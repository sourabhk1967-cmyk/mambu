import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function normalizeCdnBaseUrl(value) {
  const rawValue = String(value || '').trim();

  if (!rawValue) {
    return '/';
  }

  try {
    const cdnUrl = new URL(rawValue);
    cdnUrl.pathname = cdnUrl.pathname.replace(/\/?$/, '/');
    cdnUrl.search = '';
    cdnUrl.hash = '';

    return cdnUrl.toString();
  } catch (_error) {
    const pathBase = rawValue.replace(/\\/g, '/').replace(/^\/?/, '/').replace(/\/?$/, '/');
    return pathBase;
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const cloudflareCdnBase = normalizeCdnBaseUrl(env.VITE_CLOUDFLARE_CDN_URL);

  return {
    base: command === 'build' ? cloudflareCdnBase : '/',
    plugins: [react()],
    build: {
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined;
            }

            if (id.includes('/firebase/')) {
              return 'firebase';
            }

            if (
              id.includes('/react-markdown/') ||
              id.includes('/remark-') ||
              id.includes('/rehype-') ||
              id.includes('/katex/') ||
              id.includes('/hast-') ||
              id.includes('/unist-')
            ) {
              return 'markdown-vendor';
            }

            if (id.includes('/lucide-react/')) {
              return 'icons';
            }

            if (id.includes('/jspdf/')) {
              return 'jspdf';
            }

            if (id.includes('/html2canvas/')) {
              return 'html2canvas';
            }

            if (id.includes('/html-docx-js-typescript/')) {
              return 'docx-export';
            }

            return undefined;
          }
        }
      }
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:5050',
          changeOrigin: true
        }
      }
    }
  };
});
