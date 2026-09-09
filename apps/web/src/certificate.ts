/**
 * A finished game as a picture.
 *
 * `SPEC.md` J1: a result you can put in a message. This is the growth loop in its most compressed
 * form — somebody wins a game, sends an image, and the person who receives it can *check* it, which
 * is the part no other chess app can offer. A screenshot of Chess.com proves nothing about
 * Chess.com; this proves itself.
 *
 * Three decisions, and each one is the reason the image is worth sending:
 *
 *  1. **It carries the two signatures, in full.** Not a badge saying "verified" — the actual hex. A
 *     picture that asserts trustworthiness is worth exactly as much as any other picture; a picture
 *     carrying the evidence can be checked by somebody who has never heard of us.
 *  2. **It is drawn, not screenshotted.** A canvas at a fixed size renders identically on every
 *     device and reads on a phone. Cropping the running app would produce a different image per
 *     screen and a board too small to see.
 *  3. **Nothing on it is flattering.** The result, the reason, the moves, the height, the addresses.
 *     A certificate that decorated a loss would be a certificate nobody believes about a win.
 *
 * No library: this is a few hundred lines of `CanvasRenderingContext2D`, and pulling in a renderer
 * for it would cost more than the whole app.
 */

import { positionFromFen, squareColour, type PieceCode, type Square } from './board.ts';
import { PIECES, PIECE_VIEWBOX } from './pieces.ts';
import type { Scoresheet } from '@scoresheet/core';
import { t, type Key } from './i18n.ts';
import { identiconImage } from './identicon.ts';

/**
 * Fixed pixel dimensions, at 2× for a phone screen.
 *
 * 1080 × 1350 is the 4:5 portrait that every messaging app and social platform shows without
 * cropping. A square would waste the space the text needs; a 16:9 would crop the board out on
 * Instagram.
 */
export const CERTIFICATE_WIDTH = 1080;
export const CERTIFICATE_HEIGHT = 1350;

/** Fixed, not themed. An image is sent to somebody whose theme is not the sender's. */
const INK = '#16150f';
const MUTED = '#5b5952';
const FAINT = '#8d8b84';
const PAPER = '#f6f4ef';
const LIGHT_SQUARE = '#edd9b0';
const DARK_SQUARE = '#9a7248';
const WHITE_PIECE = '#fcfbf8';
const WHITE_LINE = '#131109';
const BLACK_PIECE = '#21201c';
const BLACK_LINE = '#f2f0ea';
const ACCENT = '#2f6f4f';

export interface CertificateInput {
  sheet: Scoresheet;
  /** Both signatures, so the picture carries its own evidence. */
  signatures: { white?: { publicKeyHex: string; signatureHex: string } | undefined; black?: { publicKeyHex: string; signatureHex: string } | undefined };
  /** Where a reader can go to check it — printed on the image. */
  verifyAt: string;
}

/** A wallet, shortened the way a person reads one. */
function shortAddress(address: string): string {
  const tight = address.replace(/\s/g, '');
  return `${tight.slice(0, 10)}…${tight.slice(-6)}`;
}

const RESULT_WORDS: Record<string, Key> = {
  checkmate: 'live.checkmate',
  resignation: 'live.resignation',
  timeout: 'live.timeout',
  stalemate: 'live.stalemate',
  agreement: 'live.agreement',
  insufficient: 'live.insufficient',
  repetition: 'live.repetition',
  'fifty-move': 'live.fiftyMove',
  abandoned: 'certificate.abandoned',
};

/**
 * The pieces, as images, decoded once.
 *
 * **Not the system's chess glyphs, and that was learned the hard way.** The first version drew
 * `♚♛♜♝♞♟` with `fillText`. Rooks and kings came out right; pawns came out looking white on both
 * sides, because the symbol font on this machine renders `♟` as an outline rather than a filled
 * shape — and the fill then paints the outline strokes while the square shows through the middle. A
 * picture whose whole purpose is to be sent to other people cannot depend on which symbol font
 * *they* happen to have: on a phone in a WebView the font may not exist at all, and the fallback
 * would be a row of tofu boxes where the position should be.
 *
 * These are the same chessnut shapes the board draws, so the certificate and the app agree, and the
 * colours are applied here exactly as the stylesheet applies them there.
 */
const pieceImages = new Map<PieceCode, HTMLImageElement>();

function pieceSvg(piece: PieceCode): string {
  const shape = PIECES[piece] ?? '';
  const fill = piece[0] === 'w' ? WHITE_PIECE : BLACK_PIECE;
  const stroke = piece[0] === 'w' ? WHITE_LINE : BLACK_LINE;
  /*
   * Colours are set on the root `<g>`, and the shapes inherit them — which is exactly how the
   * stylesheet colours the board's pieces. `fill="none"` inside a shape marks a detail line and is
   * preserved by the inline styles the vendored source already carries.
   */
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${PIECE_VIEWBOX}" width="256" height="256"><g fill="${fill}" stroke="${stroke}">${shape}</g></svg>`;
}

/**
 * Decode every piece once, before anything is drawn.
 *
 * `drawImage` needs a decoded image, so this is the one asynchronous part of making a certificate.
 * Doing it up front — rather than per piece, per draw — means the drawing itself stays synchronous
 * and deterministic, and a half-decoded board is impossible rather than unlikely.
 */
/**
 * The faces to draw on the next certificate, decoded and ready.
 *
 * Module-level because `drawCertificate` is synchronous: the alternative is an async draw, and then
 * a certificate that is half-drawn while somebody screenshots it. `loadIdenticons` is awaited
 * alongside `loadPieces` by every caller.
 */
const faces = new Map<string, HTMLImageElement>();

/** Decode the two players' faces. Never throws: a certificate without them is still a certificate. */
export async function loadIdenticons(addresses: readonly string[]): Promise<void> {
  await Promise.all(
    addresses.map(async (address) => {
      const tight = address.replace(/\s/g, '').toUpperCase();
      if (!tight || faces.has(tight)) return;
      const image = await identiconImage(tight);
      if (image) faces.set(tight, image);
    }),
  );
}

export async function loadPieces(): Promise<void> {
  const codes = Object.keys(PIECES) as PieceCode[];
  await Promise.all(
    codes.map(
      (code) =>
        new Promise<void>((resolve, reject) => {
          if (pieceImages.has(code)) {
            resolve();
            return;
          }
          const image = new Image();
          image.decoding = 'sync';
          image.addEventListener('load', () => {
            pieceImages.set(code, image);
            resolve();
          });
          image.addEventListener('error', () => reject(new Error(`could not draw the ${code} piece`)));
          // A data URL rather than a blob: no object URL to revoke, and no chance of drawing from
          // one that has already been released.
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pieceSvg(code))}`;
        }),
    ),
  );
}

function drawPiece(
  context: CanvasRenderingContext2D,
  piece: PieceCode,
  x: number,
  y: number,
  size: number,
): void {
  const image = pieceImages.get(piece);
  if (!image) return;
  // A small inset, so a piece sits inside its square rather than touching the edges of it.
  const inset = size * 0.06;
  context.drawImage(image, x + inset, y + inset, size - inset * 2, size - inset * 2);
}

/** Draw text, wrapping to a width, and return the y it finished at. */
function wrapped(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(' ');
  let line = '';
  let cursor = y;
  for (const word of words) {
    const candidate = line.length === 0 ? word : `${line} ${word}`;
    if (context.measureText(candidate).width > maxWidth && line.length > 0) {
      context.fillText(line, x, cursor);
      cursor += lineHeight;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line.length > 0) {
    context.fillText(line, x, cursor);
    cursor += lineHeight;
  }
  return cursor;
}

/**
 * Break a long hex string into fixed-width chunks that fit the image.
 *
 * A 128-character signature on one line is either unreadable or off the edge. Chunking keeps every
 * character present — which is the point, since the whole value of putting it here is that somebody
 * can type it back in.
 */
function chunk(hex: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < hex.length; i += size) out.push(hex.slice(i, i + size));
  return out;
}

/**
 * Draw the certificate onto a canvas.
 *
 * Synchronous and deterministic: the same input produces the same pixels, which is what makes it
 * testable at all.
 */
export function drawCertificate(
  canvas: HTMLCanvasElement,
  input: CertificateInput,
): { contentBottom: number; board: { left: number; top: number; size: number } } {
  const { sheet } = input;
  canvas.width = CERTIFICATE_WIDTH;
  canvas.height = CERTIFICATE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(t('certificate.cannotDraw'));

  context.fillStyle = PAPER;
  context.fillRect(0, 0, CERTIFICATE_WIDTH, CERTIFICATE_HEIGHT);

  const margin = 64;
  const width = CERTIFICATE_WIDTH - margin * 2;
  let y = margin + 20;

  /* ---------------------------------------------------------------- the result */

  context.fillStyle = INK;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.font = '600 64px system-ui, -apple-system, "Segoe UI", sans-serif';
  const winner = t(
    sheet.result === '1-0' ? 'certificate.whiteWins' : sheet.result === '0-1' ? 'certificate.blackWins' : 'certificate.drawn',
  );
  context.fillText(winner, margin, y + 48);
  y += 84;

  context.fillStyle = MUTED;
  context.font = '400 30px system-ui, -apple-system, "Segoe UI", sans-serif';
  const key = RESULT_WORDS[sheet.termination];
  const reason = key ? t(key) : sheet.termination;
  context.fillText(
    t('certificate.summary', {
      reason,
      moves: sheet.moveCount,
      kind: t(sheet.rated ? 'certificate.rated' : 'certificate.casual'),
    }),
    margin,
    y + 24,
  );
  y += 64;

  /* ---------------------------------------------------------------- the board */

  /*
   * The board is 620 wide, not the full column — and that is the fix for a real defect.
   *
   * At full width it was 952 px of a 1350 px image, which left 200 px for the addresses, the block
   * height, two signatures and the footer. They ran off the bottom and through each other: the
   * footer, drawn at a fixed distance from the bottom edge, printed straight over the address line.
   * Every check passed — the PNG was the right size, had plenty of colours, and was unreadable.
   *
   * `contentBottom` is returned so that overflow is something a test can assert on rather than
   * something somebody has to notice.
   */
  const boardSize = 620;
  const boardLeft = margin + (width - boardSize) / 2;
  const boardTop = y;
  const square = boardSize / 8;
  const position = positionFromFen(sheet.finalFen);

  const files = 'abcdefgh';
  for (let rank = 8; rank >= 1; rank--) {
    for (let file = 0; file < 8; file++) {
      const name = `${files[file]}${rank}` as Square;
      const x = boardLeft + file * square;
      const top = y + (8 - rank) * square;
      context.fillStyle = squareColour(name) === 'light' ? LIGHT_SQUARE : DARK_SQUARE;
      context.fillRect(x, top, square, square);
      const piece = position.get(name);
      if (piece) drawPiece(context, piece, x, top, square);
    }
  }

  // A hairline, so the board has an edge against the paper rather than floating.
  context.strokeStyle = 'rgba(0,0,0,0.18)';
  context.lineWidth = 2;
  context.strokeRect(boardLeft, y, boardSize, boardSize);
  y += boardSize + 52;

  /* ---------------------------------------------------------------- who played */

  context.font = '600 26px system-ui, -apple-system, "Segoe UI", sans-serif';
  context.fillStyle = INK;
  context.fillText(t('colour.white'), margin, y);
  context.fillText(t('colour.black'), margin + width / 2, y);
  y += 34;

  /*
   * Each player's face, beside their address.
   *
   * This is the artefact that gets forwarded, and two Nimiq addresses in a monospace font look
   * identical at a glance — which is exactly the problem identicons exist to solve. Drawn only if
   * the image is already decoded (`loadIdenticons` does that before this runs), because this
   * function is synchronous by design: a certificate that renders differently depending on what has
   * finished loading is a certificate that cannot be tested.
   */
  const faceSize = 44;
  const white = faces.get(sheet.white.replace(/\s/g, '').toUpperCase());
  const black = faces.get(sheet.black.replace(/\s/g, '').toUpperCase());

  /*
   * The addresses move right **only when both faces are actually there**.
   *
   * The first version tested `faces.size > 0`, which is a module-level map that outlives the
   * certificate: a face left in it by a *previous* game would indent this one's addresses past a
   * space with nothing in it. Either both or neither, decided from this game's own two.
   */
  const withFaces = white !== undefined && black !== undefined;
  if (withFaces) {
    context.drawImage(white, margin, y - 20, faceSize, faceSize);
    context.drawImage(black, margin + width / 2, y - 20, faceSize, faceSize);
  }

  context.font = '400 24px ui-monospace, "SF Mono", Menlo, monospace';
  context.fillStyle = MUTED;
  const textLeft = withFaces ? faceSize + 14 : 0;
  context.fillText(shortAddress(sheet.white), margin + textLeft, y + 8);
  context.fillText(shortAddress(sheet.black), margin + width / 2 + textLeft, y + 8);
  y += 60;

  /* ---------------------------------------------------------------- the evidence */

  context.font = '600 26px system-ui, -apple-system, "Segoe UI", sans-serif';
  context.fillStyle = ACCENT;
  context.fillText(t('certificate.bothSigned'), margin, y);
  y += 36;

  context.font = '400 22px system-ui, -apple-system, "Segoe UI", sans-serif';
  context.fillStyle = MUTED;
  y = wrapped(
    context,
    t('certificate.evidence', {
      block: sheet.endedAtBlock,
      game: sheet.gameId.slice(0, 16),
      where: input.verifyAt,
    }),
    margin,
    y,
    width,
    30,
  );
  y += 14;

  /*
   * The signatures themselves, in full, in a monospace grid.
   *
   * This is the part that makes the image evidence rather than decoration. It is small and it is
   * meant to be — nobody reads it at a glance, and somebody who wants to check it can zoom in and
   * type it. A "verified ✓" badge in its place would be a claim, and a claim on a picture is worth
   * nothing at all.
   */
  context.font = '400 17px ui-monospace, "SF Mono", Menlo, monospace';
  context.fillStyle = FAINT;
  for (const [side, signature] of [
    [t('colour.white'), input.signatures.white],
    [t('colour.black'), input.signatures.black],
  ] as const) {
    context.fillText(t('certificate.signatureOf', { side }), margin, y);
    y += 22;
    if (!signature) {
      context.fillText(t('cert.notSignedYet'), margin, y);
      y += 30;
      continue;
    }
    for (const part of chunk(signature.signatureHex, 64)) {
      context.fillText(part, margin, y);
      y += 21;
    }
    y += 10;
  }

  /* ---------------------------------------------------------------- the footer */

  const contentBottom = y;

  /*
   * The footer sits at the bottom edge, and the content above must not reach it.
   *
   * Returning where the content ended is what lets that be checked instead of eyeballed — see
   * `certificate.test.ts`, which fails if a longer signature or an extra line ever pushes the two
   * into each other.
   */
  context.font = '400 22px system-ui, -apple-system, "Segoe UI", sans-serif';
  context.fillStyle = FAINT;
  context.fillText(t('certificate.tagline'), margin, CERTIFICATE_HEIGHT - margin);

  /*
   * The board's rectangle is returned so a test can sample a named square by pixel.
   *
   * An earlier check guessed these numbers, sampled the wrong squares, and reported that the piece
   * colours were correct while the picture was being read as inverted by eye — the worst possible
   * combination, because it argued *against* looking again.
   */
  return { contentBottom, board: { left: boardLeft, top: boardTop, size: boardSize } };
}

/** Where the footer's text sits, so a caller can check nothing has grown into it. */
export const CERTIFICATE_FOOTER_TOP = CERTIFICATE_HEIGHT - 64 - 26;

/**
 * The certificate as a PNG blob, ready to be saved or shared.
 *
 * `toBlob` rather than a data URL: a data URL of a 1080 × 1350 PNG is about two megabytes of base64
 * in a string, and putting that through the share sheet is how a phone runs out of memory.
 */
export function certificateBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(t('certificate.noPicture')));
    }, 'image/png');
  });
}
