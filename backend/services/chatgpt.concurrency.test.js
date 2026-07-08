const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ChatGPTService = require('./chatgpt');

test('parallel request pages use independent tabs and close after use', async () => {
  const service = new ChatGPTService({
    maxConcurrentTabs: 10,
    parallelTabs: true
  });
  const closedPages = [];
  let pageNumber = 0;

  service.context = {
    async newPage() {
      pageNumber += 1;
      const id = pageNumber;
      let closed = false;

      return {
        id,
        keyboard: {
          async press() {}
        },
        isClosed() {
          return closed;
        },
        async close() {
          closed = true;
          closedPages.push(id);
        }
      };
    },
    pages() {
      return [];
    }
  };

  const pages = await Promise.all(
    Array.from({ length: 10 }, () => service.createRequestPage())
  );

  assert.equal(new Set(pages.map((page) => page.id)).size, 10);
  assert.equal(service.getQueueStatus().activeTabs, 10);

  await Promise.all(pages.map((page) => service.closeRequestPage(page)));
  assert.equal(service.getQueueStatus().activeTabs, 0);
  assert.deepEqual(
    closedPages.sort((left, right) => left - right),
    Array.from({ length: 10 }, (_, index) => index + 1)
  );
});

test('shared browser mode serializes different Kyrovia account sessions', () => {
  const service = new ChatGPTService({ maxConcurrentTabs: 10 });

  assert.equal(service.resolveQueueKey('account-a:chat-1'), 'chatgpt-browser');
  assert.equal(service.resolveQueueKey('account-b:chat-1'), 'chatgpt-browser');
  assert.equal(service.getQueueStatus().mode, 'shared-browser-serial');
});

test('parallel tab mode keeps session-specific queue keys when explicitly enabled', () => {
  const service = new ChatGPTService({
    maxConcurrentTabs: 10,
    parallelTabs: true
  });

  assert.equal(service.resolveQueueKey('account-a:chat-1'), 'account-a:chat-1');
  assert.equal(service.resolveQueueKey('account-b:chat-1'), 'account-b:chat-1');
  assert.equal(service.resolveQueueKey(''), 'chatgpt-browser');
  assert.equal(service.getQueueStatus().mode, 'parallel-tabs');
});

test('ten independent user sessions run concurrently', async () => {
  const service = new ChatGPTService({
    maxConcurrentTabs: 10,
    parallelTabs: true,
    queueMaxPending: 25,
    queueWaitTimeoutMs: 5000
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const startedRequestSessions = [];

  service.sendMessageNow = async (_prompt, _files, _modelId, options) => {
    startedRequestSessions.push(options.sessionKey);
    await gate;
    return options.sessionKey;
  };

  const requests = Array.from({ length: 10 }, (_, index) =>
    service.sendMessage(`message-${index}`, [], 'nova-instant', {
      sessionKey: `account-${index}:session-${index}:conversation-${index}`
    })
  );

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(service.getQueueStatus().activeCount, 10);
  assert.equal(startedRequestSessions.length, 10);
  assert.equal(new Set(startedRequestSessions).size, 10);

  release();
  assert.equal((await Promise.all(requests)).length, 10);
});

test('detects Chromium persistent profile lock startup errors', () => {
  const service = new ChatGPTService();

  assert.equal(
    service.isProfileLockError(
      new Error('Failed to create a ProcessSingleton for your profile directory')
    ),
    true
  );
  assert.equal(service.isProfileLockError(new Error('Navigation timed out')), false);
});

test('hosted runtime uses Playwright managed local browser installation', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      [
        "process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/render/.cache/ms-playwright';",
        "process.env.RENDER = '1';",
        "require('./chatgpt');",
        'console.log(process.env.PLAYWRIGHT_BROWSERS_PATH);'
      ].join('')
    ],
    {
      cwd: __dirname,
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: '/opt/render/.cache/ms-playwright',
        RENDER: '1'
      },
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '0');
});

test('headed Chromium starts minimized without being positioned off-screen', () => {
  const service = new ChatGPTService({ headless: false });
  const launchArgs = service.getLaunchArgs();

  assert.equal(launchArgs.includes('--start-minimized'), true);
  assert.equal(launchArgs.some((argument) => argument.startsWith('--window-position=')), false);
});

test('headless browser launch uses the installed full Chromium executable', async () => {
  const service = new ChatGPTService({ headless: true });
  let launchOptions = null;

  service.installMissingPlaywrightBrowser = async () => undefined;
  service.isMissingBrowserExecutableError = () => false;
  service.recoverProfileLock = false;

  const chromium = require('playwright').chromium;
  const original = chromium.launchPersistentContext;

  chromium.launchPersistentContext = async (_userDataDir, options) => {
    launchOptions = options;
    return { close: async () => undefined };
  };

  try {
    await service.launchBrowserContext(service.getLaunchArgs());
  } finally {
    chromium.launchPersistentContext = original;
  }

  assert.equal(launchOptions.channel, undefined);
  assert.equal(launchOptions.executablePath, chromium.executablePath());
});

test('transient response timeout retries once in a fresh request tab', async () => {
  const service = new ChatGPTService();
  const attempts = [];

  service.sendMessageNow = async (_prompt, _files, _modelId, options) => {
    attempts.push(options.freshChat);

    if (attempts.length === 1) {
      const error = new Error('Timed out waiting for Kyrovia response');
      error.status = 504;
      throw error;
    }

    return { text: 'recovered' };
  };

  const result = await service.sendMessageWithRetry('hello', [], 'nova-instant', {
    freshChat: false
  });

  assert.equal(result.text, 'recovered');
  assert.deepEqual(attempts, [false, true]);
});

test('closed browser target during generation is exposed and retried', async () => {
  const service = new ChatGPTService();
  const attempts = [];

  service.sendMessageNow = async (_prompt, _files, _modelId, options) => {
    attempts.push(options.freshChat);

    if (attempts.length === 1) {
      const error = service.createBrowserClosedDuringRequestError(
        new Error('page.waitForTimeout: Target page, context or browser has been closed')
      );
      throw error;
    }

    return { text: 'recovered after browser restart' };
  };

  const result = await service.sendMessageWithRetry('hello', [], 'nova-instant', {
    freshChat: false
  });

  assert.equal(result.text, 'recovered after browser restart');
  assert.deepEqual(attempts, [false, true]);
});

test('raw closed browser target errors are recognized', () => {
  const service = new ChatGPTService();

  assert.equal(
    service.isBrowserClosedError(
      new Error('page.waitForTimeout: Target page, context or browser has been closed')
    ),
    true
  );
  assert.equal(service.isBrowserClosedError(new Error('Timed out waiting for Kyrovia response')), false);
});
