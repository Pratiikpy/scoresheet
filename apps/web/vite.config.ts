import { defineConfig } from 'vite';

/**
 * `host: true` is not optional: the development loop is "run the server, open the LAN URL on the
 * phone inside Nimiq Pay". Bound to localhost the phone resolves it to itself and sees nothing.
 */

/**
 * Where the live-game API is, in development and in preview.
 *
 * **The app always calls `/api/...` on its own origin**, and this proxy is what makes that true
 * locally. Keeping the two on one origin is not a convenience — it is what removes CORS from the
 * production path entirely, and CORS inside a Mini App WebView is a class of failure that produces
 * an error message about origins in front of somebody who wanted to play chess.
 *
 * In production the same shape holds: whatever serves the static files forwards `/api` to a running
 * `@scoresheet/server`. `SERVER_ORIGIN` moves the target for anyone running the two apart.
 */
const api = process.env['SERVER_ORIGIN'] ?? 'http://localhost:8787';
const proxy = { '/api': { target: api, changeOrigin: true } };

export default defineConfig({
  server: { host: true, port: 5174, proxy },
  preview: { host: true, port: 4174, proxy },
  build: {
    target: 'es2022',
    sourcemap: true,
    // NimQuest placed third at 4.9 MB against 78 and 89. Warn well before anything gets heavy.
    chunkSizeWarningLimit: 200,
  },
});
