/**
 * The service worker, so the app is genuinely there when the network is not.
 *
 * This was written because the README said "5,000 bundled puzzles, offline" and that was **not
 * true**: the puzzles are bundled, but without this, opening the app with no connection shows
 * nothing at all. A claim in our own documentation that the product did not meet is exactly the kind
 * of thing a reviewer finds by following the instructions, and the fix is the product rather than
 * the sentence.
 *
 * It also happens to be the right thing for a Mini App: the second launch is instant, and a phone on
 * a train keeps working.
 *
 * ## The two rules
 *
 *  1. **The app is cache-first.** The shell, the JavaScript, the CSS, the puzzle chunk: served from
 *     the cache when it is there, and fetched in the background to be ready next time. A chess board
 *     that waits for a network round trip it does not need is a chess board that feels slow.
 *  2. **The API is network-only, and never cached.** A cached game state is a *wrong* game state —
 *     it would show a position the opponent has already moved past, and a poll that returned a
 *     stored answer would freeze the game outright.
 *
 * The version is bumped by the build. An old cache is deleted on activation rather than left, so a
 * deploy cannot leave somebody running half of one version and half of another.
 */

const VERSION = 'scoresheet-v1';

/**
 * What is fetched up front, at install.
 *
 * Only the shell and the things every visit needs. The puzzle chunk is 187 KB gzipped and most
 * visits never open a puzzle, so it is cached when it is *first used* rather than pushed at
 * everybody — the difference between an app that installs in a moment and one that does not.
 */
const SHELL = ['/', '/index.html', '/share.png'];

/**
 * Files whose URL changes when their contents do, so a cached copy is never stale.
 *
 * Only the evaluation network today. Vite's `/assets/` files have the same property but are small
 * enough that revalidating them costs nothing and keeps the shell honest; this one is 6.3 MB.
 */
const IMMUTABLE = /^\/nnue-[\w.-]+\.bin$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      // `reload` so an install never populates the cache from the browser's own stale HTTP cache,
      // which is how a "new version" ships the old files.
      await cache.addAll(SHELL.map((path) => new Request(path, { cache: 'reload' })));
      // Take over as soon as it is ready: waiting for every tab to close means a fix ships tomorrow.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Anything from an older version goes, so nobody runs half of one build and half of another.
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== VERSION).map((name) => caches.delete(name)));
      await self.clients.claim();
      await warmTheShell();
    })(),
  );
});

/**
 * Cache the app's own script and stylesheet, by reading them out of the shell.
 *
 * **This is the difference between the offline claim being true and being true on the second visit.**
 * A worker installs *after* the page that registered it has already asked for its JavaScript, so
 * those first requests never pass through `fetch` here and are never cached. The result was a
 * first-time visitor who lost signal getting a blank page: the shell came from the cache, asked for
 * `index-*.js`, and there was nothing to answer with. Measured — `#app` had zero children and two
 * requests failed — and invisible to every check that navigated twice before going offline, which
 * is every check there was.
 *
 * The filenames carry a content hash and cannot be written down, so they are read from the shell.
 * That keeps this correct across builds with no manifest to generate and nothing to keep in step.
 *
 * Failures are swallowed on purpose: this is an optimisation of the *first* visit, and a worker that
 * refused to activate because a warm-up fetch failed would be worse than one that warms nothing.
 */
async function warmTheShell() {
  try {
    const cache = await caches.open(VERSION);
    const shell = await cache.match('/index.html');
    if (!shell) return;

    const html = await shell.text();
    const assets = new Set();
    for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) assets.add(match[1]);

    await Promise.all(
      [...assets].map(async (path) => {
        if (await cache.match(path, { ignoreVary: true })) return;
        const response = await fetch(path).catch(() => null);
        if (response && response.ok && response.type === 'basic') await cache.put(path, response);
      }),
    );
  } catch {
    // An unwarmed cache is the old behaviour, not a broken one.
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Somebody else's origin — a Nimiq node, an RPC endpoint — is not ours to cache or to interfere with.
  if (url.origin !== self.location.origin) return;

  /*
   * The API is never cached, and never served from a cache.
   *
   * A cached game is a wrong game: it would show a position the opponent has already moved past, and
   * a poll answered from storage would stop the game dead. Offline here is an error the app already
   * has a sentence for — "your device could not reach the network, nothing was lost" — which is a
   * better answer than a stale board.
   */
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);

      /*
       * A navigation always resolves to the shell.
       *
       * Every route in this app is client-side — `/puzzles`, `/g/<id>`, `/r/<address>` — so a request
       * for one of them offline must be answered with `index.html` and let the router take it from
       * there. Without this, opening a shared link with no connection is a browser error page.
       */
      if (request.mode === 'navigate') {
        try {
          const fresh = await fetch(request);
          // Kept, so the next cold start has it even if this one was online.
          void cache.put('/index.html', fresh.clone());
          return fresh;
        } catch {
          return (
            (await cache.match('/index.html', { ignoreVary: true })) ??
            (await cache.match('/', { ignoreVary: true })) ??
            Response.error()
          );
        }
      }

      /*
       * `ignoreVary`, and it is the difference between the cache working and only appearing to.
       *
       * The server sends `Vary: Origin` — measured — and a `Request` made by the worker's own
       * warm-up does not carry the same `Origin` as one made by a document.
       * `Cache.match` honours `Vary` by default, so those two are *different entries* — the asset was
       * demonstrably in the cache and the lookup missed it anyway, and the app came up blank offline
       * with its own JavaScript sitting in storage a few bytes away. There is exactly one response
       * per URL here — the filenames carry a content hash — so varying on a header buys nothing and
       * costs the whole offline promise.
       */
      const hit = await cache.match(request, { ignoreVary: true });
      if (hit) {
        /*
         * Served from the cache, and refreshed behind it.
         *
         * Vite's assets carry a content hash in their filename, so a changed file is a different URL
         * and this can never serve a stale one. The background fetch is what keeps everything else —
         * the shell, the images — current without ever making somebody wait.
         */
        /*
         * ...except for anything immutable and large, which is re-fetched **never**.
         *
         * The evaluation network is 6.3 MB and its version is in its filename, so a new one is a new
         * URL and this can never be stale. Revalidating it would mean downloading 6.3 MB every time
         * somebody opened a game review — on a phone, on their data — to confirm a file that cannot
         * have changed. The generic rule above is right for the shell and wrong for this.
         */
        if (!IMMUTABLE.test(url.pathname)) {
          event.waitUntil(
            fetch(request)
              .then((fresh) => (fresh.ok ? cache.put(request, fresh) : undefined))
              .catch(() => undefined),
          );
        }
        return hit;
      }

      try {
        const fresh = await fetch(request);
        // Only successful, ordinary responses: caching a 404 or an opaque redirect breaks the app in
        // a way that survives a reload and is very hard to explain.
        if (fresh.ok && fresh.type === 'basic') void cache.put(request, fresh.clone());
        return fresh;
      } catch {
        // Nothing cached and no network. The app's own error handling takes it from here.
        return Response.error();
      }
    })(),
  );
});
