/**
 * `/verify` — check somebody else's record, without an account and without trusting us.
 *
 * This is the screen the whole product points at. Everywhere else asks you to believe a number on a
 * page; here you take a file a stranger sent you, drop it in, and your own browser checks every
 * signature, recomputes both Merkle roots and derives the rating from first principles. If our
 * server is switched off this page still works, which is the only test of the claim that matters.
 *
 * **It is deliberately blunt about what it cannot tell you.** A verified record proves those games
 * happened and were not altered afterwards. It does not prove the list is complete — a player can
 * leave a loss out before ever committing to it, and no signature can see an absence. That sentence
 * is on the screen next to the tick, not in a footnote, because a proof that is quietly narrower
 * than it looks is worse than no proof.
 *
 * **Nothing is uploaded.** The file is read with `FileReader` and never leaves the device; there is
 * no request in this file at all, and that is checkable by anybody with a network tab.
 */

import { t } from './i18n.ts';
import { readBundle, verifyBundleInBrowser, type BundleReport } from './verify-bundle.ts';
import { createIdenticon } from './identicon.ts';

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createVerifyScreen(): HTMLElement {
  const el = element('div', 'verify');

  el.append(element('h1', 'verify__title', t('verify.title')));
  el.append(element('p', 'verify__intro', t('verify.intro')));

  /*
   * A real `<input type="file">`, full size, laid over its own label.
   *
   * Three versions of this were wrong before this one, and each failure is worth recording because
   * they are the three ways everybody gets this control wrong:
   *
   *  - **A button that calls `input.click()`** is what most sites do, and some embedded browsers
   *    refuse to open a picker unless the gesture landed on the input itself. In a wallet WebView
   *    that is not a hypothetical.
   *  - **Hiding the input with `display:none`** takes it out of the accessibility tree and out of
   *    tab order, so the only control on the page becomes unreachable by keyboard.
   *  - **Clipping it to 1×1 while keeping it focusable** passes a casual look and fails an audit
   *    twice over: the control has no accessible name and no hit area. `npm run look` caught exactly
   *    that here.
   *
   * So the input is the full size of the button, transparent, on top of it. The tap lands on the
   * real input, the visible text comes from the label the input is named by, and the hit area is the
   * button's — which is the only arrangement that satisfies a screen reader, a keyboard and a thumb
   * at the same time.
   */
  const field = element('div', 'verify__field');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.className = 'verify__input';
  input.id = 'verify-file';
  // Named twice on purpose: the label is the visible name, and `aria-label` survives a browser that
  // does not associate a label with a file input's button the way the spec suggests.
  input.setAttribute('aria-label', t('verify.choose'));

  const label = element('label', 'btn btn--primary verify__choose', t('verify.choose'));
  label.htmlFor = input.id;
  // The visible text is the label's; the input on top of it must not announce twice.
  label.setAttribute('aria-hidden', 'true');

  field.append(label, input);
  el.append(field);

  const status = element('p', 'verify__status');
  status.setAttribute('role', 'status');
  el.append(status);

  const results = element('div', 'verify__results');
  el.append(results);

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    void check(file);
  });

  async function check(file: File): Promise<void> {
    results.replaceChildren();
    status.textContent = t('verify.checking');

    let text: string;
    try {
      text = await file.text();
    } catch {
      status.textContent = t('verify.unreadable');
      return;
    }

    const bundle = readBundle(text);
    if (!bundle) {
      status.textContent = t('verify.notARecord');
      return;
    }

    const report = await verifyBundleInBrowser(bundle);
    status.textContent = '';
    results.append(render(report));
  }

  return el;
}

function render(report: BundleReport): HTMLElement {
  const box = element('div', `verify__report verify__report--${report.intact ? 'good' : 'mixed'}`);

  const who = element('div', 'verify__who');
  who.append(createIdenticon(report.address, 40), element('p', 'verify__address', report.address));
  box.append(who);

  /*
   * The headline is a count of what verified, never the word "valid".
   *
   * "Valid" invites the reader to stop reading, and the interesting cases are all the ones where
   * some records verified and some did not.
   */
  box.append(
    element(
      'p',
      'verify__headline',
      t(report.goodGames.length === 1 ? 'verify.oneGame' : 'verify.manyGames', {
        games: report.goodGames.length,
        runs: report.goodRuns,
      }),
    ),
  );

  const rating = element('p', 'verify__rating');
  rating.textContent = report.ratedGames === 0
    ? t('verify.noneRate')
    : t('verify.rating', {
        rating: report.rating,
        games: report.ratedGames,
        opponents: report.distinctOpponents,
      });
  box.append(rating);

  if (report.ratedGames > 0 && !report.established) {
    box.append(element('p', 'verify__note', t('verify.provisional')));
  }
  if (report.puzzleRating) {
    box.append(element('p', 'verify__note', t('verify.puzzleRating', { rating: report.puzzleRating.rating })));
  }

  /* ---------------------------------------------------------------- the findings */

  const findings: string[] = [];
  if (!report.scoresheetRootMatches) findings.push(t('verify.gameRootMismatch'));
  if (!report.puzzleCardRootMatches) findings.push(t('verify.runRootMismatch'));
  if (report.anchorPresent && !report.anchorConsistent) findings.push(t('verify.anchorBefore'));
  for (const bad of report.badSignatures) {
    findings.push(t('verify.badSignature', { id: bad.id.slice(0, 8), side: bad.side }));
  }
  for (const rejected of report.rejected) {
    findings.push(
      rejected.reason === 'not-this-players-record'
        ? t('verify.notTheirs')
        : rejected.reason === 'wrong-chain'
          ? t('verify.wrongChain')
          : t('verify.malformed', { detail: rejected.detail }),
    );
  }

  if (findings.length > 0) {
    const list = element('ul', 'verify__findings');
    for (const finding of findings) list.append(element('li', 'verify__finding', finding));
    box.append(element('h2', 'verify__subtitle', t('verify.findings')), list);
  }

  if (report.anchorPresent && report.anchorConsistent) {
    box.append(element('p', 'verify__note', t('verify.anchored')));
  }

  // The caveat is appended last and unconditionally. It is the one line on this screen that must
  // never be conditional on the result being good.
  box.append(element('p', 'verify__caveat', t('verify.caveat')));
  return box;
}
