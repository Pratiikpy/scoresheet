/**
 * Fair play — signals, bands, and a refusal to accuse anybody.
 *
 * There is money on tournament outcomes, so somebody will eventually try to take some with an engine
 * open beside the board. This computes what can honestly be computed about that, and stops well short
 * of where a naive version would go.
 *
 * ## Why this is deliberately weak, and says so
 *
 * The literature is unambiguous and it is not encouraging. On the only real corpus with ground truth
 * — ChessFraud, 505 monitored tournament games — **the best published detector reaches about 62%
 * specificity and 59% recall**, barely ahead of a naive engine-match baseline at 57% and 63%. And
 * injecting one or two engine moves into an otherwise honest game moves a single-signal score from
 * 0.51 to 0.82, which means the realistic cheat is exactly the one aggregate statistics miss.
 *
 * Work the base rates and it gets worse. If one player in a hundred is cheating, a detector at 62%
 * specificity produces a pile of flags that is roughly **97% innocent people**. That is not a system
 * that should ever, on its own, take a prize away from somebody.
 *
 * So the output here is a **band, never a verdict**, the high-risk band's only consequence is that a
 * human looks, and `scripts/fairplay-calibrate.mjs` measures the bands against synthetic games with
 * known assistance so the numbers are ours rather than borrowed.
 *
 * ## And the measurement says these signals do not work
 *
 * Run against four populations — honest, and 15%, 50% and 100% engine-assisted — the result is
 * **0% of honest players flagged and 0% of assisted players caught, including the group whose every
 * move came from the engine.** Mean scores land between 20 and 30 across all four groups, well under
 * the review threshold.
 *
 * That is written here rather than fixed by moving the thresholds, because moving them until a
 * synthetic population separates is fitting to a fiction, and the thing it would produce is a
 * detector that flags real people confidently and wrongly. **Nothing in this file may gate a payout
 * until it has detection power somebody has measured**, and right now it has none.
 *
 * What the negative result actually says: engine agreement and centipawn loss, on their own, are the
 * weak signals the literature says they are. The signals with a chance are the ones not built here —
 * a per-player baseline over real history, and the order-sensitive sequential test — and both need
 * data this product has not accumulated yet. The per-move timing that feeds the first of them started
 * being recorded on 8 September 2026, which is why it started before anything consumed it.
 *
 * ## What is NOT here, on purpose
 *
 * - **No accusation, no automatic ban, no automatic forfeit.** `SPEC.md` and `BRIEF.md` already commit
 *   to "record and show, never auto-ban", and nothing in this file may quietly become an exception.
 * - **No secret threshold that decides money.** The inputs are part of the record; the weights are
 *   the only thing not published, which is the same line Lichess draws.
 * - **No treating a new player as clear.** A cold start is its own band, because "we have no evidence"
 *   and "we have evidence of nothing wrong" are different sentences and only one of them is true.
 */

/** What a band means, and what may be done about it. */
export type FairPlayBand =
  /** Not enough games to say anything. Never treated as clean. */
  | 'insufficient'
  /** Nothing stands out. The overwhelming majority of players, always. */
  | 'normal'
  /** Worth a person looking. Never an accusation, and never automatic. */
  | 'review'
  /** Strongly unusual. A person looks *before* anything is decided, not after. */
  | 'high-risk';

export interface GameSignals {
  /** How often the player's move matched the engine's first choice, 0–1. */
  engineAgreement: number;
  /** Average centipawns lost per move. Lower is stronger play. */
  averageLoss: number;
  /** How many of the player's moves were judged. Below `MIN_MOVES` nothing is concluded. */
  moves: number;
  /**
   * Rank correlation between time taken and how much choice the position offered, −1..1.
   *
   * A human spends longer when there is more to consider, so this is normally positive. Play that is
   * uniformly fast regardless of difficulty is the pattern the literature describes. Optional because
   * timing is recorded per device and a game imported as PGN has none.
   */
  timeVersusChoice?: number | undefined;
}

/** Fewer moves than this and no signal means anything at all. */
export const MIN_MOVES = 20;

/** Fewer games than this in a player's history and there is no baseline to compare against. */
export const MIN_GAMES_FOR_BASELINE = 5;

export interface FairPlayAssessment {
  band: FairPlayBand;
  /**
   * 0–100, ordering only. **Never shown to a player as a number**, and never described as a
   * probability of anything — it is not one, and the calibration says so.
   */
  score: number;
  /** The signals that pushed it up, in plain words, so a reviewer sees why rather than a verdict. */
  reasons: string[];
  /** The sentence that must accompany any display of this. */
  caveat: string;
}

/**
 * The sentence that travels with every assessment.
 *
 * Written once, here, so no screen can show a band without it.
 */
export const FAIR_PLAY_CAVEAT =
  'This is a flag for a person to look at, not a finding. Strong play looks like this too, and on ' +
  'measured data most flags are innocent.';

/**
 * Assess one player's games.
 *
 * Aggregate signals only, and the file's own documentation is clear that aggregates are the weak
 * kind. The sequential, order-sensitive test the research recommends is not built, and pretending
 * otherwise by naming the band something more confident would be the dishonest move.
 */
export function assess(games: readonly GameSignals[]): FairPlayAssessment {
  const usable = games.filter((game) => game.moves >= MIN_MOVES);

  if (usable.length < MIN_GAMES_FOR_BASELINE) {
    return {
      band: 'insufficient',
      score: 0,
      reasons: [`only ${usable.length} of ${games.length} games are long enough to say anything about`],
      caveat: FAIR_PLAY_CAVEAT,
    };
  }

  const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

  const agreement = mean(usable.map((game) => game.engineAgreement));
  const loss = mean(usable.map((game) => game.averageLoss));
  const timed = usable.filter((game) => typeof game.timeVersusChoice === 'number');
  const correlation = timed.length > 0 ? mean(timed.map((game) => game.timeVersusChoice!)) : null;

  const reasons: string[] = [];
  let score = 0;

  /*
   * Engine agreement. The oldest signal and the one everybody over-trusts.
   *
   * A strong club player agrees with a small engine a great deal of the time, which is why this can
   * only ever contribute to a band and never decide one.
   */
  if (agreement >= 0.9) {
    score += 45;
    reasons.push(`matched the engine's first choice ${(agreement * 100).toFixed(0)}% of the time`);
  } else if (agreement >= 0.8) {
    score += 25;
    reasons.push(`matched the engine's first choice ${(agreement * 100).toFixed(0)}% of the time`);
  }

  /* Very low average loss across several games — strong play, and also what assistance looks like. */
  if (loss <= 10) {
    score += 30;
    reasons.push(`lost an average of ${loss.toFixed(1)} centipawns a move`);
  } else if (loss <= 25) {
    score += 15;
    reasons.push(`lost an average of ${loss.toFixed(1)} centipawns a move`);
  }

  /*
   * Time against difficulty — the signal that survives when engine agreement does not.
   *
   * A person slows down when a position is harder. Play that takes the same time whether the position
   * is forced or wide open is the pattern the literature describes, and it is the one thing here that
   * an engine-assisted player does not naturally reproduce.
   */
  if (correlation !== null && correlation <= 0.05 && timed.length >= MIN_GAMES_FOR_BASELINE) {
    score += 25;
    reasons.push('took about the same time on easy and hard positions');
  }

  const band: FairPlayBand = score >= 70 ? 'high-risk' : score >= 40 ? 'review' : 'normal';
  return { band, score: Math.min(100, score), reasons, caveat: FAIR_PLAY_CAVEAT };
}

/**
 * What may be done at each band, as data rather than as scattered `if`s.
 *
 * Kept here so that the consequence of a band is a single, reviewable fact rather than something a
 * screen decides for itself. **Nothing at any band takes money from anybody automatically.**
 */
export const BAND_CONSEQUENCE: Record<FairPlayBand, string> = {
  insufficient: 'Nothing. There is not enough to look at yet, and that is not the same as clean.',
  normal: 'Nothing.',
  review: 'A person looks at the games before any prize is paid.',
  'high-risk': 'A person looks first, and the payout waits for that. No forfeit is automatic.',
};
