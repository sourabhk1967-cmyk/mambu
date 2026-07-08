const { spawnSync } = require('child_process');
const path = require('path');

const hostedRenderRuntime = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.RENDER_SERVICE_ID);

if (hostedRenderRuntime) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
} else if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
}

const playwrightPackageDir = path.dirname(require.resolve('playwright/package.json'));
const playwrightCli = path.join(playwrightPackageDir, 'cli.js');
const result = spawnSync(
  process.execPath,
  [playwrightCli, 'install', 'chromium', 'chromium-headless-shell'],
  {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit'
  }
);

process.exit(result.status || 0);
