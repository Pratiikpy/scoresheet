# Human perception of human vs. machine play — implications for bots and for the detector

This file centers on one directly-read, fully open-access source, so most headings describe that study
literally (§1–§3 as "what it does/why/badly"); §4 onward is this project's own synthesis of what it
implies for two different parts of Scoresheet — bot opponents and the fair-play detector — read the
same way `design.md` reads its own later sections.

Source read directly, full text: Eisma, Y.B., Koerts, R., & de Winter, J.C.F., **"Turing tests in
chess: An experiment revealing the role of human subjectivity,"** *Computers in Human Behavior Reports*
16 (2024), article 100496.
[sciencedirect.com/science/article/pii/S2451958824001295](https://www.sciencedirect.com/science/article/pii/S2451958824001295),
DOI [10.1016/j.chbr.2024.100496](https://doi.org/10.1016/j.chbr.2024.100496). Confirmed via Crossref
(queried directly, 2026-09-08) to carry a **CC BY 4.0** version-of-record licence effective 2024-09-25 —
this is a genuinely open-access article, and the abstract below is quoted in full, not paraphrased.

## 1. What they do

Twenty-four chess players each played **eight 5+0 Blitz games** from different starting positions
against four opponent types: **(1) a human, (2) Maia** (a neural-network engine trained specifically to
play human-like moves), **(3) Stockfish 16 downgraded** to a lower playing strength, and **(4) Stockfish
16 at its maximal level.** The opponent's move time was fixed at 10 seconds for every move, across all
four opponent types — deliberately removing move-timing as a variable participants could use to guess
the opponent's nature, isolating move *quality/character* as the only available cue. During play,
participants verbalized their thoughts (a think-aloud protocol); after each game, a questionnaire asked
whether they believed they had played a human or a machine, and which specific moves, if any, revealed
the opponent's true nature.

Full abstract, quoted verbatim: *"With the growing capabilities of AI, technology is increasingly able
to match or even surpass human performance. In the current study, focused on the game of chess, we
investigated whether chess players could distinguish if they were playing against a human or a
computer, and how they achieved this. A total of 24 chess players each played eight 5+0 Blitz games
from different starting positions. They played against (1) a human, (2) Maia, a neural network-based
chess engine trained to play in a human-like manner, (3) Stockfish 16, the best chess engine available,
downgraded to play at a lower level, and (4) Stockfish 16 at its maximal level. The opponent's move time
was fixed at 10 seconds. During the game, participants verbalized their thoughts, and after each game,
they indicated by means of a questionnaire whether they thought they had played against a human or a
machine and if there were particular moves that revealed the nature of the opponent. The results showed
that Stockfish at the highest level was usually correctly identified as an engine, while Maia was often
incorrectly identified as a human. The moves of the downgraded Stockfish were relatively often labeled
as 'strange' by the participants. In conclusion, the Turing test, as applied here in a domain where
computers can perform superhumanly, is essentially a test of whether the chess computer can devise
suboptimal moves that correspond to human moves, and not necessarily a test of computer intelligence."*
[sciencedirect.com/science/article/pii/S2451958824001295](https://www.sciencedirect.com/science/article/pii/S2451958824001295)

Two results outside the headline abstract, both load-bearing for §4–§5 below:

- **Stronger players were more likely to believe Maia was human** — meaning stronger players were
  *more often wrong* specifically against the human-aligned engine, not less. Chess skill did not
  protect against this particular misjudgment; if anything it correlated with being more fooled.
- **Downgraded Stockfish's moves were relatively often flagged as "strange"** by participants — a
  crude strength-reduction (playing a full-strength engine but capping its evaluation depth/search) does
  not produce moves that read as human error; it produces moves that read as *inhuman* error, a
  qualitatively different and more detectable signature.

## 2. Why it works

The mechanism the authors themselves name in their own conclusion is precise: in a domain where the
computer's raw capability already exceeds every human participant, "the Turing test... is essentially a
test of whether the chess computer can devise suboptimal moves that correspond to human moves, and not
necessarily a test of computer intelligence." Maia was purpose-built (via training on human game
databases rather than via self-play strength maximization) to produce exactly the *distribution* of
moves a human of a given rating would play, including human-typical mistakes — not to play well, but to
play *characteristically*. That is precisely why it passes: participants aren't judging capability, they
are pattern-matching against what a human of that apparent strength "would" do, and Maia was trained
directly against that distribution while raw engines (including deliberately weakened ones) were not.

Downgraded Stockfish fails the same test for the inverse reason: reducing search depth or evaluation
strength changes *how well* the engine plays without changing *how* it errs — the character of its
mistakes stays computer-shaped (locally sound, structurally alien) even when their objective quality
drops to human range. Weakness and human-likeness are different axes, and this study is direct empirical
evidence that conflating them (playing "worse" to seem "more human") does not work.

## 3. What they do badly

- **Fixed 10-second move time removes exactly the signal our own design leans on most heavily
  pre-engine.** `design.md` §1 signal 3 (move-time variance) and signal 4 (time-vs-difficulty
  correlation) are the two signals available to Scoresheet from day one, before any engine exists
  (`design.md` §1, §6). This study's protocol deliberately eliminates timing as a variable to isolate
  move-quality perception — a clean experimental choice for its own research question, but it means
  this study says nothing at all about how well *humans* (or a timing-based detector) would do at
  telling these four opponent types apart if timing were *not* fixed. **NOT VERIFIED**: whether Maia's
  timing pattern (if it had one) would also read as human-plausible; this study structurally cannot
  answer that question because it controlled the variable away.
- **Small, single-population sample.** 24 participants, 8 games each, one time control (5+0 blitz), one
  specific Stockfish downgrade configuration, one specific Maia checkpoint — the headline finding
  (Maia passes, max Stockfish doesn't, downgraded Stockfish reads as "strange") is a real, published,
  peer-reviewed, open-access result, but it is one experiment, not a settled law about all human-aligned
  models against all populations.
- **The "strange" label for downgraded Stockfish is qualitative, from open-text/questionnaire response,
  not a separately quantified strangeness metric** — the paper reports this as a pattern in participant
  language, not as a numeric score; treating it as a hard, calibrated statistic would overstate what the
  study actually measured. **NOT VERIFIED**: any specific rate or percentage for how often downgraded
  Stockfish moves were called "strange," beyond the qualitative "relatively often" the abstract itself
  uses.
- **The study measures human judges' *stated belief*, not the ground truth of what a judge would act on
  under financial stakes.** A participant guessing "human vs. machine" in a research questionnaire has
  no money riding on being right; a moderator or opponent deciding whether to contest a payout does.
  This study cannot tell us whether real financial incentive would sharpen or further bias human
  judgment against a Maia-style opponent — a genuinely open question this study does not, and could not,
  answer.

## 4. What we should copy conceptually

- **If Scoresheet ever ships bot opponents (sparring, practice, or any AI-played role), a human-aligned
  model (Maia-shaped: trained on human game distributions, not strength-capped from a maximizing
  engine) is the empirically correct approach to making a bot read as human**, and naive
  strength-reduction of a strong engine is empirically the wrong approach — this study is direct,
  open-access, peer-reviewed evidence for that specific design choice, not a guess.
- **Do not build "human-like" by turning strength down; build it by training on human move
  distributions.** The mechanism in §2 generalizes: whatever bot difficulty tiers Scoresheet ships,
  the naive lever (depth/skill cap on a strong engine) is the one this study shows produces
  detectably-inhuman play, while the harder, correct lever (training against real human move data at a
  target rating band, the way Maia does) is the one shown to actually pass.
- **A human-aligned model's *agreement rate* with a player is a stronger "is this human-plausible"
  signal than raw engine agreement** — this is the same conclusion `chessfraud.md` §3–§4 reaches from
  a completely different angle (Allie-embedding agreement outperforming raw Stockfish-match as a
  detection feature on real tournament ground truth). Two independent literatures — a human-perception
  study and a machine-detection benchmark — converge on the same design implication: human-aligned
  models are the right proxy for "human," both for judging it and for building it.
- **Treat "does this feel like a human?" as an unreliable gate specifically against the most realistic
  modern threat**, and say so plainly in any product copy that describes human/moderator review as a
  safeguard — see §5.

## 5. What we can do better

- **This study is direct evidence against relying on human moderator intuition as a meaningful check
  against a human-aligned cheat tool.** `lichess.md` §4 and `chess-com.md` §4 both list "human review as
  the final gate on any consequential action" as something to copy conceptually from those platforms.
  This study complicates that borrowing materially: stronger players were *more* often fooled by Maia,
  not less, meaning the exact population most likely to staff a manual review queue (strong, experienced
  players) is also the population this study shows is *more* susceptible to misjudging the most
  dangerous class of modern cheat tool. Scoresheet's own product copy about human review should state
  this limitation explicitly rather than implying human judgment is a reliable backstop against every
  kind of assistance — it is a reasonably reliable backstop against a blunt, undisguised strong engine
  (the study's own Stockfish-max result), and a demonstrably weaker one against a human-aligned
  assistance tool.
- **Build the detector to specifically target human-aligned-model agreement, not just raw-engine
  agreement, because that is the exact case human intuition is empirically bad at catching.** This
  directly reinforces `design.md` signal 1 and signal 2's engine-agreement design, and argues concretely
  for weighting a Maia/Allie-style agreement signal at least as heavily as raw Stockfish-match — not
  because it is theoretically nicer, but because this study shows the alternative detection layer
  (a human simply noticing) specifically fails against exactly this signature.
- **If Scoresheet bots exist and need a difficulty ladder, do not "weaken toward human" by depth
  capping** — build or license a rating-banded, human-move-distribution-trained model instead, or be
  explicit in the product's own copy that a given bot tier is a deliberately non-human-like weakened
  engine (e.g. for a "beat the calculator" mode) rather than presenting it as if it plays like a person
  at that rating, since this study shows that gap is perceptible ("strange") to real players.

## 6. What is technically required

- **For a human-aligned bot opponent**: a Maia-style model — a neural network trained via supervised
  learning on real human games at specific rating bands, not a strength-limited search engine. Maia
  itself is open-source (`chessfraud.md` §1 lists it among the human-aligned models that dataset's own
  pipeline integrates); building or adapting an equivalent, or using a comparably-licensed existing
  model, is the concrete technical path this study's finding points to. Its own licence would need
  independent verification before any reuse — **NOT VERIFIED** here, out of scope for this file, in
  scope for whichever future file evaluates bot-opponent implementation options directly.
- **For the detector**: per-move agreement scoring against a human-aligned model's move distribution
  (not just its top-1 move — the *probability* it assigns to the played move), alongside raw-engine
  agreement, as parallel features feeding the same ensemble `design.md` §1 already specifies. This
  requires hosting or calling such a model at inference time for every scored game, the same
  infrastructure requirement `design.md` §6 already lists for engine evaluation generally.
- **A held-out perception check of our own**, if we ever want to validate a bot difficulty tier against
  real players' subjective read of it, following this study's own protocol (think-aloud plus post-game
  questionnaire) rather than assuming a rating number alone certifies "feels human."

## 7. What could break

- **A single study, however clean, is not a settled law.** Twenty-four participants and one Maia
  checkpoint is the entire evidence base here; a different rating band, a different time control, or a
  newer Maia/Allie version could shift these specific numbers even if the underlying mechanism (§2)
  holds up. Any product decision built on this file should be described as "supported by this study,"
  not "proven."
- **Fixed move-time in the study means we cannot yet claim anything about combined timing+move-quality
  detection or bot design** — our own signals 3/4 (`design.md` §1) are exactly the dimension this study
  held constant, so this file cannot be cited as evidence either for or against our own time-based
  signals; it is silent on that axis by design, not by finding.
- **A rating-banded human-aligned bot is a nontrivial build**, not a config toggle on an existing engine
  — if Scoresheet ships bots under time pressure, the empirically-wrong-but-easy path (strength-capping
  Stockfish) is the one this study shows produces detectably "strange" play; naming that tradeoff
  explicitly to whoever decides the bot roadmap is the honest thing this file can do, not silently
  assuming the harder, correct path will be chosen.
- **The "stronger players are more often fooled by Maia" finding, if it generalizes, undermines any
  design that quietly relies on strong players self-policing** (e.g., titled-player second-chance
  review, informal community reporting by strong players) as a cheap detection layer — this is a direct
  complication for any future design leaning on expert human judgment as a cost-saving substitute for
  the ensemble in `design.md` §1.

## 8. What we can uniquely do because of Nimiq

- Nothing in this specific study is Nimiq-dependent — it is a finding about human and model behaviour,
  not about payments infrastructure. What Scoresheet can uniquely do is **act on the finding**: because
  our detector's confidence bands and their consequences are signed and disclosed (`design.md` §1, §8),
  we can be explicit, in a way a platform without a money-and-signature layer has less structural reason
  to be, about exactly which detection layer (statistical ensemble vs. human review) is trusted for
  which threat model — stating plainly, as signed product policy, that human review is weighted less
  heavily against human-aligned-model-shaped assistance than against blunt engine use, rather than
  presenting "human review" as a uniform backstop the way `lichess.md` §4/`chess-com.md` §4's
  "human review as final gate" pattern implicitly does.
- If Scoresheet ever needs to justify *why* a given signal (human-aligned-model agreement) is weighted
  the way it is in the published architecture (`design.md` §7's "publish architecture, not exact
  thresholds" policy), this study is a citable, open-access, independently-verifiable piece of public
  evidence for that weighting — something we can point to in our own fair-play documentation rather than
  asserting the weighting from authority alone.

## 9. Licence and reuse verdict

| Source | Licence (verified how) | What may be reused |
|---|---|---|
| Eisma, Koerts & de Winter (2024), *Computers in Human Behavior Reports* 16, art. 100496 | **CC BY 4.0** — confirmed via direct Crossref query on the DOI, 2026-09-08 (version-of-record licence, effective 2024-09-25) | Fully open access. Abstract quoted verbatim above with attribution, consistent with CC BY 4.0's own terms; findings paraphrased and cited throughout. No code or dataset accompanies this paper; nothing here is software to reuse — every reusable element is a published, uncopyrightable research finding. |

Nothing in this file requires any licence exception: the one source is CC BY 4.0, openly and directly
verified, and everything built on top of it in §4–§8 is this project's own original synthesis, not
reused expression from any other party.
