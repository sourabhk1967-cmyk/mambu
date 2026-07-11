const express = require('express');
const fs = require('fs/promises');
const multer = require('multer');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');

const requireAuth = require('../middleware/auth');
const { findApp } = require('../services/appsCatalog');
const {
  analyzeWorkspace,
  buildPersonalizationInstruction,
  predictSearches
} = require('../services/behaviorInsights');
const {
  readImageAsset,
  saveImageBuffer,
  saveImageDataUrl,
  saveRemoteImageSource
} = require('../services/imageAssetStore');
const {
  detectIdentityRequest,
  kyroviaIdentityInstruction,
  kyroviaIdentityResponse,
  sanitizeKyroviaBranding
} = require('../services/identity');
const {
  createInteractiveVisualPrompt,
  isInteractiveVisualRequest
} = require('../services/interactiveVisual');
const { createChatSessionKey } = require('../services/sessionIdentity');
const { kyroviaUserContextInstruction } = require('../services/userContext');
const { createConversationRecord, readWorkspace, writeWorkspace } = require('../services/workspaceStore');
const GenerationResultStore = require('../services/generationResultStore');

const router = express.Router();
const dataDir = path.resolve(process.cwd(), process.env.KYROVIA_DATA_DIR || './data');
const generationResults = new GenerationResultStore({
  storageDir: path.join(dataDir, 'generation-results')
});
const FALLBACK_FILE_PROMPT = 'Please review the attached file.';
const FALLBACK_FILES_PROMPT = 'Please review the attached files.';
const MAX_SAFE_FILENAME_LENGTH = 160;
const MULTIPART_FILE_FIELD = 'files';
const DEFAULT_MODEL_ID = 'nova-instant';
const SCHEDULED_TASK_INTENT = 'scheduled-task';
const JSON_HEARTBEAT_INTERVAL_MS = 4000;
const DELIVERY_REQUEST_ID_RE = /^[a-z0-9][a-z0-9_-]{15,127}$/i;
const SUPPORTED_MODEL_IDS = new Set(['nova-instant', 'nova-thinking', 'nova-agent', 'nova-agent-swarm']);
const IMAGE_EXTENSION_RE = /\.(png|jpe?g|webp|gif|bmp|svg|avif|heic|heif|tiff?)$/i;
const IMAGE_INTENT_RE =
  /\b(generate|create|design|draw|make|render|illustrate|paint|edit|turn|convert)\b[\s\S]{0,90}\b(image|picture|photo|art|illustration|wallpaper|poster|avatar|logo|character|creature|mascot|sticker|chart|diagram|graph)\b/i;
const DIRECT_IMAGE_WORD_RE = /\b(image|picture|photo|illustration|artwork|character|creature|mascot|avatar|sticker|wallpaper|chart|diagram|graph)\b/i;
const SIMILARITY_RISK_RE =
  /\b(same\s*to\s*same|same\s+as|exact(ly)?|identical|copy|copied|clone|replica|replicate|recreate|duplicate|match\s+this|like\s+this|as\s+shown|from\s+this|reference|third[-\s]?party)\b/i;
const SIMILARITY_GUARDRAIL_RE =
  /may violate our guardrails concerning similarity to third[-\s]?party content|similarity to third[-\s]?party content|retry or edit your prompt/i;

const GLABRIDIN_CALCULATION_RE =
  /\bglabridin\b[\s\S]{0,160}\b(calculation|calculate|formula|content|assay|estimation|quantification|hptlc|hplc|peak\s+area|dilution)\b|\b(calculation|calculate|formula|content|assay|estimation|quantification|hptlc|hplc|peak\s+area|dilution)\b[\s\S]{0,160}\bglabridin\b/i;
const GLABRIDIN_CALCULATION_SYMBOL_RE =
  /\b(calculation|calculate|formula|content|assay|estimation|quantification)\b[\s\S]{0,180}\b(a_?s|a_?std|c_?std|w_?s|df|sample\s+peak\s+area|standard\s+peak\s+area|dilution\s+factor)\b|\b(a_?s|a_?std|c_?std|w_?s|df|sample\s+peak\s+area|standard\s+peak\s+area|dilution\s+factor)\b[\s\S]{0,180}\b(calculation|calculate|formula|content|assay|estimation|quantification)\b/i;

function isGlabridinCalculationRequest(message = '') {
  return GLABRIDIN_CALCULATION_RE.test(message) || GLABRIDIN_CALCULATION_SYMBOL_RE.test(message);
}

function glabridinCalculationResponse() {
  const calculation = {
    title: 'Calculation',
    label: 'Glabridin content',
    factors: [
      { numerator: 'A_s', denominator: 'A_std' },
      { operator: 'times' },
      { numerator: 'C_std', denominator: 'W_s' },
      { operator: 'times' },
      { symbol: 'DF' }
    ],
    variables: [
      { symbol: 'A_s', description: 'sample peak area' },
      { symbol: 'A_std', description: 'standard peak area' },
      { symbol: 'C_std', description: 'concentration of standard' },
      { symbol: 'W_s', description: 'sample weight' },
      { symbol: 'DF', description: 'dilution factor' }
    ]
  };

  return ['```kyrovia-calculation', JSON.stringify(calculation, null, 2), '```'].join('\n');
}

router.get('/images/:imageId', async (req, res, next) => {
  try {
    const asset = await readImageAsset(req.params.imageId);

    if (!asset) {
      throw createHttpError(404, 'Generated image was not found.');
    }

    if (asset.remote) {
      const service = getChatService(req);
      const remoteImage = await service.fetchRemoteImageAsset(asset.sourceUrl);

      res.set('Cache-Control', 'private, max-age=86400');
      res.type(remoteImage.mimeType);
      res.send(remoteImage.buffer);
      return;
    }

    res.set('Cache-Control', 'private, max-age=86400');
    res.type(asset.mimeType);
    res.send(asset.buffer);
  } catch (error) {
    next(error);
  }
});

router.use(requireAuth);

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function assertSafeProviderResponse(result) {
  const text = String(result?.text || '');
  const isGatewayErrorPage =
    /(?:<!doctype\s+html|<html|cf-error-details|cloudflare\.com\/5xx-error-landing)/i.test(text) &&
    /\b(cloudflare|error\s*5\d\d|timeout occurred|web server timed out|gateway)\b/i.test(text);

  if (!isGatewayErrorPage) {
    return;
  }

  const error = createHttpError(
    /\b524\b|timeout occurred|web server timed out/i.test(text) ? 504 : 502,
    'The upstream AI service returned a gateway error page. Please try again shortly.'
  );
  error.expose = true;
  throw error;
}

function preserveProviderMarkdown(text = '') {
  return sanitizeKyroviaBranding(String(text)).replace(/\r\n/g, '\n');
}

function startJsonHeartbeat(res) {
  let started = false;
  let stopped = false;

  res.set({
    'Cache-Control': 'no-cache, no-transform',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Accel-Buffering': 'no'
  });

  const stop = () => {
    if (stopped) {
      return;
    }

    stopped = true;
    clearInterval(intervalId);
    res.off('close', stop);
  };
  const intervalId = setInterval(() => {
    if (res.destroyed || res.writableEnded) {
      stop();
      return;
    }

    started = true;
    res.write(' \n');
    res.flush?.();
  }, JSON_HEARTBEAT_INTERVAL_MS);

  res.once('close', stop);

  return {
    get started() {
      return started;
    },
    finish(payload, status = 200) {
      stop();

      if (res.destroyed || res.writableEnded) {
        return;
      }

      if (started || res.headersSent) {
        res.end(JSON.stringify(payload));
        return;
      }

      res.status(status).json(payload);
    },
    stop
  };
}

function wantsGenerationEvents(req) {
  return String(req.get('accept') || '')
    .toLowerCase()
    .includes('application/x-ndjson');
}

function wantsAsyncGeneration(req) {
  return String(req.get('prefer') || '')
    .toLowerCase()
    .split(',')
    .some((value) => value.trim() === 'respond-async');
}

function resolveDeliveryRequestId(req) {
  const requestedId = String(req.get('x-kyrovia-request-id') || '').trim();
  return DELIVERY_REQUEST_ID_RE.test(requestedId) ? requestedId : randomUUID();
}

function startGenerationEventStream(res) {
  let stopped = false;

  res.socket?.setNoDelay?.(true);
  res.status(200);
  res.set({
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();

  const send = (event, payload = {}) => {
    if (stopped || res.destroyed || res.writableEnded) {
      return;
    }

    res.write(
      `${JSON.stringify({
        event,
        at: new Date().toISOString(),
        ...payload
      })}\n`
    );
    res.flush?.();
  };
  const stop = () => {
    if (stopped) {
      return;
    }

    stopped = true;
    clearInterval(intervalId);
    res.off('close', stop);
  };
  const intervalId = setInterval(() => {
    send('heartbeat');
  }, JSON_HEARTBEAT_INTERVAL_MS);
  intervalId.unref?.();

  res.once('close', stop);

  return {
    send,
    finish(payload) {
      send('completed', { data: payload });
      stop();

      if (!res.destroyed && !res.writableEnded) {
        res.end();
      }
    },
    fail(error) {
      send('error', error);
      stop();

      if (!res.destroyed && !res.writableEnded) {
        res.end();
      }
    },
    stop
  };
}

function safeRouteError(error) {
  const status = error.type === 'entity.parse.failed' ? 400 : error.status || error.statusCode || 500;
  const isPlaywrightOrBrowserError = 
    /playwright|chromium|browser|page|tab|context|singleton|lockfile|lock|selector|timeout|agent/i.test(error.message || '');
  const isDev = process.env.NODE_ENV !== 'production';
  const expose = error.expose || isPlaywrightOrBrowserError || isDev;
  const message = status >= 500 && !expose ? 'Unexpected server error' : error.message;

  if (status >= 500 && !error.expose) {
    console.error(error);
  }

  return {
    status,
    message
  };
}

function getChatService(req) {
  const service = req.app.locals.chatgpt;

  if (!service) {
    throw createHttpError(503, 'Kyrovia browser service is not available');
  }

  return service;
}

function imageAssetUrl(_req, imageName) {
  return `/api/chat/images/${encodeURIComponent(imageName)}`;
}

function imageBufferDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function isLocalImageAssetUrl(value = '') {
  return /\/api\/chat\/images\/[a-f0-9-]{36}\.(?:avif|bmp|gif|jpe?g|png|svg|webp|remote)(?:[?#]|$)/i.test(String(value));
}

async function prepareImagesForFrontend(req, images = []) {
  const preparedImages = [];

  for (const image of images) {
    const src = String(image?.src || '');

    if (!/^data:image\//i.test(src)) {
      if (/^https?:\/\//i.test(src) && !isLocalImageAssetUrl(src)) {
        const remoteImage = await getChatService(req).fetchRemoteImageAsset(src).catch(() => null);
        const downloadedAsset = remoteImage
          ? await saveImageBuffer(remoteImage.buffer, remoteImage.mimeType)
          : null;

        if (downloadedAsset) {
          const assetUrl = imageAssetUrl(req, downloadedAsset.name);
          preparedImages.push({
            ...image,
            src: imageBufferDataUrl(remoteImage.buffer, downloadedAsset.mimeType),
            sourceUrl: assetUrl,
            delivery: 'inline-backend-asset',
            mimeType: downloadedAsset.mimeType,
            size: downloadedAsset.size
          });
          continue;
        }

        const asset = await saveRemoteImageSource(src);

        if (asset) {
          const assetUrl = imageAssetUrl(req, asset.name);
          preparedImages.push({
            ...image,
            src: assetUrl,
            sourceUrl: assetUrl,
            delivery: 'lazy-backend-asset'
          });
          continue;
        }
      }

      preparedImages.push({
        ...image,
        sourceUrl: /^data:image\//i.test(String(image?.sourceUrl || '')) ? src : image?.sourceUrl
      });
      continue;
    }

    const asset = await saveImageDataUrl(src);

    if (!asset) {
      preparedImages.push(image);
      continue;
    }

    const assetUrl = imageAssetUrl(req, asset.name);
    const sourceUrl =
      !image.sourceUrl || /^data:image\//i.test(String(image.sourceUrl)) ? assetUrl : image.sourceUrl;

    preparedImages.push({
      ...image,
      src,
      sourceUrl,
      delivery: 'inline-backend-asset',
      mimeType: image.mimeType || asset.mimeType,
      size: asset.size
    });
  }

  return preparedImages;
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function normalizeMessage(value, maxLength, fileCount = 0) {
  const hasFiles = fileCount > 0;

  if (typeof value !== 'string') {
    if (hasFiles) {
      return fileCount === 1 ? FALLBACK_FILE_PROMPT : FALLBACK_FILES_PROMPT;
    }

    throw createHttpError(400, 'Message is required');
  }

  const message = value.trim();

  if (!message && !hasFiles) {
    throw createHttpError(400, 'Message is required');
  }

  if (message.length > maxLength) {
    throw createHttpError(413, `Message is too long. Limit is ${maxLength} characters.`);
  }

  if (!message && hasFiles) {
    return fileCount === 1 ? FALLBACK_FILE_PROMPT : FALLBACK_FILES_PROMPT;
  }

  return message;
}

function sanitizeFilename(name) {
  const fallback = `upload-${Date.now()}`;
  const basename = path.basename(String(name || fallback)).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim();
  return (basename || fallback).slice(0, MAX_SAFE_FILENAME_LENGTH);
}

function firstFieldValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeModel(value) {
  const model = typeof value === 'string' ? value.trim() : '';
  return SUPPORTED_MODEL_IDS.has(model) ? model : DEFAULT_MODEL_ID;
}

function normalizeApp(value) {
  const appId = typeof value === 'string' ? value.trim() : '';

  if (!appId) {
    return null;
  }

  return findApp(appId);
}

function normalizeConversationId(value) {
  const conversationId = typeof value === 'string' ? value.trim() : '';
  return conversationId.slice(0, 180);
}

function createHumanTonePrompt(message) {
  return [
    'Human Tone Studio rewrite instructions:',
    '- Rewrite the user text so it sounds natural, clear, and written in an ordinary human voice.',
    '- Preserve the original meaning, facts, names, numbers, links, quotes, code, and formatting intent.',
    '- Keep the user voice. Do not make it glossy, generic, corporate, or overly perfect.',
    '- Use varied sentence length, simple transitions, contractions where they fit, and a few natural imperfections when appropriate.',
    '- Remove robotic phrasing, filler, repeated structure, and obvious AI-style scaffolding.',
    '- Do not add citations, new claims, fake personal experience, or claims about bypassing AI detectors.',
    '- If the user asks for multiple tones, provide concise variants. Otherwise return only the rewritten text.',
    '',
    `Text to rewrite: ${message}`
  ].join('\n');
}

function createScheduledTaskPrompt(
  message,
  user,
  personalizationInstruction = '',
  scheduledSettings = {}
) {
  const identityInstruction = kyroviaIdentityInstruction();
  const userContextInstruction = kyroviaUserContextInstruction(user);
  const approvalMode = ['ask', 'safe', 'full'].includes(scheduledSettings.approvalMode)
    ? scheduledSettings.approvalMode
    : 'ask';
  const connectedApps = Array.isArray(scheduledSettings.connectedApps)
    ? scheduledSettings.connectedApps.join(', ')
    : '';
  const grantedScopes = Object.entries(scheduledSettings.deviceScopes || {})
    .filter(([, granted]) => granted === true)
    .map(([scopeId]) => scopeId)
    .join(', ');

  return [
    identityInstruction,
    userContextInstruction,
    personalizationInstruction,
    'The user opened Kyrovia Scheduled and clicked add for this exact scheduled request:',
    message,
    '',
    'Help configure it as a recurring task, reminder, or monitor.',
    'Ask only the missing questions needed to finish setup, such as topics, timing, timezone, cadence, sources, delivery channel, and whether apps like email, calendar, WhatsApp, web search, health, or shopping sources should be connected.',
    `Current approval mode: ${approvalMode}.`,
    `Connected capabilities: ${connectedApps || 'none yet'}.`,
    `Granted device scopes: ${grantedScopes || 'none yet'}.`,
    'Never claim access to arbitrary phone or laptop apps, files, accounts, sensors, or external services. Kyrovia may use only explicitly connected apps and permissions granted by the user.',
    'For ask mode, request confirmation before every external action. For safe mode, still request confirmation before sending, editing, deleting, purchasing, sharing, or publishing. Full mode applies only within explicitly granted scopes and never bypasses operating-system, browser, or app permissions.',
    'Do not say the schedule is running yet. Explain that you can activate it after the user confirms the missing details.',
    'Keep the response concise and practical.'
  ]
    .filter(Boolean)
    .join('\n');
}

function createAppPrompt(message, app, user, personalizationInstruction = '') {
  const identityInstruction = kyroviaIdentityInstruction();
  const userContextInstruction = kyroviaUserContextInstruction(user);
  const baseInstructions = [identityInstruction, userContextInstruction, personalizationInstruction].filter(Boolean);

  if (!app) {
    return [...baseInstructions, '', `User request: ${message}`].join('\n');
  }

  if (app.id === 'human-tone') {
    return [...baseInstructions, '', createHumanTonePrompt(message)].join('\n');
  }

  return [
    ...baseInstructions,
    `The user started this chat from the Kyrovia ${app.name} app.`,
    `App purpose: ${app.description}.`,
    'Use that app context when answering, and keep the response directly useful.',
    `User request: ${message}`
  ].join('\n');
}

function isImageFile(file = {}) {
  return Boolean(
    (typeof file.type === 'string' && file.type.toLowerCase().startsWith('image/')) ||
      IMAGE_EXTENSION_RE.test(String(file.name || ''))
  );
}

function stripUrls(text = '') {
  return String(text).replace(/https?:\/\/\S+/gi, '').replace(/\s{2,}/g, ' ').trim();
}

function hasImageIntent(message, files = []) {
  const hasImageAttachment = files.some(isImageFile);
  return Boolean(hasImageAttachment || IMAGE_INTENT_RE.test(message) || (DIRECT_IMAGE_WORD_RE.test(message) && SIMILARITY_RISK_RE.test(message)));
}

function createOriginalImagePrompt(message, files = [], retry = false) {
  const cleanUserIdea = stripUrls(message) || 'an original high-quality image';
  const hasImageAttachment = files.some(isImageFile);
  const referenceNote = hasImageAttachment
    ? 'A reference image may be attached. Use it only for broad mood, subject category, and color energy.'
    : 'If a linked or described reference was mentioned, use it only as broad inspiration.';

  return [
    'Create a completely original, non-branded image for Kyrovia.',
    'Important originality rules:',
    '- Do not copy, trace, recreate, or closely imitate any existing character, brand, franchise, logo, protected artwork, uploaded image, or linked image.',
    `- ${referenceNote}`,
    '- Make the result clearly distinct with a new silhouette, face, markings, colors, pose, background, accessories, and composition.',
    '- Avoid recognizable third-party symbols, names, signature outfits, or franchise-specific motifs.',
    retry
      ? '- This is a retry after a similarity warning, so make the design more different and more original than the reference.'
      : '- If the user asked for "same", "exact", or "copy", reinterpret that as a request for a similar high-level vibe only.',
    '',
    `Original user idea to reinterpret safely: ${cleanUserIdea}`
  ].join('\n');
}

function preparePromptForChat(message, files = [], forceImageIntent = false) {
  const imageIntent = forceImageIntent || hasImageIntent(message, files);
  const interactiveVisualIntent = isInteractiveVisualRequest(message);
  const shouldAdjust =
    imageIntent && (SIMILARITY_RISK_RE.test(message) || files.some(isImageFile) || /https?:\/\/\S+/i.test(message));
  let prompt = shouldAdjust ? createOriginalImagePrompt(message, files, false) : message;

  if (interactiveVisualIntent) {
    prompt = createInteractiveVisualPrompt(prompt);
  }

  return {
    imageIntent,
    interactiveVisualIntent,
    prompt,
    adjusted: shouldAdjust
  };
}

function isSimilarityGuardrailResponse(text = '') {
  return SIMILARITY_GUARDRAIL_RE.test(String(text));
}

function similarityHelpMessage() {
  return [
    '**Image request needs an original prompt**',
    '',
    'The request was too close to third-party or reference content, so Kyrovia could not return that exact image.',
    '',
    'Try asking for an **original creature or scene** with changed features, colors, pose, background, and style instead of “same to same” or “copy this”.'
  ].join('\n');
}

function createUploadMiddleware({ maxMessageLength, maxUploadBytes, maxUploadFiles }) {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fields: 6,
      fileSize: maxUploadBytes,
      files: maxUploadFiles,
      fieldSize: Math.max(maxMessageLength, 512 * 1024),
      parts: maxUploadFiles + 6
    }
  }).array(MULTIPART_FILE_FIELD, maxUploadFiles);
}

function normalizeUploadError(error, chatConfig) {
  if (!(error instanceof multer.MulterError)) {
    return error;
  }

  if (error.code === 'LIMIT_FILE_SIZE') {
    return createHttpError(413, `One file is too large. Limit is ${formatBytes(chatConfig.maxUploadBytes)} per file.`);
  }

  if (error.code === 'LIMIT_FILE_COUNT') {
    return createHttpError(413, `Too many files. Limit is ${chatConfig.maxUploadFiles} files.`);
  }

  if (error.code === 'LIMIT_FIELD_VALUE') {
    return createHttpError(413, `Message is too long. Limit is ${chatConfig.maxMessageLength} characters.`);
  }

  return createHttpError(400, error.message || 'Upload failed.');
}

function parseSendRequest(req, res, next) {
  if (!req.is('multipart/form-data')) {
    next();
    return;
  }

  const chatConfig = req.app.locals.config.chat;
  const upload = createUploadMiddleware(chatConfig);

  upload(req, res, (error) => {
    if (error) {
      next(normalizeUploadError(error, chatConfig));
      return;
    }

    next();
  });
}

function normalizeMultipartFiles(value, { maxUploadBytes, maxUploadFiles }) {
  const files = Array.isArray(value) ? value : [];

  if (files.length > maxUploadFiles) {
    throw createHttpError(413, `Too many files. Limit is ${maxUploadFiles} files.`);
  }

  let totalBytes = 0;

  return files.map((file, index) => {
    if (!file?.buffer?.length) {
      throw createHttpError(400, `File ${index + 1} is empty.`);
    }

    totalBytes += file.buffer.length;

    if (totalBytes > maxUploadBytes) {
      throw createHttpError(413, `Files are too large. Limit is ${formatBytes(maxUploadBytes)} total.`);
    }

    return {
      name: sanitizeFilename(file.originalname),
      type: file.mimetype || 'application/octet-stream',
      size: file.buffer.length,
      buffer: file.buffer
    };
  });
}

function normalizeFiles(value, { maxUploadBytes, maxUploadFiles }) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw createHttpError(400, 'Files must be an array.');
  }

  if (value.length > maxUploadFiles) {
    throw createHttpError(413, `Too many files. Limit is ${maxUploadFiles} files.`);
  }

  let totalBytes = 0;

  return value.map((file, index) => {
    if (!file || typeof file !== 'object') {
      throw createHttpError(400, `File ${index + 1} is invalid.`);
    }

    if (typeof file.data !== 'string' || !file.data) {
      throw createHttpError(400, `File ${index + 1} is missing data.`);
    }

    const buffer = Buffer.from(file.data, 'base64');

    if (!buffer.length) {
      throw createHttpError(400, `File ${index + 1} is empty.`);
    }

    totalBytes += buffer.length;

    if (totalBytes > maxUploadBytes) {
      throw createHttpError(413, `Files are too large. Limit is ${formatBytes(maxUploadBytes)} total.`);
    }

    return {
      name: sanitizeFilename(file.name),
      type: typeof file.type === 'string' && file.type ? file.type : 'application/octet-stream',
      size: buffer.length,
      buffer
    };
  });
}

async function writeTempFiles(files) {
  if (!files.length) {
    return {
      dir: null,
      files: []
    };
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kyrovia-upload-'));
  const writtenFiles = [];

  for (const file of files) {
    const targetPath = path.join(dir, `${randomUUID()}-${file.name}`);
    await fs.writeFile(targetPath, file.buffer);
    writtenFiles.push({
      name: file.name,
      type: file.type,
      size: file.size,
      path: targetPath
    });
  }

  return {
    dir,
    files: writtenFiles
  };
}

async function cleanupTempFiles(upload) {
  if (!upload?.dir) {
    return;
  }

  await fs.rm(upload.dir, { force: true, recursive: true }).catch(() => undefined);
}

router.get('/status', async (req, res, next) => {
  try {
    const service = getChatService(req);
    const status = await service.getStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
});

router.get('/workspace', async (req, res, next) => {
  try {
    const workspace = await readWorkspace(req.user.username);
    res.json({
      workspace
    });
  } catch (error) {
    next(error);
  }
});

router.put('/workspace', async (req, res, next) => {
  try {
    const workspace = await writeWorkspace(req.user.username, req.body?.workspace || {});
    res.json({
      workspace
    });
  } catch (error) {
    next(error);
  }
});

router.get('/intelligence', async (req, res, next) => {
  try {
    const workspace = (await readWorkspace(req.user.username)) || {};
    res.json({
      preferences: workspace.intelligence?.preferences || {},
      analysis: analyzeWorkspace(workspace),
      predictions: predictSearches(workspace, req.query?.prefix || '')
    });
  } catch (error) {
    next(error);
  }
});

router.post('/device-usage', async (req, res, next) => {
  try {
    if (req.body?.consent !== true) {
      throw createHttpError(400, 'Explicit device-usage consent is required.');
    }

    if (!Array.isArray(req.body?.records) || !req.body.records.length) {
      throw createHttpError(400, 'At least one device-usage record is required.');
    }

    const current = (await readWorkspace(req.user.username)) || {};
    const intelligence = current.intelligence || {};
    const workspace = await writeWorkspace(req.user.username, {
      ...current,
      intelligence: {
        ...intelligence,
        preferences: {
          ...(intelligence.preferences || {}),
          deviceUsageEnabled: true,
          updatedAt: new Date().toISOString()
        },
        deviceUsage: [
          ...(intelligence.deviceUsage || []),
          ...req.body.records.map((record) => ({
            ...record,
            source: ['android-companion', 'ios-import'].includes(record?.source)
              ? record.source
              : 'manual'
          }))
        ]
      }
    });

    res.status(201).json({
      intelligence: workspace.intelligence,
      analysis: analyzeWorkspace(workspace)
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/device-usage', async (req, res, next) => {
  try {
    const current = (await readWorkspace(req.user.username)) || {};
    const intelligence = current.intelligence || {};
    const workspace = await writeWorkspace(req.user.username, {
      ...current,
      intelligence: {
        ...intelligence,
        preferences: {
          ...(intelligence.preferences || {}),
          deviceUsageEnabled: false,
          updatedAt: new Date().toISOString()
        },
        deviceUsage: []
      }
    });

    res.json({
      intelligence: workspace.intelligence,
      analysis: analyzeWorkspace(workspace)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/results/:requestId', (req, res) => {
  const requestId = String(req.params.requestId || '').trim();
  const result = generationResults.get(requestId, req.user.username);

  res.set('Cache-Control', 'no-store');

  if (!result) {
    res.status(404).json({
      message: 'Generation result was not found or has expired.'
    });
    return;
  }

  if (result.status === 'pending') {
    res.status(202).json({
      requestId,
      status: 'pending'
    });
    return;
  }

  if (result.status === 'failed') {
    res.status(result.error?.status || 500).json({
      error: true,
      requestId,
      status: 'failed',
      message: result.error?.message || 'Generation failed.'
    });
    return;
  }

  res.json({
    ...result.payload,
    requestId,
    deliveryRecovered: true
  });
});

router.post('/conversations', async (req, res, next) => {
  try {
    const result = await createConversationRecord(req.user.username, req.body?.conversation || {});
    let browserChat = {
      ready: false
    };

    try {
      const service = getChatService(req);
      browserChat = await service.startNewChat({
        sessionKey: createChatSessionKey(req.user, result.conversation.id)
      });
    } catch (browserError) {
      browserChat = {
        ready: false,
        message: browserError.message
      };
    }

    res.status(201).json({
      ...result,
      browserChat
    });
  } catch (error) {
    next(error);
  }
});

router.post('/send', parseSendRequest, async (req, res, next) => {
  let upload = null;
  let heartbeat = null;
  let eventStream = null;
  let requestAbortController = null;
  let abortOnClose = null;
  let deliveryRequestId = '';
  let generationStarted = false;
  const respondAsync = wantsAsyncGeneration(req);

  try {
    const chatConfig = req.app.locals.config.chat;
    const isMultipart = req.is('multipart/form-data');
    const files = isMultipart
      ? normalizeMultipartFiles(req.files, chatConfig)
      : normalizeFiles(req.body?.files, chatConfig);
    const messageInput = isMultipart ? firstFieldValue(req.body?.message) : req.body?.message;
    const modelInput = isMultipart ? firstFieldValue(req.body?.model) : req.body?.model;
    const appInput = isMultipart ? firstFieldValue(req.body?.appId) : req.body?.appId;
    const conversationInput = isMultipart ? firstFieldValue(req.body?.conversationId) : req.body?.conversationId;
    const intentInput = isMultipart ? firstFieldValue(req.body?.intent) : req.body?.intent;
    const message = normalizeMessage(messageInput, chatConfig.maxMessageLength, files.length);
    const model = normalizeModel(modelInput);
    const app = normalizeApp(appInput);
    const conversationId = normalizeConversationId(conversationInput);
    const scheduledIntent = String(intentInput || '').trim() === SCHEDULED_TASK_INTENT;
    const sessionKey = createChatSessionKey(req.user, conversationId);
    const identityRequest = detectIdentityRequest(message);
    res.set('X-Kyrovia-Session-Id', req.user.sessionId);

    if (isGlabridinCalculationRequest(message) && !files.length) {
      return res.json({
        message: glabridinCalculationResponse(),
        images: [],
        files: [],
        sources: [],
        artifacts: [],
        conversationUrl: null,
        model,
        provider: 'kyrovia-calculation',
        app: app || null,
        sessionId: req.user.sessionId,
        promptAdjusted: false,
        scrapedAt: new Date().toISOString()
      });
    }

    if (identityRequest && !files.length) {
      return res.json({
        message: kyroviaIdentityResponse(identityRequest.locale),
        images: [],
        files: [],
        sources: [],
        artifacts: [],
        conversationUrl: null,
        model,
        provider: 'kyrovia-identity',
        language: identityRequest.locale,
        app: app || null,
        sessionId: req.user.sessionId,
        promptAdjusted: false,
        scrapedAt: new Date().toISOString()
      });
    }

    deliveryRequestId = resolveDeliveryRequestId(req);
    const existingGeneration = generationResults.get(deliveryRequestId, req.user.username);

    if (existingGeneration) {
      res.set('X-Kyrovia-Request-Id', deliveryRequestId);

      if (existingGeneration.status === 'pending') {
        return res.status(202).json({
          requestId: deliveryRequestId,
          status: 'pending'
        });
      }

      if (existingGeneration.status === 'failed') {
        return res.status(existingGeneration.error?.status || 500).json({
          error: true,
          requestId: deliveryRequestId,
          status: 'failed',
          message: existingGeneration.error?.message || 'Generation failed.'
        });
      }

      return res.json({
        ...existingGeneration.payload,
        requestId: deliveryRequestId,
        deliveryRecovered: true
      });
    }

    const generationSessionId = randomUUID();
    generationResults.start(deliveryRequestId, req.user.username);
    res.set('X-Kyrovia-Request-Id', deliveryRequestId);
    res.set('X-Kyrovia-Generation-Session-Id', generationSessionId);
    const service = getChatService(req);
    if (!service?.ready) {
      throw createHttpError(
        503,
        service?.lastStartupError
          ? `Kyrovia browser is starting or unavailable. ${service.lastStartupError}`
          : 'Kyrovia browser is starting. Please retry in a moment.'
      );
    }

    const promptPlan = preparePromptForChat(message, files, intentInput === 'image-generation');
    let queueInfo = null;
    let lastStreamedMessage = '';
    requestAbortController = new AbortController();
    const sendStreamedMessage = (update = {}, partial = true) => {
      if (!eventStream) {
        return;
      }

      const streamedMessage = preserveProviderMarkdown(update.text || '');
      // The final marker must reach the client even when its text matches the
      // last partial update, otherwise the completed reply keeps its spinner.
      if (!streamedMessage || (partial && streamedMessage === lastStreamedMessage)) {
        return;
      }

      lastStreamedMessage = streamedMessage;
      eventStream.send('message', {
        requestId: deliveryRequestId,
        partial,
        data: {
          message: streamedMessage,
          images: [],
          files: [],
          sources: [],
          artifacts: [],
          conversationUrl: update.conversationUrl || null,
          model: update.model || model,
          provider: 'kyrovia',
          app: app || null,
          sessionId: req.user.sessionId,
          generationSessionId,
          imageIntent: false,
          intent: scheduledIntent ? SCHEDULED_TASK_INTENT : '',
          messageFormat: 'backend-markdown',
          promptAdjusted: promptPlan.adjusted,
          scrapedAt: update.scrapedAt || new Date().toISOString()
        }
      });
    };
    abortOnClose = () => {
      if (!res.writableEnded && !generationStarted) {
        requestAbortController.abort();
      }
    };
    res.once('close', abortOnClose);
    if (respondAsync) {
      res.status(202).json({
        requestId: deliveryRequestId,
        generationSessionId,
        status: 'pending'
      });
    } else if (wantsGenerationEvents(req)) {
      eventStream = startGenerationEventStream(res);
      eventStream.send('accepted', {
        requestId: deliveryRequestId,
        generationSessionId,
        message: 'Backend accepted the generation request.'
      });
    } else {
      heartbeat = startJsonHeartbeat(res);
    }
    upload = await writeTempFiles(files);
    const workspace = await readWorkspace(req.user.username);
    const personalizationInstruction = workspace
      ? buildPersonalizationInstruction(workspace, conversationId)
      : '';
    const providerPrompt = scheduledIntent
      ? createScheduledTaskPrompt(
          promptPlan.prompt,
          req.user,
          personalizationInstruction,
          workspace?.scheduledSettings
        )
      : createAppPrompt(promptPlan.prompt, app, req.user, personalizationInstruction);
    let result = await service.sendMessage(
      providerPrompt,
      upload.files,
      model,
      {
        freshChat: promptPlan.imageIntent || promptPlan.interactiveVisualIntent,
        expectImage: promptPlan.imageIntent,
        sessionKey,
        signal: requestAbortController.signal,
        onResponseUpdate(update) {
          sendStreamedMessage(update, true);
        },
        onQueued(info) {
          queueInfo = {
            requestId: deliveryRequestId,
            generationSessionId,
            queueRequestId: info.id,
            initialPosition: info.position,
            waitMs: 0
          };

          eventStream?.send('queued', {
            requestId: deliveryRequestId,
            generationSessionId,
            queueRequestId: info.id,
            position: info.position,
            pending: info.pending,
            maxPending: info.maxPending
          });
        },
        onStarted(info) {
          generationStarted = true;
          if (queueInfo) {
            queueInfo.waitMs = info.waitMs;
          }

          eventStream?.send('started', {
            requestId: deliveryRequestId,
            generationSessionId,
            queueRequestId: info.id,
            waitMs: info.waitMs
          });
        }
      }
    );
    assertSafeProviderResponse(result);
    let refinedMessage = preserveProviderMarkdown(result.text);

    if (
      promptPlan.imageIntent &&
      !result.interactiveHtml &&
      (isSimilarityGuardrailResponse(refinedMessage) || !(result.images || []).length)
    ) {
      const originalRetryPrompt = createOriginalImagePrompt(message, files, true);
      const retryPrompt = promptPlan.interactiveVisualIntent
        ? createInteractiveVisualPrompt(originalRetryPrompt)
        : originalRetryPrompt;
      result = await service.sendMessage(
        scheduledIntent
          ? createScheduledTaskPrompt(
              retryPrompt,
              req.user,
              personalizationInstruction,
              workspace?.scheduledSettings
            )
          : createAppPrompt(retryPrompt, app, req.user, personalizationInstruction),
        [],
        model,
        {
          freshChat: true,
          expectImage: true,
          sessionKey,
          signal: requestAbortController.signal
        }
      );
      assertSafeProviderResponse(result);
      refinedMessage = preserveProviderMarkdown(result.text);
    }

    if (promptPlan.imageIntent && isSimilarityGuardrailResponse(refinedMessage) && !(result.images || []).length) {
      refinedMessage = similarityHelpMessage();
    }

    sendStreamedMessage(
      {
        ...result,
        text: refinedMessage
      },
      false
    );

    // Images are request-scoped output. A text-only request must never receive an
    // image left in the provider DOM by an earlier generation.
    const requestOwnsImages = promptPlan.imageIntent || promptPlan.interactiveVisualIntent;
    const responseImages = requestOwnsImages
      ? await prepareImagesForFrontend(req, result.images || [])
      : [];

    if (result.interactiveHtml) {
      const liveVisual = responseImages.find((image) => image.captureType === 'backend-visual') || responseImages[0];

      if (liveVisual) {
        liveVisual.interactiveType = 'sandboxed-html';
        liveVisual.interactiveHtml = result.interactiveHtml;
      } else {
        responseImages.push({
          src: '',
          sourceUrl: '',
          alt: 'Interactive generated diagram',
          captureType: 'backend-visual',
          interactiveType: 'sandboxed-html',
          interactiveHtml: result.interactiveHtml
        });
      }
    }

    const hasBackendVisual = responseImages.some((image) => image.captureType === 'backend-visual');
    const responseMessage =
      promptPlan.imageIntent && responseImages.length && !hasBackendVisual ? '' : refinedMessage;

    const payload = {
      message: responseMessage,
      images: responseImages,
      files: result.files || [],
      sources: result.sources || [],
      artifacts: result.artifacts || [],
      conversationUrl: result.conversationUrl,
      model: result.model || model,
      provider: app ? 'kyrovia' : result.provider,
      app: app || null,
      sessionId: req.user.sessionId,
      generationSessionId,
      queue: queueInfo,
      imageIntent: promptPlan.imageIntent,
      intent: scheduledIntent ? SCHEDULED_TASK_INTENT : '',
      messageFormat: 'backend-markdown',
      promptAdjusted: promptPlan.adjusted,
      scrapedAt: result.scrapedAt
    };

    generationResults.complete(deliveryRequestId, req.user.username, payload);
    if (eventStream) {
      if (responseImages.length) {
        eventStream.send('message', {
          requestId: deliveryRequestId,
          partial: false,
          data: payload
        });
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      eventStream.finish(payload);
    } else if (heartbeat) {
      heartbeat.finish(payload);
    }
    return;
  } catch (error) {
    const safeError = safeRouteError(error);
    generationResults.fail(deliveryRequestId, req.user?.username, safeError);

    if (eventStream || heartbeat) {
      if (eventStream) {
        eventStream.fail({
          ...safeError,
          requestId: deliveryRequestId
        });
      } else {
        heartbeat.finish(
          {
            error: true,
            status: safeError.status,
            message: safeError.message
          },
          safeError.status
        );
      }
      return;
    }

    if (respondAsync && res.writableEnded) {
      return;
    }

    return next(error);
  } finally {
    if (abortOnClose) {
      res.off('close', abortOnClose);
    }
    eventStream?.stop();
    heartbeat?.stop();
    await cleanupTempFiles(upload);
  }
});

module.exports = router;
