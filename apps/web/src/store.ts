/**
 * Where signed games are kept.
 *
 * On this device, for now. A real game needs a server so the two players can agree a game id before
 * either signs and so a stranger can open a link — but the *record* does not: everything the record
 * page needs is inside the scoresheets themselves, so it works from whatever set of them it is
 * handed, wherever they came from.
 *
 * That is the point rather than a limitation. A rating derived from signatures does not need a
 * database to be trusted; it needs the signatures. This module is a bucket, and swapping it for a
 * server changes nothing above it.
 *
 * Storage is `localStorage`, guarded everywhere: private mode and disabled storage both throw, and
 * a chess app that will not open because it cannot save is worse than one that forgets.
 */

import { canonicaliseScoresheet, parseScoresheet, type Scoresheet } from '@scoresheet/core';

export interface StoredGame {
  /** The exact bytes both players signed. Kept verbatim, never rebuilt from fields. */
  canonical: string;
  /** Both sides. A game with one is not a scoresheet, but it is worth keeping until the other signs. */
  signatures: {
    white?: { publicKeyHex: string; signatureHex: string };
    black?: { publicKeyHex: string; signatureHex: string };
  };
  /** SAN, so anyone can re-derive the hash inside the signed text. */
  moves: string[];
  /** When this device recorded it. Never signed, never used for ordering — that is `endedAtBlock`. */
  savedAt: number;
}

const KEY = 'scoresheet:games';

function read(): StoredGame[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Anything that will not parse as a scoresheet is dropped rather than shown: a record page is
    // a claim about what is verifiable, so it must never carry a row it cannot stand behind.
    return parsed.filter((entry): entry is StoredGame => {
      if (typeof entry !== 'object' || entry === null) return false;
      const game = entry as StoredGame;
      if (typeof game.canonical !== 'string') return false;

      /*
       * **`signatures` has to be an object, and that check is not decoration.**
       *
       * Only `canonical` was validated here. Every reader then walked `game.signatures` unguarded —
       * `record.ts` does `Object.values(game.signatures)` on the first line it draws — and
       * `Object.values(undefined)` throws. One row written by an older version of this app, or by
       * anything else on the origin, and the **record page is dead for good**: it is the screen the
       * whole product is an argument for, it cannot be recovered by reloading, and the only way out
       * is clearing site data.
       *
       * A row that cannot be stood behind is dropped, exactly as an unparseable scoresheet is.
       */
      if (typeof game.signatures !== 'object' || game.signatures === null) return false;
      if (!Array.isArray(game.moves)) return false;

      try {
        parseScoresheet(game.canonical);
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function write(games: StoredGame[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(games));
  } catch {
    /* private mode, or full. The game is still on screen; it simply will not survive a reload. */
  }
}

/** Every game this device knows about, newest first by when it was saved. */
export function allGames(): StoredGame[] {
  return read().sort((a, b) => b.savedAt - a.savedAt);
}

/** The parsed sheets, for anything that wants to compute rather than display. */
export function allSheets(): Scoresheet[] {
  return read().map((game) => parseScoresheet(game.canonical));
}

/**
 * Save a game, or add a signature to one already saved.
 *
 * Keyed on the canonical text rather than the game id, because two different texts with the same id
 * are two different claims and both should be visible rather than one quietly replacing the other.
 */
export function saveGame(input: {
  sheet: Scoresheet;
  side: 'white' | 'black';
  signature: { publicKeyHex: string; signatureHex: string };
  moves: string[];
}): void {
  const canonical = canonicaliseScoresheet(input.sheet);
  const games = read();
  const existing = games.find((game) => game.canonical === canonical);

  if (existing) {
    existing.signatures[input.side] = input.signature;
    existing.moves = input.moves.length > 0 ? input.moves : existing.moves;
  } else {
    games.push({
      canonical,
      signatures: { [input.side]: input.signature },
      moves: input.moves,
      savedAt: Date.now(),
    });
  }
  write(games);
}

/** Games involving one wallet, whichever side it played. */
export function gamesFor(address: string): StoredGame[] {
  const wanted = address.replace(/\s/g, '').toUpperCase();
  return allGames().filter((game) => {
    const sheet = parseScoresheet(game.canonical);
    return sheet.white === wanted || sheet.black === wanted;
  });
}

/** Every wallet this device has seen play, so a record page can be offered without being asked for. */
export function knownAddresses(): string[] {
  const seen = new Set<string>();
  for (const sheet of allSheets()) {
    seen.add(sheet.white);
    seen.add(sheet.black);
  }
  return [...seen];
}

export function forgetEverything(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
