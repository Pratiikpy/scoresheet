/**
 * Every word the app says, in English.
 *
 * This file is the source of truth for the key set: `Key` in `i18n.ts` is `keyof typeof en`, so a
 * string added here and forgotten in Spanish is a **type error**, not a sentence that silently turns
 * English in front of a Spanish speaker.
 *
 * ## How the keys are named
 *
 * `screen.thing`, and the screen is where a reader would go looking. A key is not a summary of the
 * sentence — `game.resigned` rather than `game.youResignedBlackWins` — because the sentence changes
 * and the key must not.
 *
 * ## How to write one
 *
 * The same way the rest of the product is written: plainly, about the game rather than about the
 * software, and never blaming the person reading it. `{name}` placeholders carry anything variable,
 * and they are named rather than positional because word order moves between languages.
 */

export const en = {
  /* ------------------------------------------------------------------ getting around */

  'nav.sections': 'Sections',
  'nav.play': 'Play',
  'nav.train': 'Train',
  'nav.you': 'You',
  'nav.noRecord':
    'Your record appears here once a game has been signed. Finish one and sign the result — it takes a tap.',

  /* ------------------------------------------------------------------ the move list */

  'moves.label': 'Moves',
  'moves.empty': 'The moves appear here as you play.',
  'moves.viewingEarlier': 'Viewing an earlier position',
  'moves.toStart': 'Go to the start',
  'moves.back': 'Previous move',
  'moves.forward': 'Next move',
  'moves.toLive': 'Back to the live position',
  'moves.namedAfter': '{eco} · named after {plies} moves',
  'moves.namedAfterOne': '{eco} · named after {plies} move',

  /* ------------------------------------------------------------------ the board */

  'board.label': 'Chess board',
  'board.square': '{square}, {piece}',
  'board.empty': 'empty',
  'board.promote': 'Choose a piece to promote to',

  'piece.pawn': 'pawn',
  'piece.knight': 'knight',
  'piece.bishop': 'bishop',
  'piece.rook': 'rook',
  'piece.queen': 'queen',
  'piece.king': 'king',
  'piece.piece': 'piece',

  /* ------------------------------------------------------------------ playing a friend */

  'lobby.title': 'Play a friend',
  'lobby.note':
    'You get a link. Whoever opens it takes the other side — they need no account and no wallet to play.',
  'lobby.time': 'Time',
  'lobby.youPlay': 'You play',
  'lobby.make': 'Make the link',
  'lobby.making': 'Making it…',
  'lobby.study': 'Or study a game from a PGN',
  'lobby.needsWallet':
    'A game against a person needs a wallet to sign the result with. Open this in Nimiq Pay, or play the bot — that needs nothing at all.',

  'time.bullet': 'Bullet',
  'time.bulletDetail': '1 minute each',
  'time.blitz': 'Blitz',
  'time.blitzDetail': '3 minutes, 2 seconds a move',
  'time.rapid': 'Rapid',
  'time.rapidDetail': '10 minutes, 5 seconds a move',
  'time.unlimited': 'No clock',
  'time.unlimitedDetail': 'Take as long as you like',

  'colour.random': 'Random',
  'colour.randomDetail': 'The usual way',
  'colour.white': 'White',
  'colour.whiteDetail': 'You move first',
  'colour.black': 'Black',
  'colour.blackDetail': 'They move first',
  /* ------------------------------------------------------------------ puzzles */

  'today.title': 'Today',
  'today.daily': 'Solve the puzzle of the day',
  'today.game': 'Play a game',
  'today.win': 'Win one',
  'today.done': 'done',
  'today.notYet': 'not yet',

  'puzzles.title': 'Puzzles',
  'puzzles.rating': 'puzzle rating',
  'puzzles.dayInARow': 'day in a row',
  'puzzles.daysInARow': 'days in a row',
  'puzzles.bestStreak': 'best streak',
  'puzzles.bestStorm': 'best storm',
  'puzzles.note':
    'These numbers live on this device and nobody signs them. Your rating on the record page is the opposite: two signatures, and nobody can take it away.',
  'puzzles.daily': 'Puzzle of the day',
  'puzzles.dailyDone': 'Today\u2019s puzzle \u2014 done',
  'puzzles.dailyDetail': 'The same puzzle everybody else got today.',
  'puzzles.train': 'Train',
  'puzzles.trainDetail': 'Endless, and it finds your level as you go.',
  'puzzles.storm': 'Storm',
  'puzzles.stormDetail': 'Three minutes. As many as you can.',
  'puzzles.streak': 'Streak',
  'puzzles.streakDetail': 'No clock. It ends the first time you are wrong.',
  'puzzles.oneIdea': 'Or train one idea',
  /* ------------------------------------------------------------------ the coordinate trainer */

  'coords.title': 'Coordinates',
  'coords.note':
    'Knowing where a square is without counting is the skill every chess book assumes you already have. Thirty seconds, as many as you can.',
  'coords.menuDetail': 'Thirty seconds to find as many squares as you can.',
  'coords.mode': 'Mode',
  'coords.findSquare': 'Find the square',
  'coords.nameSquare': 'Name the square',
  'coords.playAs': 'You play',
  'coords.showPieces': 'Show the pieces',
  'coords.start': 'Start',
  'coords.again': 'Go again',
  'coords.change': 'Change the settings',
  'coords.findThis': '{square}',
  'coords.nameThis': 'Name the square that is lit',
  'coords.thisSquare': 'the square to name',
  'coords.score': '{correct} right · {left} seconds left',
  'coords.youScored': 'You got {score}.',
  'coords.average': 'As {side}: {average} on average, best {best}',
  'coords.noAverage': 'As {side}: nothing yet',

  'puzzles.credit': 'Puzzles from the Lichess open database, released into the public domain.',

  'theme.mateIn1': 'Mate in 1',
  'theme.mateIn2': 'Mate in 2',
  'theme.backRankMate': 'Back rank',
  'theme.fork': 'Forks',
  'theme.pin': 'Pins',
  'theme.skewer': 'Skewers',
  'theme.discoveredAttack': 'Discovered attacks',
  'theme.deflection': 'Deflection',
  'theme.sacrifice': 'Sacrifices',
  'theme.hangingPiece': 'Hanging pieces',
  'theme.endgame': 'Endgames',
  'theme.promotion': 'Promotion',
  'puzzles.stormScore': '{solved} solved \u00b7 {left} left \u00b7 best {best}',
  'puzzles.streakScore': '{solved} in a row \u00b7 best {best}',
  'puzzles.trainScore': 'Your puzzle rating {rating} \u00b7 on this device only',
  'puzzles.oneDayRun': '{days} day in a row',
  'puzzles.dayRun': '{days} days in a row',
  'puzzles.startARun': 'Solve it to start a run of days',
  'puzzles.noPuzzle': 'No puzzle could be loaded. That is our bug, not yours.',
  'puzzles.themesAndRating': '{themes} \u00b7 rated {rating}',
  'puzzles.ratingOnly': 'Rated {rating}',
  'puzzles.watchTheirMove': 'Watch their move\u2026',
  'puzzles.whiteToPlay': 'White to play. Find the best move.',
  'puzzles.blackToPlay': 'Black to play. Find the best move.',
  'puzzles.rightKeepGoing': 'Right. Keep going.',
  'puzzles.solved': 'Solved.',
  'puzzles.solvedToday': 'Solved. That is today done.',
  'puzzles.trainOnMore': 'Train on more puzzles',
  'puzzles.runEnds': 'Not that one. The run ends at {solved}.',
  'puzzles.anotherRun': 'Start another run',
  'puzzles.stormPenalty': 'Not that one \u2014 {seconds} seconds.',
  'puzzles.tryAgain': 'Not that one. Try again, or see the answer.',
  'puzzles.skip': 'Skip this one',
  'puzzles.showAnswer': 'Show the answer',
  'puzzles.theMoveWas': 'The move was {move}.',
  'puzzles.thatIsTheLine': 'That is the line.',
  'puzzles.timeUp': 'Time. {solved} solved.',
  'puzzles.runItAgain': 'Run it again',

  /* ------------------------------------------------------------------ the puzzle pool */

  'pool.allClaimed':
    'Every reward today has been claimed. The pool is funded by staking rewards, so it refills tomorrow rather than running out.',
  'pool.notFunded': 'The puzzle pool is not funded yet. Solving still counts towards your streak.',
  'pool.thereIs': 'There is {amount} in the pool for today\u2019s puzzle.',
  'pool.claim': 'Claim {amount}',
  'pool.claiming': 'Claiming\u2026',
  'pool.needsWallet':
    'The reward is paid in NIM, so it needs a wallet to arrive in. Open this in Nimiq Pay and the claim is one tap.',
  'pool.deviceReason': 'So the pool can tell one claim from another',
  'pool.sent': '{amount} sent to your wallet. The transaction says which puzzle it was for.',
  'pool.recorded':
    '{amount} is yours and the claim is recorded, but the transaction has not gone out yet. It will be sent \u2014 nothing is lost.',

  /* ------------------------------------------------------------------ shared */

  'common.backToBoard': 'Back to the board',
  /* ------------------------------------------------------------------ settings */

  'settings.title': 'Settings',
  'settings.done': 'Done',
  'settings.opponent': 'Opponent',
  'settings.opponentHelp': 'Changing this starts a new game.',
  'settings.board': 'The board',
  'settings.boardColours': 'Board colours',
  'settings.wood': 'Wood',
  'settings.slate': 'Slate',
  'settings.sea': 'Sea',
  'settings.moveDots': 'Move dots',
  'settings.moveDotsHelp': 'Show where a lifted piece can go.',
  'settings.coordinates': 'Coordinates',
  'settings.coordinatesHelp': 'File letters and rank numbers along the edge.',
  'settings.autoQueen': 'Always promote to a queen',
  'settings.autoQueenHelp': 'Turn this off to choose a rook, bishop or knight.',
  'settings.zen': 'Zen',
  'settings.zenHelp': 'The board alone. Nothing else on the screen.',
  'settings.blindfold': 'Blindfold',
  'settings.blindfoldHelp': 'Hide the pieces and play from the move list. It is as hard as it sounds.',
  'settings.feedback': 'Feedback',
  'settings.sound': 'Sound',
  'settings.soundHelp': 'Move, capture, check and the end of a game.',
  'settings.haptics': 'Vibration',
  'settings.hapticsHelp': 'A short buzz on a phone that supports it.',
  'settings.language': 'Language',
  'settings.languageHelp': 'Follows Nimiq Pay unless you choose one.',
  'settings.languageAuto': 'Automatic',

  'level.looksGood': 'Plays the first thing that looks good',
  'level.oneAhead': 'Thinks a move or two ahead',
  'level.simpleTactics': 'Sees most simple tactics',
  'level.punishes': 'Punishes a loose piece',
  /* ------------------------------------------------------------------ how a game ends */

  'result.checkmate': 'Checkmate',
  'result.stalemate': 'Stalemate \u2014 a draw',
  'result.insufficient': 'Not enough material to mate \u2014 a draw',
  'result.fiftyMove': 'Fifty moves without a capture or a pawn \u2014 a draw',
  'result.repetition': 'The same position five times \u2014 a draw',
  'result.gameOver': 'Game over',
  'result.whiteWins': ' \u2014 White wins',
  'result.blackWins': ' \u2014 Black wins',
  'result.check': ' \u2014 check',

  /* ------------------------------------------------------------------ playing the bot */

  'record.puzzleRating': 'Puzzle rating',
  'puzzles.signing': 'Signing this run…',
  'puzzles.seeRecord': 'See your record',
  'puzzles.makeCount': 'Make my runs count',
  'puzzles.loading': 'Loading puzzles…',
  'puzzles.dailyDoneNote': 'Today’s puzzle is already done. Come back tomorrow.',
  'puzzles.trainMore': 'Train on more puzzles',
  'puzzles.backToBoard': 'Back to the board',
  'game.claim': 'A chess rating nobody can take away from you. Both players sign the result — not us.',
  'game.resign': 'Resign',
  'game.resignAgain': 'Tap again to resign',
  'game.takeback': 'Take back',
  'game.backToStart': 'Back to the start. Your move.',
  'game.takenBack': 'Taken back. Your move.',
  'game.flip': 'Flip board',
  'game.newGame': 'New game',
  'game.playFriend': 'Play a friend',
  'game.leaveZen': 'Leave zen, or change settings',
  'game.resignedBlackWins': 'You resigned \u2014 Black wins',
  'game.resignedWhiteWins': 'You resigned \u2014 White wins',
  'game.rematch': 'Rematch',
  'game.review': 'See where it went wrong',
  'game.youVs': 'You vs {bot} \u00b7 {moves} moves',
  'game.seeRecord': 'See your record',
  'game.yourMoveAsWhite': 'Your move. You are White, against {bot}.',
  'game.botIsWhite': '{bot} is White. Their move.',
  'game.youFlagged': 'Your time is up.',
  'game.theyFlagged': 'Their time is up — you win.',
  'game.clock': 'Clock',
  'game.clockHelp': 'Changing this starts a new game.',
  'game.newGameAgainst': 'New game against {bot}.',

  /* ------------------------------------------------------------------ signing */

  'sign.button': 'Sign the result so it counts',
  'sign.waiting': 'Waiting for your wallet\u2026',
  'sign.whatWasSigned': 'What was signed',
  'sign.done': 'Signed. This result is yours, and anyone can check it without us.',
  'sign.demoDone':
    'Signed with the stand-in wallet. The signature is real and verifies \u2014 but its key is published in our source, so it proves the mechanism, not you.',
  'sign.needsNimiqPay': 'Signing happens in the Nimiq Pay app. Open this there and the result becomes yours.',
  'sign.invitation':
    'Sign the result and it becomes yours \u2014 a record nobody can revoke, checkable without us.',
  /* ------------------------------------------------------------------ a live game */

  'live.checkmate': 'Checkmate',
  'live.resignation': 'Resignation',
  'live.timeout': 'Time',
  'live.stalemate': 'Stalemate',
  'live.insufficient': 'Not enough material to mate',
  'live.repetition': 'Threefold repetition',
  'live.fiftyMove': 'Fifty-move rule',
  'live.agreement': 'Draw agreed',
  'live.reasonDraw': '{reason} \u2014 a draw',
  'live.reasonYouWin': '{reason} \u2014 you win',
  'live.reasonYouLose': '{reason} \u2014 you lose',
  'live.reasonYouWinStop': '{reason} \u2014 you win.',
  'live.reasonYouLoseStop': '{reason} \u2014 you lose.',
  'live.waitingForSomebody': 'Waiting for somebody to open your link.',
  'live.watching': 'You are watching this game.',
  'live.yourMove': 'Your move.',
  'live.theirMove': 'Their move.',
  'live.sendThisLink': 'Send this link to whoever you want to play',
  'live.linkLabel': 'The link to this game',
  'live.copy': 'Copy',
  'live.copied': 'Copied',
  'live.pressToCopy': 'Press to copy',
  'live.claimWin': 'Claim the win on time',
  'live.offerDraw': 'Offer a draw',
  'live.sign': 'Sign the result',
  'live.signed': 'Signed',
  'live.bothSignatures':
    'Both signatures make this a rating nobody can take away. You can sign now; they can sign whenever they open the link.',
  'live.gameTitle': '{white} vs {black} \u00b7 {moves} moves',
  'live.theyWantAnother': 'They want another game \u2014 join',
  'live.waitingForRematch': 'Waiting for them to join your rematch.',
  'live.playAgain': 'Play them again',
  'live.settingUp': 'Setting it up\u2026',
  'live.noHeightYet':
    'The chain height for this game has not come through yet, and a result needs one to be ordered against your other games. Give it a moment and sign again \u2014 nothing is lost.',
  'live.publicLink': 'Get a link anyone can check',
  'live.trouble': 'Trouble reaching the game. Still trying \u2014 nothing is lost.',
  'live.opening': 'Opening the game\u2026',
  'live.watchOnly': 'You can watch this game. To play, open it in Nimiq Pay so it has an address to sign with.',
  'live.alreadyTwo': 'This game already has two players. You are watching.',
  'live.expired': 'That game has finished or expired. Links last a day.',
  'live.leaveWarning':
    'Leave this game? Your clock keeps running, and your opponent can claim the win when it runs out.',
  'live.stay': 'Stay',
  'live.leaveAnyway': 'Leave anyway',
  /* ------------------------------------------------------------------ when something fails */

  'fail.offline':
    'Could not reach the game. Check your connection \u2014 nothing is lost, and it will pick up where it left off.',
  'fail.noGame': 'That game has finished or expired. Links last a day.',
  'fail.gameFull': 'Two people are already playing this one. You can watch it.',
  'fail.notYourTurn': 'It is their move. Your board will catch up in a moment.',
  'fail.notAPlayer': 'You are watching this game rather than playing it.',
  'fail.notStarted': 'Nobody has opened your link yet, so there is nobody to move against.',
  'fail.gameOver': 'That game is already finished.',
  'fail.illegalMove': 'That move is not legal in this position. The board has been put back.',
  'fail.stale': 'The game moved on while that was in flight. Your board is up to date now \u2014 try again.',
  'fail.notFlagged': 'Their clock has not run out yet.',
  'fail.ownFlag': 'That is your own clock that has run out, not theirs.',
  'fail.notOver': 'A game can only be signed once it has finished.',
  'fail.serverError':
    'Something went wrong on our side. Your game is safe \u2014 it is on the server, and the next check will find it.',
  'fail.tooMany':
    'That was a lot of requests at once. Wait a few seconds \u2014 your game is safe and nothing was lost.',
  'fail.tooLarge': 'That request was too big to send. This one is our bug, not yours.',
  'fail.declined': 'You did not sign. Nothing was recorded, and you can sign any time.',
  'fail.cancelled': 'Cancelled. Nothing was lost.',
  'fail.badSignature':
    'Your wallet returned a signature this app could not read. Please report it \u2014 it is our bug, not yours.',
  'fail.noStorage':
    'This browser will not let the app save anything. Everything still works for now, but it will be gone when you close the tab.',
  'fail.refused': 'This browser refused that. Nothing was lost.',
  'fail.chunk': 'Part of the app could not be loaded. Reload the page and it will come back.',
  'fail.network': 'Your device could not reach the network. Nothing was lost \u2014 try again in a moment.',
  'fail.notConfirmed': 'You did not confirm that. Nothing happened.',
  'fail.syncing': 'Nimiq Pay is still catching up with the chain. Give it a few seconds.',
  'fail.somethingWith': 'Something went wrong: {detail}',
  'fail.something': 'Something went wrong. Nothing was signed and nothing was lost.',
  'fail.noWalletSign': 'Signing happens in the Nimiq Pay app. Open this there.',
  'fail.noAddress': 'The wallet did not return an address.',
  'fail.phoneNetwork': 'Your phone could not reach the network. Nothing was lost \u2014 try again in a moment.',
  'fail.somethingSigning': 'Something went wrong. Nothing was signed.',
  'fail.timeout': '{step} \u2014 Nimiq Pay did not answer. Open the wallet and try again.',

  'wallet.sharingAddress': 'Sharing your address',
  'wallet.signing': 'Signing',
  'wallet.checkingSync': 'Checking the wallet is caught up',
  'wallet.readingHeight': 'Reading the chain height',
  'wallet.identifyingDevice': 'Identifying this device',
  /* ------------------------------------------------------------------ the record */

  'record.allPublished':
    'Every game here was signed with a key published in our source \u2014 the stand-in wallet, or the bot. The signatures verify, and anyone can make more of them, so this shows how the number is reached rather than whose it is.',
  'record.somePublished':
    '{published} of these {total} games were signed with a key published in our source \u2014 the stand-in wallet, or the bot. Those signatures verify, and anyone can make more of them.',
  'record.title': 'Record',
  'record.noRatedGames': 'No rated games yet',
  'record.oneRatedGame': '{games} rated game',
  'record.ratedGames': '{games} rated games',
  'record.oneOpponent': '{count} different opponent',
  'record.opponents': '{count} different opponents',
  'record.provisional': 'Provisional until {needed} different opponents have signed. {so_far} so far.',
  'record.recompute': 'Recompute it here',
  'record.recomputeNote':
    'Re-derives every rating below in this browser, from the signatures alone. Nothing is asked of our server.',
  'record.checking': 'Checking every signature\u2026',
  'record.checkedOne': 'Checked {checked} signed game here, in this browser.',
  'record.checkedMany': 'Checked {checked} signed games here, in this browser.',
  'record.noneRate': 'None of them rate, so the rating stays at its starting value.',
  'record.someRate': '{games} of them rate.',
  'record.agrees': 'This browser reached {reached} \u2014 the same number as this page.',
  'record.disagrees':
    'This browser reached {reached} and this page says {shown}. If those disagree, this page is wrong.',
  'record.leftOutUnsigned': '{count} not signed by both players yet',
  'record.leftOutInvalid': '{count} did not verify',
  'record.leftOut': 'Left out: {detail}.',
  'record.empty': 'No signed games on this wallet yet.',
  'record.emptyNote':
    'That is not a bad sign or a good one \u2014 it is a wallet with no record. Play a game and sign the result.',
  'record.everyGame': 'Every game, in the order they count',
  'record.won': 'Won',
  'record.lost': 'Lost',
  'record.drew': 'Drew',
  'record.casual': 'Casual \u2014 never rated',
  'record.tooShort': 'Under {moves} moves \u2014 recorded, not rated',
  'record.farmed': 'Too many games against this opponent \u2014 it no longer moves either rating',
  'record.gameLine': '{termination} \u00b7 {moves} moves \u00b7 block {block}',
  'record.footer':
    'Every number here is derived from signatures both players made. Nobody can edit it \u2014 not the person it is about, and not us.',
  /* ------------------------------------------------------------------ studying a game */

  'judge.best': 'Best',
  'judge.bests': 'best moves',
  'judge.good': 'Good',
  'judge.goods': 'good moves',
  'judge.inaccuracy': 'Inaccuracy',
  'judge.inaccuracies': 'inaccuracies',
  'judge.mistake': 'Mistake',
  'judge.mistakes': 'mistakes',
  'judge.blunder': 'Blunder',
  'judge.blunders': 'blunders',

  'study.title': 'Study a game',
  'study.note':
    'Paste a game in PGN \u2014 from Lichess, Chess.com, a tournament, anywhere \u2014 or study the one you just played. Nothing here is signed and nothing touches your rating.',
  'study.handedNote':
    'The game you just played. Nothing here is signed and nothing touches your rating \u2014 this is for looking at.',
  'study.pasteLabel': 'Paste a game in PGN',
  'study.open': 'Open it',
  'study.analyse': 'Analyse this game',
  'study.looking': 'Looking at the game\u2026',
  'study.lookingProgress': 'Looking at the game\u2026 {done} of {total} moves.',
  'study.wasBest': '{number} {san} \u2014 the best move here.',
  'study.wasGood': '{number} {san} \u2014 a good move.',
  'study.wasWorse': '{number} {san} \u2014 {label}. {better} was better, by {lost} points of winning chance.',
  'study.acpl': '{acpl} centipawns lost a move',
  'study.whiteAhead': 'White is ahead — {percent} percent',
  'study.blackAhead': 'Black is ahead — {percent} percent',
  'study.nothingToComplain': 'nothing to complain about',
  'study.caveat':
    'Reviewed by this app\u2019s own engine, running on your device \u2014 about club strength, not Stockfish. It will find the blunders in an ordinary game and will not second-guess a grandmaster.',
  'study.reviewed': 'The game has been reviewed. Walk through it to see each move judged.',
  'study.analysisFailed': 'The analysis stopped: {detail}. That is our bug \u2014 please report it.',
  'study.playersVs': '{white} vs {black}',
  'study.animported': 'An imported game',
  'study.heading': '{players} \u00b7 {moves} moves',
  'study.loaded': '{plies} moves loaded. Walk through them with the arrow keys.',

  /* ------------------------------------------------------------------ the certificate page */

  'cert.title': 'A signed game',
  'cert.fetching': 'Fetching the game\u2026',
  'cert.stillPlaying': 'That game is still being played. A certificate appears when it ends.',
  'cert.unreconstructable': 'That game cannot be reconstructed, so nothing here can be checked.',
  'cert.onlyOne': 'Only one player has signed this so far. It becomes a record when both of them have.',
  'cert.verified': 'Both players signed this result, and this browser has just checked both signatures.',
  'cert.bad': 'These signatures do not check out. Do not believe this result.',
  'cert.nothingAsked':
    'Nothing was asked of our server to reach that conclusion beyond the game itself \u2014 the signatures were verified here, on your device, against the exact text both players signed.',
  'cert.checkFailed': 'The check failed: {reason}.',
  'cert.unknown': 'unknown',
  'cert.winnersRecord': 'See the winner\u2019s record',
  'cert.playYourself': 'Play a game yourself',
  'cert.signed': 'signed',
  'cert.notSignedYet': 'not signed yet',
  /* ------------------------------------------------------------------ the certificate image */

  'certificate.abandoned': 'Abandoned',
  'certificate.cannotDraw': 'This browser cannot draw a certificate.',
  'certificate.noPicture': 'The picture could not be made.',
  'certificate.whiteWins': 'White wins',
  'certificate.blackWins': 'Black wins',
  'certificate.drawn': 'Drawn',
  'certificate.rated': 'rated',
  'certificate.casual': 'casual',
  'certificate.summary': '{reason} \u00b7 {moves} moves \u00b7 {kind}',
  'certificate.bothSigned': 'Both players signed this result',
  'certificate.evidence':
    'Nimiq block {block} \u00b7 game {game}\u2026 \u00b7 anyone can check this at {where}',
  'certificate.signatureOf': '{side} signature',
  'certificate.tagline': 'A rating nobody issued and nobody can revoke.',

  /* ------------------------------------------------------------------ sharing */

  'share.asPicture': 'Share as a picture',
  'share.asPgn': 'Save as PGN',
  'share.sent': 'Sent.',
  'share.savedPicture': 'Saved as a picture.',
  'share.savedPgn': 'Saved as PGN, which every chess program reads.',
  'share.notOnDevice': 'That game is not on this device any more.',
  'share.didNotWork': 'That did not work on this device. The game is safe either way.',

  /* ------------------------------------------------------------------ signing, in detail */

  'sign.notOver': 'That game is not over yet.',
  'sign.syncing': 'Nimiq Pay is still catching up with the chain. Give it a few seconds and sign again.',
  'sign.noHeight':
    'Nimiq Pay could not read the chain height just now, and a game needs one to be ordered. Try again in a moment.',
  'sign.notYourGame': 'This wallet did not play that game, so there is nothing here for it to sign.',

  /* ------------------------------------------------------------------ talking to the server */

  'api.offline': 'Could not reach the game. Check your connection.',
  'api.something': 'Something went wrong.',
  'api.badShape':
    'The server sent something this app could not read. That is our bug, not yours — your game is safe on the server.',
  'poolApi.offline': 'Could not reach the pool.',
  'poolApi.refused': 'That claim could not be made.',
  'poolApi.alreadyClaimed': 'You have already claimed today. The puzzle changes at midnight, and so does this.',
  'poolApi.deviceClaimed':
    'This device has already claimed today \u2014 one per device, which is what keeps the pool from being drained by a script.',
  'poolApi.notFunded':
    'The pool is not funded at the moment, so there is nothing to claim. Solving still counts towards your streak.',
  'poolApi.needsNimiqPay':
    'Claiming needs Nimiq Pay, which is what tells the pool that two claims came from two different people.',
  'poolApi.unreachable': 'Could not reach the pool. Your solve is safe \u2014 try claiming again in a moment.',

  /* ------------------------------------------------------------------ sending NIM yourself */

  'send.needsNimiqPay': 'Sending NIM happens in the Nimiq Pay app. Open this there.',
  'send.memoTooLong': 'That message is too long for a Nimiq transaction. This one is our bug.',
  'send.badAmount': 'That is not an amount that can be sent.',
  'send.waiting': 'Waiting for your wallet',
  'send.declined': 'Nothing was sent. Your NIM is where it was.',
  'send.failed': 'That could not be sent. Nothing left your wallet.',
  'send.tip': 'Send them {amount} NIM',
  'send.tipTitle': 'Good game?',
  'send.tipNote':
    'Send them NIM straight from your wallet. It never touches us, and the transaction says which game it was for.',
  'send.tipSent': 'Sent. {amount} NIM went from your wallet to theirs.',
  'send.poolTitle': 'Put something back',
  'send.poolNote':
    'The pool pays a stranger for solving the daily puzzle. Anyone can add to it, and every payout it makes is on the chain with the puzzle written in.',
  'send.poolAdd': 'Add {amount} NIM to the pool',
  'send.poolSent': 'Sent. {amount} NIM is in the pool for whoever solves next.',
  'send.sending': 'Waiting for your wallet…',

  'app.broke': 'Something broke',










  /* ---------------------------------------------------------------- the portable record */
  'record.take': 'Take your record with you',
  'record.takeNote':
    'One file with every signed game and puzzle run on this device. Anyone can check it without this site, and without asking us anything.',
  'record.takeButton': 'Save my record',
  'record.takeEmpty': 'Nothing signed on this device yet.',
  'record.recordSent': 'Sent \u2014 {games} games and {runs} puzzle runs.',
  'record.recordSaved': 'Saved \u2014 {games} games and {runs} puzzle runs.',
  'record.recordSkipped': '{count} left out: not signed by both sides, or from the other network.',

  /* ---------------------------------------------------------------- the verify screen */
  'verify.title': 'Check a record',
  'verify.intro':
    'Someone sent you a Scoresheet record? Open it here. Your browser checks every signature and works out the rating itself. Nothing is uploaded, and this page does not need our server.',
  'verify.choose': 'Choose a record file',
  'verify.checking': 'Checking every signature\u2026',
  'verify.unreadable': 'That file could not be read.',
  'verify.notARecord': 'That is not a Scoresheet record.',
  'verify.oneGame': '1 game verified, and {runs} puzzle runs.',
  'verify.manyGames': '{games} games verified, and {runs} puzzle runs.',
  'verify.rating': 'Rating {rating}, from {games} rated games against {opponents} different people.',
  'verify.noneRate': 'None of these games are rated, so there is no rating to check.',
  'verify.provisional': 'Provisional: a rating counts as settled after ten different opponents.',
  'verify.puzzleRating': 'Puzzle rating {rating}.',
  'verify.findings': 'What did not check out',
  'verify.badSignature': 'Game {id}: the {side} signature does not match.',
  'verify.notTheirs': 'A game belonging to somebody else was left out.',
  'verify.wrongChain': 'A game from the other network was left out.',
  'verify.malformed': 'A record could not be read: {detail}',
  'verify.gameRootMismatch': 'The games do not add up to the fingerprint this record declares. Something was added or removed after it was made.',
  'verify.runRootMismatch': 'The puzzle runs do not add up to the fingerprint this record declares.',
  'verify.anchorBefore': 'This record claims to have been stamped on the chain before one of the games it contains.',
  'verify.anchored': 'Stamped on the Nimiq chain, after the last game it contains.',
  'verify.caveat':
    'This proves these games happened and have not been changed. It does not prove the list is complete \u2014 anyone can leave a loss out of a record they publish themselves.',

  'study.tryAgain': 'Try it yourself',
  'study.tryGiveUp': 'Show me instead',
  'study.tryPrompt': 'Your move. Find something better than what you played.',
  'study.tryThinking': 'Looking at it\u2026',
  'study.tryFound': '{san} \u2014 that is it. That is what the engine wanted.',
  'study.tryBetter': '{san} is better than what you played, though not the best. It costs {lost} points instead.',
  'study.tryNo': '{san} costs {lost} points \u2014 no better than the move you made. Try another.',
  'study.tryUnknown': 'The engine did not answer in time, so this one is unjudged.',

  'study.trainThis': 'Train this',
  'study.trainChecking': 'Checking whether this makes a fair puzzle…',
  'study.trainAdded': 'Added to your training. You will meet this position again.',
  'study.trainAlready': 'This one is already in your training.',
  'study.trainNotUnique': 'Not added: there is more than one good move here, so it would not be a fair puzzle.',
  'study.trainNotSuitable': 'Not added: the best move here is not the kind of thing a puzzle can ask for.',
  'study.trainNotSound': 'Not added: a longer look did not agree with the first one.',
  'study.trainUnknown': 'The engine did not answer in time, so this one was not added.',
  'puzzles.mine': 'Your own mistakes',
  'puzzles.mineDetail': '{count} waiting. Positions you got wrong, worst first.',
  'puzzles.mineDone': 'That is all of them. You have worked through every mistake you saved.',

  /* ---------------------------------------------------------------- tournaments */
  'lobby.tourneyTitle': 'Hold a tournament',
  'lobby.tourneyNote': 'Everyone plays everyone, or Swiss above eight. You get a link to send to the players.',
  'lobby.seats': 'Players',
  'lobby.seats4': 'Four',
  'lobby.seats4Detail': 'Six games, one round each',
  'lobby.seats6': 'Six',
  'lobby.seats6Detail': 'Fifteen games',
  'lobby.seats8': 'Eight',
  'lobby.seats8Detail': 'Everyone plays everyone',
  'lobby.seats12': 'Twelve',
  'lobby.seats12Detail': 'Swiss, five rounds',
  'lobby.hold': 'Hold a tournament',
  'lobby.tourneyName': 'Tournament',
  'tourney.title': 'Tournament',
  'tourney.loading': 'Loading the tournament\u2026',
  'tourney.notFound': 'There is no tournament with that link.',
  'tourney.unavailable': 'That tournament could not be loaded just now.',
  'tourney.open': 'Open \u2014 {entrants} of {seats} seats taken.',
  'tourney.running': 'Playing \u2014 {entrants} players.',
  'tourney.finished': 'Finished \u2014 {entrants} players.',
  'tourney.agrees': 'This browser worked out the table itself, from the games, and reached the same order.',
  'tourney.disagrees': 'This browser worked out a different table from these games. Something does not add up.',
  'tourney.standings': 'Standings',
  'tourney.games': 'Games',
  'tourney.round': 'Round {round}',
  'tourney.toPlay': 'to play',
  'tourney.prize': '{nim} NIM',
  'tourney.caveat': 'Every game above was verified in this browser, against the two signatures on it. The order follows from those games, and you just watched it be worked out.',
  'tourney.agreesSigned': 'This browser checked all {games} signed games itself and worked out the same table — without asking us anything.',
  'tourney.dropped': '{games} submitted games did not check out and were left out of the table.',
  'tourney.caveatUnchecked': 'The order follows from these results, and you just checked that yourself. Whether these are the results is a separate question, and each game answers it on its own certificate.',
  'tourney.join': 'Join this tournament',
  'tourney.joinFailed': 'That did not go through. The seats may have filled.',
  'tourney.yours': 'Your games',
  'tourney.playThem': 'not played yet',
  'tourney.report': 'Report the game',
  'tourney.reportFailed': 'That game was not accepted. It has to be signed by both of you.',
  'tourney.back': 'Back',
} as const;
