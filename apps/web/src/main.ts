/**
 * The entry point.
 *
 * One rule governs what happens here: the board is on the screen before anything is tapped, and
 * something is playable in one tap with no wallet, no opponent and no wait (`SPEC.md` E3, Q4).
 * So the first thing this file does is draw a game.
 */

import './styles.css';
import { LEVELS } from '@scoresheet/core';
import { installDemoWallet } from './demo-wallet.ts';
import { createGame } from './game.ts';

// Before anything renders, and only when asked for. A real wallet always wins.
installDemoWallet();

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('no #app');

const game = createGame(LEVELS[1]);
app.append(game.el);
