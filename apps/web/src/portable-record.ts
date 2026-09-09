/**
 * Your whole record, as one file you own.
 *
 * The certificate proves one game. The record page recomputes a rating in front of you. Neither is a
 * thing you can *take with you*, and that gap was the last one between "a rating nobody can revoke"
 * as a slogan and as a fact: a rating you can only see on our site is a rating that disappears when
 * our site does.
 *
 * So: one JSON file holding every fully signed game and puzzle card this device has for one wallet,
 * in canonical order, with two Merkle roots over them. Hand it to anyone. Their browser checks every
 * signature, recomputes both roots and derives the rating from first principles. Nothing in that
 * path touches our server and none of it asks them to trust us, which is the only reason it is worth
 * doing at all.
 *
 * **Delivery degrades rather than fails**, reusing `share-game.ts`'s ladder — share sheet, then
 * download, then a new tab. Inside an embedded browser a download link can be inert, so the tab
 * fallback is not politeness; it is the path that actually works in the container this app lives in.
 *
 * **One bundle is one chain.** A testnet game and a mainnet game are different facts about different
 * worlds, and a file mixing them would produce a rating belonging to neither. So the chain is taken
 * from the newest record and everything else is left behind and *counted*, because a silent
 * exclusion on a page about proof is the one thing this whole feature exists to argue against.
 */

import {
  buildBundle,
  parsePuzzleCard,
  parseScoresheet,
  type BundledPuzzleCard,
  type BundledScoresheet,
  type ChessChain,
  type RatingBundle,
} from '@scoresheet/core';
import { cardsFor } from './puzzle-cards.ts';
import { gamesFor } from './store.ts';
import { offerFile } from './share-game.ts';
import { t } from './i18n.ts';

/** A filename somebody will still recognise in a downloads folder next month. */
export function bundleFilename(address: string): string {
  const short = address.replace(/\s/g, '').slice(2, 10).toLowerCase();
  return `scoresheet-record-${short}.json`;
}

export interface CollectedBundle {
  bundle: RatingBundle;
  /** Records held on this device that were deliberately not put in the file. */
  skippedUnsigned: number;
  skippedOtherChain: number;
}

/**
 * Gather everything this device holds for one wallet.
 *
 * **Only fully signed records travel.** A game with one signature is worth keeping on the device
 * until the opponent signs, and it is not evidence of anything — putting it in a file whose entire
 * purpose is proof would mean shipping something that cannot verify and then explaining why.
 */
export function collectBundle(address: string, generatedAtBlock: number): CollectedBundle {
  let skippedUnsigned = 0;

  const games = gamesFor(address)
    .map((game) => {
      const { white, black } = game.signatures;
      if (!white || !black) {
        skippedUnsigned += 1;
        return null;
      }
      try {
        return { entry: { text: game.canonical, white, black }, sheet: parseScoresheet(game.canonical) };
      } catch {
        skippedUnsigned += 1;
        return null;
      }
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  const cards = cardsFor(address)
    .map((card) => {
      const { solver, witness } = card.signatures;
      if (!solver || !witness) {
        skippedUnsigned += 1;
        return null;
      }
      try {
        return { entry: { text: card.canonical, solver, witness }, card: parsePuzzleCard(card.canonical) };
      } catch {
        skippedUnsigned += 1;
        return null;
      }
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  /*
   * The chain of the newest record wins.
   *
   * Newest rather than most-common: a player who moved from testnet to mainnet has a record whose
   * *current* meaning is the mainnet one, and a majority vote would keep exporting their old world
   * long after they had left it.
   */
  const newest = Math.max(
    0,
    ...games.map((g) => g.sheet.endedAtBlock),
    ...cards.map((c) => c.card.endedAtBlock),
  );
  const chain: ChessChain =
    games.find((g) => g.sheet.endedAtBlock === newest)?.sheet.chain ??
    cards.find((c) => c.card.endedAtBlock === newest)?.card.chain ??
    'main';

  const scoresheets: BundledScoresheet[] = [];
  const puzzleCards: BundledPuzzleCard[] = [];
  let skippedOtherChain = 0;

  for (const { entry, sheet } of games) {
    if (sheet.chain === chain) scoresheets.push(entry);
    else skippedOtherChain += 1;
  }
  for (const { entry, card } of cards) {
    if (card.chain === chain) puzzleCards.push(entry);
    else skippedOtherChain += 1;
  }

  return {
    bundle: buildBundle({ chain, address, generatedAtBlock, scoresheets, puzzleCards }),
    skippedUnsigned,
    skippedOtherChain,
  };
}

/** The bundle as bytes, indented so a person can read it in a text editor. */
export function bundleBlob(bundle: RatingBundle): Blob {
  return new Blob([`${JSON.stringify(bundle, null, 2)}\n`], { type: 'application/json' });
}

/** Hand the file over, by whichever route this browser actually supports. */
export async function shareBundle(address: string, generatedAtBlock: number): Promise<string> {
  const { bundle, skippedUnsigned, skippedOtherChain } = collectBundle(address, generatedAtBlock);
  const how = await offerFile(bundleBlob(bundle), bundleFilename(address));

  const saved = t(how === 'shared' ? 'record.recordSent' : 'record.recordSaved', {
    games: bundle.scoresheets.length,
    runs: bundle.puzzleCards.length,
  });

  const skipped = skippedUnsigned + skippedOtherChain;
  return skipped === 0 ? saved : `${saved} ${t('record.recordSkipped', { count: skipped })}`;
}
