# Scoresheet — submission copy

**What this file is.** The words that go in the submission form and the app listing, written once and
kept here so the store description, the README and the app itself cannot drift into saying different
things. The scored criterion is: *"Does the submission look app-store ready, well-packaged with a
clear description, polished visuals, and a demo that makes you want to try it?"*

Every number below is measured and reproducible from this repository. Nothing here is aspirational;
if a claim is not yet true it is in the **Not yet true** section at the bottom, which exists so that
nobody copies an overclaim into a form under deadline pressure.

---

## One line

> A chess rating nobody can take away from you.

## Short description — 40 words

> Play chess, and both players sign the result. Your rating is derived from those signatures, not
> stored in our account — so anyone can recompute it in their own browser, and we could delete
> everything we hold and you would still have it.

## Full description — 252 words

> **Your chess rating lives in somebody else's account, and dies with it.** Close the app, lose the
> login, get banned on a bad day, and the years of games are gone. Scoresheet is the same game with
> that one thing fixed.
>
> Both players sign the result with their Nimiq wallet. The rating is not a number we store — it is
> derived from those signatures by a function anybody can run, so a stranger can recompute your whole
> record in their own browser with our server switched off. Press **Recompute** and watch it happen.
> Export your history as one file and hand it to anyone; `/verify` checks every signature and
> re-derives the rating without asking us anything.
>
> It is a real chess app underneath. Live games with a clock, four bots measured to be genuinely in
> order, 5,000 offline puzzles, PGN in and out, five languages. Game review does more than grade you:
> it names what went wrong in one plain sentence — the piece you left hanging, the pin you walked
> into — then hands the position back so you can find the better move yourself, and files your
> mistake as a puzzle you will meet again.
>
> Play alone and still earn a rating: a run of five puzzles, signed by you and countersigned by the
> server, so one wallet is enough. Tournaments pair and score themselves by rules a stranger can
> recompute — no random draw anywhere, because the prize is real.
>
> Nothing is held for you. There is no balance and no withdrawal.

## The demo path — sixty seconds

The README's own path, kept in step with the app by a test that reads the button names out of the
README and presses them:

1. **0:00** — open it. A board, a bot, no sign-up.
2. **0:15** — solve five puzzles and sign the run. You now hold a rated record with one wallet.
3. **0:35** — open your record and press **Recompute**. Your browser re-derives the number from the
   signatures alone and prints what it reached.
4. **0:50** — press **Save my record**, then open `/verify` and drop the file in. Every signature
   checks out with no request to our server at all.

## The video

`npm run demo` records it, ~70 seconds, by driving the built app against the real API — nothing is
staged and nothing is re-enacted, so the film cannot drift from the product the way a hand-recorded
take can. It writes `demo/scoresheet-demo.webm` plus a segment timeline, and prints the one ffmpeg
line that finishes it to 1920×1080.

The order, because it is the order that makes the point:

1. **0:00** A board, a real engine, nothing asked for.
2. **0:07** A game signed — the scoresheet shown in full before it is signed.
3. **0:17** Five puzzles solved. The server chose them and countersigns the run, so this is a rating
   earned by one person with one wallet.
4. **0:49** **Recompute**, on screen: *"1 puzzle run verified here, and it reaches 1252 — the number
   above."* Derived in that browser, from the signatures, with nothing asked of us.
5. **1:02** A tournament held, with a link to send.

Still missing from it, and worth adding by hand: the record file opened on `/verify` in a second
browser with the network tab visible and empty.

---

## Not yet true — do not put these in a form

- **The puzzle pool has never paid real NIM.** The path is built and tested against a stand-in node;
  the pool is unfunded and `POOL_REWARD_NIM` is worth about $0.00017 a puzzle. Nothing in the copy
  above says money has moved, and nothing should until it has.
- **No absolute engine rating.** The four bots are measured to be *in order* against each other; there
  is no Stockfish on the build machine, so there is no Elo number and none is claimed.
- **The video has no voice-over and no captions**, and there is no store thumbnail sized for a
  listing. What does exist: `npm run demo` records the film by driving the built app, so every frame
  is the real product and re-running it reproduces the film; `apps/web/public/share.png` is a
  designed 1200×630 link-preview card carrying the claim and the final position of the Immortal
  Game; and `npm run icons` draws the home-screen set from the same knight as the favicon.
- **Swiss pairing is Dutch-*style*, not certified FIDE.** The copy says "rules a stranger can
  recompute", which is exactly what is proven.
- **Tournaments have never been played by real people.** They are now reachable and their results
  are signed — you hold one from the play screen, send the link, other people take the seats, and a
  finished game is reported as the signed scoresheet it already is, which the page re-verifies in the
  reader's own browser. All of that is driven end to end by `npm run look`. What has *not* happened
  is four humans playing one, so say "tournaments are built" rather than "people are running them".
- **A tournament's prize table cannot be paid yet.** Prizes are computed and displayed, and the
  create button deliberately offers no prize field, because the pool has never moved real NIM. Do not
  describe tournaments as paying anybody.
- **This has never run inside Nimiq Pay.** Tested, not assumed: the deep links are `nimiqpay://` and
  `https://nimpay.app/miniapps/open/<host>`, and that second URL answers **404 "Unknown mini app
  host"** — it is a redirector for registered apps, not a web runtime — and there is no Android SDK
  on the build machine. The SDK's own source settles it: `init()` polls for an injected
  `window.nimiq` and otherwise throws *"Are you running inside a Nimiq app?"* — there is no mock and
  no standalone provider, because the signing keys live in the wallet. So the host genuinely needs a
  phone with the wallet on it, and that is proven rather than assumed.

  What *is* closed is the bug class that absence hides, at two levels. `npm run provider` checks
  every Nimiq call against `@nimiq/mini-app-sdk`'s declarations, so a method that does not exist
  (the classic being `getBalance`, which does not) cannot reach a judge's phone. And `window.nimiq`
  is now typed by **Nimiq's own** `declare global` rather than by a hand-written interface, with the
  stand-in wallet checked against the same signatures — so a wrong argument shape is a build error.
  That mattered: `requestDeviceIdentifier` once shipped hand-typed as `(reason?: string)` when the
  host takes an options object, and because the stand-in copied the same mistake, every test passed
  while the feature was broken on a real phone. None of this proves the WebView renders the app or
  that a confirmation dialog reads well.
- **No human has opened this cold.** `npm run judge` settles the mechanical half — it loads, it plays,
  it verifies with the server unreachable, it works offline — and then prints nine comprehension
  questions it deliberately refuses to answer. Those need three testers who have never seen the app.
  Every claim above about what somebody *understands* is therefore unmeasured.
