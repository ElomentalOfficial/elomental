/**
 * Every word a player sees or hears, in one place. Voice, tone and the
 * glossary (cell vs square, Elo, game, mistake...) are in docs/BRAND_VOICE.md.
 * Screens import from here; never write player-facing text inline.
 *
 * Plain strings stay plain; text with numbers or names in it is a small
 * function. aria-labels (`a11y`) are literal and never joke.
 */

/** "1 hint", "3 hints". */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
/** "easy" → "Easy". */
export const capitalize = (s: string): string => s[0].toUpperCase() + s.slice(1);
/** "4, 7 and 9". */
export const listOf = (items: (string | number)[]): string =>
  items.length <= 1 ? String(items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/**
 * One of several lines for the same moment, so it doesn't read the same every
 * game: the same `key` (a game's seed) always gets the same line, different
 * keys spread across them.
 */
export function pick<T>(lines: readonly T[], key: string): T {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return lines[hash % lines.length];
}

// --- Shared ----------------------------------------------------------------

export const common = {
  appName: 'Elomental',
  /** The browser tab and window title for a screen. */
  pageTitle: (screen: string) => `${screen} · Elomental`,
  tagline: 'Competitive sudoku',
  ok: 'OK',
  close: 'Close',
  cancel: 'Cancel',
  back: 'Back',
  next: 'Next',
  home: 'Home',
  paste: 'Paste',
  play: 'Play',
  resume: 'Resume',
  pause: 'Pause',
  on: 'On',
  off: 'Off',
  loading: 'Loading…',
  searching: 'Searching…',
  you: 'You',
  friend: 'Friend',
  guest: 'Guest',
  modes: { casual: 'Casual', daily: 'Daily Square', ranked: 'Ranked', clash: 'Clash' },
  difficulty: { easy: 'Easy', medium: 'Medium', hard: 'Hard' },
  stardust: 'Stardust',
  elo: 'Elo',
  crowns: 'Crowns',
  plusStardust: (n: number) => `+${n} Stardust`,
  rareCrown: 'Rare drop: Rusted Crown!',
  /** Shown under the player's name, by Elo. */
  ranks: ['Novice', 'Apprentice', 'Adept', 'Elementalist', 'Archmage'] as const,
};

// --- Welcome ---------------------------------------------------------------

export const welcome = {
  a11y: 'Elomental. Continue.',
};

// --- Home ------------------------------------------------------------------

export const home = {
  tiles: {
    setup: 'Setup',
    daily: 'Daily Square',
    store: 'Store',
    leaderboard: 'Leaderboard',
    casual: 'Casual',
    ranked: 'Play Ranked',
  },
  storeLater: 'The Store opens soon.',
  leaderboardLater: 'The Leaderboard opens soon.',
  casual: {
    title: 'Casual',
    text: 'No pressure, no Elo.',
    resume: (difficulty: string) => `Resume ${capitalize(difficulty)}`,
    resumeInfo: (time: string, percent: number) => `${time} · ${percent}% done`,
    newGame: 'New game',
    withFriend: 'With a friend',
    play: (difficulty: string) => `Play ${capitalize(difficulty)}`,
    clash: 'Clash a friend',
    clashInfo: 'Race to finish',
    squareCode: 'Square code',
    squareCodeInfo: 'Play from a code',
  },
  ranked: {
    title: 'Ranked',
    text: 'A square matched to your Elo. Solve it to climb.',
    start: 'Start',
  },
};

// --- Daily Square ----------------------------------------------------------

const DAY_STATE = { done: 'solved', missed: 'not solved', today: 'today', future: 'coming up' } as const;

export const daily = {
  title: 'Daily Square',
  weekdays: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const,
  doneToday: 'Today’s square is solved',
  play: 'Play today’s square',
  continue: 'Continue today’s square',
  monthCount: (done: number, days: number) => `${done} of ${days}`,
  avatar: (month: string) => `${month} avatar`,
  avatarUnlocked: 'Unlocked. Well played.',
  avatarLocked: 'Solve every square this month to unlock it.',
  nextIn: (hours: number, minutes: number) => `New square in ${hours}h ${minutes}m`,
  missedLater: 'Missed days can be restored with tokens. Coming soon.',
  a11yDay: (month: string, day: number, state: keyof typeof DAY_STATE) => `${month} ${day}, ${DAY_STATE[state]}`,
};

// --- Game ------------------------------------------------------------------

export const game = {
  /** Shown while a square is made (only when that takes a moment). */
  loading: ['Forging your square…', 'Sharpening the logic…', 'Setting up the grid…', 'Placing the given numbers…'] as const,
  forgeFailed: 'Couldn’t make a square. Try again.',
  offlineSignedIn: 'No connection. Games need the internet while you’re signed in.',
  squareUnplayable: 'That square can’t be played.',
  squareErrors: {
    too_few: 'That square has too few numbers to have one answer.',
    no_solution: 'That square has no answer: some numbers clash.',
    not_unique: 'That square has more than one answer.',
  } as Record<string, string>,
  concede: 'Concede',
  paused: 'Paused',
  pausesLeft: (n: number) => `${plural(n, 'pause')} left`,
  noPausesLeft: 'No pauses left in this game.',
  label: {
    clash: (beat?: string) => `Clash${beat ? ` · beat ${beat}` : ''}`,
    casual: (difficulty: string) => `Casual · ${capitalize(difficulty)}`,
  },
  squareCode: (code: string) => `#${code}`,
  squareCodeCopied: 'Square code copied. Send it to a friend.',
  squareCodeBlocked: (code: string) => `Copy blocked. The code is ${code}.`,
  hint: 'Hint',
  undo: 'Undo',
  notes: 'Notes',
  noHintsLeft: (max: number) => `No hints left: ${max} per game.`,
  noHintStep: 'No hint fits this position. Try notes on the busiest box.',
  hintEloCut: (percent: number) => `Hints this game: Elo gain −${percent}%`,
  placeNumber: (n: number) => `Place ${n}`,
  concedeConfirm: 'Concede this game? It counts as a loss.',
  keepPlaying: 'Keep playing',
  wheelHelp: 'Slide toward a number to add or remove a note',
  a11y: {
    pause: 'Pause',
    resume: 'Resume',
    mistakes: (used: number, max: number) => `${used} of ${max} mistakes`,
    board: 'Sudoku board',
    erase: 'Erase',
    hint: (left: number) => `Hint, ${left} left`,
    cell: (row: number, column: number, box: number, content: string) => `Row ${row}, column ${column}, box ${box}: ${content}`,
    cellGiven: (n: number) => `${n}, given`,
    cellYours: (n: number) => `${n}, your number`,
    cellWrong: (n: number) => `${n}, wrong`,
    cellNotes: (numbers: number[]) => `empty, notes ${numbers.join(' ')}`,
    cellEmpty: 'empty',
    skipToBoard: 'Skip to board',
    // Spoken game events (a polite live region; never the clock).
    wrongNumber: (left: number) => `Wrong number. ${plural(left, 'mistake')} left.`,
    wrongNumberNoLimit: 'Wrong number.',
    mistakesNoLimit: (used: number) => plural(used, 'mistake'),
    unitsComplete: (units: string[]) => `${capitalize(listOf(units))} complete.`,
    row: (n: number) => `row ${n}`,
    column: (n: number) => `column ${n}`,
    box: (n: number) => `box ${n}`,
    hintPlaced: (n: number, row: number, column: number) => `Hint: ${n} in row ${row}, column ${column}.`,
    pausedNow: 'Game paused.',
    resumedNow: 'Game resumed.',
    notesMode: (on: boolean) => (on ? 'Notes on.' : 'Notes off.'),
    squareCode: (code: string) => `Copy square code ${code.split('').join(' ')}`,
    wheelNote: (n: number, set: boolean) => `Note ${n}${set ? ', set' : ''}`,
  },
};

// --- Results ---------------------------------------------------------------

export const result = {
  titles: { solved: 'Solved', mistakes: 'Out of mistakes', concede: 'Conceded' } as Record<string, string>,
  /**
   * The line under "Solved", by how the game went; `key` (the game's seed)
   * picks among equally fitting lines. Mistakes and hints are never shamed.
   */
  winLine: (game: { mistakes: number; hints: number; maxMistakes: number }, key: string): string => {
    if (game.hints > 0) {
      return pick(['Solved, with a little help. That’s how patterns stick.', 'Solved. The hints did their job; next time, maybe fewer.'], key);
    }
    if (game.mistakes === 0) return pick(['Clean solve: no mistakes, no hints.', 'Checkmate, grid. Not a single mistake.', 'Flawless. Every number where it belongs.'], key);
    if (game.mistakes >= game.maxMistakes - 1) return pick(['Two mistakes, still standing. Solved.', 'Close one. You held your nerve.'], key);
    return pick(['One slip, no harm done.', 'Solved. One mistake, quickly put right.'], key);
  },
  /** Losses: kind, plain, no jokes. */
  lossLine: (reason: 'mistakes' | 'concede'): string =>
    reason === 'mistakes' ? 'Three mistakes this time. The next square is waiting.' : 'Game conceded. The next square is waiting.',
  time: 'Time',
  mistakes: 'Mistakes',
  hints: 'Hints',
  elo: 'Elo',
  mistakesOf: (n: number, max: number) => `${n} / ${max}`,
  /** `shown` counts up to the new Elo; `delta` is the final change. */
  eloChange: (before: number, shown: number, delta = shown - before) => `${before} → ${shown} (${delta >= 0 ? '+' : ''}${delta})`,
  unratedCopied: 'Unrated: cells were filled before they could be worked out.',
  unratedUnchecked: 'Unrated: this solve couldn’t be checked. Check your connection.',
  speedBonus: (percent: number) => `Speed bonus +${percent}%`,
  tipNoHints: 'Solve it without hints for the full Elo gain.',
  tipFaster: 'A little faster next time earns a speed bonus.',
  protectedLoss: 'No Elo lost: your rating is protected below 500.',
  thisMonth: 'This month',
  monthOf: (done: number, days: number) => `${done} / ${days} squares`,
  monthComplete: 'Month complete. Avatar unlocked!',
  dailyRetry: 'Not solved yet. Try today’s square again: the day counts once you solve it.',
  tryAgain: 'Try again',
  calendar: 'Calendar',
  nextRanked: 'Next game',
  newSquare: 'New square',
};

// --- Tutorial and hints ----------------------------------------------------

export const tutorial = {
  skip: 'Skip',
  start: 'Let’s play',
  counter: (n: number, of: number) => `${n} / ${of}`,
  pick: { title: 'Pick a cell', text: 'Tap an empty cell to select it. Its row and column light up. Tap a filled cell to highlight every matching number.' },
  fill: { title: 'Fill it in', text: 'Tap a number to place it in the selected cell. A wrong number fades away and costs a mistake (the skulls at the top). Three mistakes and the square is lost.' },
  notesButton: { title: 'Take notes', text: 'Tap Notes, then numbers, to pencil small notes into the cell. The keys shrink to show it. Tap Notes again to go back.' },
  notesWheel: { title: 'Notes wheel', text: 'Or hold an empty cell, slide onto a number and let go to add or remove that note. Dragging toward the number opens the wheel right away.' },
  erase: { title: 'Erase', text: 'Clears the selected cell: its number or its notes.' },
  undo: { title: 'Undo', text: 'Takes back your last move. Mistakes still count.' },
  hints: {
    title: 'Hints',
    text: (max: number, rankedCut?: number) =>
      `Fills in the next logical cell. ${max} per game, and each one trims your Stardust.` +
      (rankedCut !== undefined ? ` In Ranked, each also cuts your Elo gain by ${rankedCut}%.` : ''),
  },
};

type Unit = 'row' | 'column' | 'box' | 'line';

export const hints = {
  counter: (n: number, of: number) => `Hint · ${n} / ${of}`,
  first: (technique: string) => `First: ${technique}`,
  then: (technique: string) => `Then: ${technique}`,
  stepsAbove: (many: boolean) => (many ? 'the steps above rule' : 'the step before rules'),
  fullHouse: {
    one: (unit: Unit) => `Only one cell is still empty in this ${unit}.`,
    missing: (n: number) => `Every other number is already here. The missing one is ${n}.`,
  },
  hiddenSingle: {
    where: (n: number, unit: Unit) => `Where can ${n} go in this ${unit}?`,
    ruledOut: (n: number, stepsAbove?: string) =>
      `The ${n}s already on the board rule out every other empty cell here` + (stepsAbove ? ` (${stepsAbove} out the rest).` : '.'),
    one: (n: number) => `That leaves just one place for ${n}.`,
  },
  nakedSingle: {
    look: 'Look at everything this cell can see: its row, column and box.',
    left: (present: number[], stepsAbove: string | undefined, n: number) =>
      `Between them they already hold ${listOf(present)}` + (stepsAbove ? `, and ${stepsAbove} out the rest` : '') + `. The only number left for this cell is ${n}.`,
  },
  /** Elimination steps before the placement, by technique. d = the step's numbers. */
  prior: {
    pointing: (d: number[]) => `In this box, ${d[0]} can only go in one line, so ${d[0]} can’t go anywhere else along that line.`,
    claiming: (d: number[], unit: Unit) => `In this ${unit}, ${d[0]} can only go inside one box, so ${d[0]} is ruled out of the rest of that box.`,
    nakedSubset: (d: number[], count: number, unit: Unit) => `These ${count} cells can only hold ${listOf(d)} between them, so no other cell in this ${unit} can.`,
    hiddenSubset: (d: number[], count: number, unit: Unit) => `${listOf(d)} fit only in these ${count} cells of this ${unit}, so those cells can’t hold anything else.`,
    fish: (d: number[]) => `${d[0]} sits in matching spots across these lines, so ${d[0]} is ruled out of the rest of the lines they cross.`,
    finnedFish: (d: number[]) =>
      `${d[0]} sits in matching spots across these lines, plus a fin: an extra spot or two inside one box. ` +
      `Either the fin is ${d[0]}, or the lines lock ${d[0]} in and clear the lines they cross. ` +
      `Cells in the fin’s box on those crossing lines lose ${d[0]} either way.`,
    emptyRectangle: (d: number[]) =>
      `In this box, ${d[0]} can only sit on one row or one column. This line outside it has just two spots for ${d[0]}: ` +
      `if the one in line with the box is ${d[0]}, the box’s ${d[0]} is pushed onto its other line; if not, the far spot is ${d[0]}. ` +
      `Either way this cell can’t be ${d[0]}.`,
    xyzWing: (d: number[]) => `Whatever the middle cell turns out to be, one of these three cells must be ${d[0]}, so any cell that sees all three can’t be ${d[0]}.`,
    turbot: (d: number[]) =>
      `Two lines each have only two spots for ${d[0]}, and one end of each sees the other. ` +
      `They can’t both be ${d[0]}, so one of the two far ends is. Any cell that sees both far ends can’t be ${d[0]}.`,
    wWing: (d: number[]) =>
      `These two cells can only be ${d[0]} or ${d[1]}. They can’t both be ${d[1]}, because the ${d[1]} they each see has to go somewhere. ` +
      `So one of them is ${d[0]}, and any cell that sees both can’t be ${d[0]}.`,
    remotePairs: (d: number[]) =>
      `Each of these cells can only be ${listOf(d)}, and each sees the next, so along the chain they take turns. ` +
      `A cell that sees one of each kind can be neither ${d[0]} nor ${d[1]}.`,
    colourWrap: (d: number[]) =>
      `Follow the pairs of spots for ${d[0]}: they take turns being ${d[0]}. Two cells on the same turn see each other, so that turn is wrong and none of them is ${d[0]}.`,
    colourTrap: (d: number[]) =>
      `Follow the pairs of spots for ${d[0]}: they take turns being ${d[0]}, so one turn holds every ${d[0]}. Any cell that sees both turns can’t be ${d[0]}.`,
    xChain: (d: number[]) =>
      `Follow this chain of ${d[0]}s: if the first cell isn’t ${d[0]}, each link forces the next, and the last cell is ${d[0]}. ` +
      `So one end of the chain is ${d[0]}, and any cell that sees both ends can’t be.`,
    xyChain: (d: number[]) =>
      `Each cell in this chain has only two choices. If the first isn’t ${d[0]}, the choices fall like dominoes until the last one is ${d[0]}. ` +
      `So one end is ${d[0]}, and any cell that sees both ends can’t be.`,
    alsXz: (d: number[]) =>
      `These two groups each have one more number than cells. ${d[1]} can only go in one of the groups, and that pins the other group down. ` +
      `Either way one of the groups holds ${d[0]}, so any cell that sees every ${d[0]} in both can’t be ${d[0]}.`,
    xyWing: (d: number[]) => `These three cells force ${d[0]} into one of the outer two, so any cell that sees both can’t be ${d[0]}.`,
  },
};

// --- Clash -----------------------------------------------------------------

export const clash = {
  title: 'Clash',
  intro: 'Race a friend on the same square. Lowest time wins; hints and mistakes add seconds.',
  challenge: (seconds: string, mistakes: number, hints: number) =>
    `Your friend set ${seconds} with ${plural(mistakes, 'mistake')} and ${plural(hints, 'hint')}. Beat it.`,
  challengeUnsolved: 'Your friend couldn’t crack this one. Can you?',
  resume: (code: string) => `Resume ${code}`,
  enterCode: 'Enter a code',
  join: 'Join clash',
  orCreate: 'or create one',
  created: (difficulty: string) => `Your ${difficulty} code. Send it now or after you play: your time travels with the result.`,
  shareCode: 'Share code',
  log: 'Clash log',
  logNoteOnline: 'You vs friend. Results arrive on their own once your friend finishes (they need an account too).',
  logNoteOffline: 'You vs friend. A result appears once its link is opened on this phone. Sign in (Setup) to get results automatically.',
  logEmpty: 'No clashes yet. Create a code and send it to a friend.',
  status: { won: 'Won', lost: 'Lost', draw: 'Draw', waiting: 'Waiting', unplayed: 'Not played' },
  notFinished: 'DNF',
  noTime: '—',
  versus: (mine: string, theirs: string) => `${mine} vs ${theirs}`,
  noCodeOnClipboard: 'No Clash code on the clipboard',
  pasteBlocked: 'Paste blocked. Long-press the boxes instead.',
  waitingForFriend: 'Waiting for your friend’s result. Open the result link they send you and it lands here.',
  sendResult: 'Send result',
  challengeFriend: 'Challenge a friend',
  verdict: { timeSet: 'Time set!', lost: 'Not solved', won: 'You won the clash', defeated: 'You lost the clash', draw: 'Dead heat' },
  table: { time: 'Time', mistakes: 'Mistakes', hints: 'Hints', total: 'Total' },
  totalRule: (hintPenalty: number, mistakePenalty: number) =>
    `Total = time + ${hintPenalty}s per hint + ${mistakePenalty}s per mistake. Lowest total wins.`,
  resultNote: {
    onlineAnswered: 'Your friend sees this result too, in their Clash log.',
    onlineWaiting: 'Send the code to your friend. When they finish, you’ll both see who won in the Clash log.',
    offlineAnswered: 'Send your result back so your friend sees who won too.',
    offlineWaiting: 'Send your result to your friend. When their result link comes back, open it here to see who won. Both results stay in the Clash log.',
  },
  linkCopied: 'Link copied. Paste it to your friend.',
  shareFailed: (code: string) => `Share failed. Your code is ${code}.`,
  shareTitle: 'Elomental Clash',
  shareText: (code: string, result?: { solved: boolean; time: string; mistakes: number; hints: number }) =>
    !result
      ? `Clash me on Elomental. Code ${code}.`
      : result.solved
        ? `Clash me on Elomental. Code ${code}. Beat my ${result.time} (${plural(result.mistakes, 'mistake')}, ${plural(result.hints, 'hint')}).`
        : `Clash me on Elomental. Code ${code}. I didn’t crack it. Can you?`,
  a11y: {
    codeField: 'Clash code, 6 characters',
    code: (code: string) => `Code ${code.split('').join(' ')}`,
    table: (code: string) => `Clash ${code} results`,
    logRow: (code: string, difficulty: string, status: string) => `Clash ${code}, ${difficulty}, ${status}`,
  },
};

// --- Square code -----------------------------------------------------------

export const squareCode = {
  title: 'Square code',
  intro: 'Play the exact square a friend sent you. Every game shows its code at the top.',
  label: 'Code or sudoku string',
  placeholder: 'K7P2-QX9M',
  play: 'Play square',
  gridInfo: (numbers: number) => `Sudoku string with ${numbers} numbers.`,
  finding: 'Finding the square…',
  notFound: 'No square has that code. Check it with your friend.',
  offline: 'No connection. Square codes need the internet.',
  pasteBlocked: 'Paste blocked. Long-press the box instead.',
  a11yField: 'Square code or 81-digit sudoku string',
};

// --- Account and sign-in ---------------------------------------------------

export const account = {
  title: 'Account',
  signUp: 'Sign up with email',
  emailLabel: 'Email',
  emailPlaceholder: 'you@example.com',
  sendLink: 'Email me a link',
  enterEmail: 'Enter your email address.',
  useDifferentEmail: 'Use a different email',
  checkEmail: 'Check your email',
  linkSentConfirm: (email: string) => `We sent a sign-in link to ${email}. Tap it, then confirm on the page that opens.`,
  linkSent: (email: string) => `We sent a link to ${email}. Tap it to confirm. This screen continues by itself.`,
  yourCode: 'Your code',
  waitingConfirm: 'Waiting for you to confirm…',
  waitingLink: 'Waiting for the link…',
  switchWarning: 'That email already has an account. Signing in switches to it; this guest’s progress won’t move over.',
  linkExpired: 'The link expired. Ask for a new one.',
  signedIn: 'Signed in.',
  signedUp: 'Signed up. Your progress is saved.',
  guestIntro: 'Playing as a guest. Sign up with your email to keep your Elo, Stardust and Daily progress on any device.',
  signInIntro: 'Sign in with your email. Your Elo, Stardust and Clash results are saved on any device.',
  keepRewards: 'Keep your rewards',
  saveProgress: 'Save your progress',
  keepRewardsText: 'Sign up with your email. Your Stardust, Elo and Daily progress stay yours, on any device.',
  saveProgressText: 'Sign up with your email so your Stardust, Elo and Daily progress are saved from now on.',
  signedInAs: (email: string) => `Signed in as ${email}`,
  playerName: 'Player name',
  saveName: 'Save name',
  nameSaved: 'Name saved',
  signOut: 'Sign out',
  nameAgainOn: (day: string) => `You can change your name again on ${day}.`,
  nameAgainOnHint: (day: string) => `You can change your name again on ${day}.`,
  nameCooldown: (days: number) => `You can change your name once every ${days} days.`,
  nameTaken: 'That name is taken.',
  nameRules: 'Names are 3–20 letters, numbers, spaces, . _ -',
  errors: {
    tooManyEmails: 'Too many emails. Wait a minute and try again.',
    badCode: 'That code is wrong or expired.',
    badEmail: 'Check the email address.',
  },
  a11yMatchCode: (code: string) => `Matching code ${code}`,
};

/** The page a sign-in link opens in another browser (handoff.ts). */
export const handoff = {
  expiredTitle: 'Link expired',
  expiredText: 'This sign-in link has expired or was already used. Ask for a new one in the app.',
  yourAccount: 'your account',
  title: 'Sign in the app?',
  text: (email: string) => `The Elomental app asked to sign in as ${email}. Only confirm if you just did that and it shows this code:`,
  code: 'Code',
  confirm: 'Yes, sign in the app',
  deny: 'No, that wasn’t me',
  doneTitle: 'Done',
  doneText: 'Go back to the Elomental app. It signs in by itself in a few seconds.',
  errors: {
    expiredLink: 'The sign-in link has expired. Ask for a new one in the app.',
    wrongAccount: 'This request was made for a different email.',
    expiredRequest: 'This request has expired. Ask for a new link in the app.',
    offline: 'No connection. Try again.',
  },
};

// --- Server refusals (start_game, finish_game) -----------------------------

export const refusals = {
  start: {
    daily_done: 'You’ve already solved today’s square.',
    clash_played: 'You’ve already played this clash.',
    bad_date: 'Your clock looks off. Check the date.',
    bad_code: 'That code isn’t valid.',
    not_signed_in: 'Sign in again to play.',
    ranked_restricted: 'Ranked is paused for your account for now. Casual, Daily and Clash are open.',
  } as Record<string, string>,
  finish: {
    too_fast: 'Too fast to count: this solve wasn’t recorded.',
    already_finished: 'This game was already counted.',
    invalid_solution: 'The grid didn’t check out, so it wasn’t counted.',
  } as Record<string, string>,
  finishOffline: 'No connection. This game wasn’t saved to your account.',
};

// --- Setup -----------------------------------------------------------------

/** Setup > Accessibility > Accessibility statement (screens/statement.ts). */
export const statement = {
  title: 'Accessibility',
  intro: 'Elomental is made to be played by everyone: by touch, mouse, keyboard or screen reader. We aim for WCAG 2.2 level AA.',
  supportedTitle: 'What works',
  supported: [
    'The whole game plays from the keyboard: arrows, numbers, Shift with a number for notes. Press ? in a game for every shortcut.',
    'Screen readers hear each cell (row, column, box, number, given or yours), mistakes left, completed lines and hints.',
    'Text size up to 200%, a high-contrast mode, and a colour-blind friendly mode that marks every state with a shape.',
    'Reduce motion, hide the timer, choose the highlights, keep wrong numbers on the board, turn off vibration, turn on sounds.',
    'Casual can drop the three-mistake limit, so you can practise without losing the square.',
  ] as const,
  limitsTitle: 'Known limits',
  limits: [
    'Pinch zoom is off on phones so the board stays still while you play. Use Text size instead.',
    'The notes wheel needs a long press or a drag. With a keyboard or screen reader, use Notes (N) or Shift with a number.',
    'Ranked, Daily and Clash are timed races: you can hide the clock, not stop it, and pauses are limited.',
    'Tested with automated checks and keyboard only so far; testing with VoiceOver, TalkBack and NVDA is under way.',
  ] as const,
  feedbackTitle: 'Tell us',
  feedback: 'Something hard to see, hear or use? Open an issue and tell us what happened and on which device.',
  feedbackLink: 'Open an issue on GitHub',
  feedbackUrl: 'https://github.com/barsmin/elomental/issues',
  reviewed: 'Last reviewed October 2026.',
};

/** The keyboard shortcuts panel ("?" in a game). */
export const shortcuts = {
  title: 'Keyboard shortcuts',
  intro: 'Play the whole game from the keyboard.',
  keys: [
    [['←', '↑', '→', '↓'], 'Move around the board'],
    [['1–9'], 'Place a number'],
    [['Shift', '1–9'], 'Add or remove a note'],
    [['N'], 'Notes on or off'],
    [['Backspace'], 'Erase the cell'],
    [['Ctrl', 'Z'], 'Undo'],
    [['H'], 'Hint'],
    [['P'], 'Pause or resume'],
    [['Tab'], 'Move between controls'],
    [['Esc'], 'Close a pop-up'],
    [['?'], 'Show these shortcuts'],
  ] as [string[], string][],
};

/** Add to Home Screen: the Setup row, the note on Home and the steps pop-up (install.ts). */
export const install = {
  title: 'Add to Home Screen',
  help: 'Open Elomental from your Home Screen, full screen like an app.',
  open: 'Add to Home Screen',
  why: 'One tap from your Home Screen, full screen, no browser bars.',
  stepsIos: ['Tap Share in your browser’s toolbar.', 'Scroll down and tap Add to Home Screen.', 'Tap Add.'],
  stepsAndroid: ['Open your browser’s menu.', 'Tap Add to Home screen or Install app.', 'Tap Add or Install.'],
  done: 'Got it',
  added: 'Added. Elomental is on your Home Screen.',
  note: 'Play from your Home Screen',
  how: 'How',
  howLabel: 'How to add Elomental to your Home Screen',
  closeNote: 'Close this note',
};

export const setup = {
  title: 'Setup',
  theme: 'Theme',
  themeHelp: 'Dark is the default.',
  dark: 'Dark',
  light: 'Light',
  notesWheel: 'Notes wheel',
  notesWheelHelp: 'Long-press a cell to open the notes wheel. The Notes button works either way.',
  tutorial: 'Tutorial',
  tutorialHelp: 'How to fill cells, take notes, erase and undo.',
  tutorialReplay: 'Show again next game',
  tutorialQueued: 'The tutorial plays at the start of your next game.',
  a11y: {
    title: 'Accessibility',
    intro: 'Make the game easier to see, hear and play. Your choices follow your account to every device.',
    summary: 'Text size, contrast, colour, motion, highlights and sound.',
    open: 'Open accessibility',
    groups: { see: 'Text and colour', calm: 'Motion and time', board: 'Board', feedback: 'Sound and vibration', help: 'Help' },
    textSize: 'Text size',
    textSizeHelp: 'Larger text for labels, buttons and notes.',
    percent: (n: number) => `${n}%`,
    contrast: 'Contrast',
    contrastHelp: 'High contrast outlines every cell and makes highlights stronger.',
    system: 'System',
    standard: 'Standard',
    high: 'High',
    colourBlind: 'Colour-blind friendly',
    colourBlindHelp: 'Adds marks to highlighted and wrong cells, so no state relies on colour.',
    motion: 'Reduce motion',
    motionHelp: 'Cuts page turns, ripples and pops. System follows your device.',
    reduce: 'Reduce',
    timer: 'Timer',
    timerHelp: 'Hide the clock while you play. Your time still counts and shows at the end.',
    show: 'Show',
    hide: 'Hide',
    lines: 'Highlight row and column',
    linesHelp: 'What lights up around the selected cell.',
    box: 'Highlight the 3×3 box',
    same: 'Highlight same numbers',
    wrong: 'Wrong numbers',
    wrongHelp: 'How long a wrong number stays on the board.',
    briefly: 'Briefly',
    untilNextMove: 'Until next move',
    mistakeLimit: 'Mistake limit in Casual',
    mistakeLimitHelp: 'Off lets a Casual game go on after three mistakes. Ranked, Daily and Clash keep the limit.',
    haptics: 'Vibration',
    sounds: 'Sounds',
    soundsHelp: 'Soft tones for a placed number, a mistake and a completed line.',
    shortcuts: 'Keyboard shortcuts',
    statement: 'Accessibility statement',
    resetGroup: 'Start over',
    resetHelp: 'Put every choice on this page back to how the game first set it.',
    reset: 'Reset to defaults',
    resetConfirm: 'Reset every accessibility setting to its default?',
    resetYes: 'Reset',
    resetDone: 'Accessibility settings are back to their defaults.',
  },
  review: 'Review',
  reviewHelp: 'Players flagged for copying answers in Ranked.',
  openReview: 'Open review',
};

// --- Review (founders only; neutral, no jokes) ------------------------------

export const review = {
  title: 'Review',
  tabs: { open: 'To review', banned: 'Banned', history: 'History' },
  a11yTabs: 'Show',
  searchPlaceholder: 'Search name, email or ID',
  a11ySearch: 'Search players',
  a11yClearSearch: 'Clear search',
  matches: (n: number, query: string, limit: number) =>
    n === 1 ? `1 player matches “${query}”` : n >= limit ? `${limit}+ players match “${query}”. Type more to narrow it down.` : `${n} players match “${query}”`,
  noMatch: (query: string) => `No case found for “${query}”. Check the spelling, or try their email or account ID.`,
  showMore: (shown: number, total: number) => `Show more (${shown} of ${total})`,
  loadMoreFailed: 'Couldn’t load more. Try again.',
  empty: { open: 'Nothing to review. All clear.', banned: 'Nobody is banned from Ranked.', history: 'No decisions yet.' },
  pillAgain: 'Again',
  pillBanned: 'Banned',
  pillOpen: 'Open',
  flagged: 'Flagged',
  games: (n: number) => plural(n, 'game'),
  guestAccount: 'Guest account',
  emailAndElo: (email: string, elo: number) => `${email} · Elo ${elo}`,
  id: (id: string) => `ID ${id}`,
  bannedLine: (length: string, reason?: string | null) => `Banned from Ranked ${length}${reason ? `: ${reason}` : ''}.`,
  bannedSummary: (length: string, reason?: string | null) => `Banned ${length}${reason ? ` · ${reason}` : ''}`,
  earlier: (decision: string, when: string, note?: string | null) => `Earlier: ${decision} on ${when}${note ? ` (${note})` : ''}`,
  flaggedGames: (n: number) => `Flagged games (${n})`,
  flaggedGamesOpen: (n: number, open: number) => `Flagged games (${n}${open ? `, ${open} open` : ''})`,
  decisions: (n: number) => `Decisions (${n})`,
  actions: { clear: 'It was a mistake', banUntilLifted: 'Ban until lifted', ban30Instead: 'Ban 30 days instead', ban30: 'Ban from Ranked 30 days', lift: 'Lift ban' },
  confirm: {
    clear: (name: string) => `${name}’s flags are marked as a mistake, and any Ranked ban is lifted.`,
    restrict: (name: string, days: number | null) =>
      `${name} can’t play Ranked ${days ? `for ${days} days` : 'until you lift the ban'} and is off the leaderboard meanwhile. Nothing else changes: Elo, Stardust, Casual, Daily and Clash all stay.`,
    lift: (name: string) => `${name} can play Ranked again and returns to the leaderboard.`,
    button: { clear: 'Clear flags', restrict: 'Ban', lift: 'Lift ban' },
    reason: 'Reason (optional)',
    note: 'Note (optional)',
  },
  done: {
    clear: (name: string) => `${name}: cleared`,
    lift: (name: string) => `${name} can play Ranked again`,
    restrict: (name: string) => `${name} is banned from Ranked`,
  },
  status: {
    banned: (length: string) => `Banned ${length}`,
    toReview: (n: number) => `${plural(n, 'flag')} to review`,
    none: 'No open flags',
  },
  by: (name: string) => `by ${name}`,
  fromSqlEditor: 'from the SQL Editor',
  flags: (n: number) => plural(n, 'flag'),
  rated: (rating: number) => `rated ${rating}`,
  solvedIn: (time: string) => `solved in ${time}`,
  toReviewTag: ' · to review',
  noteLine: (note: string) => `Note: ${note}`,
  verdict: { unchecked: 'Not checked', veryLikely: 'Very likely copied', likely: 'Likely copied' },
  why: {
    unchecked: 'the app never sent its moves for checking, usually a dropped connection.',
    invalid: 'the square it reported was not a valid sudoku.',
    leaps: (leaps: number | null, placements: number | null) => `${leaps} of ${placements} cells were filled in before they could be worked out.`,
  },
  until: (day: string) => `until ${day}`,
  untilLifted: 'until lifted',
  decision: {
    clear: 'Cleared as a mistake',
    lift: 'Ban lifted',
    restrict: (days: number | null) => (days ? `Banned from Ranked for ${days} days` : 'Banned from Ranked until lifted'),
  },
  errors: {
    notAdmin: 'Only founders can open Review.',
    notAdminAction: 'Only founders can do this.',
    loadFailed: 'Couldn’t load Review. Try again.',
    searchFailed: 'Couldn’t search. Try again.',
    actionFailed: 'That didn’t work. Try again.',
  },
};
