/**
 * Sound and haptics.
 *
 * On a phone this is most of what "feel" means, and the low-time tick is a genuine part of playing
 * blitz rather than a flourish — people hear the clock before they look at it.
 *
 * **Synthesised, not sampled.** Every sound set in `lichess-org/lila` is AGPL or CC BY-NC-SA
 * (checked against their own `COPYING.md`, 6 September 2026), so none of them can ship here. Web
 * Audio makes a move click and a capture thud out of an oscillator and a gain ramp in a few lines,
 * and then they are ours, they weigh nothing, and they work offline.
 *
 * Three rules that keep it from being annoying:
 *
 *  - **Nothing plays until the player has interacted with the page.** Browsers block it anyway, and
 *    an app that makes noise before you touch it is an app people mute permanently.
 *  - **One shared context, created lazily.** A context per sound leaks, and creating one at load
 *    starts a suspended audio graph on every page view for people who never play.
 *  - **Muting is honoured everywhere, and remembered.**
 */

export type SoundName = 'move' | 'capture' | 'check' | 'castle' | 'promote' | 'lowTime' | 'end';

/** Every sound as a small recipe. Two oscillators at most; anything richer starts sounding cheap. */
interface Recipe {
  /** Hertz, from and to. A falling tone reads as "placed", a rising one as "something happened". */
  from: number;
  to: number;
  /** Seconds. Everything here is short — a move sound that outlasts the move is noise. */
  duration: number;
  type: OscillatorType;
  /** Peak gain, 0–1. Deliberately quiet: this plays on every single move. */
  gain: number;
}

const RECIPES: Record<SoundName, Recipe> = {
  // A soft wooden click. Short and low, so it disappears into the background after two games.
  move: { from: 320, to: 180, duration: 0.055, type: 'triangle', gain: 0.16 },
  // Heavier and lower than a move, because a capture is a bigger event and should sound like one.
  capture: { from: 220, to: 90, duration: 0.09, type: 'square', gain: 0.2 },
  // Rising, and the only one that goes up: check is the sound that should make you look.
  check: { from: 440, to: 660, duration: 0.11, type: 'triangle', gain: 0.19 },
  castle: { from: 280, to: 200, duration: 0.13, type: 'triangle', gain: 0.17 },
  promote: { from: 520, to: 880, duration: 0.16, type: 'sine', gain: 0.2 },
  // The clock. Sharp, quiet and repeated — it is meant to be felt more than heard.
  lowTime: { from: 900, to: 900, duration: 0.045, type: 'sine', gain: 0.14 },
  end: { from: 380, to: 140, duration: 0.3, type: 'sine', gain: 0.22 },
};

const STORAGE_KEY = 'scoresheet:sound';

let context: AudioContext | null = null;
let muted = read();

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'off';
  } catch {
    // Private mode, or storage disabled. Sound on is the better default to fail to.
    return false;
  }
}

/** The one context, made on first use — never at load, and never one per sound. */
function audio(): AudioContext | null {
  if (muted) return null;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  // Browsers suspend the context until a gesture. Resuming here is what makes the first move audible.
  if (context.state === 'suspended') void context.resume();
  return context;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? 'off' : 'on');
  } catch {
    /* nothing to do; the setting simply will not survive a reload */
  }
}

export function play(name: SoundName): void {
  const ctx = audio();
  if (!ctx) return;
  const recipe = RECIPES[name];
  const now = ctx.currentTime;

  const oscillator = ctx.createOscillator();
  oscillator.type = recipe.type;
  oscillator.frequency.setValueAtTime(recipe.from, now);
  if (recipe.to !== recipe.from) oscillator.frequency.exponentialRampToValueAtTime(recipe.to, now + recipe.duration);

  /*
   * The envelope is what stops it sounding like a test tone.
   *
   * A gain that starts and stops abruptly clicks; ramping up over a couple of milliseconds and
   * decaying exponentially is the difference between a piece being placed and a beep.
   */
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(recipe.gain, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + recipe.duration);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + recipe.duration + 0.02);
}

/**
 * A short buzz, where the device has one.
 *
 * Kept beside sound because they are the same decision to a player: both are "did that register".
 * `navigator.vibrate` is absent on iOS and throws in some embedded WebViews, so it is guarded.
 */
export function haptic(pattern: number | number[] = 8): void {
  if (muted) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* no vibration hardware, or a WebView that refuses. Not worth a word to anybody. */
  }
}

/**
 * Pick the right sound for a move from its SAN, so a caller never has to think about it.
 *
 * SAN carries everything needed: `x` is a capture, `+`/`#` is check or mate, `O-O` is castling,
 * `=` is a promotion. Reading it here means one place decides, and the game screen stays about chess.
 */
export function playMoveSound(san: string): void {
  if (san.includes('#')) play('end');
  else if (san.includes('+')) play('check');
  else if (san.startsWith('O-O')) play('castle');
  else if (san.includes('=')) play('promote');
  else if (san.includes('x')) play('capture');
  else play('move');
  haptic(san.includes('x') ? 12 : 8);
}
