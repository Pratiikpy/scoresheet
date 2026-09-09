/**
 * A face for an address — Nimiq's own identicons, everywhere an address is shown.
 *
 * `SPEC.md` J2 asked for these on the bots. They are worth far more than that: a Nimiq address is
 * thirty-six characters of base-32 that nobody reads and nobody remembers, and every Nimiq product
 * puts a generated face beside one for exactly that reason. Every screen in this app that shows an
 * address — the record, a live game, the certificate — currently shows `NQ84BAFB…PMTP`, which tells
 * a person nothing about *who*. An identicon is recognisable at a glance and stable forever.
 *
 * ## Three decisions
 *
 *  1. **The bundled build, imported by its exact path.** `@nimiq/identicons` ships a 5 KB module
 *     that fetches an 88 KB SVG sprite at runtime, and an 87 KB bundle with the sprite inlined. Its
 *     `package.json` points **`browser` at the fetching one**, so a bare `import '@nimiq/identicons'`
 *     resolves to the build that goes to the network — which would quietly break the offline promise
 *     the service worker exists to keep, and only on a phone with no signal. The bundle is therefore
 *     named explicitly. Verified by reading it: `typeof IdenticonsAssets !== 'undefined'`
 *     short-circuits the fetch, and the module really does export the sprite alongside the class.
 *  2. **Loaded on first use, never at start.** A dynamic `import()` puts it in its own chunk, so the
 *     cold open (`SPEC.md` E3) carries none of it and the service worker caches it the first time
 *     somebody opens a screen with an address on it.
 *  3. **One promise, cached per address.** The same face is asked for repeatedly — a record page
 *     lists the same opponent many times — and generating it is pure, so it is generated once.
 *
 * ## What it must never do
 *
 * **Never block, never throw, never leave a hole.** An identicon is decoration on top of an address
 * that is already on screen. A failure to draw one must cost the decoration and nothing else, which
 * is why every path here ends in "the element stays empty" rather than in an error.
 */

/** Faces already generated, by address. Pure input, pure output, so it is safe to keep forever. */
const cache = new Map<string, Promise<string | null>>();

/** The library, loaded once. `null` once a load has failed, so it is not retried on every address. */
let loading: Promise<{ svg: (address: string) => Promise<string> } | null> | null = null;

async function library(): Promise<{ svg: (address: string) => Promise<string> } | null> {
  loading ??= import('@nimiq/identicons/dist/identicons.bundle.min.js')
    .then((module) => {
      const identicons = (module.default ?? module) as { svg?: (address: string) => Promise<string> };
      return typeof identicons.svg === 'function'
        ? { svg: identicons.svg.bind(identicons) }
        : null;
    })
    .catch(() => null);
  return loading;
}

/**
 * The identicon for an address, as an SVG string, or `null` if one cannot be made.
 *
 * Deliberately tolerant of anything: an empty address, a malformed one, a library that would not
 * load. All three produce `null`, and the caller draws nothing.
 */
export async function identiconFor(address: string): Promise<string | null> {
  const tight = address.replace(/\s/g, '').toUpperCase();
  if (!tight) return null;

  const existing = cache.get(tight);
  if (existing) return existing;

  const made = (async () => {
    const identicons = await library();
    if (!identicons) return null;
    try {
      return await identicons.svg(tight);
    } catch {
      return null;
    }
  })();

  cache.set(tight, made);
  return made;
}

/**
 * The same face, decoded as an image, for drawing onto a canvas.
 *
 * The certificate is a `<canvas>`, and `drawImage` needs a decoded image rather than SVG markup.
 * Cached like the markup is, because the certificate is redrawn on every share.
 *
 * Returns `null` rather than throwing: a certificate without faces is still a certificate, and one
 * that failed to render because a decoration would not decode is not.
 */
const images = new Map<string, Promise<HTMLImageElement | null>>();

export function identiconImage(address: string): Promise<HTMLImageElement | null> {
  const tight = address.replace(/\s/g, '').toUpperCase();
  const existing = images.get(tight);
  if (existing) return existing;

  const made = (async () => {
    const svg = await identiconFor(tight);
    if (!svg) return null;
    try {
      /*
       * A data URL rather than a blob URL.
       *
       * A blob URL would have to be revoked, and forgetting to is a leak that only shows up after a
       * few hundred shares. The markup is a few kilobytes, so the URL is cheap.
       */
      const url = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
      return await new Promise<HTMLImageElement | null>((resolve) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image), { once: true });
        image.addEventListener('error', () => resolve(null), { once: true });
        image.src = url;
      });
    } catch {
      return null;
    }
  })();

  images.set(tight, made);
  return made;
}

/**
 * An element that fills itself in with the address's face.
 *
 * Returned immediately, at its final size, and filled when the library arrives. Sizing it up front
 * is what stops the page jumping: a face that appeared and pushed a list of games down half a second
 * after it rendered would be worse than no face at all.
 */
export function createIdenticon(address: string, size = 32): HTMLElement {
  const el = document.createElement('span');
  el.className = 'identicon';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  /*
   * Decoration for a screen reader.
   *
   * The address is always beside it in text, and a generated face has no name — announcing "image"
   * before every address would be noise in front of the only content that matters.
   */
  el.setAttribute('aria-hidden', 'true');

  void identiconFor(address).then((svg) => {
    // `innerHTML` with library-generated SVG, from an input that is a Nimiq address: the library
    // builds the markup from a numeric hash of the string, so nothing from the address reaches the
    // output as markup.
    if (svg) el.innerHTML = svg;
  });

  return el;
}
