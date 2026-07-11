import {
  GenerationEventError,
  consumeGenerationEvent,
  parseGenerationEventText,
  shouldRecoverGenerationResult
} from './generationEvents.js';

const viteEnv = import.meta.env || {};
const API_BASE_URL = viteEnv.VITE_API_URL || '/api';
const DEFAULT_REQUEST_TIMEOUT_MS = 320000;
const configuredTimeoutMs = Number(viteEnv.VITE_API_TIMEOUT_MS);
const REQUEST_TIMEOUT_MS =
  Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0 ? configuredTimeoutMs : DEFAULT_REQUEST_TIMEOUT_MS;
const DEFAULT_AI_REQUEST_TIMEOUT_MS = 65 * 60 * 1000;
const configuredAiTimeoutMs = Number(viteEnv.VITE_AI_TIMEOUT_MS);
const AI_REQUEST_TIMEOUT_MS =
  Number.isFinite(configuredAiTimeoutMs) && configuredAiTimeoutMs > 0
    ? configuredAiTimeoutMs
    : DEFAULT_AI_REQUEST_TIMEOUT_MS;
const GENERATION_RECOVERY_POLL_MS = 100;
const GENERATION_RECOVERY_TIMEOUT_MS = 10 * 60 * 1000;
const GENERATION_PARALLEL_RECOVERY_DELAY_MS = 6000;
const DEFAULT_GENERATION_STREAM_IDLE_TIMEOUT_MS = 90 * 1000;
const configuredGenerationStreamIdleTimeoutMs = Number(
  viteEnv.VITE_GENERATION_STREAM_IDLE_TIMEOUT_MS
);
const GENERATION_STREAM_IDLE_TIMEOUT_MS =
  Number.isFinite(configuredGenerationStreamIdleTimeoutMs) &&
  configuredGenerationStreamIdleTimeoutMs > 0
    ? configuredGenerationStreamIdleTimeoutMs
    : DEFAULT_GENERATION_STREAM_IDLE_TIMEOUT_MS;
const TOKEN_KEY = 'kyrovia-token';
const USER_KEY = 'kyrovia-user';
const LEGACY_TOKEN_KEY = 'chatgpt-proxy-token';
const LEGACY_USER_KEY = 'chatgpt-proxy-user';
const TRANSIENT_API_STATUSES = new Set([0, 408, 429, 502, 503, 504, 511, 524]);
const DEFAULT_RETRY_DELAYS_MS = [500, 1500, 3000, 6000, 10000];

function candidateApiBaseUrls() {
  const urls = [
    API_BASE_URL,
    ...(import.meta.env.DEV
      ? [
          typeof window !== 'undefined' ? `http://${window.location.hostname}:5050/api` : '',
          'http://127.0.0.1:5050/api',
          'http://localhost:5050/api'
        ]
      : [])
  ].filter(Boolean);

  return [...new Set(urls)];
}

export class ApiError extends Error {
  constructor(message, status, payload = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function buildHeaders(options) {
  if (options.body instanceof FormData) {
    return {
      'Bypass-Tunnel-Reminder': 'true',
      ...(options.headers || {})
    };
  }

  return {
    'Content-Type': 'application/json',
    'Bypass-Tunnel-Reminder': 'true',
    ...(options.headers || {})
  };
}

function buildAuthHeaders(token) {
  return token
    ? {
        Authorization: `Bearer ${token}`
      }
    : {};
}

function responseErrorMessage(response, text, contentType) {
  const isHtml =
    contentType.includes('text/html') ||
    /^\s*(?:<!doctype\s+html|<html|<head|<body|<!--)/i.test(text);
  const isGatewayPage =
    isHtml &&
    /\b(cloudflare|gateway|error\s*5\d\d|timeout occurred|web server timed out|cf-error-details)\b/i.test(text);

  if (response.status === 524 || (isGatewayPage && /\b524\b/.test(text))) {
    return 'The public API gateway timed out (HTTP 524). Restart or replace the tunnel, then try again.';
  }

  if (isGatewayPage || (isHtml && response.status >= 500)) {
    return `The public API gateway returned an error page (HTTP ${response.status || 502}). Please try again shortly.`;
  }

  if (isHtml) {
    return 'The API returned a web page instead of JSON. Check VITE_API_URL and make sure it points to the backend /api endpoint.';
  }

  return '';
}

async function readJsonPayload(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const safeResponseError = responseErrorMessage(response, text, contentType);

  if (safeResponseError) {
    throw new ApiError(safeResponseError, response.ok ? 502 : response.status, {
      upstreamStatus: response.status
    });
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    if (response.ok) {
      throw new ApiError('The API returned an invalid response. Please check the backend or public API URL.', 502);
    }

    return {
      message: text.slice(0, 300)
    };
  }
}

async function readGenerationChunk(reader) {
  let timeoutId;

  try {
    return await Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(
            new ApiError(
              'The live generation connection paused before delivering the reply.',
              408
            )
          );
        }, GENERATION_STREAM_IDLE_TIMEOUT_MS);
      })
    ]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function readGenerationBodyText(reader) {
  const decoder = new TextDecoder();
  let text = '';

  while (true) {
    const { value, done } = await readGenerationChunk(reader);
    text += decoder.decode(value || new Uint8Array(), { stream: !done });

    if (done) {
      return text;
    }
  }
}

async function cancelGenerationReader(reader) {
  try {
    await reader.cancel();
  } catch (_error) {
    // The completed event is already authoritative; failing to cancel the
    // transport should not hide the backend reply from the UI.
  }
}

export async function readGenerationEventStream(response, onEvent) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();

  if (!response.body) {
    return readJsonPayload(response);
  }

  if (!contentType.includes('application/x-ndjson')) {
    const text = await readGenerationBodyText(response.body.getReader());
    const safeResponseError = responseErrorMessage(response, text, contentType);

    if (safeResponseError) {
      throw new ApiError(safeResponseError, response.ok ? 502 : response.status, {
        upstreamStatus: response.status
      });
    }

    try {
      const payload = JSON.parse(text);
      onEvent?.({
        event: 'message',
        requestId: response.headers.get('x-kyrovia-request-id') || '',
        data: payload
      });
      onEvent?.({
        event: 'completed',
        requestId: response.headers.get('x-kyrovia-request-id') || '',
        data: payload
      });
      return payload;
    } catch (_error) {
      try {
        const parsedEvents = parseGenerationEventText(text, onEvent);

        if (parsedEvents.matched) {
          return parsedEvents.payload;
        }
      } catch (eventError) {
        if (eventError instanceof GenerationEventError) {
          const error = new ApiError(eventError.message, eventError.status, eventError.payload);
          error.terminal = eventError.terminal;
          throw error;
        }

        throw eventError;
      }

      if (response.ok) {
        throw new ApiError('The API returned an invalid response. Please check the backend or public API URL.', 502);
      }

      return {
        message: text.slice(0, 300)
      };
    }
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completedPayload = null;
  let completed = false;

  const consumeLine = (line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    let lifecycleEvent;

    try {
      lifecycleEvent = JSON.parse(trimmed);
    } catch (_error) {
      throw new ApiError('The backend returned an invalid generation event.', 502);
    }

    try {
      const result = consumeGenerationEvent(lifecycleEvent, onEvent);

      if (result.completed) {
        completed = true;
        completedPayload = result.payload;
      }
    } catch (eventError) {
      if (eventError instanceof GenerationEventError) {
        const error = new ApiError(eventError.message, eventError.status, eventError.payload);
        error.terminal = eventError.terminal;
        throw error;
      }

      throw eventError;
    }
  };

  while (true) {
    const { value, done } = await readGenerationChunk(reader);
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      consumeLine(line);

      if (completed) {
        await cancelGenerationReader(reader);
        return completedPayload;
      }
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    consumeLine(buffer);

    if (completed) {
      return completedPayload;
    }
  }

  if (!completed) {
    throw new ApiError('The generation stream ended before a result was returned.', 502);
  }

  return completedPayload;
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function createGenerationRequestId() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `kyrovia-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function fetchGenerationResult(baseUrl, requestId, headers) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(
      requestUrl(baseUrl, `/chat/results/${encodeURIComponent(requestId)}`),
      {
        method: 'GET',
        headers: {
          ...headers,
          Accept: 'application/json'
        },
        signal: controller.signal
      }
    );
    const payload = await readJsonPayload(response);

    if (response.status === 202) {
      return null;
    }

    if (response.status === 404) {
      return undefined;
    }

    if (!response.ok || payload?.error) {
      const error = new ApiError(
        payload.message || 'Generation recovery failed.',
        payload.status || response.status || 500,
        payload
      );
      error.terminal = true;
      throw error;
    }

    return normalizeBackendAssets(payload, baseUrl);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function recoverGenerationResult(baseUrls, requestId, options = {}) {
  const deadline =
    Date.now() +
    Math.min(
      options.timeoutMs || GENERATION_RECOVERY_TIMEOUT_MS,
      GENERATION_RECOVERY_TIMEOUT_MS
    );
  const headers = buildHeaders(options);

  while (Date.now() < deadline) {
    let foundPendingResult = false;

    for (const baseUrl of baseUrls) {
      try {
        const payload = await fetchGenerationResult(baseUrl, requestId, headers);

        if (payload) {
          return payload;
        }

        if (payload === null) {
          foundPendingResult = true;
        }
      } catch (error) {
        if (error instanceof ApiError && error.terminal) {
          throw error;
        }
      }
    }

    await wait(foundPendingResult ? GENERATION_RECOVERY_POLL_MS : 400);
  }

  throw new ApiError(
    'The reply was generated, but delivery was interrupted and recovery timed out. Please try again.',
    408,
    { requestId }
  );
}

function requestUrl(baseUrl, path) {
  return `${baseUrl}${path}`;
}

function resolveBackendAssetUrl(value, baseUrl) {
  if (typeof value !== 'string' || !value) {
    return value;
  }

  let assetPath = '';

  if (value.startsWith('/api/chat/images/')) {
    assetPath = value;
  } else {
    try {
      const parsed = new URL(value, window.location.origin);

      if (parsed.pathname.startsWith('/api/chat/images/')) {
        assetPath = `${parsed.pathname}${parsed.search}`;
      }
    } catch (_error) {
      return value;
    }
  }

  if (!assetPath) {
    return value;
  }

  const backendOrigin = new URL(baseUrl, window.location.origin).origin;
  return `${backendOrigin}${assetPath}`;
}

function normalizeBackendAssets(payload, baseUrl) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.images)) {
    return payload;
  }

  return {
    ...payload,
    images: payload.images.map((image) => ({
      ...image,
      src: resolveBackendAssetUrl(image?.src || image?.sourceUrl, baseUrl),
      sourceUrl: resolveBackendAssetUrl(image?.sourceUrl || image?.src, baseUrl)
    }))
  };
}

async function requestFromBaseUrl(baseUrl, path, options = {}) {
  const controller = new AbortController();
  const {
    timeoutMs = REQUEST_TIMEOUT_MS,
    streamResponse = false,
    onStreamEvent,
    onStreamComplete,
    onStreamMessage,
    generationRequestId: requestedGenerationRequestId = '',
    parallelRecoveryStarted: _parallelRecoveryStarted = false,
    ...fetchOptions
  } = options;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  let streamStarted = false;
  let generationRequestId = requestedGenerationRequestId;
  const headers = {
    ...buildHeaders(fetchOptions)
  };

  try {
    const response = await fetch(requestUrl(baseUrl, path), {
      ...fetchOptions,
      headers,
      signal: controller.signal
    });
    generationRequestId =
      response.headers.get('x-kyrovia-request-id') || generationRequestId;
    const payload = streamResponse
      ? await readGenerationEventStream(response, (event) => {
          streamStarted = true;
          generationRequestId = event.requestId || generationRequestId;
          const normalizedEvent =
            event.event === 'completed' || event.event === 'message'
              ? {
                  ...event,
                  data: normalizeBackendAssets(event.data || {}, baseUrl)
                }
              : event;

          if (normalizedEvent.event === 'completed') {
            onStreamComplete?.(normalizedEvent.data, normalizedEvent);
          }

          if (normalizedEvent.event === 'message') {
            onStreamMessage?.(normalizedEvent.data, normalizedEvent);
          }

          onStreamEvent?.(normalizedEvent);
        })
      : await readJsonPayload(response);

    if (payload?.error) {
      throw new ApiError(payload.message || 'Request failed', payload.status || response.status || 500, payload);
    }

    if (!response.ok) {
      throw new ApiError(payload.message || 'Request failed', response.status, payload);
    }

    return normalizeBackendAssets(payload, baseUrl);
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new ApiError('Request timed out. Please try again.', 408);
      timeoutError.streamStarted = streamStarted;
      timeoutError.requestId = generationRequestId;
      throw timeoutError;
    }

    if (!(error instanceof ApiError)) {
      const networkError = new ApiError('Unable to reach the backend. Make sure the API server is running.', 0);
      networkError.streamStarted = streamStarted;
      networkError.requestId = generationRequestId;
      throw networkError;
    }

    error.streamStarted = error.streamStarted || streamStarted;
    error.requestId = error.requestId || generationRequestId;
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function request(path, options = {}) {
  if (
    options.streamResponse &&
    options.generationRequestId &&
    !options.parallelRecoveryStarted
  ) {
    const recoveryBaseUrl = candidateApiBaseUrls()[0];
    let primarySettled = false;
    const primaryRequest = request(path, {
      ...options,
      parallelRecoveryStarted: true
    }).finally(() => {
      primarySettled = true;
    });
    const recoveryRequest = wait(GENERATION_PARALLEL_RECOVERY_DELAY_MS).then(() => {
      if (primarySettled) {
        return primaryRequest;
      }

      return recoverGenerationResult([recoveryBaseUrl], options.generationRequestId, options);
    });

    return Promise.race([
      primaryRequest,
      recoveryRequest.catch(() => primaryRequest)
    ]);
  }

  const baseUrls = candidateApiBaseUrls();
  let lastNetworkError = null;

  for (const baseUrl of baseUrls) {
    try {
      return await requestFromBaseUrl(baseUrl, path, options);
    } catch (error) {
      if (
        error instanceof ApiError &&
        shouldRecoverGenerationResult({
          streamResponse: options.streamResponse,
          requestId: error.requestId,
          terminal: error.terminal
        })
      ) {
        return recoverGenerationResult([baseUrl], error.requestId, options);
      }

      if (
        error instanceof ApiError &&
        (error.streamStarted || (error.status !== 0 && error.status !== 408))
      ) {
        throw error;
      }

      lastNetworkError = error;
    }
  }

  throw lastNetworkError || new ApiError('Unable to reach the backend. Make sure the API server is running.', 0);
}

function isTransientApiError(error) {
  return error instanceof ApiError && TRANSIENT_API_STATUSES.has(Number(error.status || 0));
}

async function requestWithTransientRetry(path, options = {}, retryDelays = DEFAULT_RETRY_DELAYS_MS) {
  let lastError;

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      return await request(path, options);
    } catch (error) {
      lastError = error;

      if (!isTransientApiError(error) || attempt >= retryDelays.length) {
        throw error;
      }

      await wait(retryDelays[attempt]);
    }
  }

  throw lastError;
}

export function getStoredToken() {
  return window.localStorage.getItem(TOKEN_KEY) || window.localStorage.getItem(LEGACY_TOKEN_KEY);
}

export function setStoredToken(token) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function getStoredUser() {
  const rawUser = window.localStorage.getItem(USER_KEY) || window.localStorage.getItem(LEGACY_USER_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    const user = JSON.parse(rawUser);
    return user && typeof user === 'object' ? user : null;
  } catch (_error) {
    window.localStorage.removeItem(USER_KEY);
    window.localStorage.removeItem(LEGACY_USER_KEY);
    return null;
  }
}

export function setStoredUser(user) {
  if (!user || typeof user !== 'object') {
    window.localStorage.removeItem(USER_KEY);
    window.localStorage.removeItem(LEGACY_USER_KEY);
    return;
  }

  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.localStorage.removeItem(LEGACY_USER_KEY);
}

export function logout() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_USER_KEY);
}

export function loginWithFirebaseIdToken(idToken) {
  return request('/auth/firebase', {
    method: 'POST',
    body: JSON.stringify({ idToken })
  });
}

export function me(token = getStoredToken()) {
  return request('/auth/me', {
    headers: buildAuthHeaders(token)
  });
}

export function chatStatus(token = getStoredToken()) {
  return request('/chat/status', {
    headers: buildAuthHeaders(token)
  });
}

export function deploymentStatus() {
  return request('/deployment');
}

export function getWorkspace(token = getStoredToken()) {
  return requestWithTransientRetry('/chat/workspace', {
    headers: buildAuthHeaders(token)
  });
}

export function saveWorkspaceRemote(workspace, token = getStoredToken()) {
  return requestWithTransientRetry('/chat/workspace', {
    method: 'PUT',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({ workspace })
  });
}

export function createBackendConversation(conversation, token = getStoredToken()) {
  return requestWithTransientRetry('/chat/conversations', {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({ conversation })
  });
}

export function runCodeSnippet({ code, language, stdin = '', timeoutMs = 12000 }, token = getStoredToken()) {
  return request('/code/run', {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({
      code,
      language,
      stdin,
      timeoutMs
    })
  });
}

export function searchGoogle(query, options = {}, token = getStoredToken()) {
  if (typeof options === 'string') {
    token = options;
    options = {};
  }

  return request('/search/google', {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({
      query,
      page: options.page || 1,
      type: options.type || 'web',
      sort: options.sort || 'relevance'
    })
  });
}

export function getAppsCatalog(token = getStoredToken()) {
  return request('/apps', {
    headers: buildAuthHeaders(token)
  });
}

export function getAppDetail(appId, token = getStoredToken()) {
  return request(`/apps/${encodeURIComponent(appId)}`, {
    headers: buildAuthHeaders(token)
  });
}

export function generateAppResponse({ appId, prompt = '', model = 'nova-instant' }, token = getStoredToken()) {
  return request('/apps/generate', {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({
      appId,
      prompt,
      model
    })
  });
}

export function getWhatsAppStatus(token = getStoredToken()) {
  return request('/whatsapp/status', {
    headers: buildAuthHeaders(token)
  });
}

export function connectWhatsApp({ restart = false } = {}, token = getStoredToken()) {
  return request('/whatsapp/connect', {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({ restart })
  });
}

export function disconnectWhatsApp({ logout = false } = {}, token = getStoredToken()) {
  return request('/whatsapp/disconnect', {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({ logout })
  });
}

export function sendWhatsAppMessage({ to, text }, token = getStoredToken()) {
  return request('/whatsapp/send', {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({ to, text })
  });
}

export function getHealthProfile(token = getStoredToken()) {
  return request('/health/profile', {
    headers: buildAuthHeaders(token)
  });
}

export function saveHealthProfile(profile, token = getStoredToken()) {
  return request('/health/profile', {
    method: 'PUT',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({ profile })
  });
}

export function connectHealthSource(source, token = getStoredToken()) {
  return request('/health/connect', {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({ source })
  });
}

export function getGoogleFitStatus(token = getStoredToken()) {
  return request('/health/google-fit/status', {
    headers: buildAuthHeaders(token)
  });
}

export function authorizeGoogleFit({ timeZone = '' } = {}, token = getStoredToken()) {
  return request('/health/google-fit/authorize', {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({ timeZone })
  });
}

export function syncGoogleFit({ days = 30, timeZone = '' } = {}, token = getStoredToken()) {
  return request('/health/google-fit/sync', {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({ days, timeZone })
  });
}

export function disconnectGoogleFit(token = getStoredToken()) {
  return request('/health/google-fit/disconnect', {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({})
  });
}

export function importHealthData(payload, token = getStoredToken()) {
  return request('/health/import', {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify(payload)
  });
}

export function generateHealthPlan(model = 'nova-instant', token = getStoredToken()) {
  return request('/health/plan', {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({ model }),
    timeoutMs: AI_REQUEST_TIMEOUT_MS
  });
}

export function sendMessage(
  message,
  files = [],
  token = getStoredToken(),
  model = 'nova-instant',
  appId = '',
  conversationId = '',
  options = {}
) {
  if (typeof files === 'string') {
    token = files;
    files = [];
  }

  const generationRequestId = createGenerationRequestId();

  const finishAsyncGeneration = async (submitOptions) => {
    options.onStatus?.({
      event: 'accepted',
      requestId: generationRequestId
    });
    const accepted = await requestWithTransientRetry('/chat/send', submitOptions);

    if (accepted?.status !== 'pending') {
      options.onComplete?.(accepted);
      return accepted;
    }

    options.onStatus?.({
      event: 'started',
      requestId: accepted.requestId || generationRequestId
    });
    const result = await recoverGenerationResult(
      candidateApiBaseUrls(),
      accepted.requestId || generationRequestId,
      {
        headers: buildAuthHeaders(token),
        timeoutMs: AI_REQUEST_TIMEOUT_MS
      }
    );
    options.onComplete?.(result);
    return result;
  };

  if (files.length) {
    const formData = new FormData();
    formData.append('message', message);
    formData.append('model', model);
    if (appId) {
      formData.append('appId', appId);
    }
    if (conversationId) {
      formData.append('conversationId', conversationId);
    }
    if (options.intent) {
      formData.append('intent', options.intent);
    }
    for (const file of files) {
      formData.append('files', file, file.name || 'upload');
    }

    return finishAsyncGeneration({
      method: 'POST',
      headers: {
        ...buildAuthHeaders(token),
        Accept: 'application/json',
        Prefer: 'respond-async',
        'X-Kyrovia-Request-Id': generationRequestId
      },
      body: formData,
      timeoutMs: REQUEST_TIMEOUT_MS
    });
  }

  return finishAsyncGeneration({
    method: 'POST',
    headers: {
      ...buildAuthHeaders(token),
      Accept: 'application/json',
      Prefer: 'respond-async',
      'X-Kyrovia-Request-Id': generationRequestId
    },
    body: JSON.stringify({
      message,
      model,
      appId,
      conversationId,
      intent: options.intent || ''
    }),
    timeoutMs: REQUEST_TIMEOUT_MS
  });
}
