/**
 * Taking a finished game somewhere else: as a picture, or as PGN.
 *
 * Both endings — the bot game and the live game — need exactly this, so it lives once. It is written
 * against the *stored* game rather than either screen's state, because a game that has been signed
 * is a game the store already holds, and rebuilding it from what a screen believes is how two
 * artefacts about one game end up disagreeing.
 *
 * **Every path degrades rather than failing.** `navigator.share` is absent on desktop and refused in
 * plenty of WebViews; the Clipboard API throws without a user gesture or a secure context; a
 * download link is inert inside some embedded browsers. Each falls back to the next, and the last
 * one always works.
 */

import { toPgn, type Scoresheet } from '@scoresheet/core';
import { certificateBlob, drawCertificate, loadIdenticons, loadPieces } from './certificate.ts';
import type { StoredGame } from './store.ts';
import { t } from './i18n.ts';

/** Where a reader is told to go to check the game. Printed on the picture. */
function verifyAt(): string {
  return typeof window === 'undefined' ? 'scoresheet' : window.location.host;
}

/** A filename a person will recognise a week later in their downloads folder. */
export function fileStem(sheet: Scoresheet): string {
  const white = sheet.white.slice(0, 8);
  const black = sheet.black.slice(0, 8);
  return `chess-${white}-${black}-${sheet.gameId.slice(0, 8)}`;
}

/**
 * Offer a blob to the person, by whatever route this browser actually supports.
 *
 * The order is deliberate: the share sheet first, because on a phone that is what somebody wants and
 * it reaches the app they are going to send it to. A download second. Opening in a tab last, because
 * it is ugly but it is the one thing that works when a WebView has disabled the other two.
 */
export async function offerFile(blob: Blob, filename: string): Promise<'shared' | 'downloaded' | 'opened'> {
  return offer(blob, filename);
}

async function offer(blob: Blob, filename: string): Promise<'shared' | 'downloaded' | 'opened'> {
  const file = new File([blob], filename, { type: blob.type });

  // `canShare` must be consulted: Safari throws on `share` with files it will not take.
  if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (error) {
      // A cancelled share sheet rejects with AbortError, and that is a choice, not a failure —
      // falling through to a download would then force a file on somebody who just said no.
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared';
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.click();
    return 'downloaded';
  } finally {
    // Revoked on the next frame: revoking immediately can cancel the download in some browsers.
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** The game as a picture, shared or saved. */
export async function shareCertificate(game: StoredGame, sheet: Scoresheet): Promise<string> {
  // Decoded up front, so the drawing itself stays synchronous and a half-drawn board is impossible.
  await loadPieces();
  await loadIdenticons([sheet.white, sheet.black]);
  const canvas = document.createElement('canvas');
  drawCertificate(canvas, {
    sheet,
    signatures: game.signatures,
    verifyAt: verifyAt(),
  });
  const blob = await certificateBlob(canvas);
  const how = await offer(blob, `${fileStem(sheet)}.png`);
  return t(how === 'shared' ? 'share.sent' : 'share.savedPicture');
}

/** The game as PGN, shared or saved. */
export async function sharePgn(game: StoredGame, sheet: Scoresheet): Promise<string> {
  const pgn = toPgn(sheet, game.moves, {
    site: verifyAt(),
    event: sheet.rated ? 'Rated game' : 'Casual game',
  });
  const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
  const how = await offer(blob, `${fileStem(sheet)}.pgn`);
  return t(how === 'shared' ? 'share.sent' : 'share.savedPgn');
}

/**
 * The certificate as a canvas, for showing it before sending it.
 *
 * A picture somebody is about to put in a message is a picture they want to look at first — and it
 * is also the only way to notice that something on it is wrong.
 */
export async function certificateCanvas(game: StoredGame, sheet: Scoresheet): Promise<HTMLCanvasElement> {
  await loadPieces();
  await loadIdenticons([sheet.white, sheet.black]);
  const canvas = document.createElement('canvas');
  canvas.className = 'certificate';
  drawCertificate(canvas, { sheet, signatures: game.signatures, verifyAt: verifyAt() });
  return canvas;
}
