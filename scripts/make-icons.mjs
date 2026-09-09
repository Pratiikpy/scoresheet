/*
 * The square icons, drawn from the same mark as the favicon.
 *
 * There was one icon asset and it was the wrong shape: `apple-touch-icon` pointed at `share.png`,
 * which is the **1200×630 landscape** card built for a link preview. Added to a home screen that is
 * not an icon, it is a squashed banner — and a home screen is exactly where a Mini App ends up when
 * somebody likes it enough to keep it.
 *
 * So this renders the favicon's knight at the sizes a home screen and an app listing actually ask
 * for. Drawn from the same path data as the inline favicon in `index.html`, so the icon in the tab
 * and the icon on the home screen are the same mark rather than two things that drifted.
 *
 * Rendered through a real browser rather than an image library: the SVG is already correct and a
 * browser is the one renderer guaranteed to agree with what the favicon does.
 *
 *   node scripts/make-icons.mjs
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'apps', 'web', 'public');

/**
 * The mark: a knight on the board's own brown, with the corner radius the app uses everywhere.
 *
 * Identical geometry to the favicon data URI in `index.html`. If one changes, both must — which is
 * why the path lives here in one place and the sizes are generated rather than hand-exported.
 */
const MARK = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="SIZE" height="SIZE">
  <rect width="32" height="32" rx="7" fill="#9a7248"/>
  <path fill="#f6f4ef" d="M11.6 6.2c.5 1 .6 2 .4 3l3.2-1.4c2.9-1 6 .7 6.9 3.6.2.6.3 1.3.3 2v9.9c0 .7-.6 1.3-1.3 1.3H9.3a1 1 0 0 1-.7-1.7l4.5-4.7-1.5.6a3 3 0 0 1-3.8-1.6l-1-2.3a1 1 0 0 1 .3-1.2l2.7-2-1.6-.5a1 1 0 0 1-.5-1.6l3.9-3.4Z"/>
</svg>`;

/*
 * The sizes, and why each one exists.
 *
 *  180 — Apple's home-screen icon. The only size iOS actually asks for.
 *  192 — the smallest a web app manifest should carry, used in app switchers.
 *  512 — the manifest's large icon, and what a store listing is generated from.
 */
const SIZES = [180, 192, 512];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });

await mkdir(OUT, { recursive: true });

for (const size of SIZES) {
  const svg = MARK.replaceAll('SIZE', String(size));
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px">${svg}</body></html>`,
    { waitUntil: 'load' },
  );
  // `omitBackground` keeps the corner radius transparent rather than white, which is what makes the
  // rounded corner read as a rounded corner on a dark home screen.
  const png = await page.screenshot({ omitBackground: true });
  await writeFile(join(OUT, `icon-${size}.png`), png);
  console.log(`icon-${size}.png`);
}

await browser.close();

/*
 * The manifest.
 *
 * Without one, a Mini App added to a home screen is titled with its URL and has no icon of its own.
 * `display: standalone` is deliberate: opened from a home screen this should look like the app it
 * already is inside the wallet, not like a browser tab wearing a chrome bar.
 */
const manifest = {
  name: 'Scoresheet',
  short_name: 'Scoresheet',
  description: 'A chess rating nobody can take away from you. Both players sign the result.',
  start_url: '/',
  display: 'standalone',
  background_color: '#f6f4ef',
  theme_color: '#f6f4ef',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  ],
};

await writeFile(join(OUT, 'manifest.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log('manifest.webmanifest');
