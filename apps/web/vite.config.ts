import { defineConfig } from 'vite';

/**
 * `host: true` is not optional: the development loop is "run the server, open the LAN URL on the
 * phone inside Nimiq Pay". Bound to localhost the phone resolves it to itself and sees nothing.
 */
export default defineConfig({
  server: { host: true, port: 5174 },
  preview: { host: true, port: 4174 },
  build: {
    target: 'es2022',
    sourcemap: true,
    // NimQuest placed third at 4.9 MB against 78 and 89. Warn well before anything gets heavy.
    chunkSizeWarningLimit: 200,
  },
});
