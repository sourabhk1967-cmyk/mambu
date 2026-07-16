function isHostedProductionRuntime() {
  return (
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.RENDER_SERVICE_ID)
  );
}

const hostedProductionRuntime = isHostedProductionRuntime();

const DEFAULTS = {
  port: 5050,
  corsOrigin: 'http://localhost:5173',
  jsonLimit: '80mb',
  jwtExpiresIn: '8h',
  jwtIssuer: 'kyrovia',
  jwtAudience: 'kyrovia-client',
  maxMessageLength: 8000,
  maxUploadBytes: 60 * 1024 * 1024,
  maxUploadFiles: 12,
  chatUrl: 'https://chatgpt.com/',
  playwrightHeadless: hostedProductionRuntime,
  playwrightTimeoutMs: 120000,
  chatMaxConcurrentTabs: 1,
  chatParallelTabs: false,
  playwrightRecoverProfileLock: true,
  chatQueueMaxPending: 200,
  chatQueueWaitTimeoutMs: 30 * 60 * 1000,
  browserWorkerTimeoutMs: 20 * 60 * 1000,
  playwrightUserDataDir: './playwright-profile',
  playwrightViewportWidth: 1365,
  playwrightViewportHeight: 900,
  apiRateLimitWindowMs: 15 * 60 * 1000,
  apiRateLimitMax: 600,
  authRateLimitMax: 200,
  aiRateLimitMax: 200,
  googleFitSyncDays: 30,
  whatsappAuthDir: './data/whatsapp-auth',
  whatsappAutoReconnect: true,
  whatsappAutoReply: true,
  whatsappReplyGroups: false
};

function readString(name, fallback = '') {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readBoolean(name, fallback = false) {
  const value = process.env[name];

  if (typeof value !== 'string') {
    return fallback;
  }

  if (/^(1|true|yes|on)$/i.test(value.trim())) {
    return true;
  }

  if (/^(0|false|no|off)$/i.test(value.trim())) {
    return false;
  }

  return fallback;
}

function readPositiveInteger(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function readCorsOrigins() {
  return readString('CORS_ORIGIN', DEFAULTS.corsOrigin)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function readChatUrl() {
  const rawUrl = readString('CHATGPT_URL', DEFAULTS.chatUrl);

  try {
    return new URL(rawUrl).toString();
  } catch (_error) {
    return DEFAULTS.chatUrl;
  }
}

function loadConfig() {
  return {
    server: {
      port: readPositiveInteger('PORT', DEFAULTS.port),
      corsOrigins: readCorsOrigins(),
      jsonLimit: readString('JSON_LIMIT', DEFAULTS.jsonLimit),
      publicAppUrl: readString('PUBLIC_APP_URL', readString('RENDER_EXTERNAL_URL')),
      rateLimitWindowMs: readPositiveInteger('RATE_LIMIT_WINDOW_MS', DEFAULTS.apiRateLimitWindowMs),
      rateLimitMax: readPositiveInteger('RATE_LIMIT_MAX', DEFAULTS.apiRateLimitMax),
      authRateLimitMax: readPositiveInteger('AUTH_RATE_LIMIT_MAX', DEFAULTS.authRateLimitMax),
      aiRateLimitMax: readPositiveInteger('AI_RATE_LIMIT_MAX', DEFAULTS.aiRateLimitMax)
    },
    auth: {
      jwtSecret: readString('JWT_SECRET'),
      jwtExpiresIn: readString('JWT_EXPIRES_IN', DEFAULTS.jwtExpiresIn),
      jwtIssuer: readString('JWT_ISSUER', DEFAULTS.jwtIssuer),
      jwtAudience: readString('JWT_AUDIENCE', DEFAULTS.jwtAudience)
    },
    firebase: {
      projectId: readString('FIREBASE_PROJECT_ID', 'kyrovia-8dd36'),
      serviceAccountPath: readString('FIREBASE_SERVICE_ACCOUNT_PATH'),
      serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || ''
    },
    chat: {
      maxMessageLength: readPositiveInteger('MAX_MESSAGE_LENGTH', DEFAULTS.maxMessageLength),
      maxUploadBytes: readPositiveInteger('MAX_UPLOAD_BYTES', DEFAULTS.maxUploadBytes),
      maxUploadFiles: readPositiveInteger('MAX_UPLOAD_FILES', DEFAULTS.maxUploadFiles)
    },
    googleSearch: {
      cseId: readString('GOOGLE_CSE_ID'),
      cseUrl: readString('GOOGLE_CSE_URL', 'https://cse.google.com/cse')
    },
    googleFit: {
      clientId: readString('GOOGLE_FIT_CLIENT_ID'),
      clientSecret: readString('GOOGLE_FIT_CLIENT_SECRET'),
      redirectUri: readString('GOOGLE_FIT_REDIRECT_URI'),
      returnUrl: readString(
        'GOOGLE_FIT_RETURN_URL',
        readString('PUBLIC_APP_URL', readString('CORS_ORIGIN', DEFAULTS.corsOrigin).split(',')[0])
      ),
      syncDays: readPositiveInteger('GOOGLE_FIT_SYNC_DAYS', DEFAULTS.googleFitSyncDays),
      tokenEncryptionKey: readString('GOOGLE_FIT_TOKEN_ENCRYPTION_KEY', readString('JWT_SECRET'))
    },
    chatgpt: {
      chatUrl: readChatUrl(),
      headless: readBoolean('PLAYWRIGHT_HEADLESS', DEFAULTS.playwrightHeadless),
      timeoutMs: readPositiveInteger('PLAYWRIGHT_TIMEOUT_MS', DEFAULTS.playwrightTimeoutMs),
      maxConcurrentTabs: readPositiveInteger('CHAT_MAX_CONCURRENT_TABS', DEFAULTS.chatMaxConcurrentTabs),
      parallelTabs: readBoolean('CHAT_PARALLEL_TABS', DEFAULTS.chatParallelTabs),
      recoverProfileLock: readBoolean(
        'PLAYWRIGHT_RECOVER_PROFILE_LOCK',
        DEFAULTS.playwrightRecoverProfileLock
      ),
      queueMaxPending: readPositiveInteger('CHAT_QUEUE_MAX_PENDING', DEFAULTS.chatQueueMaxPending),
      queueWaitTimeoutMs: readPositiveInteger('CHAT_QUEUE_WAIT_TIMEOUT_MS', DEFAULTS.chatQueueWaitTimeoutMs),
      userDataDir: readString('PLAYWRIGHT_USER_DATA_DIR', DEFAULTS.playwrightUserDataDir),
      viewport: {
        width: readPositiveInteger('PLAYWRIGHT_VIEWPORT_WIDTH', DEFAULTS.playwrightViewportWidth),
        height: readPositiveInteger('PLAYWRIGHT_VIEWPORT_HEIGHT', DEFAULTS.playwrightViewportHeight)
      }
    },
    browserWorker: {
      url: readString('KYROVIA_BROWSER_WORKER_URL'),
      secret: readString('KYROVIA_BROWSER_WORKER_SECRET'),
      timeoutMs: readPositiveInteger('KYROVIA_BROWSER_WORKER_TIMEOUT_MS', DEFAULTS.browserWorkerTimeoutMs)
    },
    whatsapp: {
      authDir: readString('WHATSAPP_AUTH_DIR', DEFAULTS.whatsappAuthDir),
      autoReconnect: readBoolean('WHATSAPP_AUTO_RECONNECT', DEFAULTS.whatsappAutoReconnect),
      autoReply: readBoolean('WHATSAPP_AUTO_REPLY', DEFAULTS.whatsappAutoReply),
      replyGroups: readBoolean('WHATSAPP_REPLY_GROUPS', DEFAULTS.whatsappReplyGroups)
    }
  };
}

function assertJwtConfig(authConfig) {
  if (!authConfig.jwtSecret) {
    const error = new Error('JWT auth is not configured. Set JWT_SECRET in the backend environment.');
    error.status = 500;
    throw error;
  }
}

module.exports = {
  assertJwtConfig,
  loadConfig
};
