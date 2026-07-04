const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const RENDER_PLAYWRIGHT_BROWSERS_PATH = path.resolve(__dirname, '..', '.playwright-browsers');

if (
  process.env.RENDER ||
  process.env.RENDER_EXTERNAL_URL ||
  process.env.RENDER_SERVICE_ID
) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = RENDER_PLAYWRIGHT_BROWSERS_PATH;
}

const { chromium } = require('playwright');
const sharp = require('sharp');
const { extractInteractiveVisual } = require('./interactiveVisual');
const SerialTaskQueue = require('./serialTaskQueue');

const execFileAsync = promisify(execFile);
const ASSISTANT_SELECTOR = '[data-message-author-role="assistant"]';
const DEFAULT_MODEL_ID = 'nova-instant';
const SHARED_BROWSER_QUEUE_KEY = 'chatgpt-browser';
const COMPOSER_SELECTORS = [
  '[data-testid="prompt-textarea"]',
  '#prompt-textarea',
  'textarea[placeholder*="Message"]',
  'div[contenteditable="true"]'
];
const SEND_BUTTON_SELECTORS = [
  '[data-testid="send-button"]',
  'button[aria-label="Send prompt"]',
  'button[aria-label="Send message"]'
];
const STOP_BUTTON_SELECTORS = [
  '[data-testid="stop-button"]',
  'button[aria-label*="Stop"]',
  'button:has-text("Stop")'
];
const ADD_FILES_BUTTON_SELECTORS = [
  'button[aria-label*="Upload"]',
  'button[aria-label*="Attach"]',
  'button[aria-label*="Add files"]',
  'button[aria-label*="Add photos"]',
  'button:has-text("Upload")',
  'button:has-text("Attach")'
];
const BLOCKING_MODAL_SELECTORS = [
  '[data-testid="modal-no-auth-rate-limit"]',
  '#modal-no-auth-rate-limit',
  '[role="dialog"][data-state="open"]',
  '[data-state="open"].fixed'
];
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_VIEWPORT = { width: 1365, height: 900 };
const RESPONSE_POLL_INTERVAL_MS = 75;
const STABLE_READS_REQUIRED = 2;
const TEXT_STABLE_WHILE_GENERATING_READS = 40;
const RESPONSE_FINAL_SETTLE_MS = 300;
const PROMPT_READY_TIMEOUT_MS = 30000;
const COMPOSER_FILL_VERIFY_TIMEOUT_MS = 3000;
const COMPOSER_FILL_SETTLE_MS = 150;
const MIN_DOWNLOAD_LINK_WAIT_MS = 8000;
const DOWNLOAD_LINK_SETTLE_MS = 30000;
const MAX_BLOCKER_TEXT_LENGTH = 280;
const MAX_CAPTURED_IMAGES = 1;
const MAX_CAPTURED_SOURCES = 8;
const MAX_CAPTURED_FILES = 8;
const MAX_CAPTURED_ARTIFACTS = 4;
const MAX_ARTIFACT_TEXT_LENGTH = 200000;
const MIN_IMAGE_SIDE_PX = 96;
const IMAGE_SCREENSHOT_TIMEOUT_MS = 10000;
const IMAGE_SOURCE_FETCH_TIMEOUT_MS = 15000;
const FILE_DOWNLOAD_TIMEOUT_MS = 30000;
const MAX_RAW_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_RAW_FILE_BYTES = 24 * 1024 * 1024;
const MIN_VISUAL_WIDTH_PX = 240;
const MIN_VISUAL_HEIGHT_PX = 120;
const PAGE_IMAGE_SCOPE_SELECTOR = 'main, [role="main"], body';
const PAGE_SOURCE_SCOPE_SELECTOR =
  'main a[href], [role="main"] a[href], [data-testid*="source" i] a[href], [data-testid*="citation" i] a[href], [class*="source" i] a[href], [class*="citation" i] a[href]';
const DOWNLOAD_CONTROL_SELECTOR =
  'a[href], button, [role="button"], [role="link"], [data-testid*="download" i], [data-testid*="file" i], [data-testid*="attachment" i], [aria-label*="download" i], [title*="download" i]';
const DOWNLOAD_LINK_SCOPE_SELECTOR =
  'main a[href], main button, main [role="button"], main [role="link"], main [data-testid*="download" i], main [data-testid*="file" i], main [data-testid*="attachment" i], main [aria-label*="download" i], main [title*="download" i], [role="main"] a[href], [role="main"] button, [role="main"] [role="button"], [role="main"] [role="link"], [role="main"] [data-testid*="download" i], [role="main"] [data-testid*="file" i], [role="main"] [data-testid*="attachment" i], [role="main"] [aria-label*="download" i], [role="main"] [title*="download" i]';
const DOWNLOAD_INTENT_RE = /\b(download|file|pdf|docx?|xlsx?|pptx?|zip|source\s+code|python\s+code|created)\b/i;
const DOWNLOAD_ACTION_RE = /\b(download|save|get|open)\b/i;
const DOWNLOAD_FILE_HINT_RE =
  /\b(pdf|docx?|word|xlsx?|spreadsheet|csv|pptx?|slides?|zip|archive|python|source\s+code|code\s+file|html|json|text|image|png|jpe?g|webp|gif|svg)\b/i;
const DOWNLOAD_FILE_EXTENSION_RE =
  /\.(pdf|docx?|xlsx?|pptx?|zip|py|js|jsx|ts|tsx|html|css|json|txt|csv|md|png|jpe?g|webp|gif|svg|mp3|wav|mp4|mov)(?=$|[?#\s),.;:'"`\]])/i;
const WRITING_BLOCK_SELECTOR = '[data-testid="writing-block-container"], [data-writing-block]';
const WRITING_BLOCK_CONTENT_SELECTOR = '[data-lexical-editor="true"], [contenteditable="true"], .ProseMirror';
const ARTIFACT_INTENT_RE = /\b(canvas|editable document|document|research paper|report|essay|article|proposal|white paper|thesis)\b/i;
const ARTIFACT_RESPONSE_HINT_RE =
  /\b(canvas|writing block|editable document|document block|research paper|report draft|document draft)\b/i;
const VISUAL_RESPONSE_INTENT_RE =
  /\b(diagram|chart|graph|plot|visuali[sz]ation|interactive|circuit|flowchart|schematic|simulation)\b/i;
const IMAGE_GENERATION_INTENT_RE =
  /\b(generate|create|design|draw|make|render|illustrate|paint|edit|transform)\b[\s\S]{0,120}\b(image|picture|photo|art|illustration|wallpaper|poster|avatar|logo|character|creature|mascot|sticker)\b/i;
const TERMINAL_IMAGE_FAILURE_RE =
  /\b(?:cannot|can't|could not|couldn't|unable to|won't)\b[\s\S]{0,80}\b(?:generate|create|edit|render)\b[\s\S]{0,80}\b(?:image|picture|photo|art)|similarity to third[-\s]?party content|image request (?:was )?(?:blocked|rejected)|violat(?:e|es|ing) (?:our )?(?:policy|guardrails?)/i;
const MIME_BY_EXTENSION = {
  csv: 'text/csv',
  css: 'text/css',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  gif: 'image/gif',
  html: 'text/html',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript',
  json: 'application/json',
  md: 'text/markdown',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  png: 'image/png',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  py: 'text/x-python',
  svg: 'image/svg+xml',
  ts: 'text/typescript',
  txt: 'text/plain',
  wav: 'audio/wav',
  webp: 'image/webp',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip'
};
const EXTENSION_BY_MIME = Object.fromEntries(Object.entries(MIME_BY_EXTENSION).map(([extension, mime]) => [mime, extension]));

function normalizeComposerText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function createServiceError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

class ChatGPTService {
  constructor(options = {}) {
    this.chatUrl = options.chatUrl || 'https://chatgpt.com/';
    this.headless = Boolean(options.headless);
    this.timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
    this.viewport = options.viewport || DEFAULT_VIEWPORT;
    this.userDataDir = path.resolve(process.cwd(), options.userDataDir || './playwright-profile');
    this.parallelTabs = Boolean(options.parallelTabs);
    this.recoverProfileLock = options.recoverProfileLock !== false;
    this.context = null;
    this.page = null;
    this.activeRequestPages = new Set();
    this.ready = false;
    this.lastStartupError = null;
    this.browserInstallAttempted = false;
    this.initPromise = null;
    this.requestQueue = new SerialTaskQueue({
      maxConcurrent: options.maxConcurrentTabs,
      maxPending: options.queueMaxPending,
      waitTimeoutMs: options.queueWaitTimeoutMs
    });
    this.sessionUrls = new Map();
    this.lastBrowserStatus = {
      loggedIn: false,
      blocked: false,
      blockerText: ''
    };
  }

  async init() {
    if (this.context && this.ready) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initBrowser()
      .then(() => {
        this.lastStartupError = null;
      })
      .catch((error) => {
        this.lastStartupError = this.formatStartupError(error);
        throw error;
      })
      .finally(() => {
        this.initPromise = null;
      });

    return this.initPromise;
  }

  async initBrowser() {
    if (this.context && !this.ready) {
      await this.context.close().catch(() => undefined);
      this.context = null;
      this.page = null;
    }

    this.context = await this.launchBrowserContext(this.getLaunchArgs());

    this.page = await this.ensurePage();
    await this.page.goto(this.chatUrl, { waitUntil: 'domcontentloaded', timeout: this.timeoutMs });
    await this.page.keyboard.press('Control+0').catch(() => undefined);
    await this.page.waitForTimeout(250);
    this.ready = true;
  }

  getLaunchArgs() {
    const launchArgs = ['--disable-blink-features=AutomationControlled'];

    if (this.headless) {
      launchArgs.push(
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      );
    } else {
      launchArgs.push('--start-minimized');
    }

    return launchArgs;
  }

  async launchBrowserContext(launchArgs) {
    const launchOptions = {
      headless: this.headless,
      acceptDownloads: true,
      viewport: this.viewport,
      args: launchArgs
    };

    if (this.headless) {
      launchOptions.channel = 'chromium';
    }

    console.info(
      `Starting Kyrovia browser: headless=${this.headless}, userDataDir=${this.userDataDir}, PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH || '(default)'}`
    );

    try {
      return await chromium.launchPersistentContext(this.userDataDir, launchOptions);
    } catch (error) {
      if (!this.browserInstallAttempted && this.isMissingBrowserExecutableError(error)) {
        this.browserInstallAttempted = true;
        await this.installMissingPlaywrightBrowser(error);
        return chromium.launchPersistentContext(this.userDataDir, launchOptions);
      }

      if (!this.recoverProfileLock || !this.isProfileLockError(error)) {
        throw error;
      }

      const recovery = await this.recoverLockedProfile();
      if (recovery.stopped > 0) {
        console.warn(
          `Stopped ${recovery.stopped} stale Chromium process(es) using ${this.userDataDir}. Retrying Kyrovia browser startup.`
        );
        await new Promise((resolve) => setTimeout(resolve, 800));

        try {
          return await chromium.launchPersistentContext(this.userDataDir, launchOptions);
        } catch (retryError) {
          throw this.createProfileLockError(retryError, recovery);
        }
      }

      throw this.createProfileLockError(error, recovery);
    }
  }

  isProfileLockError(error) {
    return /ProcessSingleton|profile (?:directory )?(?:is already )?in use|Opening in existing browser session|Lock file can not be created/i.test(
      String(error?.message || '')
    );
  }

  isMissingBrowserExecutableError(error) {
    return /Executable doesn't exist|Please run the following command to download new browsers|playwright install/i.test(
      String(error?.message || '')
    );
  }

  async installMissingPlaywrightBrowser(error) {
    console.warn(`Playwright browser executable is missing. Attempting runtime install: ${this.formatStartupError(error)}`);

    // Resolve the playwright CLI script path without relying on the './cli' subpath
    // export, which was removed in Playwright v1.44+. Instead, locate playwright's
    // package directory and reference 'cli.js' directly from within it.
    let playwrightCli;
    try {
      const playwrightPkg = path.dirname(require.resolve('playwright/package.json'));
      playwrightCli = path.join(playwrightPkg, 'cli.js');
    } catch (_resolveError) {
      // Fallback: use npx to invoke the playwright binary
      playwrightCli = null;
    }

    const backendDir = path.resolve(__dirname, '..');
    const execArgs = playwrightCli
      ? [playwrightCli, 'install', 'chromium', 'chromium-headless-shell']
      : [require.resolve('playwright-core/cli'), 'install', 'chromium', 'chromium-headless-shell'];

    try {
      await execFileAsync(process.execPath, execArgs, {
        cwd: backendDir,
        env: process.env,
        timeout: Math.max(this.timeoutMs, 300000),
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 8
      });
      console.info('Playwright Chromium runtime install completed. Retrying Kyrovia browser startup.');
    } catch (installError) {
      const serviceError = createServiceError(
        503,
        `Playwright browser executable is missing and automatic install failed. Build with "npm --prefix backend run playwright:install", redeploy, then restart the backend. Install error: ${this.formatStartupError(installError)}`
      );
      serviceError.cause = installError;
      throw serviceError;
    }
  }

  createProfileLockError(error, recovery = {}) {
    const supported = recovery.supported !== false;
    const detail = supported
      ? 'Close the existing Kyrovia Chromium window or stop the other backend process, then restart the backend.'
      : 'Close the existing browser process that is using the Kyrovia profile, then restart the backend.';
    const serviceError = createServiceError(
      503,
      `The Kyrovia browser profile is locked: ${this.userDataDir}. ${detail}`
    );
    serviceError.cause = error;
    serviceError.recovery = recovery;
    return serviceError;
  }

  formatStartupError(error) {
    const message = String(error?.message || error || 'Unknown browser startup error')
      .replace(/\s+/g, ' ')
      .trim();
    return message.length > 1200 ? `${message.slice(0, 1197)}...` : message;
  }

  createNotReadyError() {
    const detail = this.lastStartupError ? ` Last startup error: ${this.lastStartupError}` : '';
    return createServiceError(
      503,
      `Playwright is not ready. Restart the backend and check browser startup logs.${detail}`
    );
  }

  async recoverLockedProfile() {
    if (process.platform !== 'win32') {
      let stopped = 0;
      try {
        const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
        for (const file of lockFiles) {
          const filePath = path.join(this.userDataDir, file);
          try {
            await fs.unlink(filePath);
            stopped++;
          } catch (unlinkErr) {
            if (unlinkErr.code !== 'ENOENT') {
              console.warn(`Could not unlink ${filePath}: ${unlinkErr.message}`);
            }
          }
        }
      } catch (err) {
        console.error('Error recovering locked profile on Linux/Mac:', err);
      }
      return {
        supported: true,
        stopped
      };
    }

    const script = `
$ErrorActionPreference = 'Stop'
$target = [System.IO.Path]::GetFullPath($env:KYROVIA_PROFILE_TARGET).TrimEnd([char]92)
$profilePattern = '(?i)--user-data-dir=(?:"' + [regex]::Escape($target) + '"|' + [regex]::Escape($target) + ')(?="|\\s|$)'
$stopped = @()
Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine -match $profilePattern -and
    $_.CommandLine -notmatch '(?i)(?:^|\\s)--type=' -and
    $_.Name -match '^(chrome|chromium|msedge)(\\.exe)?$'
  } |
  ForEach-Object {
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($_.ParentProcessId)" -ErrorAction SilentlyContinue
    $hasLiveOwner = $parent -and $parent.CreationDate -le $_.CreationDate

    if (-not $hasLiveOwner) {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
      $stopped += [pscustomobject]@{
        pid = $_.ProcessId
        name = $_.Name
      }
    }
  }
@{
  supported = $true
  stopped = $stopped
  target = $target
} | ConvertTo-Json -Compress
`;

    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
        {
          env: {
            ...process.env,
            KYROVIA_PROFILE_TARGET: this.userDataDir
          },
          timeout: 10000,
          windowsHide: true,
          maxBuffer: 1024 * 1024
        }
      );
      const parsed = JSON.parse(stdout || '{}');
      const stopped = Array.isArray(parsed.stopped)
        ? parsed.stopped.length
        : parsed.stopped
        ? 1
        : 0;

      return {
        supported: true,
        stopped,
        target: parsed.target || this.userDataDir
      };
    } catch (recoveryError) {
      return {
        supported: true,
        stopped: 0,
        error: recoveryError.message
      };
    }
  }

  async close() {
    this.ready = false;
    this.initPromise = null;
    this.requestQueue.close();
    this.sessionUrls.clear();
    this.activeRequestPages.clear();

    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
    }
  }

  async getStatus() {
    const queue = this.getQueueStatus();

    if (!this.ready) {
      return {
        ready: false,
        loggedIn: false,
        blocked: false,
        startupError: this.lastStartupError,
        chatUrl: this.chatUrl,
        headless: this.headless,
        timeoutMs: this.timeoutMs,
        queue
      };
    }

    if (queue.processing || queue.pending) {
      return {
        ready: true,
        ...this.lastBrowserStatus,
        chatUrl: this.chatUrl,
        headless: this.headless,
        timeoutMs: this.timeoutMs,
        queue
      };
    }

    const status = await this.requestQueue.enqueue(() => this.inspectStatusNow(), {
      kind: 'status',
      key: this.resolveQueueKey()
    });

    return {
      ...status,
      queue: this.getQueueStatus()
    };
  }

  async inspectStatusNow() {
    const page = await this.ensurePage();
    await this.gotoChat(page);
    const blocker = await this.getBlockingModal(page);
    const composer = await this.waitForComposer(page);

    const status = {
      ready: this.ready,
      loggedIn: Boolean(composer && !blocker),
      blocked: Boolean(blocker),
      blockerText: blocker ? await this.describeBlockingModal(blocker) : '',
      chatUrl: this.chatUrl,
      headless: this.headless,
      timeoutMs: this.timeoutMs
    };

    this.lastBrowserStatus = {
      loggedIn: status.loggedIn,
      blocked: status.blocked,
      blockerText: status.blockerText
    };
    return status;
  }

  async isLoggedIn() {
    const status = await this.getStatus();
    return Boolean(status.loggedIn && !status.blocked);
  }

  resolveModelTarget(modelId = DEFAULT_MODEL_ID) {
    const labels = {
      'nova-instant': 'Kyrovia Nova Instant',
      'nova-thinking': 'Kyrovia Nova Thinking',
      'nova-agent': 'Kyrovia Nova Agent',
      'nova-agent-swarm': 'Nova Agent Swarm Online'
    };
    const id = labels[modelId] ? modelId : DEFAULT_MODEL_ID;

    return {
      id,
      provider: 'kyrovia',
      label: labels[id],
      url: this.chatUrl
    };
  }

  async sendMessage(prompt, files = [], modelId = DEFAULT_MODEL_ID, options = {}) {
    const freshChat = Boolean(options?.freshChat);
    const expectImage = Boolean(options?.expectImage);
    const sessionKey = this.normalizeSessionKey(options?.sessionKey);
    const requestSessionKey = this.normalizeSessionKey(options?.requestSessionKey);
    const queueKey = this.resolveQueueKey(requestSessionKey || sessionKey);
    const onResponseUpdate =
      typeof options?.onResponseUpdate === 'function' ? options.onResponseUpdate : null;

    return this.requestQueue.enqueue(
      () =>
        this.sendMessageWithRetry(prompt, files, modelId, {
          expectImage,
          freshChat,
          sessionKey,
          onResponseUpdate
        }),
      {
        kind: 'message',
        key: queueKey,
        signal: options?.signal,
        onQueued: options?.onQueued,
        onStarted: options?.onStarted
      }
    );
  }

  async sendMessageWithRetry(prompt, files = [], modelId = DEFAULT_MODEL_ID, options = {}) {
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.sendMessageNow(prompt, files, modelId, {
          ...options,
          freshChat: options.freshChat || attempt > 1
        });
      } catch (error) {
        const transientComposerFailure =
          error?.status === 409 && /not signed in|composer is available/i.test(String(error.message || ''));
        const transientResponseTimeout = error?.status === 504;
        const transientBrowserClosed = this.isBrowserClosedError(error) || error?.transientBrowserClosed;

        if (
          attempt >= maxAttempts ||
          (!transientComposerFailure && !transientResponseTimeout && !transientBrowserClosed)
        ) {
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }

    throw createServiceError(500, 'Kyrovia generation retry ended unexpectedly.');
  }

  async startNewChat(options = {}) {
    const sessionKey = this.normalizeSessionKey(options?.sessionKey);

    if (sessionKey) {
      this.sessionUrls.delete(sessionKey);
      return {
        conversationUrl: this.chatUrl,
        ready: this.ready
      };
    }

    return this.requestQueue.enqueue(() => this.startNewChatNow(), {
      kind: 'new-chat',
      key: this.resolveQueueKey(sessionKey),
      signal: options?.signal
    });
  }

  async startNewChatNow() {
    if (!this.ready) {
      throw this.createNotReadyError();
    }

    const page = await this.ensurePage();
    await page.goto(this.chatUrl, { waitUntil: 'domcontentloaded', timeout: this.timeoutMs });
    await this.assertChatNotBlocked(page);

    const composer = await this.waitForComposer(page);

    if (!composer) {
      throw createServiceError(
        409,
        'Kyrovia is not signed in. Complete sign-in in the Playwright browser window, then retry.'
      );
    }

    this.lastBrowserStatus = {
      loggedIn: true,
      blocked: false,
      blockerText: ''
    };
    return {
      conversationUrl: page.url(),
      ready: true
    };
  }

  async sendMessageNow(prompt, files = [], modelId = DEFAULT_MODEL_ID, options = {}) {
    if (!this.ready) {
      await this.init().catch(() => undefined);

      if (!this.ready) {
        throw this.createNotReadyError();
      }
    }

    if (typeof prompt !== 'string' || !prompt.trim()) {
      throw createServiceError(400, 'Prompt must be a non-empty string.');
    }

    if (!Array.isArray(files)) {
      throw createServiceError(400, 'Files must be an array.');
    }

    const target = this.resolveModelTarget(modelId);

    const page = await this.createRequestPage();
    let requestTimedOut = false;
    let requestTimeoutId = null;
    const requestTimeoutMs = Math.max(30000, Math.min(this.timeoutMs, 180000));
    const timeoutPromise = new Promise((_, reject) => {
      requestTimeoutId = setTimeout(() => {
        requestTimedOut = true;
        const timeoutError = createServiceError(
          504,
          'Kyrovia browser request timed out. The backend browser was restarted; please send the message again.'
        );
        this.resetBrowserAfterRequestTimeout(page, timeoutError).finally(() => reject(timeoutError));
      }, requestTimeoutMs);
      requestTimeoutId.unref?.();
    });

    try {
      return await Promise.race([
        this.sendMessageOnPage(page, prompt, files, target, options),
        timeoutPromise
      ]);
    } catch (error) {
      if (!requestTimedOut && this.isBrowserClosedError(error)) {
        await this.resetBrowserAfterUnexpectedClose(page, error);
        throw this.createBrowserClosedDuringRequestError(error);
      }

      if (!requestTimedOut) {
        await this.recoverBrowserAfterSendError(page);
      }
      throw error;
    } finally {
      if (requestTimeoutId) {
        clearTimeout(requestTimeoutId);
      }
      await this.closeRequestPage(page);
    }
  }

  async sendMessageOnPage(page, prompt, files, target, options = {}) {
    await this.openRequestConversation(page, options);

    await this.assertChatNotBlocked(page);
    await this.ensureReadyForPrompt(page);

    let composer = await this.waitForComposer(page);
    if (!composer) {
      await page
        .reload({
          waitUntil: 'domcontentloaded',
          timeout: Math.min(this.timeoutMs, 60000)
        })
        .catch(() => undefined);
      await this.assertChatNotBlocked(page);
      composer = await this.waitForComposer(page, Math.min(this.timeoutMs, 60000));
    }

    if (!composer) {
      throw createServiceError(
        409,
        'Kyrovia is not signed in. Complete sign-in in the Playwright browser window, then retry.'
      );
    }

    this.lastBrowserStatus = {
      loggedIn: true,
      blocked: false,
      blockerText: ''
    };
    const previousAssistantCount = await page.locator(ASSISTANT_SELECTOR).count();
    await this.attachFiles(page, files);
    const previousPageImageKeys = await this.getVisibleContentImageKeys(page.locator(PAGE_IMAGE_SCOPE_SELECTOR).first());
    const previousDownloadKeys = await this.getDownloadCandidateKeys(page);
    const expectImage = options.expectImage || IMAGE_GENERATION_INTENT_RE.test(prompt);
    await this.fillComposer(page, composer, prompt.trim());
    await this.submitPrompt(page);

    const assistant = await this.waitForAssistantResponseStarted(
      page,
      previousAssistantCount,
      previousPageImageKeys,
      expectImage
    );
    const response = await this.waitForStableResponse(
      page,
      assistant,
      previousPageImageKeys,
      previousDownloadKeys,
      DOWNLOAD_INTENT_RE.test(prompt),
      ARTIFACT_INTENT_RE.test(prompt),
      VISUAL_RESPONSE_INTENT_RE.test(prompt),
      expectImage,
      options.onResponseUpdate
        ? async (update) => {
            await options.onResponseUpdate({
              ...update,
              conversationUrl: page.url(),
              model: target.id,
              provider: target.provider
            });
          }
        : null
    );

    const conversationUrl = page.url();
    if (options.sessionKey && this.isConversationUrl(conversationUrl)) {
      this.sessionUrls.set(options.sessionKey, conversationUrl);
    }

    return {
      text: response.text,
      images: response.images,
      interactiveHtml: response.interactiveHtml,
      files: response.files,
      sources: response.sources,
      artifacts: response.artifacts,
      conversationUrl,
      model: target.id,
      provider: target.provider,
      scrapedAt: new Date().toISOString()
    };
  }

  isBrowserClosedError(error) {
    const message = String(error?.message || error || '');
    return (
      error?.name === 'TargetClosedError' ||
      /Target page, context or browser has been closed|Target closed|Browser has been closed|browser context has been closed|Protocol error.*Target closed/i.test(
        message
      )
    );
  }

  createBrowserClosedDuringRequestError(error) {
    const serviceError = createServiceError(
      503,
      'Kyrovia browser closed while generating the reply. The backend restarted the browser session and retried the message.'
    );
    serviceError.cause = error;
    serviceError.transientBrowserClosed = true;
    return serviceError;
  }

  async resetBrowserAfterRequestTimeout(page, error) {
    console.warn(error.message);
    this.ready = false;
    this.sessionUrls.clear();
    this.activeRequestPages.clear();

    await page?.close?.().catch(() => undefined);
    await this.context?.close?.().catch((closeError) => {
      console.warn(`Kyrovia browser context did not close after timeout: ${closeError.message}`);
    });

    this.context = null;
    this.page = null;
  }

  async resetBrowserAfterUnexpectedClose(page, error) {
    console.warn(`Kyrovia browser closed during request: ${this.formatStartupError(error)}`);
    this.ready = false;
    this.sessionUrls.clear();
    this.activeRequestPages.clear();

    await page?.close?.().catch(() => undefined);
    await this.context?.close?.().catch(() => undefined);

    this.context = null;
    this.page = null;
  }

  async createRequestPage() {
    if (!this.context) {
      throw createServiceError(503, 'Browser context is not available');
    }

    if (!this.parallelTabs) {
      const page = await this.ensurePage();
      this.activeRequestPages.add(page);
      await page.keyboard.press('Control+0').catch(() => undefined);
      return page;
    }

    const page = await this.context.newPage();
    this.activeRequestPages.add(page);
    await page.keyboard.press('Control+0').catch(() => undefined);
    return page;
  }

  async closeRequestPage(page) {
    if (!page) {
      return;
    }

    this.activeRequestPages.delete(page);
    if (!this.parallelTabs || page === this.page) {
      return;
    }

    if (!page.isClosed()) {
      await page.close().catch(() => undefined);
    }
  }

  async ensurePage() {
    if (!this.context) {
      throw createServiceError(503, 'Browser context is not available');
    }

    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    this.page = this.context.pages()[0] || (await this.context.newPage());
    return this.page;
  }

  getQueueStatus() {
    return {
      ...this.requestQueue.getStatus(),
      mode: this.parallelTabs ? 'parallel-tabs' : 'shared-browser-serial',
      parallelTabs: this.parallelTabs,
      activeTabs: this.activeRequestPages.size,
      openTabs: this.context?.pages().filter((page) => !page.isClosed()).length || 0
    };
  }

  resolveQueueKey(sessionKey = '') {
    if (!this.parallelTabs) {
      return SHARED_BROWSER_QUEUE_KEY;
    }

    return this.normalizeSessionKey(sessionKey) || SHARED_BROWSER_QUEUE_KEY;
  }

  normalizeSessionKey(value) {
    if (typeof value !== 'string') {
      return '';
    }

    return value.trim().slice(0, 500);
  }

  async openRequestConversation(page, options = {}) {
    const sessionUrl = options.freshChat ? '' : this.sessionUrls.get(options.sessionKey);
    const targetUrl = sessionUrl && this.isConversationUrl(sessionUrl) ? sessionUrl : this.chatUrl;

    if (page.url() === targetUrl) {
      return;
    }

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: this.timeoutMs });
  }

  isConversationUrl(currentUrl) {
    try {
      const current = new URL(currentUrl);
      const target = new URL(this.chatUrl);
      return current.origin === target.origin && /^\/c\/[^/]+/i.test(current.pathname);
    } catch (_error) {
      return false;
    }
  }

  async gotoChat(page) {
    if (!this.isOnChatTarget(page.url())) {
      await page.goto(this.chatUrl, { waitUntil: 'domcontentloaded', timeout: this.timeoutMs });
    }
  }

  isOnChatTarget(currentUrl) {
    try {
      const current = new URL(currentUrl);
      const target = new URL(this.chatUrl);
      return current.origin === target.origin;
    } catch (_error) {
      return false;
    }
  }

  async findComposer(page, selectors = COMPOSER_SELECTORS) {
    for (const selector of selectors) {
      const locator = page.locator(selector).last();
      const count = await locator.count();

      if (!count) {
        continue;
      }

      const visible = await locator.isVisible().catch(() => false);
      const editable = await locator.isEditable().catch(() => true);

      if (visible && editable) {
        return locator;
      }
    }

    return null;
  }

  async waitForComposer(page, timeoutMs = Math.min(this.timeoutMs, 30000), selectors = COMPOSER_SELECTORS) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const composer = await this.findComposer(page, selectors);

      if (composer) {
        return composer;
      }

      await page.waitForTimeout(RESPONSE_POLL_INTERVAL_MS);
    }

    return null;
  }

  async getBlockingModal(page) {
    for (const selector of BLOCKING_MODAL_SELECTORS) {
      const modal = page.locator(selector).first();
      const count = await modal.count().catch(() => 0);

      if (!count) {
        continue;
      }

      const visible = await modal.isVisible().catch(() => false);
      if (visible) {
        return modal;
      }
    }

    return null;
  }

  async describeBlockingModal(modal) {
    const text = await modal.innerText({ timeout: 1000 }).catch(() => '');
    const normalized = text.replace(/\s+/g, ' ').trim();

    if (!normalized) {
      return 'A Kyrovia sign-in or rate-limit dialog is open.';
    }

    return normalized.length > MAX_BLOCKER_TEXT_LENGTH
      ? `${normalized.slice(0, MAX_BLOCKER_TEXT_LENGTH)}...`
      : normalized;
  }

  async assertChatNotBlocked(page) {
    const blocker = await this.getBlockingModal(page);

    if (!blocker) {
      return;
    }

    const blockerText = await this.describeBlockingModal(blocker);
    throw createServiceError(
      409,
      `Kyrovia is blocking messages: ${blockerText} Open the Playwright browser window, resolve that dialog, then retry.`
    );
  }

  async ensureReadyForPrompt(page) {
    const deadline = Date.now() + Math.min(this.timeoutMs, PROMPT_READY_TIMEOUT_MS);

    while (Date.now() < deadline) {
      await this.assertChatNotBlocked(page);

      if (!(await this.isGenerating(page))) {
        return;
      }

      await this.stopGenerating(page);
      await page.waitForTimeout(RESPONSE_POLL_INTERVAL_MS);
    }

    if (await this.isGenerating(page)) {
      throw createServiceError(
        409,
        'Kyrovia is still generating the previous response. Stop it in the browser window, then retry.'
      );
    }
  }

  async recoverBrowserAfterSendError(page) {
    if (!page || page.isClosed()) {
      return;
    }

    await this.stopGenerating(page).catch(() => undefined);
    await page
      .goto(this.chatUrl, {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(this.timeoutMs, PROMPT_READY_TIMEOUT_MS)
      })
      .catch(() => undefined);
  }

  selectAllShortcut() {
    return process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
  }

  async focusComposer(composer) {
    await composer.evaluate((node) => {
      const target =
        node.matches?.('textarea,input,[contenteditable="true"]')
          ? node
          : node.querySelector?.('textarea,input,[contenteditable="true"]') || node;

      target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
      target.focus?.({ preventScroll: true });
    });
  }

  async readComposerText(composer) {
    return composer
      .evaluate((node) => {
        const target =
          node.matches?.('textarea,input,[contenteditable="true"]')
            ? node
            : node.querySelector?.('textarea,input,[contenteditable="true"]') || node;

        if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
          return target.value || '';
        }

        return target.innerText || target.textContent || '';
      })
      .catch(() => '');
  }

  async waitForComposerFilled(page, composer, prompt, timeoutMs = COMPOSER_FILL_VERIFY_TIMEOUT_MS) {
    const expected = normalizeComposerText(prompt);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const current = normalizeComposerText(await this.readComposerText(composer));

      if (current === expected) {
        return true;
      }

      await page.waitForTimeout(RESPONSE_POLL_INTERVAL_MS);
    }

    return normalizeComposerText(await this.readComposerText(composer)) === expected;
  }

  async setComposerTextInDom(composer, prompt) {
    return composer
      .evaluate((node, value) => {
        const text = String(value || '');
        const normalize = (input) =>
          String(input || '')
            .replace(/\r\n/g, '\n')
            .replace(/\u00a0/g, ' ')
            .trim();
        const target =
          node.matches?.('textarea,input,[contenteditable="true"]')
            ? node
            : node.querySelector?.('textarea,input,[contenteditable="true"]') || node;

        const dispatchInput = (inputType = 'insertText') => {
          target.dispatchEvent(
            new InputEvent('input', {
              bubbles: true,
              data: text,
              inputType
            })
          );
          target.dispatchEvent(new Event('change', { bubbles: true }));
        };

        target.focus?.({ preventScroll: true });

        if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
          const descriptor = Object.getOwnPropertyDescriptor(target.constructor.prototype, 'value');

          if (descriptor?.set) {
            descriptor.set.call(target, text);
          } else {
            target.value = text;
          }

          dispatchInput('insertReplacementText');
          return normalize(target.value) === normalize(text);
        }

        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(target);
        selection.removeAllRanges();
        selection.addRange(range);

        let inserted = false;
        try {
          inserted = document.execCommand('insertText', false, text);
        } catch (_error) {
          inserted = false;
        }

        if (!inserted || normalize(target.innerText || target.textContent) !== normalize(text)) {
          const fragment = document.createDocumentFragment();
          text.split('\n').forEach((line, index) => {
            if (index > 0) {
              fragment.appendChild(document.createElement('br'));
            }

            fragment.appendChild(document.createTextNode(line));
          });
          target.replaceChildren(fragment);
        }

        dispatchInput(inserted ? 'insertText' : 'insertReplacementText');
        return normalize(target.innerText || target.textContent) === normalize(text);
      }, prompt)
      .catch(() => false);
  }

  async fillComposer(page, composer, prompt) {
    try {
      await this.focusComposer(composer);
      await page.keyboard.press(this.selectAllShortcut());
      await page.keyboard.insertText(prompt);
      await page.waitForTimeout(COMPOSER_FILL_SETTLE_MS);

      if (await this.waitForComposerFilled(page, composer, prompt)) {
        return;
      }
    } catch (_keyboardFillError) {
      await this.assertChatNotBlocked(page);
    }

    try {
      if (await this.setComposerTextInDom(composer, prompt)) {
        await page.waitForTimeout(COMPOSER_FILL_SETTLE_MS);

        if (await this.waitForComposerFilled(page, composer, prompt)) {
          return;
        }
      }
    } catch (_directFillError) {
      await this.assertChatNotBlocked(page);
    }

    try {
      await composer.fill(prompt, { timeout: 5000 });
      await page.waitForTimeout(COMPOSER_FILL_SETTLE_MS);

      if (await this.waitForComposerFilled(page, composer, prompt)) {
        return;
      }
    } catch (_fillError) {
      await this.assertChatNotBlocked(page);
    }

    try {
      await this.focusComposer(composer);
      await page.keyboard.press(this.selectAllShortcut());
      await page.keyboard.type(prompt, { delay: 0 });
      await page.waitForTimeout(COMPOSER_FILL_SETTLE_MS);

      if (await this.waitForComposerFilled(page, composer, prompt)) {
        return;
      }
    } catch (_typedFillError) {
      await this.assertChatNotBlocked(page);
    }

    throw createServiceError(
      409,
      'Kyrovia could not enter the prompt in its browser workspace. Reload the Kyrovia browser window, make sure the composer is available, then retry.'
    );
  }

  async submitPrompt(page, selectors = SEND_BUTTON_SELECTORS) {
    for (const selector of selectors) {
      const buttons = page.locator(selector);
      const count = await buttons.count().catch(() => 0);

      for (let index = count - 1; index >= 0; index -= 1) {
        const button = buttons.nth(index);
        const visible = await button.isVisible().catch(() => false);
        const enabled = await button.isEnabled().catch(() => false);

        if (visible && enabled) {
          await button.evaluate((node) => node.click());
          return;
        }
      }
    }

    await page.keyboard.press('Enter');
  }

  async attachFiles(page, files) {
    if (!files.length) {
      return;
    }

    const filePaths = files.map((file) => file.path);
    const fileInput = await this.findFileInput(page);

    if (fileInput) {
      await fileInput.setInputFiles(filePaths);
      await this.waitForFileUploadsSettled(page, files);
      return;
    }

    const addFilesButton = await this.findAddFilesButton(page);
    if (!addFilesButton) {
      throw createServiceError(409, 'Could not find the file upload control in the Kyrovia browser session.');
    }

    const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
    await addFilesButton.click();
    const fileChooser = await chooserPromise;

    if (fileChooser) {
      await fileChooser.setFiles(filePaths);
      await this.waitForFileUploadsSettled(page, files);
      return;
    }

    const openedInput = await this.findFileInput(page);
    if (!openedInput) {
      throw createServiceError(409, 'File upload did not open in the Kyrovia browser session.');
    }

    await openedInput.setInputFiles(filePaths);
    await this.waitForFileUploadsSettled(page, files);
  }

  async findFileInput(page) {
    const inputs = page.locator('input[type="file"]');
    const count = await inputs.count().catch(() => 0);

    if (!count) {
      return null;
    }

    return inputs.last();
  }

  async findAddFilesButton(page) {
    for (const selector of ADD_FILES_BUTTON_SELECTORS) {
      const button = page.locator(selector).first();
      const visible = await button.isVisible().catch(() => false);
      const enabled = await button.isEnabled().catch(() => false);

      if (visible && enabled) {
        return button;
      }
    }

    return null;
  }

  async waitForFileUploadsSettled(page, files) {
    const startedAt = Date.now();
    const targetNames = files.map((file) => file.name).filter(Boolean);

    while (Date.now() - startedAt < Math.min(this.timeoutMs, 30000)) {
      await this.assertChatNotBlocked(page);

      const uploading = await page.locator('text=/uploading|processing|attaching/i').count().catch(() => 0);
      const visibleNames = await Promise.all(
        targetNames.map((name) => page.getByText(name, { exact: false }).first().isVisible().catch(() => false))
      );

      if (!uploading && (!targetNames.length || visibleNames.some(Boolean) || Date.now() - startedAt > 2500)) {
        await page.waitForTimeout(800);
        return;
      }

      await page.waitForTimeout(500);
    }
  }

  async waitForAssistantResponseStarted(
    page,
    previousCount,
    previousPageImageKeys = new Set(),
    expectImage = false
  ) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < this.timeoutMs) {
      await this.assertChatNotBlocked(page);

      const assistants = page.locator(ASSISTANT_SELECTOR);
      const currentCount = await assistants.count().catch(() => 0);

      if (currentCount > previousCount) {
        return assistants.last();
      }

      // Generated images can appear in a page-level canvas before ChatGPT adds an
      // assistant message wrapper. For ordinary text requests, page images are not
      // a valid response-start signal: an image from an earlier turn may simply be
      // finishing a lazy reload and would make us scrape the whole conversation.
      if (!expectImage) {
        await page.waitForTimeout(RESPONSE_POLL_INTERVAL_MS);
        continue;
      }

      const newPageImages = await this.getNewVisibleContentImages(page, previousPageImageKeys);

      if (newPageImages.length) {
        const newestImage = this.rankImageCandidates(newPageImages)[0];
        const imageAssistant = newestImage.locator.locator(
          'xpath=ancestor::*[@data-message-author-role="assistant"][1]'
        );
        const imageAssistantCount = await imageAssistant.count().catch(() => 0);

        if (imageAssistantCount) {
          return imageAssistant;
        }

        return page.locator(PAGE_IMAGE_SCOPE_SELECTOR).first();
      }

      await page.waitForTimeout(RESPONSE_POLL_INTERVAL_MS);
    }

    throw createServiceError(
      504,
      'Timed out waiting for Kyrovia to start a response. If an image appeared in the browser, refresh the proxy and try again.'
    );
  }

  async getAssistantSignature(locator) {
    const text = await locator.innerText().catch(() => '');
    const imageCount = await this.countVisibleContentImages(locator);
    const visualCount = await this.countVisibleResponseVisuals(locator);
    return `${text.trim()}|images:${imageCount}|visuals:${visualCount}`;
  }

  async waitForStableResponse(
    page,
    locator,
    previousPageImageKeys = new Set(),
    previousDownloadKeys = new Set(),
    expectDownloadLinks = false,
    expectArtifacts = false,
    expectVisual = false,
    expectImage = false,
    onResponseUpdate = null
  ) {
    const startedAt = Date.now();
    let stableReads = 0;
    let stableSignatureReads = 0;
    let lastSignature = '';
    let lastStreamedText = '';
    let lastStreamedRawText = '';
    const inspectImages = expectImage || expectVisual;
    const inspectDownloads = expectDownloadLinks;
    const richResponse = inspectImages || inspectDownloads || expectArtifacts;
    const requiredStableReads = richResponse ? STABLE_READS_REQUIRED : 1;

    while (Date.now() - startedAt < this.timeoutMs) {
      const text = await locator.innerText().catch(() => '');
      const imageCount = inspectImages ? await this.countVisibleContentImages(locator) : 0;
      const visualCount = expectVisual ? await this.countVisibleResponseVisuals(locator) : 0;
      const newPageImages = inspectImages
        ? await this.getNewVisibleContentImages(page, previousPageImageKeys)
        : [];
      const newPageImageCount = newPageImages.length;
      const newPageImageSignature = newPageImages.map((image) => image.key).sort().join('||');
      const downloadLinkCount = inspectDownloads
        ? await this.countDownloadCandidateLinks(page, locator, previousDownloadKeys)
        : 0;
      const responseText = /^thinking\.{0,3}$/i.test(text.trim()) ? '' : text.trim();
      const generating = await this.isGenerating(page);
      const hasImage = imageCount > 0 || newPageImageCount > 0 || visualCount > 0;
      const hasGeneratedImage = imageCount > 0 || newPageImageCount > 0;
      const hasDownload = downloadLinkCount > 0;
      const imageRequestFinished =
        !expectImage || hasGeneratedImage || TERMINAL_IMAGE_FAILURE_RE.test(responseText);
      const signature = `${responseText}|assistantImages:${imageCount}|visuals:${visualCount}|pageImages:${newPageImageCount}:${newPageImageSignature}|downloads:${downloadLinkCount}`;
      const hasResponse = Boolean(responseText || hasImage || hasDownload);
      const sameSignature = signature === lastSignature;

      if (hasResponse && sameSignature) {
        stableSignatureReads += 1;
      } else {
        stableSignatureReads = 0;
      }

      if (
        typeof onResponseUpdate === 'function' &&
        !expectImage &&
        responseText &&
        responseText !== lastStreamedRawText
      ) {
        lastStreamedRawText = responseText;
        const streamedText =
          (await this.extractAssistantMarkdown(locator).catch(() => '')) || responseText;

        if (streamedText && streamedText !== lastStreamedText) {
          lastStreamedText = streamedText;
          try {
            await onResponseUpdate({
              text: streamedText,
              generating
            });
          } catch (_error) {
            // A disconnected response stream must not stop backend generation.
          }
        }
      }

      if (
        hasResponse &&
        imageRequestFinished &&
        sameSignature &&
        (!generating ||
          hasDownload ||
          (!richResponse &&
            responseText &&
            stableSignatureReads >= TEXT_STABLE_WHILE_GENERATING_READS))
      ) {
        stableReads += 1;
      } else {
        stableReads = 0;
      }

      if (stableReads >= requiredStableReads) {
        if (inspectDownloads || expectArtifacts) {
          await this.waitForResponseArtifactsSettled(
            page,
            locator,
            text,
            previousDownloadKeys,
            expectDownloadLinks,
            expectArtifacts
          );
        }

        const images = inspectImages
          ? await this.scrapeResponseImages(page, locator, previousPageImageKeys, {
              expectImage
            })
          : [];
        let capturedVisual = null;

        if (expectVisual && !images.length) {
          capturedVisual = await this.captureResponseVisual(locator, {
            allowRootFallback: expectVisual
          });

          if (capturedVisual) {
            images.push(capturedVisual);
          }
        }

        const [extractedMarkdown, files, sources, artifacts] = await Promise.all([
          this.extractAssistantMarkdown(locator, {
            excludeVisuals: Boolean(capturedVisual)
          }),
          inspectDownloads
            ? this.scrapeResponseFiles(page, locator, previousDownloadKeys)
            : Promise.resolve([]),
          this.scrapeResponseSources(page, locator),
          expectArtifacts ? this.scrapeResponseArtifacts(page) : Promise.resolve([])
        ]);
        const markdown = extractedMarkdown || text;
        const interactiveVisual = extractInteractiveVisual(markdown);

        return {
          text: interactiveVisual.markdown,
          images,
          interactiveHtml: interactiveVisual.html,
          files,
          sources,
          artifacts
        };
      }

      lastSignature = signature;
      await page.waitForTimeout(RESPONSE_POLL_INTERVAL_MS);
    }

    throw createServiceError(504, 'Timed out waiting for Kyrovia response');
  }

  async getVisibleContentImageKeys(locator) {
    const images = await this.collectVisibleContentImageRecords(locator);
    return new Set(images.map((image) => image.key));
  }

  async extractAssistantMarkdown(locator, options = {}) {
    return locator
      .evaluate((root, extractionOptions) => {
        const skipSelectors = [
          'button',
          'svg',
          'script',
          'style',
          'textarea',
          'input',
          '[aria-hidden="true"]',
          '[data-testid*="copy" i]',
          '[data-testid*="feedback" i]',
          '[data-testid*="turn-action" i]',
          '[class*="sr-only" i]'
        ];
        if (!extractionOptions?.allowEditable) {
          skipSelectors.push('[contenteditable="true"]');
        }
        const SKIP_SELECTOR = skipSelectors.join(',');
        const BLOCK_TAGS = new Set([
          'ADDRESS',
          'ARTICLE',
          'ASIDE',
          'BLOCKQUOTE',
          'DIV',
          'DL',
          'FIELDSET',
          'FIGCAPTION',
          'FIGURE',
          'FOOTER',
          'FORM',
          'H1',
          'H2',
          'H3',
          'H4',
          'H5',
          'H6',
          'HEADER',
          'HR',
          'LI',
          'MAIN',
          'NAV',
          'OL',
          'P',
          'PRE',
          'SECTION',
          'TABLE',
          'UL'
        ]);

        function isElement(node) {
          return node && node.nodeType === Node.ELEMENT_NODE;
        }

        function visibleBox(node) {
          if (!(node instanceof Element)) {
            return null;
          }

          const style = window.getComputedStyle(node);
          const box = node.getBoundingClientRect();

          if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            Number(style.opacity || 1) <= 0 ||
            box.width <= 0 ||
            box.height <= 0
          ) {
            return null;
          }

          return box;
        }

        function visibleVisualSignal(node) {
          const box = visibleBox(node);

          if (!box) {
            return false;
          }

          if (node.matches('input[type="range"]')) {
            return box.width >= 80 || box.height >= 80;
          }

          if (node.matches('[role="slider"]')) {
            let track = node.parentElement;

            for (let depth = 0; track && depth < 4; depth += 1, track = track.parentElement) {
              const trackBox = visibleBox(track);

              if (trackBox && (trackBox.width >= 80 || trackBox.height >= 80)) {
                return true;
              }
            }

            return false;
          }

          return (
            box.width >= extractionOptions.minVisualWidth &&
            box.height >= extractionOptions.minVisualHeight
          );
        }

        function findExcludedVisualRoot() {
          if (!extractionOptions.excludeVisuals) {
            return null;
          }

          const signals = Array.from(
            root.querySelectorAll('canvas, iframe, svg, input[type="range"], [role="slider"]')
          ).filter(visibleVisualSignal);
          const candidates = new Map();

          for (const signal of signals) {
            let current = signal;

            for (let depth = 0; current && current !== root && depth < 9; depth += 1, current = current.parentElement) {
              const box = visibleBox(current);

              if (
                !box ||
                box.width < extractionOptions.minVisualWidth ||
                box.height < extractionOptions.minVisualHeight
              ) {
                continue;
              }

              const largeVisuals = [
                ...(current.matches('canvas, iframe, svg') ? [current] : []),
                ...current.querySelectorAll('canvas, iframe, svg')
              ].filter(visibleVisualSignal).length;
              const sliders = [
                ...(current.matches('input[type="range"], [role="slider"]') ? [current] : []),
                ...current.querySelectorAll('input[type="range"], [role="slider"]')
              ].filter(visibleVisualSignal).length;
              const semanticContext = [
                current.id,
                current.getAttribute('class'),
                current.getAttribute('aria-label'),
                current.getAttribute('data-testid')
              ]
                .filter(Boolean)
                .join(' ');
              const semanticBonus =
                !current.matches('canvas, iframe, svg, input[type="range"], [role="slider"]') &&
                /\b(learning-block|visuali[sz]ation|diagram|chart|graph|simulation|interactive|circuit)\b/i.test(
                  semanticContext
                )
                  ? 12
                  : 0;
              const score = largeVisuals * 8 + sliders * 5 + semanticBonus;

              if (!score) {
                continue;
              }

              const existing = candidates.get(current);
              const area = box.width * box.height;

              if (!existing || score > existing.score) {
                candidates.set(current, {
                  node: current,
                  score,
                  area
                });
              }
            }
          }

          return (
            Array.from(candidates.values()).sort((left, right) => {
              if (right.score !== left.score) {
                return right.score - left.score;
              }

              return left.area - right.area;
            })[0]?.node || null
          );
        }

        const excludedVisualRoot = findExcludedVisualRoot();

        function shouldSkip(node) {
          if (node === excludedVisualRoot) {
            return true;
          }

          if (
            isElement(node) &&
            node.tagName === 'BUTTON' &&
            ((/\bdownload\b/i.test(node.textContent || '') &&
              /\b(file|pdf|docx?|word|xlsx?|spreadsheet|csv|pptx?|slides?|zip|archive|python|source\s+code|code|html|json|text|txt|image|png|jpe?g|webp|gif|svg)\b/i.test(
                node.textContent || ''
              )) ||
              /\.(pdf|docx?|xlsx?|pptx?|zip|py|js|jsx|ts|tsx|html|css|json|txt|csv|md|png|jpe?g|webp|gif|svg|mp3|wav|mp4|mov)(?:[?#]|$)/i.test(
                node.textContent || ''
              ))
          ) {
            return false;
          }

          return isElement(node) && node.matches(SKIP_SELECTOR);
        }

        function cleanInline(value) {
          return String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t\r\n]+/g, ' ');
        }

        function cleanBlock(value) {
          return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        }

        function isMathElement(node) {
          return (
            isElement(node) &&
            (node.matches(
              '.katex, .katex-display, .math-inline, .math-display, [data-latex], [data-math], mjx-container, math'
            ) ||
              node.getAttribute('role') === 'math')
          );
        }

        function isDisplayMathElement(node) {
          return (
            isElement(node) &&
            (node.matches('.katex-display, .math-display, mjx-container[display="true"]') ||
              /\bdisplay\b/i.test(node.getAttribute('data-math-style') || ''))
          );
        }

        function mathTex(node) {
          if (!isElement(node)) {
            return '';
          }

          const annotation = node.querySelector('annotation[encoding="application/x-tex"]');
          const candidates = [
            node.getAttribute('data-latex'),
            node.getAttribute('data-math'),
            annotation?.textContent,
            node.getAttribute('aria-label')
          ];
          const tex = candidates.find((value) => typeof value === 'string' && value.trim());

          return String(tex || '')
            .trim()
            .replace(/^\\\(([\s\S]*)\\\)$/g, '$1')
            .replace(/^\\\[([\s\S]*)\\\]$/g, '$1');
        }

        function children(node) {
          return Array.from(node.childNodes || []);
        }

        function inlineChildren(node, options = {}) {
          const rendered = children(node).map(renderInline).join('');

          if (!options.preserveBreaks) {
            return cleanInline(rendered).trim();
          }

          return rendered
            .split(/\n+/)
            .map((line) => cleanInline(line).trim())
            .filter(Boolean)
            .join('\\\n');
        }

        function renderInline(node) {
          if (!node) {
            return '';
          }

          if (node.nodeType === Node.TEXT_NODE) {
            return cleanInline(node.textContent);
          }

          if (!isElement(node) || shouldSkip(node)) {
            return '';
          }

          if (isMathElement(node)) {
            const tex = mathTex(node);

            if (tex) {
              return isDisplayMathElement(node) ? `$$${tex}$$` : `$${tex}$`;
            }
          }

          const tag = node.tagName;

          if (tag === 'BR') {
            return '\n';
          }

          if (tag === 'STRONG' || tag === 'B') {
            const content = inlineChildren(node);
            return content ? `**${content}**` : '';
          }

          if (tag === 'EM' || tag === 'I') {
            const content = inlineChildren(node);
            return content ? `_${content}_` : '';
          }

          if (tag === 'CODE') {
            const content = cleanInline(node.textContent).trim();
            return content ? `\`${content.replace(/`/g, '\\`')}\`` : '';
          }

          if (tag === 'A') {
            const content = inlineChildren(node) || cleanInline(node.textContent).trim();
            const href = node.getAttribute('href') || '';
            return content && /^https?:\/\//i.test(href) ? `[${content}](${href})` : content;
          }

          return children(node).map(renderInline).join('');
        }

        function renderList(node, ordered) {
          return children(node)
            .filter((child) => isElement(child) && child.tagName === 'LI')
            .map((child, index) => renderListItem(child, ordered ? `${index + 1}.` : '-'))
            .filter(Boolean)
            .join('\n');
        }

        function renderListItem(node, marker) {
          const nested = [];
          const inlineParts = [];

          for (const child of children(node)) {
            if (shouldSkip(child)) {
              continue;
            }

            if (isElement(child) && (child.tagName === 'UL' || child.tagName === 'OL')) {
              const nestedList = renderList(child, child.tagName === 'OL')
                .split('\n')
                .map((line) => (line ? `  ${line}` : line))
                .join('\n');
              nested.push(nestedList);
            } else if (isElement(child) && BLOCK_TAGS.has(child.tagName)) {
              const block = renderBlock(child);
              if (block) {
                inlineParts.push(` ${block.replace(/\n{2,}/g, '\n').trim()} `);
              }
            } else {
              inlineParts.push(renderInline(child));
            }
          }

          const firstLine = cleanInline(inlineParts.join('')).trim();
          const lines = firstLine ? [`${marker} ${firstLine}`] : [];

          for (const nestedList of nested) {
            if (nestedList) {
              lines.push(nestedList);
            }
          }

          return lines.join('\n');
        }

        function renderTable(node) {
          const rows = Array.from(node.querySelectorAll('tr')).map((row) =>
            Array.from(row.querySelectorAll('th,td')).map((cell) => inlineChildren(cell).replace(/\|/g, '\\|'))
          );

          if (!rows.length) {
            return '';
          }

          const width = Math.max(...rows.map((row) => row.length));
          const normalized = rows.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill('')]);
          const header = normalized[0];
          const separator = Array(width).fill('---');
          const body = normalized.slice(1);
          const markdownRows = [header, separator, ...body].map((row) => `| ${row.join(' | ')} |`);

          return markdownRows.join('\n');
        }

        function normalizeCodeLanguage(value) {
          const text = String(value || '').toLowerCase();
          const languageMatch = /language-([a-z0-9_+#.-]+)/i.exec(text);

          if (languageMatch?.[1]) {
            return languageMatch[1].toLowerCase();
          }

          const aliases = [
            ['python', 'python'],
            ['py', 'python'],
            ['javascript', 'javascript'],
            ['typescript', 'typescript'],
            ['tsx', 'tsx'],
            ['jsx', 'jsx'],
            ['html', 'html'],
            ['css', 'css'],
            ['json', 'json'],
            ['bash', 'bash'],
            ['shell', 'bash'],
            ['powershell', 'powershell'],
            ['java', 'java'],
            ['c++', 'cpp'],
            ['cpp', 'cpp'],
            ['c#', 'csharp'],
            ['csharp', 'csharp'],
            ['sql', 'sql'],
            ['php', 'php'],
            ['ruby', 'ruby'],
            ['go', 'go'],
            ['rust', 'rust']
          ];
          const match = aliases.find(([label]) => new RegExp(`(^|[^a-z0-9])${label.replace(/[+#]/g, '\\$&')}([^a-z0-9]|$)`).test(text));

          return match?.[1] || '';
        }

        function inferCodeLanguage(pre) {
          const code = pre.querySelector('code');
          const closestLanguageNode = pre.closest('[data-language], [class*="language-"]');
          const candidates = [
            code?.getAttribute('class'),
            pre.getAttribute('class'),
            code?.getAttribute('data-language'),
            pre.getAttribute('data-language'),
            closestLanguageNode?.getAttribute('data-language'),
            closestLanguageNode?.getAttribute('class'),
            pre.previousElementSibling?.textContent,
            pre.parentElement?.querySelector('[data-language]')?.getAttribute('data-language')
          ];

          return candidates.map(normalizeCodeLanguage).find(Boolean) || '';
        }

        function extractPreText(pre) {
          const code = pre.querySelector('code') || pre;
          const rawText = code.innerText || code.textContent || '';
          const cleaned = rawText
            .replace(/\r\n/g, '\n')
            .replace(/^\s*(Python|JavaScript|TypeScript|HTML|CSS|JSON|Bash|Shell|PowerShell|Java|C\+\+|C#|SQL|PHP|Ruby|Go|Rust)\s*\n/i, '')
            .replace(/^\s*Run\s*\n/i, '')
            .replace(/\n+$/g, '');

          return cleaned;
        }

        function renderBlock(node) {
          if (!node) {
            return '';
          }

          if (node.nodeType === Node.TEXT_NODE) {
            return cleanInline(node.textContent).trim();
          }

          if (!isElement(node) || shouldSkip(node)) {
            return '';
          }

          if (isMathElement(node)) {
            const tex = mathTex(node);

            if (tex) {
              return isDisplayMathElement(node) ? `$$\n${tex}\n$$` : `$${tex}$`;
            }
          }

          const tag = node.tagName;

          if (/^H[1-6]$/.test(tag)) {
            return `${'#'.repeat(Number(tag.slice(1)))} ${inlineChildren(node)}`;
          }

          if (tag === 'P') {
            return inlineChildren(node, { preserveBreaks: true });
          }

          if (tag === 'UL' || tag === 'OL') {
            return renderList(node, tag === 'OL');
          }

          if (tag === 'PRE') {
            const code = extractPreText(node);
            const language = inferCodeLanguage(node);
            return code ? `\`\`\`${language}\n${code}\n\`\`\`` : '';
          }

          if (tag === 'BLOCKQUOTE') {
            return renderChildrenAsBlocks(node)
              .split('\n')
              .map((line) => (line ? `> ${line}` : '>'))
              .join('\n');
          }

          if (tag === 'TABLE') {
            return renderTable(node);
          }

          const blockContent = renderChildrenAsBlocks(node);

          if (blockContent) {
            return blockContent;
          }

          return inlineChildren(node);
        }

        function renderChildrenAsBlocks(node) {
          return children(node)
            .map(renderBlock)
            .map(cleanBlock)
            .filter(Boolean)
            .join('\n\n');
        }

        return cleanBlock(renderChildrenAsBlocks(root));
      }, {
        ...options,
        minVisualWidth: MIN_VISUAL_WIDTH_PX,
        minVisualHeight: MIN_VISUAL_HEIGHT_PX
      })
      .catch(() => '');
  }

  async scrapeResponseArtifacts(page) {
    const candidates = await page
      .evaluate(
        ({ maxArtifacts, maxTextLength, writingBlockContentSelector, writingBlockSelector }) => {
          const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
          const isVisible = (node) => {
            if (!(node instanceof Element)) {
              return false;
            }

            const style = window.getComputedStyle(node);
            const box = node.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 100 && box.height > 60;
          };
          const controlLabel = (node) =>
            normalize(
              [
                node.getAttribute('aria-label'),
                node.getAttribute('title'),
                node.getAttribute('data-testid'),
                node.textContent
              ].join(' ')
            ).toLowerCase();
          const actionFlags = (root) => {
            const labels = Array.from(root.querySelectorAll('button, a, [role="button"]'))
              .filter(isVisible)
              .map(controlLabel);

            return {
              count: labels.length,
              edit: labels.some((label) => /\bedit\b/.test(label)),
              copy: labels.some((label) => /\bcopy\b/.test(label)),
              download: labels.some((label) => /\bdownload\b|\bexport\b/.test(label)),
              expand: labels.some((label) => /\bexpand\b|\bfullscreen\b|\bfull screen\b|\bopen canvas\b/.test(label))
            };
          };
          const contentSelectors = [
            '[data-lexical-editor="true"]',
            '[contenteditable="true"]',
            '.ProseMirror',
            '[role="document"]',
            '[data-testid*="artifact" i]',
            '[data-testid*="canvas" i]',
            '[class*="prose" i]',
            'article'
          ].join(',');
          const chooseContentRoot = (root) => {
            const editableCandidates = Array.from(root.querySelectorAll(writingBlockContentSelector))
              .filter(isVisible)
              .map((node) => ({
                node,
                text: normalize(node.innerText || node.textContent)
              }))
              .filter((item) => item.text.length >= 120)
              .sort((left, right) => right.text.length - left.text.length);
            if (editableCandidates.length) {
              return editableCandidates[0];
            }

            const candidates = [root, ...root.querySelectorAll(contentSelectors)]
              .filter(isVisible)
              .map((node) => ({
                node,
                text: normalize(node.innerText || node.textContent)
              }))
              .filter((item) => item.text.length >= 120)
              .sort((left, right) => right.text.length - left.text.length);

            return candidates[0] || null;
          };
          const controls = Array.from(document.querySelectorAll('button, a, [role="button"]')).filter(isVisible);
          const seedControls = controls.filter((control) =>
            /\b(edit|copy|download|export|expand|fullscreen|full screen|open canvas)\b/.test(controlLabel(control))
          );
          const records = [];
          const usedRoots = new Set();
          const captureRoot = (root) => {
            if (!isVisible(root) || usedRoots.has(root) || records.length >= maxArtifacts) {
              return false;
            }

            const content = chooseContentRoot(root);
            if (!content || content.text.length > maxTextLength) {
              return false;
            }

            const captureId = `artifact-${Date.now()}-${records.length}`;
            const contentId = `${captureId}-content`;
            root.setAttribute('data-kyrovia-artifact-capture', captureId);
            content.node.setAttribute('data-kyrovia-artifact-content', contentId);
            const heading = Array.from(content.node.querySelectorAll('h1, h2, h3'))
              .map((node) => normalize(node.textContent))
              .find(Boolean);
            const firstLine = content.text.split(/\n+/).map(normalize).find(Boolean);
            const title = (heading || firstLine || `Generated document ${records.length + 1}`).slice(0, 240);

            usedRoots.add(root);
            records.push({
              captureId,
              contentId,
              title,
              plainText: content.text.slice(0, maxTextLength)
            });
            return true;
          };

          for (const writingBlock of document.querySelectorAll(writingBlockSelector)) {
            captureRoot(writingBlock);
          }

          for (const control of seedControls) {
            let root = control.parentElement;

            for (let depth = 0; root && depth < 9; depth += 1, root = root.parentElement) {
              if (
                root.hasAttribute('data-kyrovia-artifact-capture') ||
                root.querySelector('[data-kyrovia-artifact-capture]')
              ) {
                break;
              }

              if (!isVisible(root) || usedRoots.has(root)) {
                continue;
              }

              const flags = actionFlags(root);
              const hasArtifactToolbar =
                (flags.edit && flags.copy && (flags.download || flags.expand)) ||
                (flags.copy && flags.download && flags.expand) ||
                (flags.edit && flags.count >= 4);
              if (!hasArtifactToolbar) {
                continue;
              }

              if (captureRoot(root)) {
                break;
              }
            }

            if (records.length >= maxArtifacts) {
              break;
            }
          }

          return records;
        },
        {
          maxArtifacts: MAX_CAPTURED_ARTIFACTS,
          maxTextLength: MAX_ARTIFACT_TEXT_LENGTH,
          writingBlockSelector: WRITING_BLOCK_SELECTOR,
          writingBlockContentSelector: WRITING_BLOCK_CONTENT_SELECTOR
        }
      )
      .catch(() => []);
    const artifacts = [];

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const contentLocator = page.locator(`[data-kyrovia-artifact-content="${candidate.contentId}"]`).first();
      const visible = await contentLocator.isVisible().catch(() => false);
      if (!visible) {
        continue;
      }

      const markdown =
        (await this.extractAssistantMarkdown(contentLocator, { allowEditable: true })) || candidate.plainText || '';
      if (!markdown.trim()) {
        continue;
      }

      artifacts.push({
        id: `artifact-${index + 1}`,
        title: candidate.title || `Generated document ${index + 1}`,
        type: 'document',
        format: 'markdown',
        content: markdown.slice(0, MAX_ARTIFACT_TEXT_LENGTH),
        plainText: String(candidate.plainText || '').slice(0, MAX_ARTIFACT_TEXT_LENGTH),
        editable: true
      });
    }

    return artifacts;
  }

  async waitForResponseArtifactsSettled(
    page,
    assistantLocator,
    text = '',
    previousDownloadKeys = new Set(),
    expectDownloadLinks = false,
    expectArtifacts = false
  ) {
    await page.waitForTimeout(RESPONSE_FINAL_SETTLE_MS);
    await this.waitForWritingBlockSettled(page, text, expectArtifacts);

    if (!expectDownloadLinks && !DOWNLOAD_INTENT_RE.test(String(text))) {
      return;
    }

    const deadline = Date.now() + DOWNLOAD_LINK_SETTLE_MS;
    const minimumDeadline = expectDownloadLinks ? Date.now() + MIN_DOWNLOAD_LINK_WAIT_MS : 0;
    let previousCount = -1;
    let stableReads = 0;

    while (Date.now() < deadline) {
      const count = await this.countDownloadCandidateLinks(page, assistantLocator, previousDownloadKeys);

      if (count > 0 && count === previousCount) {
        stableReads += 1;
      } else {
        stableReads = 0;
      }

      if (stableReads >= 1 && Date.now() >= minimumDeadline) {
        return;
      }

      previousCount = count;
      await page.waitForTimeout(RESPONSE_POLL_INTERVAL_MS);
    }
  }

  async waitForWritingBlockSettled(page, responseText = '', expectArtifacts = false) {
    const blocks = page.locator(WRITING_BLOCK_SELECTOR);
    const initialCount = await blocks.count().catch(() => 0);
    const shouldWait = expectArtifacts || initialCount > 0 || ARTIFACT_RESPONSE_HINT_RE.test(String(responseText));
    if (!shouldWait) {
      return;
    }

    const deadline = Date.now() + Math.min(DOWNLOAD_LINK_SETTLE_MS, this.timeoutMs);
    let previousSignature = '';
    let stableReads = 0;

    while (Date.now() < deadline) {
      const count = await blocks.count().catch(() => 0);
      const textParts = [];

      for (let index = 0; index < count; index += 1) {
        const blockText = await blocks.nth(index).innerText().catch(() => '');
        textParts.push(blockText.trim());
      }

      const signature = `${count}|${textParts.join('||')}`;
      const generating = await this.isGenerating(page);
      if (count > 0 && signature === previousSignature && !generating) {
        stableReads += 1;
      } else {
        stableReads = 0;
      }

      if (stableReads >= STABLE_READS_REQUIRED) {
        return;
      }

      previousSignature = signature;
      await page.waitForTimeout(RESPONSE_POLL_INTERVAL_MS);
    }
  }

  async getDownloadCandidateKeys(page) {
    const seen = new Set();
    await this.collectDownloadLinkCandidates(page.locator(DOWNLOAD_LINK_SCOPE_SELECTOR), seen, false);
    return seen;
  }

  async countDownloadCandidateLinks(page, assistantLocator, previousDownloadKeys = new Set()) {
    const assistantSeen = new Set(previousDownloadKeys);
    const assistantCandidates = await this.collectDownloadLinkCandidates(
      assistantLocator.locator(DOWNLOAD_CONTROL_SELECTOR),
      assistantSeen,
      false
    );

    if (assistantCandidates.length >= MAX_CAPTURED_FILES) {
      return assistantCandidates.length;
    }

    const seen = new Set(assistantSeen);
    const pageCandidates = await this.collectDownloadLinkCandidates(
      page.locator(DOWNLOAD_LINK_SCOPE_SELECTOR),
      seen,
      false,
      assistantCandidates.length
    );

    return assistantCandidates.length + pageCandidates.length;
  }

  async scrapeResponseFiles(page, assistantLocator, previousDownloadKeys = new Set()) {
    const assistantSeen = new Set(previousDownloadKeys);
    const assistantCandidates = await this.collectDownloadLinkCandidates(
      assistantLocator.locator(DOWNLOAD_CONTROL_SELECTOR),
      assistantSeen,
      false
    );
    const seen = new Set(assistantSeen);
    const pageCandidates = await this.collectDownloadLinkCandidates(
      page.locator(DOWNLOAD_LINK_SCOPE_SELECTOR),
      seen,
      false,
      assistantCandidates.length
    );
    const candidates = [...assistantCandidates, ...pageCandidates].slice(0, MAX_CAPTURED_FILES);
    const files = [];
    const capturedKeys = new Set();

    for (const candidate of candidates) {
      if (files.length >= MAX_CAPTURED_FILES) {
        break;
      }

      const capturedFile = await this.captureDownloadFile(page, candidate, files.length + 1);

      if (!capturedFile) {
        const fallbackFile = this.buildDownloadPlaceholder(page, candidate, files.length + 1);

        if (fallbackFile) {
          files.push(fallbackFile);
        }

        continue;
      }

      const key = capturedFile.dataUrl || capturedFile.sourceUrl || capturedFile.name;
      if (capturedKeys.has(key)) {
        continue;
      }

      capturedKeys.add(key);
      files.push(capturedFile);
    }

    return files;
  }

  buildDownloadPlaceholder(page, candidate, fileNumber) {
    const sourceUrl = candidate.url || '';
    const name = this.resolveDownloadFileName(candidate, '', this.inferMimeType(candidate, '') || '', fileNumber);

    if (!sourceUrl || /^sandbox:/i.test(sourceUrl) || (!name && !candidate.text)) {
      return null;
    }

    return {
      id: `file-${fileNumber}`,
      name: name || `generated-file-${fileNumber}`,
      mimeType: this.inferMimeType(candidate, name) || 'application/octet-stream',
      size: 0,
      dataUrl: '',
      sourceUrl,
      linkText: candidate.text || ''
    };
  }

  async collectDownloadLinkCandidates(anchors, seen, requireExplicitDownloadText = false, offset = 0) {
    const total = await anchors.count().catch(() => 0);
    const candidates = [];

    for (let position = 0; position < total && candidates.length < MAX_CAPTURED_FILES - offset; position += 1) {
      const index = total - 1 - position;
      const anchor = anchors.nth(index);
      const visible = await anchor.isVisible().catch(() => false);

      if (!visible) {
        continue;
      }

      const details = await this.getDownloadLinkDetails(anchor);
      const url = this.normalizeDownloadUrl(details.href || details.absoluteHref);

      if (!this.isDownloadCandidate({ ...details, url }, requireExplicitDownloadText)) {
        continue;
      }

      const filenameHint = this.filenameFromText(
        [details.download, details.text, details.ariaLabel, details.titleAttribute, details.contextText].join(' ')
      );
      const key =
        url ||
        details.download ||
        filenameHint ||
        `${details.dataTestId}|${details.text}|${details.ariaLabel}|${details.titleAttribute}|${details.contextText}`;
      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      candidates.push({
        ...details,
        locator: anchor,
        url
      });
    }

    return candidates;
  }

  async getDownloadLinkDetails(anchor) {
    return anchor
      .evaluate((node) => {
        const fileExtensionRe =
          /\.(pdf|docx?|xlsx?|pptx?|zip|py|js|jsx|ts|tsx|html|css|json|txt|csv|md|png|jpe?g|webp|gif|svg|mp3|wav|mp4|mov)(?=$|[?#\s),.;:'"`\]])/i;
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const href = node.getAttribute('href') || '';
        const absoluteHref = typeof node.href === 'string' ? node.href : '';
        const ownText = normalize(node.textContent);
        const contextParts = [];
        const addContext = (value) => {
          const text = normalize(value);

          if (!text || text === ownText || contextParts.includes(text) || text.length > 700) {
            return;
          }

          contextParts.push(text);
        };

        addContext(node.previousElementSibling?.textContent);
        addContext(node.nextElementSibling?.textContent);

        let parent = node.parentElement;
        for (let depth = 0; parent && depth < 5; depth += 1) {
          addContext(parent.textContent);

          if (fileExtensionRe.test(parent.textContent || '')) {
            break;
          }

          parent = parent.parentElement;
        }

        return {
          tagName: node.tagName || '',
          href,
          absoluteHref,
          download: node.getAttribute('download') || '',
          text: ownText,
          contextText: contextParts.join(' | '),
          ariaLabel: normalize(node.getAttribute('aria-label')),
          titleAttribute: normalize(node.getAttribute('title')),
          dataTestId: normalize(node.getAttribute('data-testid')),
          type: normalize(node.getAttribute('type')),
          disabled: Boolean(node.disabled || node.getAttribute('aria-disabled') === 'true')
        };
      })
      .catch(() => ({
        tagName: '',
        href: '',
        absoluteHref: '',
        download: '',
        text: '',
        contextText: '',
        ariaLabel: '',
        titleAttribute: '',
        dataTestId: '',
        type: '',
        disabled: false
      }));
  }

  normalizeDownloadUrl(href = '') {
    const value = String(href || '').trim();

    if (!value || /^(#|javascript:|mailto:|tel:)/i.test(value)) {
      return '';
    }

    if (/^(blob:|data:|sandbox:)/i.test(value)) {
      return value;
    }

    try {
      return new URL(value, this.chatUrl).toString();
    } catch (_error) {
      return value;
    }
  }

  isDownloadCandidate(candidate, requireExplicitDownloadText = false) {
    if (candidate.disabled) {
      return false;
    }

    const directText = [candidate.text, candidate.ariaLabel, candidate.titleAttribute, candidate.dataTestId].join(' ');
    const contextText = candidate.contextText || '';
    const linkText = [directText, contextText].join(' ');
    const directHaystack = [candidate.url, candidate.href, candidate.download, candidate.type, directText].join(' ');
    const haystack = [directHaystack, contextText].join(' ');
    const hasDownloadAttribute = Boolean(candidate.download);
    const hasDirectFileExtension = DOWNLOAD_FILE_EXTENSION_RE.test(directHaystack) || Boolean(this.filenameFromText(directText));
    const hasContextFileExtension = Boolean(this.filenameFromText(contextText));
    const hasFileExtension = hasDirectFileExtension || hasContextFileExtension;
    const hasDownloadAction = DOWNLOAD_ACTION_RE.test(directText);
    const hasFileHint = DOWNLOAD_FILE_HINT_RE.test(haystack);
    const isDownloadEndpoint = /\/interpreter\/download\b|[?&]sandbox_path=|\/download\b|^blob:|^data:|^sandbox:/i.test(
      candidate.url || candidate.href || ''
    );
    const plainNavigationLink =
      candidate.tagName === 'A' &&
      /^https?:\/\//i.test(candidate.url || candidate.href || '') &&
      !hasDownloadAttribute &&
      !isDownloadEndpoint &&
      !hasDownloadAction &&
      !hasDirectFileExtension;

    if (plainNavigationLink) {
      return false;
    }

    if (hasDownloadAttribute) {
      return true;
    }

    if (requireExplicitDownloadText && !hasDownloadAction) {
      return false;
    }

    return Boolean(
      (hasDownloadAction && (hasFileHint || hasFileExtension || isDownloadEndpoint)) ||
        (hasDirectFileExtension && (hasDownloadAction || !requireExplicitDownloadText || isDownloadEndpoint)) ||
        (hasContextFileExtension && (hasDownloadAction || isDownloadEndpoint))
    );
  }

  async captureDownloadFile(page, candidate, fileNumber) {
    const fetchedFile = await this.fetchDownloadFile(page, candidate, fileNumber);

    if (fetchedFile) {
      return fetchedFile;
    }

    return this.clickAndCaptureDownload(page, candidate, fileNumber);
  }

  async fetchDownloadFile(page, candidate, fileNumber) {
    const sourceUrl = candidate.url;

    if (!sourceUrl) {
      return null;
    }

    if (/^data:/i.test(sourceUrl)) {
      const dataMatch = /^data:([^;,]+)?(?:;base64)?,/i.exec(sourceUrl);
      const mimeType = (dataMatch?.[1] || this.inferMimeType(candidate, '') || 'application/octet-stream').toLowerCase();
      const byteLength = this.estimateDataUrlBytes(sourceUrl);

      if (byteLength > MAX_RAW_FILE_BYTES) {
        return null;
      }

      return {
        id: `file-${fileNumber}`,
        name: this.resolveDownloadFileName(candidate, '', mimeType, fileNumber),
        mimeType,
        size: byteLength,
        dataUrl: sourceUrl,
        sourceUrl,
        linkText: candidate.text || ''
      };
    }

    if (!/^https?:\/\//i.test(sourceUrl)) {
      return null;
    }

    const response = await page
      .context()
      .request.get(sourceUrl, { timeout: FILE_DOWNLOAD_TIMEOUT_MS, failOnStatusCode: false })
      .catch(() => null);

    if (!response || !response.ok()) {
      return null;
    }

    const headers = response.headers();
    const contentType = (headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const contentDisposition = headers['content-disposition'] || '';

    if (this.isUnintendedJsonDownload(candidate, contentType, contentDisposition)) {
      return null;
    }

    if (contentType === 'text/html' && !contentDisposition && !candidate.download) {
      return null;
    }

    const body = await response.body().catch(() => null);

    if (!body?.length || body.length > MAX_RAW_FILE_BYTES) {
      return null;
    }

    const mimeType = contentType || this.inferMimeType(candidate, '') || 'application/octet-stream';

    return {
      id: `file-${fileNumber}`,
      name: this.resolveDownloadFileName(candidate, contentDisposition, mimeType, fileNumber),
      mimeType,
      size: body.length,
      dataUrl: `data:${mimeType};base64,${body.toString('base64')}`,
      sourceUrl,
      linkText: candidate.text || ''
    };
  }

  async clickAndCaptureDownload(page, candidate, fileNumber) {
    const sourceUrl = candidate.url || '';
    const currentUrl = page.url();
    let downloadRequestUrl = '';
    const responseCaptures = [];
    const onRequest = (request) => {
      const url = request.url();

      if (/\/interpreter\/download\b|[?&]sandbox_path=|\/download\b/i.test(url)) {
        downloadRequestUrl = url;
      }
    };
    const onResponse = (response) => {
      const url = response.url();

      if (!/\/interpreter\/download\b|[?&]sandbox_path=|\/download\b/i.test(url)) {
        return;
      }

      responseCaptures.push(
        response
          .body()
          .then((body) => ({
            body,
            headers: response.headers(),
            url
          }))
          .catch(() => null)
      );
    };
    const downloadPromise = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
    page.on('request', onRequest);
    page.on('response', onResponse);
    await candidate.locator.click({ timeout: 5000 }).catch(() => null);
    const download = await downloadPromise;
    page.off('request', onRequest);
    page.off('response', onResponse);

    if (!download) {
      if (page.url() !== currentUrl) {
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: this.timeoutMs }).catch(() => undefined);
      }

      if (responseCaptures.length) {
        const capturedResponse = await responseCaptures[responseCaptures.length - 1];
        const capturedFile = this.buildDownloadFileFromBuffer(
          candidate,
          capturedResponse?.url || downloadRequestUrl,
          capturedResponse?.headers || {},
          capturedResponse?.body,
          fileNumber
        );

        if (capturedFile) {
          return capturedFile;
        }
      }

      if (downloadRequestUrl) {
        return this.fetchDownloadFile(page, { ...candidate, url: downloadRequestUrl }, fileNumber);
      }

      return null;
    }

    const downloadPath = await download.path().catch(() => '');
    let suggestedName = '';
    try {
      suggestedName = download.suggestedFilename();
    } catch (_error) {
      suggestedName = '';
    }

    if (!downloadPath) {
      await download.delete().catch(() => undefined);
      return null;
    }

    const body = await fs.readFile(downloadPath).catch(() => null);
    await download.delete().catch(() => undefined);

    if (!body?.length || body.length > MAX_RAW_FILE_BYTES) {
      return null;
    }

    const mimeType = this.inferMimeType(candidate, suggestedName) || 'application/octet-stream';
    const clickCandidate = {
      ...candidate,
      download: candidate.download || suggestedName
    };

    return {
      id: `file-${fileNumber}`,
      name: this.resolveDownloadFileName(clickCandidate, '', mimeType, fileNumber),
      mimeType,
      size: body.length,
      dataUrl: `data:${mimeType};base64,${body.toString('base64')}`,
      sourceUrl,
      linkText: candidate.text || ''
    };
  }

  buildDownloadFileFromBuffer(candidate, sourceUrl, headers = {}, body, fileNumber) {
    if (!body?.length || body.length > MAX_RAW_FILE_BYTES) {
      return null;
    }

    const contentType = (headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const contentDisposition = headers['content-disposition'] || '';
    const mimeType = contentType || this.inferMimeType({ ...candidate, url: sourceUrl }, '') || 'application/octet-stream';

    if (this.isUnintendedJsonDownload(candidate, contentType, contentDisposition)) {
      return null;
    }

    return {
      id: `file-${fileNumber}`,
      name: this.resolveDownloadFileName({ ...candidate, url: sourceUrl }, contentDisposition, mimeType, fileNumber),
      mimeType,
      size: body.length,
      dataUrl: `data:${mimeType};base64,${body.toString('base64')}`,
      sourceUrl,
      linkText: candidate.text || ''
    };
  }

  estimateDataUrlBytes(dataUrl = '') {
    const body = String(dataUrl).split(',')[1] || '';

    if (/;base64,/i.test(dataUrl)) {
      return Math.floor((body.length * 3) / 4);
    }

    try {
      return Buffer.byteLength(decodeURIComponent(body));
    } catch (_error) {
      return Buffer.byteLength(body);
    }
  }

  resolveDownloadFileName(candidate, contentDisposition = '', mimeType = '', fileNumber = 1) {
    const fromDisposition = this.filenameFromContentDisposition(contentDisposition);
    const fromUrl = this.filenameFromUrl(candidate.url || candidate.href || '');
    const fromText = this.filenameFromText(
      [candidate.download, candidate.text, candidate.ariaLabel, candidate.titleAttribute, candidate.contextText].join(' ')
    );
    const extension =
      this.extensionFromFilename(fromDisposition || candidate.download || fromUrl || fromText) ||
      this.extensionFromMimeType(mimeType) ||
      this.extensionFromText([candidate.text, candidate.ariaLabel, candidate.titleAttribute, candidate.contextText].join(' ')) ||
      'bin';
    const candidates = [
      fromDisposition,
      candidate.download,
      fromUrl,
      fromText,
      candidate.text,
      candidate.ariaLabel,
      candidate.titleAttribute,
      `generated-file-${fileNumber}.${extension}`
    ];
    let name = candidates.map((value) => this.sanitizeDownloadFilename(value)).find(Boolean);

    if (!this.extensionFromFilename(name)) {
      name = `${name}.${extension}`;
    }

    return name;
  }

  filenameFromContentDisposition(value = '') {
    const encodedMatch = /filename\*=UTF-8''([^;]+)/i.exec(value);

    if (encodedMatch?.[1]) {
      try {
        return decodeURIComponent(encodedMatch[1].replace(/^"|"$/g, ''));
      } catch (_error) {
        return encodedMatch[1].replace(/^"|"$/g, '');
      }
    }

    const plainMatch = /filename="?([^";]+)"?/i.exec(value);
    return plainMatch?.[1] || '';
  }

  isUnintendedJsonDownload(candidate = {}, contentType = '', contentDisposition = '') {
    if (!/json/i.test(contentType || '')) {
      return false;
    }

    const visibleFilename = this.filenameFromText(
      [this.filenameFromContentDisposition(contentDisposition), candidate.download, candidate.text, candidate.ariaLabel, candidate.titleAttribute, candidate.contextText].join(
        ' '
      )
    );
    const directText = [candidate.download, candidate.text, candidate.ariaLabel, candidate.titleAttribute].join(' ');

    return !/\.json(?=$|[?#\s),.;:'"`\]])/i.test(visibleFilename || directText);
  }

  filenameFromText(value = '') {
    const text = String(value || '');
    const match =
      /(?:^|[\s"'([{])([A-Za-z0-9][A-Za-z0-9._ -]{0,170}\.(?:pdf|docx?|xlsx?|pptx?|zip|py|js|jsx|ts|tsx|html|css|json|txt|csv|md|png|jpe?g|webp|gif|svg|mp3|wav|mp4|mov))(?=$|[?#\s),.;:'"`\]])/i.exec(text);

    return match?.[1] || '';
  }

  filenameFromUrl(value = '') {
    try {
      const url = new URL(value, this.chatUrl);
      const queryFilename =
        url.searchParams.get('filename') ||
        url.searchParams.get('file') ||
        url.searchParams.get('name') ||
        url.searchParams.get('sandbox_path');

      if (queryFilename) {
        return decodeURIComponent(queryFilename).split(/[\\/]/).filter(Boolean).pop() || '';
      }

      const pathname = decodeURIComponent(url.pathname || '');
      return pathname.split('/').filter(Boolean).pop() || '';
    } catch (_error) {
      return '';
    }
  }

  sanitizeDownloadFilename(value = '') {
    const withoutPromptWords = String(value || '')
      .replace(/^download\s+(the\s+)?/i, '')
      .replace(/^open\s+(the\s+)?/i, '')
      .trim();
    const basename = path
      .basename(withoutPromptWords || '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();

    return basename.slice(0, 180);
  }

  extensionFromFilename(value = '') {
    const match = /\.([a-z0-9]{1,12})(?:[?#]|$)/i.exec(String(value || ''));
    return match?.[1]?.toLowerCase() || '';
  }

  extensionFromMimeType(mimeType = '') {
    return EXTENSION_BY_MIME[String(mimeType || '').split(';')[0].trim().toLowerCase()] || '';
  }

  extensionFromText(value = '') {
    const text = String(value || '').toLowerCase();

    if (/\bpdf\b/.test(text)) return 'pdf';
    if (/\bdocx?\b|\bword\b/.test(text)) return 'docx';
    if (/\bxlsx?\b|\bspreadsheet\b/.test(text)) return 'xlsx';
    if (/\bpptx?\b|\bslides?\b/.test(text)) return 'pptx';
    if (/\bzip\b|\barchive\b/.test(text)) return 'zip';
    if (/\bpython\b|\b\.py\b/.test(text)) return 'py';
    if (/\bhtml\b/.test(text)) return 'html';
    if (/\bjson\b/.test(text)) return 'json';
    if (/\bcsv\b/.test(text)) return 'csv';
    if (/\btext\b|\btxt\b/.test(text)) return 'txt';
    if (/\bpng\b/.test(text)) return 'png';
    if (/\bjpe?g\b/.test(text)) return 'jpg';

    return '';
  }

  inferMimeType(candidate, filename = '') {
    const extension =
      this.extensionFromFilename(filename) ||
      this.extensionFromFilename(candidate.download || '') ||
      this.extensionFromFilename(candidate.url || '') ||
      this.extensionFromFilename(this.filenameFromText([candidate.text, candidate.ariaLabel, candidate.titleAttribute, candidate.contextText].join(' '))) ||
      this.extensionFromText([candidate.text, candidate.ariaLabel, candidate.titleAttribute, candidate.contextText].join(' '));

    return MIME_BY_EXTENSION[extension] || '';
  }

  async countNewVisibleContentImages(page, previousImageKeys) {
    return (await this.getNewVisibleContentImages(page, previousImageKeys)).length;
  }

  async getNewVisibleContentImages(page, previousImageKeys) {
    const images = await this.collectVisibleContentImageRecords(page.locator(PAGE_IMAGE_SCOPE_SELECTOR).first());
    return images.filter((image) => !previousImageKeys.has(image.key));
  }

  async countVisibleContentImages(locator) {
    return (await this.collectVisibleContentImageRecords(locator)).length;
  }

  async countVisibleResponseVisuals(locator) {
    return locator
      .evaluate(
        (root, limits) => {
          const isVisible = (node) => {
            if (!(node instanceof Element)) {
              return false;
            }

            const style = window.getComputedStyle(node);
            const box = node.getBoundingClientRect();
            return (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              Number(style.opacity || 1) > 0 &&
              box.width >= limits.minWidth &&
              box.height >= limits.minHeight
            );
          };
          const isLargeSvg = (node) => {
            if (!(node instanceof SVGElement) || !isVisible(node)) {
              return false;
            }

            const box = node.getBoundingClientRect();
            return box.width >= limits.minWidth && box.height >= limits.minHeight;
          };
          const hasLargeCanvasOrFrame = Array.from(root.querySelectorAll('canvas, iframe')).some(isVisible);
          const hasLargeSvg = Array.from(root.querySelectorAll('svg')).some(isLargeSvg);
          const hasSlider = Array.from(root.querySelectorAll('input[type="range"], [role="slider"]')).some((node) => {
            if (!(node instanceof Element)) {
              return false;
            }

            const style = window.getComputedStyle(node);
            const box = node.getBoundingClientRect();
            if (style.display === 'none' || style.visibility === 'hidden' || box.width <= 0 || box.height <= 0) {
              return false;
            }

            if (node.matches('input[type="range"]')) {
              return box.width >= 80 || box.height >= 80;
            }

            let track = node.parentElement;

            for (let depth = 0; track && depth < 4; depth += 1, track = track.parentElement) {
              const trackBox = track.getBoundingClientRect();
              if (trackBox.width >= 80 || trackBox.height >= 80) {
                return true;
              }
            }

            return false;
          });

          return hasLargeCanvasOrFrame || hasLargeSvg || hasSlider ? 1 : 0;
        },
        {
          minWidth: MIN_VISUAL_WIDTH_PX,
          minHeight: MIN_VISUAL_HEIGHT_PX
        }
      )
      .catch(() => 0);
  }

  async captureVisualCandidate(locator) {
    const marker = `visual-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const candidate = await locator
      .evaluate(
        (root, options) => {
          const normalizeBox = (node) => {
            if (!(node instanceof Element)) {
              return null;
            }

            const style = window.getComputedStyle(node);
            const box = node.getBoundingClientRect();
            if (
              style.display === 'none' ||
              style.visibility === 'hidden' ||
              Number(style.opacity || 1) <= 0 ||
              box.width < options.minWidth ||
              box.height < options.minHeight
            ) {
              return null;
            }

            return {
              width: box.width,
              height: box.height,
              area: box.width * box.height
            };
          };
          const visibleSlider = (node) => {
            if (!(node instanceof Element)) {
              return false;
            }

            const style = window.getComputedStyle(node);
            const box = node.getBoundingClientRect();
            if (style.display === 'none' || style.visibility === 'hidden' || box.width <= 0 || box.height <= 0) {
              return false;
            }

            if (node.matches('input[type="range"]')) {
              return box.width >= 80 || box.height >= 80;
            }

            let track = node.parentElement;

            for (let depth = 0; track && depth < 4; depth += 1, track = track.parentElement) {
              const trackBox = track.getBoundingClientRect();
              if (trackBox.width >= 80 || trackBox.height >= 80) {
                return true;
              }
            }

            return false;
          };
          const visibleLargeVisual = (node) => Boolean(normalizeBox(node));
          const signals = Array.from(
            root.querySelectorAll('canvas, iframe, svg, input[type="range"], [role="slider"]')
          ).filter((node) => {
            if (node.matches('input[type="range"], [role="slider"]')) {
              return visibleSlider(node);
            }

            return visibleLargeVisual(node);
          });
          const candidates = new Map();

          for (const signal of signals) {
            let current = signal;

            for (let depth = 0; current && depth < 9; depth += 1, current = current.parentElement) {
              if (!(current instanceof Element) || !root.contains(current)) {
                break;
              }

              const box = normalizeBox(current);
              if (!box) {
                continue;
              }

              const largeVisuals = [
                ...(current.matches('canvas, iframe, svg') ? [current] : []),
                ...current.querySelectorAll('canvas, iframe, svg')
              ].filter(visibleLargeVisual).length;
              const sliders = [
                ...(current.matches('input[type="range"], [role="slider"]') ? [current] : []),
                ...current.querySelectorAll('input[type="range"], [role="slider"]')
              ].filter(visibleSlider).length;
              const semanticContext = [
                current.id,
                current.getAttribute('class'),
                current.getAttribute('aria-label'),
                current.getAttribute('data-testid')
              ]
                .filter(Boolean)
                .join(' ');
              const semanticBonus =
                !current.matches('canvas, iframe, svg, input[type="range"], [role="slider"]') &&
                /\b(learning-block|visuali[sz]ation|diagram|chart|graph|simulation|interactive|circuit)\b/i.test(
                  semanticContext
                )
                  ? 12
                  : 0;
              const score = largeVisuals * 8 + sliders * 5 + semanticBonus;

              if (!score) {
                continue;
              }

              const existing = candidates.get(current);
              if (!existing || score > existing.score) {
                candidates.set(current, {
                  node: current,
                  score,
                  area: box.area,
                  width: box.width,
                  height: box.height
                });
              }
            }
          }

          const ranked = Array.from(candidates.values()).sort((left, right) => {
            if (right.score !== left.score) {
              return right.score - left.score;
            }

            return left.area - right.area;
          });
          const best = ranked[0];

          if (!best) {
            return null;
          }

          const containsOpaqueVisual =
            best.node.matches('canvas, iframe') || Boolean(best.node.querySelector('canvas, iframe'));
          let captureNode = best.node;

          if (!containsOpaqueVisual) {
            const host = document.createElement('div');
            const clone = best.node.cloneNode(true);
            const computed = window.getComputedStyle(best.node);
            const isolationStyle = document.createElement('style');

            host.setAttribute('data-kyrovia-visual-host', options.marker);
            isolationStyle.setAttribute('data-kyrovia-visual-isolation', options.marker);
            isolationStyle.textContent = `
              body > :not([data-kyrovia-visual-host="${options.marker}"]) {
                visibility: hidden !important;
              }
            `;
            Object.assign(host.style, {
              position: 'fixed',
              top: '0',
              left: '0',
              zIndex: '2147483647',
              width: `${best.width}px`,
              height: `${best.height}px`,
              overflow: 'hidden',
              pointerEvents: 'none',
              background: '#ffffff'
            });

            if (clone instanceof HTMLElement || clone instanceof SVGElement) {
              for (const property of computed) {
                if (property.startsWith('--')) {
                  clone.style.setProperty(property, computed.getPropertyValue(property));
                }
              }

              clone.style.setProperty('box-sizing', 'border-box', 'important');
              clone.style.setProperty('width', `${best.width}px`, 'important');
              clone.style.setProperty('height', `${best.height}px`, 'important');
              clone.style.setProperty('max-width', 'none', 'important');
              clone.style.setProperty('max-height', 'none', 'important');
              clone.style.setProperty('margin', '0', 'important');
              clone.style.setProperty('transform', 'none', 'important');
              clone.style.setProperty('scale', 'none', 'important');
              clone.style.setProperty('zoom', '1', 'important');
            }

            host.appendChild(clone);
            root.ownerDocument.head.appendChild(isolationStyle);
            root.ownerDocument.body.appendChild(host);

            if (clone instanceof HTMLElement || clone instanceof SVGElement) {
              const renderedBox = clone.getBoundingClientRect();
              const scaleX = renderedBox.width > 0 ? best.width / renderedBox.width : 1;
              const scaleY = renderedBox.height > 0 ? best.height / renderedBox.height : 1;

              clone.style.setProperty('transform-origin', 'top left', 'important');
              clone.style.setProperty('transform', `scale(${scaleX}, ${scaleY})`, 'important');
            }

            captureNode = host;
          }

          captureNode.setAttribute('data-kyrovia-visual-capture', options.marker);
          return {
            width: Math.round(best.width),
            height: Math.round(best.height),
            globalCapture: captureNode !== best.node && root !== root.ownerDocument.body,
            trimWhitespace: captureNode !== best.node
          };
        },
        {
          marker,
          minWidth: MIN_VISUAL_WIDTH_PX,
          minHeight: MIN_VISUAL_HEIGHT_PX
        }
      )
      .catch(() => null);

    if (!candidate) {
      return null;
    }

    const captureSelector = `[data-kyrovia-visual-capture="${marker}"]`;
    const visual = candidate.globalCapture
      ? locator.page().locator(captureSelector).first()
      : locator.locator(captureSelector).first();
    const screenshot = await visual
      .screenshot({
        animations: 'disabled',
        timeout: Math.max(IMAGE_SCREENSHOT_TIMEOUT_MS, 20000)
      })
      .catch(() => null);

    await visual
      .evaluate((node, marker) => {
        const host = node.closest(`[data-kyrovia-visual-host="${marker}"]`);

        if (host) {
          host.ownerDocument
            .querySelector(`[data-kyrovia-visual-isolation="${marker}"]`)
            ?.remove();
          host.remove();
          return;
        }

        node.removeAttribute('data-kyrovia-visual-capture');
      }, marker)
      .catch(() => undefined);

    if (!screenshot) {
      return null;
    }

    if (candidate.trimWhitespace) {
      const trimmed = await sharp(screenshot)
        .trim({
          background: '#ffffff',
          threshold: 10,
          lineArt: true
        })
        .png()
        .toBuffer({ resolveWithObject: true })
        .catch(() => null);

      if (
        trimmed?.data &&
        trimmed.info.width >= MIN_VISUAL_WIDTH_PX &&
        trimmed.info.height >= MIN_VISUAL_HEIGHT_PX
      ) {
        return {
          captureBox: {
            width: trimmed.info.width,
            height: trimmed.info.height
          },
          screenshot: trimmed.data
        };
      }
    }

    return {
      captureBox: candidate,
      screenshot
    };
  }

  async captureFrameVisual(locator) {
    const frames = locator.locator('iframe');
    const total = await frames.count().catch(() => 0);

    for (let index = total - 1; index >= 0; index -= 1) {
      const frameElement = frames.nth(index);
      const frameBox = await frameElement.boundingBox().catch(() => null);

      if (
        !frameBox ||
        frameBox.width < MIN_VISUAL_WIDTH_PX ||
        frameBox.height < MIN_VISUAL_HEIGHT_PX
      ) {
        continue;
      }

      const frameBody = frameElement.contentFrame().locator('body');
      const capture = await this.captureVisualCandidate(frameBody).catch(() => null);

      if (capture) {
        return capture;
      }
    }

    return null;
  }

  createCapturedVisual(capture) {
    if (!capture?.screenshot || !capture.captureBox) {
      return null;
    }

    return {
      id: 'image-1',
      alt: 'Generated diagram',
      width: Math.round(capture.captureBox.width),
      height: Math.round(capture.captureBox.height),
      mimeType: 'image/png',
      captureType: 'backend-visual',
      src: `data:image/png;base64,${capture.screenshot.toString('base64')}`,
      sourceUrl: ''
    };
  }

  async captureResponseVisual(locator, options = {}) {
    if (!options.preferRoot) {
      const frameCapture = await this.captureFrameVisual(locator);

      if (frameCapture) {
        return this.createCapturedVisual(frameCapture);
      }

      const candidateCapture = await this.captureVisualCandidate(locator);

      if (candidateCapture) {
        return this.createCapturedVisual(candidateCapture);
      }
    }

    if (!options.allowRootFallback) {
      return null;
    }

    const captureBox = await locator.boundingBox().catch(() => null);
    const screenshot = await locator
      .screenshot({
        animations: 'disabled',
        timeout: Math.max(IMAGE_SCREENSHOT_TIMEOUT_MS, 20000)
      })
      .catch(() => null);

    return this.createCapturedVisual({
      captureBox,
      screenshot
    });
  }

  async collectVisibleContentImageRecords(locator) {
    const images = locator.locator(
      'img, canvas, [role="img"]:not(svg), [style*="background-image" i]'
    );
    const total = await images.count().catch(() => 0);
    const records = [];

    for (let index = 0; index < total; index += 1) {
      const image = images.nth(index);
      const box = await this.getVisibleImageBox(image);

      if (!this.isContentImageBox(box)) {
        continue;
      }

      const metadata = await image
        .evaluate((node) => {
          const style = window.getComputedStyle(node);
          const backgroundImage = style.backgroundImage || '';
          const backgroundUrl =
            backgroundImage.match(/url\((?:"|')?([^"')]+)(?:"|')?\)/i)?.[1] || '';
          const tagName = node.tagName.toLowerCase();

          return {
            src: node.currentSrc || node.src || backgroundUrl || '',
            alt:
              node.alt ||
              node.getAttribute('aria-label') ||
              node.getAttribute('title') ||
              '',
            naturalWidth: node.naturalWidth || node.width || 0,
            naturalHeight: node.naturalHeight || node.height || 0,
            kind: tagName,
            visualIdentity: [
              node.getAttribute('data-testid') || '',
              node.getAttribute('data-message-id') || '',
              node.getAttribute('class') || '',
              backgroundImage
            ]
              .join('|')
              .slice(0, 800)
          };
        })
        .catch(() => ({
          src: '',
          alt: '',
          naturalWidth: 0,
          naturalHeight: 0,
          kind: '',
          visualIdentity: ''
        }));

      records.push({
        locator: image,
        src: metadata.src,
        alt: metadata.alt,
        naturalWidth: metadata.naturalWidth,
        naturalHeight: metadata.naturalHeight,
        box,
        key: this.buildImageKey({
          src: metadata.src,
          alt: metadata.alt,
          naturalWidth: metadata.naturalWidth,
          naturalHeight: metadata.naturalHeight,
          box,
          kind: metadata.kind,
          visualIdentity: metadata.visualIdentity
        })
      });
    }

    return records;
  }

  normalizeImageKeySource(src = '') {
    if (!src) {
      return '';
    }

    try {
      const url = new URL(src);
      const fileId = url.searchParams.get('id');

      if (fileId && /\/backend-api\/estuary\/content$/i.test(url.pathname)) {
        return `${url.origin}${url.pathname}?id=${fileId}`;
      }
    } catch (_error) {
      return src.slice(0, 800);
    }

    return src.slice(0, 800);
  }

  buildImageKey({
    src,
    alt,
    naturalWidth = 0,
    naturalHeight = 0,
    box,
    kind = '',
    visualIdentity = ''
  }) {
    const stableSource = this.normalizeImageKeySource(src);
    const stableSize = [
      Math.round(naturalWidth || box?.width || 0),
      Math.round(naturalHeight || box?.height || 0)
    ].join('x');

    return [
      kind,
      stableSource,
      alt.slice(0, 160),
      stableSize,
      visualIdentity
    ].join('|');
  }

  async scrapeResponseImages(page, assistantLocator, previousImageKeys, options = {}) {
    const assistantImages = await this.collectVisibleContentImageRecords(assistantLocator);
    let candidates = assistantImages.filter((image) => !previousImageKeys.has(image.key));

    // Ordinary text follow-ups must never inherit an image that merely reloaded elsewhere
    // on the conversation page. Explicit image requests may use ChatGPT's out-of-message
    // image canvas, but only when the current assistant response does not own an image.
    if (!candidates.length && options.expectImage) {
      const pageImages = await this.collectVisibleContentImageRecords(
        page.locator(PAGE_IMAGE_SCOPE_SELECTOR).first()
      );
      candidates = pageImages.filter((image) => !previousImageKeys.has(image.key));
    }

    candidates = this.rankImageCandidates(candidates);
    const capturedImages = [];
    const capturedKeys = new Set();

    for (const image of candidates) {
      if (capturedImages.length >= MAX_CAPTURED_IMAGES || capturedKeys.has(image.key)) {
        continue;
      }

      const capturedImage = await this.captureResponseImage(page, image, capturedImages.length + 1);

      if (!capturedImage) {
        continue;
      }

      capturedKeys.add(image.key);
      capturedImages.push(capturedImage);
    }

    return capturedImages;
  }

  async captureResponseImage(page, image, imageNumber) {
    if (/^data:image\//i.test(image.src)) {
      const mimeType = image.src.match(/^data:([^;,]+)/i)?.[1] || 'image/png';
      return {
        id: `image-${imageNumber}`,
        alt: image.alt || 'Generated image',
        width: image.naturalWidth || Math.round(image.box.width),
        height: image.naturalHeight || Math.round(image.box.height),
        mimeType,
        captureType: 'generated-image',
        src: image.src,
        sourceUrl: image.src
      };
    }

    if (/^https?:\/\//i.test(image.src)) {
      return {
        id: `image-${imageNumber}`,
        alt: image.alt || 'Generated image',
        width: image.naturalWidth || Math.round(image.box.width),
        height: image.naturalHeight || Math.round(image.box.height),
        mimeType: 'image/png',
        captureType: 'generated-image',
        src: image.src,
        sourceUrl: image.src,
        delivery: 'lazy-source'
      };
    }

    const screenshot = await image.locator.screenshot({ timeout: IMAGE_SCREENSHOT_TIMEOUT_MS }).catch(() => null);

    if (!screenshot) {
      return null;
    }

    return {
      id: `image-${imageNumber}`,
      alt: image.alt || 'Generated image',
      width: Math.round(image.box.width),
      height: Math.round(image.box.height),
      mimeType: 'image/png',
      captureType: 'generated-image',
      src: `data:image/png;base64,${screenshot.toString('base64')}`,
      sourceUrl: image.src
    };
  }

  async fetchRemoteImageAsset(sourceUrl) {
    if (!this.context) {
      throw createServiceError(503, 'Browser context is not available');
    }

    if (!/^https?:\/\//i.test(sourceUrl || '')) {
      throw createServiceError(400, 'Generated image source is not a valid URL.');
    }

    const response = await this.context.request
      .get(sourceUrl, { timeout: IMAGE_SOURCE_FETCH_TIMEOUT_MS, failOnStatusCode: false })
      .catch(() => null);

    if (!response || !response.ok()) {
      throw createServiceError(502, 'Unable to load the generated image from the browser session.');
    }

    const contentType = (response.headers()['content-type'] || '').split(';')[0].trim().toLowerCase();

    if (!contentType.startsWith('image/')) {
      throw createServiceError(502, 'The generated image source did not return image data.');
    }

    const buffer = await response.body().catch(() => null);

    if (!buffer?.length) {
      throw createServiceError(502, 'Generated image data was empty.');
    }

    if (buffer.length > MAX_RAW_IMAGE_BYTES) {
      throw createServiceError(413, `Generated image is too large. Limit is ${MAX_RAW_IMAGE_BYTES} bytes.`);
    }

    return {
      buffer,
      mimeType: contentType
    };
  }

  async fetchRawImageSource(page, sourceUrl) {
    if (!sourceUrl) {
      return null;
    }

    if (/^data:image\//i.test(sourceUrl)) {
      const mimeType = sourceUrl.match(/^data:([^;,]+)/i)?.[1] || 'image/png';
      return {
        mimeType,
        src: sourceUrl
      };
    }

    if (!/^https?:\/\//i.test(sourceUrl)) {
      return null;
    }

    const response = await page
      .context()
      .request.get(sourceUrl, { timeout: IMAGE_SOURCE_FETCH_TIMEOUT_MS, failOnStatusCode: false })
      .catch(() => null);

    if (!response || !response.ok()) {
      return null;
    }

    const contentType = (response.headers()['content-type'] || '').split(';')[0].trim().toLowerCase();

    if (!contentType.startsWith('image/')) {
      return null;
    }

    const body = await response.body().catch(() => null);

    if (!body?.length || body.length > MAX_RAW_IMAGE_BYTES) {
      return null;
    }

    return {
      mimeType: contentType,
      src: `data:${contentType};base64,${body.toString('base64')}`
    };
  }

  async scrapeResponseSources(page, assistantLocator) {
    const seen = new Set();
    const assistantSources = await this.collectSourceRecords(assistantLocator.locator('a[href]'), seen);

    return assistantSources.slice(0, MAX_CAPTURED_SOURCES);
  }

  async collectSourceRecords(anchors, seen, offset = 0) {
    const total = await anchors.count().catch(() => 0);
    const sources = [];

    for (let index = 0; index < total && sources.length < MAX_CAPTURED_SOURCES - offset; index += 1) {
      const anchor = anchors.nth(index);
      const href = (await anchor.getAttribute('href').catch(() => '')) || '';
      const sourceUrl = this.normalizeSourceUrl(href);

      if (!sourceUrl || seen.has(sourceUrl)) {
        continue;
      }

      seen.add(sourceUrl);
      sources.push(await this.buildSourceRecord(anchor, sourceUrl, offset + sources.length + 1));
    }

    return sources;
  }

  buildConversationSourceRecord(conversationUrl) {
    return {
      id: 'source-conversation',
      title: 'Backend Kyrovia conversation',
      url: conversationUrl,
      displayUrl: this.getSourceDisplayUrl(conversationUrl),
      hostname: this.getSourceHostname(conversationUrl),
      linkText: 'Backend conversation',
      ariaLabel: '',
      titleAttribute: '',
      sourceText:
        'No external source links were exposed by Kyrovia for this answer. This is the backend conversation link used to generate the response.',
      sourceType: 'backend-conversation'
    };
  }

  normalizeSourceUrl(href) {
    if (!href || /^(#|javascript:|data:|blob:|mailto:|tel:)/i.test(href)) {
      return '';
    }

    try {
      const sourceUrl = new URL(href, this.chatUrl);
      const redirectedUrl =
        sourceUrl.searchParams.get('url') ||
        sourceUrl.searchParams.get('q') ||
        sourceUrl.searchParams.get('u') ||
        sourceUrl.searchParams.get('target');

      if (redirectedUrl && /^https?:\/\//i.test(redirectedUrl)) {
        return this.normalizeSourceUrl(redirectedUrl);
      }

      const chatUrl = new URL(this.chatUrl);
      const sourceHost = sourceUrl.hostname.replace(/^www\./i, '');
      const chatHost = chatUrl.hostname.replace(/^www\./i, '');

      if (!/^https?:$/i.test(sourceUrl.protocol) || sourceHost === chatHost) {
        return '';
      }

      sourceUrl.hash = '';
      return sourceUrl.toString();
    } catch (_error) {
      return '';
    }
  }

  async buildSourceRecord(anchor, sourceUrl, sourceNumber) {
    const details = await this.getAnchorSourceDetails(anchor);
    const hostname = this.getSourceHostname(sourceUrl);
    const displayUrl = this.getSourceDisplayUrl(sourceUrl);
    const title = this.getSourceTitle(details, hostname);
    const snippet = this.getSourceSnippet(details, title);

    return {
      id: `source-${sourceNumber}`,
      title,
      url: sourceUrl,
      displayUrl,
      hostname,
      linkText: details.linkText,
      ariaLabel: details.ariaLabel,
      titleAttribute: details.titleAttribute,
      sourceText: snippet
    };
  }

  async getAnchorSourceDetails(anchor) {
    return anchor
      .evaluate((node) => {
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const containers = [
          node.closest('[data-testid*="source" i]'),
          node.closest('[class*="source" i]'),
          node.closest('article'),
          node.closest('li'),
          node.closest('p'),
          node.parentElement
        ].filter(Boolean);
        const container = containers.find((item) => normalize(item.textContent).length > normalize(node.textContent).length);

        return {
          linkText: normalize(node.textContent),
          ariaLabel: normalize(node.getAttribute('aria-label')),
          titleAttribute: normalize(node.getAttribute('title')),
          sourceText: normalize(container?.textContent)
        };
      })
      .catch(() => ({
        linkText: '',
        ariaLabel: '',
        titleAttribute: '',
        sourceText: ''
      }));
  }

  getSourceTitle(details, hostname) {
    const candidates = [
      details.linkText,
      details.ariaLabel,
      details.titleAttribute,
      this.getFirstSourceTextLine(details.sourceText),
      hostname
    ];

    const title = candidates
      .map((value) => this.cleanSourceText(value, 120))
      .find((value) => value && !/^\d+$/.test(value) && !/^https?:\/\//i.test(value));

    return title.length > 90 ? `${title.slice(0, 87)}...` : title;
  }

  getSourceSnippet(details, title) {
    const sourceText = this.cleanSourceText(details.sourceText, 420);

    if (!sourceText || sourceText === title || /^\d+$/.test(sourceText)) {
      return '';
    }

    return sourceText;
  }

  getFirstSourceTextLine(value) {
    return String(value || '')
      .split(/\n|(?<=\.)\s+/)
      .map((item) => item.trim())
      .find(Boolean) || '';
  }

  cleanSourceText(value, maxLength) {
    const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
    return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 3)}...` : cleaned;
  }

  getSourceDisplayUrl(sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      const pathText = `${url.pathname}${url.search}`.replace(/\/$/, '');
      const displayUrl = `${url.hostname.replace(/^www\./i, '')}${pathText === '/' ? '' : pathText}`;
      return displayUrl.length > 160 ? `${displayUrl.slice(0, 157)}...` : displayUrl;
    } catch (_error) {
      return sourceUrl;
    }
  }

  getSourceHostname(sourceUrl) {
    try {
      return new URL(sourceUrl).hostname.replace(/^www\./i, '');
    } catch (_error) {
      return 'Source';
    }
  }

  rankImageCandidates(images) {
    return [...images].sort((left, right) => {
      const rightArea = right.box.width * right.box.height;
      const leftArea = left.box.width * left.box.height;
      return rightArea - leftArea;
    });
  }

  async getVisibleImageBox(image) {
    const visible = await image.isVisible().catch(() => false);

    if (!visible) {
      return null;
    }

    return image.boundingBox().catch(() => null);
  }

  isContentImageBox(box) {
    return Boolean(box && (box.width >= MIN_IMAGE_SIDE_PX || box.height >= MIN_IMAGE_SIDE_PX));
  }

  async isGenerating(page) {
    for (const selector of SEND_BUTTON_SELECTORS) {
      const button = page.locator(selector).first();
      const visible = await button.isVisible().catch(() => false);
      const enabled = visible ? await button.isEnabled().catch(() => false) : false;

      if (visible && enabled) {
        return false;
      }
    }

    for (const selector of STOP_BUTTON_SELECTORS) {
      const button = page.locator(selector).first();
      const visible = await button.isVisible().catch(() => false);
      const enabled = visible ? await button.isEnabled().catch(() => false) : false;

      if (visible && enabled) {
        return true;
      }
    }

    return false;
  }

  async stopGenerating(page) {
    for (const selector of STOP_BUTTON_SELECTORS) {
      const button = page.locator(selector).first();
      const visible = await button.isVisible().catch(() => false);
      const enabled = await button.isEnabled().catch(() => false);

      if (visible && enabled) {
        await button.evaluate((node) => node.click()).catch(() => undefined);
        return true;
      }
    }

    await page.keyboard.press('Escape').catch(() => undefined);
    return false;
  }
}

module.exports = ChatGPTService;
