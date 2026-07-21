const cors = require('cors');
const dotenv = require('dotenv');
const express = require('express');
const fs = require('fs');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');

const { configurePlaywrightBrowserPath } = require('./playwrightEnvironment');

dotenv.config();
configurePlaywrightBrowserPath();

const { loadConfig } = require('./config');
const appsRoutes = require('./routes/apps');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const codeRoutes = require('./routes/code');
const healthRoutes = require('./routes/health');
const searchRoutes = require('./routes/search');
const whatsappRoutes = require('./routes/whatsapp');
const { WhatsAppManager } = require('./services/whatsappManager');

const config = loadConfig();
const ChatGPTService = require('./services/chatgpt');
const app = express();
const chatgpt = new ChatGPTService(config.chatgpt);
const browserWorkerConfigured = Boolean(config.browserWorker?.url && config.browserWorker?.secret);
const whatsappManager = new WhatsAppManager(config.whatsapp, {
  responseHandler: async (message, account) => {
    const senderLabel = message.senderName || message.senderJid || 'WhatsApp user';
    const prompt = [
      'You are Kyrovia. Generate the exact WhatsApp message body to send to the sender.',
      'Return only the final reply text. Do not include labels, quotes, markdown fences, explanations, or phrases like "Suggested reply:" or "You can reply:".',
      'Use plain text and keep it concise unless the sender asks for detail.',
      `Sender: ${senderLabel}`,
      'Incoming WhatsApp message:',
      message.text
    ].join('\n');
    const result = await chatgpt.sendMessage(prompt, [], 'nova-instant', {
      sessionKey: `whatsapp:${account.storageId}:${message.senderJid || message.chatJid}`
    });

    return result.text;
  }
});
const frontendDist = path.resolve(__dirname, '../frontend/dist');
const hasFrontendBuild = fs.existsSync(path.join(frontendDist, 'index.html'));
const tunnelActivePublicUrlFile = path.resolve(__dirname, '../.tunnel/active-public-url.txt');

function readActivePublicApiUrl() {
  try {
    const publicUrl = fs.readFileSync(tunnelActivePublicUrlFile, 'utf8').trim();

    if (!publicUrl) {
      return '';
    }

    const parsedUrl = new URL(publicUrl);
    parsedUrl.pathname = '/api';
    parsedUrl.search = '';
    parsedUrl.hash = '';
    return parsedUrl.toString().replace(/\/$/, '');
  } catch (_error) {
    return '';
  }
}

function isTrustedTunnelOrigin(origin = '') {
  try {
    const { protocol, hostname } = new URL(origin);

    return (
      protocol === 'https:' &&
      (/\.loca\.lt$/i.test(hostname) || /\.trycloudflare\.com$/i.test(hostname))
    );
  } catch (_error) {
    return false;
  }
}

app.locals.chatgpt = chatgpt;
app.locals.config = config;
app.locals.whatsappManager = whatsappManager;

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
  })
);
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }

  const origin = req.get('origin');
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const requestOrigin = `${forwardedProto || req.protocol}://${forwardedHost || req.get('host')}`;
  const allowedOrigins = [
    ...config.server.corsOrigins,
    config.server.publicAppUrl
  ].filter(Boolean);

  if (
    !origin ||
    origin === requestOrigin ||
    allowedOrigins.includes('*') ||
    allowedOrigins.includes(origin) ||
    isTrustedTunnelOrigin(origin)
  ) {
    cors({
      origin: origin || false,
      credentials: true,
      exposedHeaders: [
        'X-Kyrovia-Request-Id',
        'X-Kyrovia-Session-Id',
        'X-Kyrovia-Generation-Session-Id'
      ],
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'Accept',
        'Bypass-Tunnel-Reminder',
        'Prefer',
        'X-Kyrovia-Request-Id'
      ]
    })(req, res, next);
    return;
  }

  res.status(403).json({ message: `Origin ${origin} is not allowed by CORS` });
});
app.use(express.json({ limit: config.server.jsonLimit }));

app.use((req, res, next) => {
  try {
    const decodedPath = decodeURIComponent(req.path);

    if (/^\/api\/health\s*->/i.test(decodedPath)) {
      res.redirect(302, '/api/health');
      return;
    }
  } catch (_error) {
    // If a malformed URL cannot be decoded, let Express return the normal 404.
  }

  next();
});

app.get('/.well-known/kyrovia-runtime.json', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    apiBaseUrl: readActivePublicApiUrl(),
    checkedAt: new Date().toISOString()
  });
});

const apiLimiter = rateLimit({
  windowMs: config.server.rateLimitWindowMs,
  limit: config.server.rateLimitMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req) =>
    req.method === 'OPTIONS' ||
    /^\/api\/chat\/results\/[^/]+\/?$/.test(req.originalUrl),
  message: { message: 'Too many requests. Please wait a moment and try again.' }
});
const authLimiter = rateLimit({
  windowMs: config.server.rateLimitWindowMs,
  limit: config.server.authRateLimitMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please wait a moment and try again.' }
});
const aiLimiter = rateLimit({
  windowMs: config.server.rateLimitWindowMs,
  limit: config.server.aiRateLimitMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'AI request limit reached. Please wait before trying again.' }
});

app.get('/api/health', (_req, res) => {
  const queue = chatgpt.getQueueStatus();
  res.json({
    ok: true,
    service: 'kyrovia',
    browserReady: chatgpt.ready,
    browserStartupError: chatgpt.lastStartupError,
    browserHeadless: config.chatgpt.headless,
    browserWorker: {
      configured: browserWorkerConfigured,
      url: config.browserWorker?.url || ''
    },
    aiProvider: 'kyrovia-browser',
    queue: {
      processing: queue.processing,
      active: queue.activeCount,
      activeTabs: queue.activeTabs,
      openTabs: queue.openTabs,
      pending: queue.pending,
      maxPending: queue.maxPending,
      maxConcurrent: queue.maxConcurrent,
      mode: queue.mode,
      parallelTabs: queue.parallelTabs
    },
    uptimeSeconds: Math.round(process.uptime()),
    checkedAt: new Date().toISOString()
  });
});

app.get('/api/deployment', (_req, res) => {
  const queue = chatgpt.getQueueStatus();
  const publicAppUrl = config.server.publicAppUrl || '';
  const isNetlify = Boolean(process.env.NETLIFY);
  const runtime = isNetlify ? 'netlify-functions' : 'persistent-node';

  res.json({
    ok: true,
    service: 'kyrovia',
    public: Boolean(publicAppUrl || isNetlify),
    runtime,
    publicAppUrl,
    apiBasePath: '/api',
    noOpenAiApiKeyRequired: true,
    backendRequiresPersistentBrowser: true,
    netlifyFrontendReady: true,
    netlifyBackendMode:
      runtime === 'netlify-functions'
        ? 'limited-serverless-health-only'
        : 'external-persistent-express',
    browser: {
      ready: chatgpt.ready,
      startupError: chatgpt.lastStartupError,
      headless: config.chatgpt.headless,
      userDataDir: config.chatgpt.userDataDir,
      workerConfigured: browserWorkerConfigured,
      workerUrl: config.browserWorker?.url || '',
      queue: {
        active: queue.activeCount,
        openTabs: queue.openTabs,
        pending: queue.pending,
        maxPending: queue.maxPending,
        maxConcurrent: queue.maxConcurrent,
        mode: queue.mode,
        parallelTabs: queue.parallelTabs
      }
    },
    checkedAt: new Date().toISOString()
  });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/chat/send', aiLimiter);
app.use('/api/apps/generate', aiLimiter);
app.use('/api/search/google', aiLimiter);
app.use('/api', apiLimiter);
app.use('/api/chat', chatRoutes);
app.use('/api/code', codeRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/apps', appsRoutes);
app.use('/api/whatsapp', whatsappRoutes);

if (hasFrontendBuild) {
  app.use(express.static(frontendDist, { maxAge: 0, index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }

    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, _req, res, _next) => {
  const status = err.type === 'entity.parse.failed' ? 400 : err.status || err.statusCode || 500;
  const isPlaywrightOrBrowserError = 
    /playwright|chromium|browser|page|tab|context|singleton|lockfile|lock|selector|timeout|agent/i.test(err.message || '');
  const isDev = process.env.NODE_ENV !== 'production';
  const expose = err.expose || isPlaywrightOrBrowserError || isDev;
  const message = status >= 500 && !expose ? 'Unexpected server error' : err.message;

  if (status >= 500 && !err.expose) {
    console.error(err);
  }

  res.status(status).json({ message });
});

let server = null;
let shuttingDown = false;
let browserHealthInterval = null;
const RECOVERABLE_SERVER_ERRORS = new Set(['ECONNABORTED', 'EMFILE', 'ENFILE', 'ENOBUFS']);
const BROWSER_HEALTH_INTERVAL_MS = Number.parseInt(process.env.BROWSER_HEALTH_INTERVAL_MS || '30000', 10);

function handleServerError(error) {
  if (RECOVERABLE_SERVER_ERRORS.has(error?.code)) {
    console.warn(`HTTP server resource pressure (${error.code}). Keeping the service alive.`);
    return;
  }

  console.error('HTTP server error:', error);
  process.exitCode = 1;

  if (!shuttingDown) {
    setTimeout(() => process.exit(1), 100).unref?.();
  }
}

async function startBrowserService() {
  if (browserWorkerConfigured) {
    console.log('Kyrovia browser worker is configured; skipping Render-local Chromium startup.');
    return;
  }

  try {
    await chatgpt.init();
  } catch (error) {
    console.warn('The Kyrovia browser service did not start cleanly. Chat requests will fail until this is fixed.');
    console.warn(error.message);
  }
}

function startBrowserHealthCheck() {
  if (
    browserWorkerConfigured ||
    browserHealthInterval ||
    !Number.isFinite(BROWSER_HEALTH_INTERVAL_MS) ||
    BROWSER_HEALTH_INTERVAL_MS <= 0
  ) {
    return;
  }

  browserHealthInterval = setInterval(async () => {
    if (shuttingDown) {
      return;
    }

    try {
      const result = await chatgpt.ensureBrowserHealthy({ restart: true });
      if (result.restarted) {
        console.warn(`Kyrovia browser health check restarted the browser (${result.reason || 'unknown'}).`);
      }
    } catch (error) {
      console.warn(`Kyrovia browser health check failed: ${error.message}`);
    }
  }, BROWSER_HEALTH_INTERVAL_MS);
  browserHealthInterval.unref?.();
}

async function start() {
  server = app.listen(config.server.port, () => {
    console.log(`API listening at http://localhost:${config.server.port}`);
    startBrowserService();
    startBrowserHealthCheck();
  });
  server.on('error', handleServerError);
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Received ${signal}. Closing services...`);

  if (browserHealthInterval) {
    clearInterval(browserHealthInterval);
    browserHealthInterval = null;
  }

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }).catch((error) => {
      console.warn(`HTTP server did not close cleanly: ${error.message}`);
    });
  }

  await chatgpt.close().catch((error) => {
    console.warn(`Kyrovia browser service did not close cleanly: ${error.message}`);
  });
  await whatsappManager.disconnectAll().catch((error) => {
    console.warn(`WhatsApp sockets did not close cleanly: ${error.message}`);
  });

  process.exit(0);
}

if (require.main === module) {
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGUSR2', shutdown);

  process.on('uncaughtException', (error) => {
    if (error?.code === 'ENOBUFS') {
      console.warn('Recoverable system resource pressure (uncaught ENOBUFS). Keeping service alive.');
      return;
    }
    console.error('Uncaught Exception:', error);
    process.exit(1);
  });

  start();
}

module.exports = {
  app,
  start,
  shutdown
};
