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
/** Every Elo, Stardust and count in one style (L29): grouped from five digits, "12,480", "6400". */
export const formatNumber = (n: number): string => (Math.abs(n) >= 10000 ? n.toLocaleString('en-GB') : String(n));
/** A technique's name as shown ("X-Wing"): a word joiner after each hyphen, so it never breaks there. */
export const techniqueName = (name: string): string => name.replace(/-/g, '-⁠');
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
  /** The beta site (beta.ts): its corner tag, and the start of every tab title. */
  betaTag: 'Beta',
  betaTitle: (title: string) => `Beta · ${title}`,
  /** The beta site's sign-in, for invited testers only (beta.ts). */
  betaGateTitle: 'Elomental Beta',
  betaGateText: 'New things are tried here before they reach the game. Only invited testers can sign in.',
  betaSignInTitle: 'Sign in',
  betaSignInText: 'Use the email you were invited with.',
  betaNotInvited: 'That email isn’t on the tester list. To play, go to elomental.online.',
  betaLiveLink: 'Go to elomental.online',
  /** A new deploy is out while the app was open (update.ts). */
  updateReady: 'A new version of Elomental is ready.',
  updateRefresh: 'Refresh',
  /** The browser tab and window title for a screen. */
  pageTitle: (screen: string) => `${screen} · Elomental`,
  tagline: 'Competitive sudoku',
  ok: 'OK',
  close: 'Close',
  cancel: 'Cancel',
  /** Under a button you hold to confirm (hold.ts). */
  holdHint: 'Hold to confirm',
  /** The same button pressed by a screen reader, which can't hold: the next press confirms. */
  pressAgain: 'Press again to confirm.',
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
  /** A page split off the main script (lazy.ts) that can't be fetched: offline, or the app was updated. */
  pageOffline: 'No connection. This page needs the internet to open.',
  reloading: 'Loading the latest version of Elomental…',
  searching: 'Searching…',
  you: 'You',
  friend: 'Friend',
  guest: 'Guest',
  modes: { casual: 'Casual', daily: 'Daily Square', ranked: 'Ranked', clash: 'Clash' },
  difficulty: { easy: 'Easy', medium: 'Medium', hard: 'Hard' },
  stardust: 'Stardust',
  elo: 'Elo',
  spirits: 'Spirits',
  /** The label after a Spirit count: 1 Spirit, 2 Spirits. */
  spiritsLabel: (n: number) => (n === 1 ? 'Spirit' : 'Spirits'),
  plusStardust: (n: number) => `+${formatNumber(n)} Stardust`,
  rareSpirit: 'Rare drop: a Spirit!',
  /** Shown under the player's name, by Elo (profile.ts rankTier). Names only, no divisions. */
  ranks: ['Novice', 'Apprentice', 'Adept', 'Archmage', 'Elomental'] as const,
  /** A title shown before the rank's name ("Founder · Archmage", rankName.ts), and read out with it. */
  titleBeforeRank: (title: string) => `${title} · `,
  titledRank: (title: string, rank: string) => `${title}, ${rank}`,
  /** Up to 1 Spirit on the result's strip (when a bigger moment holds the card). */
  plusSpirit: '+1 Spirit',
  /** How far the next rank is (profile.ts nextRank). */
  toNextRank: (gap: number, label: string) => `${gap} Elo to ${label}`,
};

// --- Welcome ---------------------------------------------------------------

export const welcome = {
  a11y: 'Elomental. Continue.',
};

// --- Home ------------------------------------------------------------------

export const home = {
  tiles: {
    setup: 'Setup',
    forge: 'Forge',
    daily: 'Daily Square',
    store: 'Store',
    leaderboard: 'Leaderboard',
    casual: 'Casual',
    ranked: 'Play Ranked',
  },
  storeLater: 'The Store opens soon.',
  /** The profile card (homeCard.ts). */
  card: {
    badges: 'Your badges',
    noBadges: 'Badges you earn show here.',
    /** An empty badge slot on the card, a button that opens the badge choice. */
    a11yAddBadge: 'Add a badge to your card',
    /** A badge on the card, a button that opens the badge choice. */
    a11yBadge: (badge: string) => `${badge}. Change the badges on your card`,
    faction: (name: string) => `Faction: ${name}`,
  },
  /** The way to choose a side, where one isn't chosen yet (Profile, the result). */
  line: {
    chooseSide: 'Choose your faction',
  },
  /** Once, on the first launch after your side won the month (settle_faction_month). */
  monthWon: {
    title: (element: string, month: string) => `${element} won ${month}`,
    text: (month: string) => `+300 Stardust and the ${month} badge are yours.`,
    badges: 'See your badges',
  },
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
    /** Wide screens (banner pages): the banner's count, and the doors. */
    solved: 'Squares solved',
    waiting: 'Your square is waiting',
    givens: (count: number) => `At least ${count} given numbers`,
    lastPlayed: 'Last played',
    a11yDifficultyDoor: (difficulty: string, count: number, last: boolean) =>
      `Play ${capitalize(difficulty)}. At least ${count} given numbers.${last ? ' Last played.' : ''}`,
    /** A difficulty door while a square waits: one click shouldn't end it unasked. */
    replaceTitle: 'Start a new square?',
    replaceText: (difficulty: string, percent: number) => `Your ${capitalize(difficulty)} square (${percent}% done) ends here.`,
    keepPlaying: 'Keep playing',
    startNew: 'Start new',
  },
  ranked: {
    title: 'Ranked',
    text: 'A square matched to your Elo. Solve it to climb.',
    /** Before you start: your rank, the square's length and what's at stake. */
    rank: (label: string, elo: number) => `${label} · ${elo} Elo`,
    /** The length, and the slow cut at twice it. */
    length: (minutes: number, slow: number) => `About ${minutes} min. Faster wins more; over ${slow} min wins less.`,
    stakes: (win: number, loss: number) =>
      loss === 0 ? `Win about +${win}. Losses cost no Elo below 300.`
      : win < 1 ? `Little Elo left to gain above 1600. Lose about −${loss}.`
      : `Win about +${win}, lose about −${loss} (3 mistakes or Concede).`,
    /** After two losses in a row (profile.ts rankedStageFor). */
    comeback: 'After two losses in a row, this square is a step easier.',
    /**
     * Once each, before the first square from a stage that brings in a technique family
     * (engine RANKED_STAGES[].introduces). Information, not a reward. Technique names keep a
     * word joiner after the hyphen (techniqueName), so they never break across lines.
     */
    newTechnique: {
      title: 'New in your Ranked squares',
      pointing: 'From now on, a square can need pointing: if a number can only go in one row of a box, it can’t go anywhere else in that row. Columns work the same way. A hint shows you how, for a smaller Elo gain.',
      pairs: 'From now on, a square can need pairs: two cells that can only hold the same two numbers keep them out of the rest of their row, column or box. A hint shows you how, for a smaller Elo gain.',
      wings: 'From now on, a square can need an X-⁠Wing or an XY-⁠Wing. In an X-⁠Wing, a number fits just two cells in each of two rows, in the same two columns, so it can’t go anywhere else in those columns. A hint shows you how, for a smaller Elo gain.',
      chains: 'From now on, a square can need a chain or a linked pattern, such as a Finned X-⁠Wing, a Skyscraper or an XY-⁠Chain. A hint shows you how, for a smaller Elo gain.',
      finned: 'From now on, a square can need a Finned Swordfish or a Finned Jellyfish. A hint shows you how, for a smaller Elo gain.',
    },
    pauses: '3 pauses of up to 5 minutes.',
    /** Ranked's promise (owner, 2026-10-24): parts and Stardust are looks, and the Store will sell looks only. */
    fair: 'Skill only: nothing you forge or buy ever changes your Elo.',
    start: 'Start',
  },
};

// --- Daily Square ----------------------------------------------------------

const DAY_STATE = { done: 'solved', mended: 'filled in', missed: 'not solved', today: 'today', future: 'coming up' } as const;

export const daily = {
  title: 'Daily Square',
  weekdays: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const,
  doneToday: 'Today’s square is solved',
  play: 'Play today’s square',
  continue: 'Continue today’s square',
  monthCount: (done: number, days: number) => `${done} of ${days}`,
  /** The month's badge (daily_month): 20 days solved or filled in, every day of a shorter month. */
  monthBadge: (month: string) => `${month} badge`,
  badgeEarned: 'Earned. It’s on your Profile.',
  badgeHow: (need: number) => `Solve or fill in ${need} days this month to earn it.`,
  /** Not reachable this month (a player who joined late, or missed too many days): why, then what's next (owner, 2026-10-24). */
  badgeOutOfReach: (need: number, nextMonth: string) => `It needs ${need} days, more than this month has left. ${nextMonth}’s badge starts on the 1st.`,
  badgeNeedsAccount: 'Badges are kept with an account. Connect and sign in to earn this one.',
  mendBadgeHeld: (month: string) => `The ${month} badge is already yours, so this only fills in the calendar.`,
  mendHint: (stardust: number, left: number) => `Tap a missed day to fill it in: ${stardust} Stardust each, ${left} left this month.`,
  /** In the fill-in sheet: what this fill-in does for the month's badge. */
  mendToward: (after: number, need: number) => `Brings you to ${after} of ${need} for the badge.`,
  mendNoBadge: (month: string) => `The ${month} badge needs more days than this month has left, so this only fills in the calendar and your streak.`,
  nextIn: (hours: number, minutes: number) => `New square in ${hours}h ${minutes}m`,
  /** The streak (days.ts dailyStreak): days in a row solved or filled in, and what keeps it going. */
  streakToday: (days: number) => `${days}-day streak: solve today’s square to make it ${days + 1}.`,
  streakTomorrow: (days: number) => `${days}-day streak: back tomorrow for ${days + 1}.`,
  streakStart: 'Solve today’s square to start a streak.',
  /** Wide screens (banner pages): the banner's line. */
  bannerHelp: 'One square a day, the same for everyone.',
  /** The banner's count: every Daily solved. */
  bannerStat: 'Daily squares solved',
  mendTitle: (date: string) => `Fill in ${date}?`,
  mendText: 'It counts as solved for this month’s Daily total and for your streak. Your Elo doesn’t change.',
  mendLeft: (left: number, stardust: number) => `${left} of 3 left this month · You have ${formatNumber(stardust)} Stardust`,
  mend: (stardust: number) => `Fill in for ${stardust} Stardust`,
  mendNoneLeft: 'You’ve filled in 3 days this month: that’s the most.',
  mended: (date: string) => `${date} filled in.`,
  mendOffline: 'Filling in a day needs a connection and an account.',
  a11yDay: (month: string, day: number, state: keyof typeof DAY_STATE) => `${month} ${day}, ${DAY_STATE[state]}`,
  /** What tapping a day does, after its date: today plays, a missed day opens the fill-in. */
  a11yPlayToday: (dayLabel: string, resume: boolean) => `${dayLabel}. ${resume ? 'Continue today’s square' : 'Play today’s square'}`,
  a11yFillIn: (dayLabel: string) => `${dayLabel}. Fill in`,
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
  pausesLeft: (n: number) => `${plural(n, 'pause')} left. The clock waits up to 5 minutes.`,
  noPausesLeft: 'No pauses left in this game.',
  pauseFailed: 'Couldn’t pause: no connection. The clock is still running, and no pause was used.',
  /** A finished game whose result couldn't be sent (pending.ts). */
  pendingKept: 'No connection. Your result is saved on this phone and will be sent when you’re back online.',
  /** Ranked and Clash are timed by the server, up to when the result arrives. */
  pendingKeptTimed: 'No connection. Your result is saved on this phone and will be sent when you’re back online. The time counts until it arrives, so reconnect soon.',
  pauseClosed: 'This game can’t be paused any more.',
  pendingStillWaiting: 'Your last result is still waiting to be sent. Try again once you’re back online.',
  pendingSent: (n: number) => (n === 1 ? 'Your saved result was sent and counted.' : `Your ${n} saved results were sent and counted.`),
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
  /** Once, after a player's first hint outside Ranked (the coach no longer has a Hints card). */
  hintStardust: (max: number) => `Each hint trims this square’s Stardust. ${max} per game.`,
  /** Ranked: asked before the first hint of a game. */
  hintConfirmTitle: 'Use a hint?',
  hintConfirmText: (percent: number) => `In Ranked, each hint cuts this game’s Elo gain by ${percent}%. The clock keeps running while the hint is open.`,
  hintConfirmClash: 'In a Clash, the clock keeps running while the hint is open.',
  hintUse: 'Use hint',
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

// --- Parts and the forge ---------------------------------------------------------
// docs/PROGRESSION_DESIGN.md (revised 2026-10-20): every 3rd solved, rated square drops a
// part (a whole avatar or a frame); Stardust forges any part still missing. Rarity is always written,
// never shown by colour alone.

export const forge = {
  rarities: { common: 'Common', rare: 'Rare', epic: 'Epic', mythic: 'Mythic' },
  elements: { fire: 'Fire', water: 'Water', earth: 'Earth', air: 'Air' },
  /** The frames, one a tier (avatar.ts FRAME_TIERS). */
  frameTiers: { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', epic: 'Epic', mythic: 'Mythic' },
  /** "Gold Frame". */
  frameName: (tier: string) => `${tier} Frame`,
  slots: { avatar: 'Avatar', frame: 'Frame' },
  /** The Forge's group headings. */
  slotGroups: { avatar: 'Avatars', frame: 'Frames' },
  /** The avatars, by name (art/faces). */
  avatars: {
    happy: 'Happy', upset: 'Upset', angry: 'Angry', silly: 'Silly', sad: 'Sad', bored: 'Bored',
    excited: 'Excited', scared: 'Scared', calm: 'Calm', tired: 'Tired', disappointed: 'Disappointed', shocked: 'Shocked',
  } as Record<string, string>,

  // The result pop-up (reward.ts)
  newPart: 'New part',
  /** A drop is a blueprint you forge with Stardust (blueprints). */
  blueprint: 'Blueprint',
  blueprintNote: (stardust: number) => (stardust ? `Forge it for ${formatNumber(stardust)} Stardust.` : 'Free to forge: one tap in the Forge.'),
  openForge: 'Open the Forge',
  duplicate: (stardust: number) => `Already yours: +${stardust} Stardust instead.`,
  pityHit: (rarity: string) => `${rarity} guaranteed: your luck came due.`,
  /** The counter toward the next part. */
  progress: (count: number, every: number) => `Next part: ${count} of ${every} squares`,
  influence: (n: number, element: string) => `+${n} influence for ${element}`,
  /** Screen readers hear the part as one literal line. */
  a11yDrop: (name: string, rarity: string) => `New part: ${name}, ${rarity}.`,
  a11yBlueprint: (name: string, rarity: string) => `Blueprint: ${name}, ${rarity}.`,
  // The Forge page (screens/forge.ts)
  title: 'Forge',
  /** Wide screens (banner pages): the banner's line. */
  bannerHelp: 'Turn blueprints and Stardust into new looks.',
  /** Wide screens: the title over how parts come. */
  blueprintsTitle: 'Blueprints',
  intro: 'Every 3rd square you solve brings a blueprint for an avatar or a frame. Forge it cheaply with Stardust, or forge any part without one for more.',
  parts: 'Parts',
  collected: (n: number, total: number) => `${n} of ${total} collected`,
  wearing: 'Equipped',
  owned: 'Owned',
  ready: 'Ready to forge',
  blueprintReady: 'Blueprint: ready to forge',
  blueprintNeeds: 'Blueprint: not enough Stardust yet',
  /** The sheet's price with a blueprint in hand. */
  blueprintPrice: (stardust: number) => (stardust ? `With your blueprint: ${formatNumber(stardust)} Stardust` : 'Free with your blueprint'),
  needsMore: 'Not enough Stardust yet',
  price: (stardust: number) => `${formatNumber(stardust)} Stardust`,
  forge: 'Forge',
  wear: 'Equip',
  takeOff: 'Unequip',
  forged: (name: string) => `Forged: ${name}.`,
  /** Marks (marks): a frame you wear earns one every 40 rated wins, up to 3. */
  marksTitle: 'Marks',
  marksNote: 'The frame you wear earns a mark every 40 rated wins, up to 3.',
  marks: (n: number) => (n === 1 ? '1 mark' : `${n} marks`),
  /** Toward the next mark, on the card and the sheet. */
  markProgress: (wins: number) => `${wins} / 40`,
  marksLine: (n: number, wins: number) => (n >= 3 ? 'All 3 marks earned.' : `${n} of 3 marks. ${wins} of 40 wins to the next.`),
  a11yMarks: (n: number, wins: number) => (n >= 3 ? '3 of 3 marks' : `${n} of 3 marks, ${wins} of 40 wins to the next`),
  /** Gilding (gilding): a frame with 3 marks, once, for Stardust; a gilt rim wherever it's worn. */
  gilded: 'Gilded',
  gildButton: (stardust: number) => `Gild for ${formatNumber(stardust)} Stardust`,
  gildNote: 'Gilding gives this frame a gilt rim, wherever you wear it. Once per frame.',
  gildLocked: 'With 3 marks, this frame can be gilded.',
  gildedLine: 'Gilded: its rim shows on your profile and the leaderboard.',
  gildShort: (have: number, need: number) => `You have ${formatNumber(have)} of ${formatNumber(need)} Stardust.`,
  gildDone: (name: string) => `Gilded: ${name}.`,
  /** On the result, when the win earned the worn frame a mark (mark_moment). */
  markEarned: (name: string, n: number) => (n >= 3 ? `Your ${name} earned its 3rd mark: it can be gilded now.` : `Your ${name} earned a mark: ${n} of 3.`),
  edition: (n: number) => `No. ${n}`,
  offline: 'The Forge needs a connection. Your parts are safe on your account.',
  loading: 'Opening the Forge…',

  // The odds sheet: plain and exact, no jokes.
  oddsButton: 'How parts work',
  oddsTitle: 'How parts work',
  oddsIntro: 'Every 3rd solved, rated square brings one blueprint. These are the odds of its rarity.',
  oddsPityTitle: 'Guarantees',
  oddsPity: ['Epic or better within 10 parts.', 'Mythic within 25 parts.'],
  oddsDupeTitle: 'Parts you already have',
  oddsDupe: 'A part you don’t have is much likelier than one you already have. One you already own, or hold as a blueprint, turns into Stardust: 20 for Common, 50 Rare, 120 Epic, 300 Mythic.',
  oddsForgeTitle: 'Forging',
  oddsForge: 'With its blueprint a part forges cheaply: Common free, Rare 50 Stardust, Epic 200, Mythic 500. Without one, any part you’re missing costs 150 for Common, 375 Rare, 900 Epic, 1800 Mythic.',
  oddsPaceTitle: 'Each day',
  oddsPace: 'Your first 9 solved squares each day count toward parts: up to 3 parts a day.',
  oddsSpiritTitle: 'Spirit',
  oddsSpirit: 'The rarest drop: a 0.2% chance on each square that counts toward parts, and one is guaranteed within 500 of them. A Spirit brings one avatar to life.',
  oddsSpendTitle: 'Spending Stardust',
  oddsSpend: [
    'Bring an avatar to life: 6000 Stardust and a Spirit, once per avatar.',
    'Fill in a missed Daily Square: 300 Stardust, up to 3 days a month.',
    'Call a Spirit: 15000 Stardust, then 5000 more for each one called this season.',
  ],

  // Spirits on the Forge page: how close the next one is, and calling one for Stardust
  spiritsTitle: 'Spirits',
  /** Counted squares: the first 9 solved each day. */
  spiritIn: (n: number) => (n <= 1 ? 'A Spirit is guaranteed with your next counted square.' : `A Spirit is guaranteed within ${n} counted squares.`),
  callTitle: 'Call a Spirit',
  callNote: 'A Spirit for Stardust, to bring an avatar to life. Each one this season costs 5000 more.',
  callButton: (stardust: number) => `Call a Spirit · ${formatNumber(stardust)} Stardust`,
  /** Every avatar you own is alive or has a Spirit waiting. */
  callNone: 'Every avatar you own is alive or has a Spirit waiting for it.',
  /** Under a greyed-out Call button: why. */
  callShort: (have: number, cost: number) => `You have ${formatNumber(have)} of ${formatNumber(cost)} Stardust.`,
  called: 'A Spirit came. Bring an avatar to life with it.',

  // Polish (an avatar brought to life, once): a look only
  alive: 'Alive',
  lifeTitle: 'Bring to life',
  lifeNote: 'It moves wherever your avatar shows. Once per avatar.',
  lifeButton: 'Bring to life',
  lifeSpirit: 'Spirit',
  lifeHave: (n: number) => `You have ${n}`,
  /** Under a cost the player can't cover yet. */
  lifeShort: (n: number) => `Need ${n} more`,
  /** The cost, read as one line by screen readers. */
  a11yLifeCost: (stardust: number, haveDust: number, haveSpirits: number) => `Costs ${formatNumber(stardust)} Stardust and 1 Spirit. You have ${formatNumber(haveDust)} Stardust and ${plural(haveSpirits, 'Spirit')}.`,
  broughtToLife: (name: string) => `${name} is alive.`,
};
// --- Name plates (plates.ts, screens/plates.ts; come with the level, never bought) ---------
// A frame round the name with the level at its foot, one for each level milestone. Glossary:
// "name plate" ("plate" for short); Equip / Equipped / Unequip; never "buy" or "get".

export const plates = {
  title: 'Name plates',
  /** The Profile's row into the page, and how many are collected. */
  count: (n: number, total: number) => `${n} of ${total}`,
  /** Wide screens: the Name plates door's line, with the plate you wear (none for the Blank plate). */
  doorLine: (plate: string | null, n: number, total: number) => (plate ? `Wearing ${plate} · ${n} of ${total}` : `${n} of ${total}`),
  intro: 'A frame round your name, with your level at its foot. Reach a level to earn the next one; every plate is yours to keep.',
  /** Plate 0 (no frame, the level alone) to 9, in the order they come (xp.ts PLATE_LEVELS). */
  names: ['Blank', 'Riveted', 'Banded', 'Cartouche', 'Fanlight', 'Colonnade', 'Sunburst', 'Jewelled', 'Winged', 'Starforged'] as const,
  /** The page's groups: the plates' bands, cold to lit. */
  bands: { ink: 'Ink', steel: 'Steel', gilt: 'Gilt', star: 'Star', epic: 'Aether', mythic: 'Starforged' } as Record<string, string>,
  equipped: 'Equipped',
  from: (level: number) => `From level ${level}`,
  locked: (level: number) => `Level ${level}`,
  toGo: (xp: number) => `${formatNumber(xp)} XP to go`,
  /** Blank: one plain line under the name, with the level (how a plate is taken off). */
  blankLine: 'A plain line and your level',
  a11yEquipped: (name: string) => `${name} plate, equipped`,
  a11yEquip: (name: string) => `${name} plate. Equip.`,
  a11yLocked: (name: string, level: number) => `${name} plate, locked until level ${level}`,
  isNew: 'New',
  worn: (name: string) => `Your name now has the ${name} plate.`,
  none: 'Your name has no plate now.',
  /** The level bar's caption when the next level brings a plate. */
  nextCaption: (xp: number, level: number) => `${formatNumber(xp)} XP to level ${level}: a new name plate`,
  /** On the result: a new plate as its moment, or a line when a bigger moment holds it. */
  newTitle: 'New name plate',
  newLine: (name: string, level: number) => `${name}, for reaching level ${level}.`,
  newEquipped: 'Equipped',
  newElsewhere: 'It’s with your name plates on your Profile.',
  newShort: (name: string) => `New name plate: ${name}`,
  a11yNew: (name: string, level: number, equipped: boolean) =>
    `New name plate: ${name}, for reaching level ${level}. ${equipped ? 'Equipped.' : 'It’s with your name plates on your Profile.'}`,
};
// --- Profile ---------------------------------------------------------------------
// Opened from Home's avatar: who you are, how you're doing, and the way into the Forge.

export const profile = {
  title: 'Profile',
  /** Home's avatar button: literal. */
  a11yAvatar: 'Your avatar. Opens your profile.',
  stats: 'Stats',
  elo: 'Elo',
  bestElo: 'Best Elo',
  solved: 'Squares solved',
  ranked: 'Ranked games',
  dailyMonth: (month: string) => `Daily in ${month}`,
  dailyCount: (done: number, days: number) => `${done} of ${days}`,
  collection: 'Collection',
  season: (n: number, total: number) => `Season Alpha: ${n} of ${total} parts`,
  /** When the season ends (L23): "until 1 July 2027". */
  seasonUntil: (season: string, date: string) => `${season} ends on ${date}.`,
  collectionOffline: 'Your parts show here when you’re online.',
  forge: 'Forge',
  /** Wide screens: the Forge door's line, your purse. */
  forgeLine: (stardust: number, spirits: number) => `${formatNumber(stardust)} Stardust · ${spirits} ${spirits === 1 ? 'Spirit' : 'Spirits'}`,
  guestNote: 'Sign up to keep your avatar, parts and Elo on any device.',
};
// --- Factions ------------------------------------------------------------------
// docs/PROGRESSION_DESIGN.md §13: each player fights for one element in a monthly war.

export const affinity = {
  title: 'Your faction',
  intro: 'Every square you solve adds influence to your element. You count from your 5th square of the month, with up to 300 influence each. Each month, the side with the most influence per player wins.',
  /** One line of character per element; flavour only, no element plays differently. */
  character: {
    fire: 'Speed and nerve.',
    water: 'Patience, the long line.',
    earth: 'Steady, every day.',
    air: 'A light touch, many squares.',
  } as Record<string, string>,
  needsYou: 'Needs you',
  /** The card, read in full by screen readers. */
  a11yCard: (element: string, line: string, needsYou = false) => `${element}. ${line}${needsYou ? ' Needs you.' : ''}`,
  confirmTitle: (element: string) => `Join ${element}?`,
  confirmText: 'You can switch once a month, in your first 5 days in a faction. Your faction’s frames start dropping for you.',
  /** The Profile's faction line, while switching is allowed. */
  change: 'Change',
  a11yChange: 'Change your faction',
  join: 'Join',
  later: 'Decide later',
  joined: (element: string) => `Welcome to ${element}.`,
  /** The Forge's head: your side and where it stands. */
  yours: (element: string, place: string) => `${element} · ${place} this month`,
};

// --- Results ---------------------------------------------------------------

// --- Account level --------------------------------------------------------------
// level.ts: a permanent level from XP. "Level" and "XP"; never "level up" (the glossary keeps
// that out), never "level" for a rank or a square's rating.
export const level = {
  /** Above the number in the badge */
  cap: 'Level',
  label: (n: number) => `Level ${n}`,
  gain: (xp: number) => `+${formatNumber(xp)} XP`,
  toNext: (xp: number, next: number) => `${formatNumber(xp)} XP to level ${next}`,
  reached: (n: number) => `Level ${n} reached`,
  a11y: (n: number, gained: number, left: number) => `Level ${n}. +${formatNumber(gained)} XP. ${formatNumber(left)} XP to level ${n + 1}.`,
};

/** The Spirit as the result's one moment (its own card, not a line over a part's). */
export const spiritHero = {
  title: 'Rare drop: a Spirit!',
  text: 'Brings an avatar to life.',
};

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
  /** `max` null: Casual without the mistake limit, so just the count. */
  mistakesOf: (n: number, max: number | null) => (max === null ? String(n) : `${n} / ${max}`),
  /** Under the Elo row when a solve took over twice the square's par. */
  slowCut: (minutes: number) => `Over ${minutes} min: Elo gain −25%`,
  /** The day's counted solves are used up (finish_game partsCapped / dustCapped). */
  partsCapped: 'You’ve earned today’s 3 parts. More tomorrow.',
  dustCapped: '1 Stardust after your first 20 squares today.',
  /** `shown` counts up to the new Elo; `delta` is the final change. */
  eloChange: (before: number, shown: number, delta = shown - before) => `${before} → ${shown} (${delta >= 0 ? '+' : ''}${delta})`,
  /** Why a Ranked win earned no Elo (finish_game's reasons). */
  unrated: {
    copied: 'Unrated: cells were filled before they could be worked out.',
    unchecked: 'Unrated: this solve couldn’t be checked. Check your connection.',
    restricted: 'Unrated: Ranked is paused for your account.',
    too_quick: 'Unrated: solved faster than a Ranked square can be worked out.',
  },
  speedBonus: (percent: number) => `Speed bonus +${percent}%`,
  protectedLoss: 'No Elo lost: losses cost nothing below 300 Elo.',
  /** A step up in rank; demotions get no line. */
  /** Before the new rank's name, in its colours (rankName.ts). */
  promoted: 'Promoted: ',
  /** After a second loss in a row, from 300 Elo up: what the next game holds. */
  comeback: 'Your next square is a step easier, until you win one.',
  /** A Ranked square's hardest step, when it needed more than singles (techniqueName). */
  keyStep: (technique: string) => `Key step: ${technique}`,
  thisMonth: 'This month',
  monthOf: (done: number, days: number) => `${done} / ${days} squares`,
  /** A solved Daily: the streak it makes (days.ts dailyStreak). */
  streak: 'Streak',
  streakDays: (days: number) => plural(days, 'day'),
  /** Shown once, on the solve or fill-in that earns the month's badge. */
  monthBadgeEarned: (month: string) => `${month} badge earned. It’s on your Profile.`,
  /**
   * A player's first 3 wins (owner, 2026-10-24): what each thing this result paid is for, one line
   * each, only for what it paid.
   */
  learn: {
    dust: 'Stardust forges new avatars and frames in the Forge.',
    xp: 'XP raises your level. Every 5 levels brings a new name plate.',
    part: (count: number, every: number) => `Every ${ORDINAL(every)} square you solve brings an avatar or a frame: ${count} of ${every} so far.`,
    influence: 'Influence helps your faction win this month.',
  },
  /** Once, when it's time to choose a side (3 solves, no faction yet). */
  chooseSide: 'Your squares can count for a side this month.',
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
  fill: { title: 'Fill it in', text: 'Tap a number to place it in the selected cell. A wrong number costs a mistake, shown at the top. Three mistakes and the square is lost.' },
  notes: { title: 'Take notes', text: 'Tap Notes, then numbers, to pencil small notes into the cell. Tap Notes again to go back.' },
  notesWithWheel: { title: 'Take notes', text: 'Tap Notes, then numbers, to pencil small notes into the cell. Or hold an empty cell and slide onto a number.' },
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
  join: 'Join Clash',
  /** The sheet's two jobs, chosen first. */
  haveCode: 'I have a code',
  pickDifficulty: 'How hard should the square be?',
  /** A typed code nobody has played yet: fine if it's fresh, a typo otherwise. */
  unknownCode: 'Nobody has played this code yet. That’s fine if your friend just made it. If you typed it, check it first.',
  joinAnyway: 'Start this code',
  created: (difficulty: string) => `Your ${difficulty} code. Send it now or after you play: your time travels with the result.`,
  shareCode: 'Share code',
  log: 'Clash log',
  logNoteOnline: 'You vs friend. Results arrive once your friend finishes.',
  logNoteOffline: 'You vs friend. A result appears once its link is opened on this phone. Sign in (Setup) to get results automatically.',
  logEmpty: 'No clashes yet. Create a code and send it to a friend.',
  status: { won: 'Won', lost: 'Lost', draw: 'Draw', waiting: 'Waiting', unplayed: 'Not played' },
  notFinished: 'Not solved',
  noTime: '—',
  versus: (mine: string, theirs: string) => `${mine} vs ${theirs}`,
  noCodeOnClipboard: 'No Clash code on the clipboard',
  pasteBlocked: 'Paste blocked. Long-press the boxes instead.',
  waitingForFriend: 'Waiting for your friend’s result. Open the result link they send you and it lands here.',
  /** Signed in, results arrive by themselves. */
  waitingForFriendOnline: 'Waiting for your friend’s result. It arrives here once they finish.',
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
  /** A full-length code with a character codes never use. */
  lookalike: 'Codes never use 0, O, 1, I or L. Check those characters.',
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
  sendCode: 'Email me a code',
  enterEmail: 'Enter your email address.',
  useDifferentEmail: 'Use a different email',
  checkEmail: 'Check your email',
  signInSent: (email: string) => `We sent a code to ${email}. Type it below, or tap the link in the same email.`,
  linkSent: (email: string) => `We sent a code to ${email}. Type it below, or tap the link in the same email. This screen continues by itself.`,
  codeLabel: 'Code from the email',
  useCode: 'Use code',
  waitingLink: 'Waiting for the link…',
  /** Asked before switching (the code isn't sent until the guest chooses). */
  switchTitle: (email: string) => `${email} already has an account`,
  switchText: (elo: number, stardust: number) =>
    `Signing in switches to that account. This guest’s ${elo} Elo and ${stardust} Stardust won’t move over, and you can’t come back to them.`,
  switchGo: 'Switch to that account',
  playedBefore: 'Played before? Use the same email to sign in.',
  /** After a sign-in or a switch to an existing account (not a guest's email being saved). */
  signedInSwitched: 'Signed in. You’re on your account now.',
  /** The result's one-line invitation (opens the form when tapped). */
  keepLine: 'Keep this on any device.',
  saveLine: 'Sign up to save your games from now on.',
  signUpShort: 'Sign up',
  notNow: 'Not now',
  /** Once, when a guest who played offline gets an account this session (decision D9). */
  offlineTitle: 'A fresh start here',
  offlineText: 'Games you played offline couldn’t move to this profile, so Elo and Stardust start again here. From now on, every game is saved.',
  offlineOk: 'OK',
  signedIn: 'Signed in.',
  signedUp: 'Signed up. Your progress is saved.',
  guestIntro: 'Playing as a guest. Sign up with your email to keep your Elo, Stardust and Daily progress on any device.',
  signInIntro: 'Sign in with your email. Your Elo, Stardust and Clash results are saved on any device.',
  keepRewards: 'Keep your rewards',
  saveProgress: 'Save your progress',
  keepRewardsText: 'Sign up with your email. Your Stardust, Elo and Daily progress stay yours, on any device.',
  saveProgressText: 'Sign up with your email to save your games from now on, on any device. What you played before signing up starts again on the account.',
  signedInAs: (email: string) => `Signed in as ${email}`,
  playerName: 'Player name',
  saveName: 'Save name',
  nameSaved: 'Name saved',
  signOut: 'Sign out',
  signOutPending: 'A result on this phone hasn’t been sent yet. Sign out once you’re back online, so it counts.',
  nameAgainOn: (day: string) => `You can change your name again on ${day}.`,
  nameCooldown: (days: number) => `You can change your name once every ${days} days.`,
  nameTaken: 'That name is taken.',
  nameRules: 'Names are 3–20 letters, numbers, spaces, . _ -',
  errors: {
    tooManyEmails: 'Too many emails. Wait a minute and try again.',
    badCode: 'That code is wrong or expired.',
    badEmail: 'Check the email address.',
  },
};

/** The page the button in a sign-in email opens (emailLink.ts). */
export const emailLink = {
  expiredTitle: 'Link expired',
  expiredText: 'This sign-in link has expired or was already used. Ask for a new one in Setup.',
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
    slow_down: 'Too many games started in a minute. Wait a moment and try again.',
  } as Record<string, string>,
  finish: {
    too_fast: 'Too fast to count: this solve wasn’t recorded.',
    already_finished: 'This game was already counted.',
    invalid_solution: 'The grid didn’t check out, so it wasn’t counted.',
    no_game: 'This game belongs to another account, so it wasn’t counted here.',
  } as Record<string, string>,
  /** The server answered with something unexpected (no connection keeps the result instead, pending.ts). */
  finishOffline: 'The server couldn’t count this game. Try again later.',
  /** The Forge (forge_part, refine_components, swap_components, equip_part). */
  forge: {
    not_enough_stardust: 'Not enough Stardust or Spirits for that yet.',
    already_owned: 'That part is already yours.',
    already_gilded: 'That frame is already gilded.',
    needs_marks: 'That frame needs 3 marks first.',
    not_gildable: 'Only frames can be gilded.',
    vaulted: 'That part’s season has ended. It can’t be forged any more.',
    not_owned: 'You don’t own that part yet.',
    already_alive: 'That avatar is already alive.',
    no_avatar_to_wake: 'Every avatar you own is alive or has a Spirit waiting for it.',
    plate_not_owned: 'You haven’t reached that plate’s level yet.',
    no_mends_left: 'You’ve filled in 3 days this month: that’s the most.',
    already_solved: 'That day is already done.',
    bad_date: 'Only missed days earlier this month can be filled in.',
    not_signed_in: 'Sign in again to use the Forge.',
  } as Record<string, string>,
  forgeOffline: 'No connection. Nothing was spent; try again in a moment.',
  /** Dev mode (founders only). */
  dev: {
    not_admin: 'Only founders can use dev mode.',
    dev_off: 'Turn dev mode on first.',
    bad_request: 'That value isn’t allowed.',
    beta_only: 'This is only on beta.elomental.online.',
    bad_email: 'Enter an email address.',
  } as Record<string, string>,
  devOffline: 'No connection. Nothing changed.',
  /** choose_affinity */
  affinity: {
    too_soon: 'Solve 3 squares first, then choose your faction.',
    affinity_locked: 'Your faction is set for this month. You can switch in the first 5 days of the next one.',
    not_signed_in: 'Sign in again to choose your faction.',
  } as Record<string, string>,
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
    'Ranked and Clash are timed races: you can hide the clock, not stop it, and pauses are limited.',
    'Tested with automated checks and keyboard only so far; testing with VoiceOver, TalkBack and NVDA is under way.',
  ] as const,
  feedbackTitle: 'Tell us',
  feedback: 'Something hard to see, hear or use? Open an issue and tell us what happened and on which device.',
  feedbackLink: 'Open an issue on GitHub',
  feedbackUrl: 'https://github.com/ElomentalOfficial/elomental/issues',
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
  tutorialHelp: 'How to pick a cell, fill it in and take notes.',
  tutorialReplay: 'Show again next game',
  tutorialQueued: 'The tutorial plays at the start of your next game.',
  /** Wide screens (banner pages): the banner's line, and the doors with what's set behind each. */
  bannerHelp: 'Make Elomental yours.',
  doors: {
    accountLine: 'Your name and email',
    accountGuestLine: 'Sign up to keep your progress',
    signedIn: 'Signed in',
    guest: 'Playing as a guest',
    look: 'Look and play',
    lookLine: 'Theme, notes wheel, tutorial',
    a11yLine: 'Text size, contrast, motion, sound',
    privacyLine: 'What other players see',
    lookState: (theme: string, wheel: boolean) => `${theme} · notes wheel ${wheel ? 'on' : 'off'}`,
    a11yState: (size: number, sounds: boolean) => `Text ${size}% · sound ${sounds ? 'on' : 'off'}`,
    privacyState: (listed: boolean) => (listed ? 'On the leaderboard' : 'Off the leaderboard'),
    privacyGuest: 'Sign up to be listed',
    founderLine: 'Players to review, testing tools',
    founderState: (unlocked: boolean, devMode: boolean) => (!unlocked ? 'Locked' : devMode ? 'Unlocked · dev mode on' : 'Unlocked'),
  },
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
    /** Shown only with a mouse or trackpad (a11y.ts finePointer). */
    cursor: 'Pointer',
    cursorHelp: 'The gold arrow lights up over anything you can click. System keeps your device’s own pointer, at its size. This device only.',
    gem: 'Gold arrow',
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
  dev: 'Founder tools',
  devHelp: (on: boolean) => (on ? 'Players to review, and testing tools (dev mode on).' : 'Players to review, and testing tools (dev mode off).'),
  /** Live: the founder tools are Review only (dev mode is on beta). */
  devHelpLive: 'Players to review and their games.',
  openDev: 'Open founder tools',
  /** The bottom of Setup: which version this is (vite.config.ts), e.g. "Version 352" or "Version 352 · Beta". */
  build: (n: string, beta: boolean) => `Version ${n}${beta ? ' · Beta' : ''}`,
};

// --- Leaderboard (screens/leaderboard.ts, playerCard.ts) ------------------------
// docs/LEADERBOARD_DESIGN.md. Calm and literal: places, names, Elo. Elements are always
// named in words beside their colour.

const ORDINAL = (n: number) => {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

export const leaderboard = {
  title: 'Leaderboard',
  /** The lists' tabs: short, so all four fit one row on a phone. */
  views: { friends: 'Friends', global: 'All', faction: 'Faction', season: 'Season' },
  a11yViews: 'Which list',
  /** Wide screens (banner pages): the banner's line, and the podium for screen readers. */
  bannerHelp: 'Where you stand.',
  a11yPodium: 'Top three',
  /** Under the lists' tabs: what the chosen one ranks. */
  about: {
    friends: 'You and the players you follow, by Elo.',
    global: 'Everyone with a place, by Elo.',
    faction: (side: string | null) => (side ? `Everyone in ${side}, by Elo.` : 'Players in your faction, by Elo.'),
    season: 'Best Elo this season. 20 Ranked games to qualify.',
  },
  updated: (min: number) => (min < 1 ? 'Updated just now' : `Updated ${min} min ago`),
  ranks: 'Ranks',
  showMore: 'Show more',
  showMe: 'Show me',
  showTop: 'Back to the top',
  you: 'You',
  place: (n: number) => `#${formatNumber(n)}`,
  ofTotal: (n: number) => `of ${formatNumber(n)}`,
  notRated: 'Play a Ranked game to get your place.',
  /** A guest (no email yet) is never listed, however many games they've played. */
  guestBar: 'Guests aren’t listed. Sign up to get your place.',
  guestSignUp: 'Sign up',
  guestSheetTitle: 'Get your place',
  guestSheetText: (rated: boolean) =>
    rated
      ? 'Sign up with your email to appear on the leaderboard. Your Elo, Stardust and Daily progress come with you.'
      : 'Sign up with your email, then play Ranked to get your place. Your Stardust and Daily progress come with you.',
  hiddenBar: (place: number | null) => (place ? `You’re hidden. Your place would be #${formatNumber(place)}.` : 'You’re hidden from the leaderboard.'),
  restricted: 'Ranked is closed to you for now, so you aren’t listed.',
  notInView: {
    faction: 'Choose a faction to see your place here.',
    season: 'Play 20 Ranked games this season to get a place here.',
    friends: 'Play a Ranked game to compare with your friends.',
    global: 'Play a Ranked game to get your place.',
  } as Record<string, string>,
  empty: {
    friends: 'Follow players to compare with them here. Find them with the search above.',
    faction: 'Nobody in this faction has a place yet.',
    season: 'Nobody has played 20 Ranked games this season yet.',
    global: 'Nobody has a place yet.',
  } as Record<string, string>,
  loading: 'Loading the list…',
  meLoading: 'Finding your place…',
  offline: 'The leaderboard needs a connection.',
  retry: 'Try again',
  elo: 'Elo',
  /** The Season list: best Elo this season, from 20 Ranked games (decision D8). */
  seasonToGo: (left: number) => `${left} more Ranked ${left === 1 ? 'game' : 'games'} this season to get a place here.`,
  best: 'Best',
  a11yRow: (place: number, name: string, rank: string, elo: number) => `${place}. ${name}, ${rank}, ${elo} Elo`,
  a11ySeasonRow: (place: number, name: string, best: number) => `${place}. ${name}, best ${best} Elo this season`,

  // Search
  search: 'Find a player',
  searchPlaceholder: 'Find a player…',
  searching: 'Searching…',
  noResults: (q: string) => `No player matches “${q}”.`,
  a11yResults: (n: number) => (n === 1 ? '1 player found' : `${n} players found`),

  // The factions this month
  affinitiesOf: (month: string) => `Factions · ${month}`,
  daysLeft: (d: number) => (d <= 1 ? 'Last day' : `${d} days left`),
  /** The leader row's line under the name: how it stands, then the days left. */
  leading: (d: number) => `Leading · ${d <= 1 ? 'Last day' : `${d} days left`}`,
  level: (d: number) => `Tied · ${d <= 1 ? 'Last day' : `${d} days left`}`,
  nobody: (d: number) => `No influence yet · ${d <= 1 ? 'Last day' : `${d} days left`}`,
  tied: 'Tied',
  noLeader: 'No leader yet',
  /** In place of the bar while no side has influence. */
  emptyHint: 'Every square you solve this month adds influence to your faction.',
  prize: 'Everyone on the winning side with 5 or more squares this month gets a badge and 300 Stardust.',
  yours: (n: number, place: number, element: string) => `You: +${n} influence · ${ORDINAL(place)} in ${element}`,
  yoursNotYet: (n: number, element: string) => `You: ${n} more ${n === 1 ? 'square' : 'squares'} and you count for ${element}`,
  yoursNone: (element: string) => `You: no influence yet for ${element} this month`,
  /** Your side, when it isn't the one leading: its place and share. */
  yourSide: (element: string, place: number, pct: number) => `${element} is ${ORDINAL(place)}, at ${pct}%.`,
  joinIn: 'Choose a faction',
  /** Under the button, for players without a faction: the reason to join. */
  joinWhy: 'Solve 5 squares on the winning side for a badge and 300 Stardust.',
  a11yStrength: (parts: string) => `Strength this month: ${parts}`,
  details: 'Details',
  sheetTitle: (month: string) => `Factions in ${month}`,
  howWon: 'How it’s won',
  sheetIntro: 'Every square you solve adds influence to your faction. You count from your 5th square of the month, up to 300 influence each. The side with the most influence per player wins. Sides that tie all win.',
  barNote: 'The bar on the card shows each side’s influence per player, as a share of 100%.',
  members: (n: number) => (n === 1 ? '1 player' : `${n} players`),
  influence: (n: number) => `${formatNumber(n)} influence`,
  perPlayer: (n: number) => `${n} each`,
  topIn: (element: string) => `Top in ${element} this month`,
  topEmpty: 'Nobody yet.',
  /** One side, or every side that tied. */
  lastWinner: (elements: string[], month: string) =>
    `${month}: ${elements.length > 1 ? `${elements.slice(0, -1).join(', ')} and ${elements[elements.length - 1]}` : elements[0]} won`,

  // Ranks
  tiersTitle: 'Ranks',
  tiersIntro: 'Your Elo sets your rank. The share is of everyone with a place.',
  from: (n: number) => (n === 0 ? 'From the start' : `From ${n} Elo`),
  share: (pct: number) => `${pct}%`,
  a11yTier: (name: string, from: string, pct: number) => `${name}: ${from}, ${pct}% of players`,
  yourTier: 'Yours',

  errors: {
    slow_down: 'Lots of searches: wait a moment, then try again.',
    no_player: 'That player can’t be followed.',
    too_many_follows: 'You follow 500 players, the most.',
    not_owned: 'You don’t own that part.',
    bad_request: 'That isn’t allowed.',
  } as Record<string, string>,

  // The show-off card
  card: {
    peak: (n: number) => `Peak ${n}`,
    notRanked: 'Not ranked',
    stats: (solved: number, ranked: number) => `${formatNumber(solved)} solved · ${formatNumber(ranked)} Ranked`,
    follow: 'Follow',
    following: 'Following',
    a11yFollowing: (name: string) => `Following ${name}. Tap to stop following.`,
    followed: (name: string) => `You follow ${name}. They’re in your Friends list.`,
    unfollowed: (name: string) => `You stopped following ${name}.`,
    fullProfile: 'Full profile',
    showOnBoard: 'Show on the leaderboard',
    hidden: 'This player keeps their card private.',
    missing: 'This player can’t be found.',
    winBadge: (element: string, month: string) => `${element} won ${month}`,
    you: 'This is you',
    loading: 'Opening the card…',
  },
};

// Seasons and the faction month ending (migration cycles; plain, proud on a win, kind otherwise)

/** "Season Alpha", or "Season 1" for a season without a name yet. */
export const seasonName = (id: number, name?: string | null) => `Season ${name ?? id}`;

export const away = {
  title: 'While you were away',
  /** One line per season that ended. */
  season: (season: string, rank: string | null) =>
    rank ? `${season} ended. Your best rank: ${rank}.` : `${season} ended.`,
  seasonBadge: (badge: string) => `You earned the ${badge} badge.`,
  seasonElo: (before: number, after: number) => `Elo ${before} → ${after} for the new season.`,
  /** One line per faction month your side played. */
  monthWon: (month: string, side: string, badge: boolean) =>
    badge ? `${month}: ${side} won. You earned its badge and Stardust.` : `${month}: ${side} won.`,
  monthLost: (month: string, side: string) => `${month}: ${side} didn’t win. A new month has started.`,
  ok: 'Continue',
};

// Badges (badges.ts): earned now; the store and events later.
export const badges = {
  title: 'Badges',
  unknown: 'Badge',
  /** 'daily-2026-10': 20 Daily squares in October 2026. */
  daily: (month: string) => `Daily Square, ${month}`,
  /** 'season-0-adept': the best rank reached in Season Alpha (migration cycles). */
  season: (season: string, rank: string) => `${season} · ${rank}`,
  none: 'No badges yet. Solve 20 Daily squares in a month, or win a month with your faction, to earn one.',
  noneOther: 'No badges yet.',
  choose: 'Choose three',
  chooseTitle: 'Badges on your card',
  pick: 'Choose up to three. With none chosen, your newest three show.',
  save: 'Save',
  saved: 'Badges on your card saved.',
  count: (n: number) => (n === 1 ? '1 badge' : `${n} badges`),
  a11yPick: (name: string, chosen: boolean) => `${name}${chosen ? ', on your card' : ''}`,
  onCard: 'On your card',
};
// Setup > Leaderboard and card (screens/privacy.ts)
export const privacy = {
  title: 'Leaderboard and card',
  summary: 'What other players see.',
  open: 'Open',
  a11yOpen: 'Open leaderboard and card settings',
  intro: 'Choose what other players see. Your place is always visible to you.',
  group: 'What others see',
  listed: 'Show me on leaderboards',
  listedHelp: 'Off: you’re left out of every list and search, and nobody can follow you.',
  stats: 'Stats on my card',
  statsHelp: 'Squares solved and Ranked games played.',
  saved: 'Saved.',
  guest: 'Make an account to appear on the leaderboard.',
  /** Setup's row for a guest, in place of Open. */
  guestRow: 'Guests aren’t listed. Sign up in Account, at the top of Setup, to get your place and choose what your card shows.',
};
// --- Founder access (literal; screens/setup.ts) -------------------------------
// Review and Dev mode need a code from an authenticator app on top of the founder email.

export const founder = {
  title: 'Founder tools',
  lockedHelp: 'Founder tools need a code from your authenticator app, on top of your email.',
  setUp: 'Set up authenticator',
  unlock: 'Enter code',
  setUpTitle: 'Set up your authenticator',
  setUpSteps: 'Scan this with an authenticator app (Google Authenticator, 1Password, Authy…), or type the key in by hand. Then enter the 6-digit code it shows.',
  keyLabel: 'Key',
  a11yQr: 'QR code for your authenticator app',
  unlockTitle: 'Enter your code',
  unlockText: 'Open your authenticator app and enter the 6-digit code for Elomental.',
  codeLabel: '6-digit code',
  verify: 'Verify',
  unlocked: 'Founder tools unlocked for this session.',
  wrongCode: 'That code didn’t work. Check the time on your phone, then try the newest code.',
  offline: 'No connection. Try again in a moment.',
  errors: {
    expired: 'That code expired. Enter the newest one.',
  } as Record<string, string>,
  // Dev mode page: what founders did lately
  activity: 'Recent founder actions',
  activityHelp: 'Everything done in Dev mode and Review. Anything you don’t recognise: remove the authenticator in Supabase and sign out everywhere.',
  activityEmpty: 'Nothing yet.',
  actions: {
    dev_on: 'Dev mode on', dev_off: 'Dev mode off', fill: 'Filled up', empty: 'Emptied', unlock_all: 'Unlocked every part',
    clear_parts: 'Removed every part', plate: 'Name plate', level: 'Level', elo: 'Elo', next_drop: 'Next part', next_spirit: 'Next Spirit',
    forget_affinity: 'Forgot faction', show_founders: 'Founders shown', hide_founders: 'Founders hidden', review_clear: 'Review: cleared', review_restrict: 'Review: restricted', review_lift: 'Review: lifted',
    tester_add: 'Tester added', tester_remove: 'Tester removed',
  } as Record<string, string>,
};
// --- Founder tools (screens/founderConsole.ts; plain, literal) -----------------

export const founderConsole = {
  title: 'Founder tools',
  groups: { players: 'Players', account: 'My account', beta: 'Beta', activity: 'Activity' },
  sections: {
    open: 'To review', banned: 'Banned', history: 'History', search: 'Search',
    devmode: 'Dev mode', show: 'Show founders', tools: 'Stardust and parts', account: 'Account',
    testers: 'Testers', activity: 'Founder activity',
  } as Record<string, string>,
};

// --- Beta testers (founders on beta only; plain, literal) ---------------------
// screens/dev.ts: who may sign in on beta.elomental.online.

export const testers = {
  intro: 'Only these emails can sign in on beta. Founders always can.',
  addTitle: 'Add a tester',
  addHelp: 'They sign in on beta.elomental.online with this email and the code it gets.',
  add: 'Add',
  added: (email: string) => `${email} can sign in on beta now.`,
  listTitle: 'Testers',
  empty: 'No testers yet.',
  notJoined: 'Hasn’t signed in yet',
  lastSeen: (name: string | null, when: string) => (name ? `${name} · last signed in ${when}` : `Last signed in ${when}`),
  remove: 'Remove',
  a11yRemove: (email: string) => `Remove ${email}`,
  removeTitle: (email: string) => `Remove ${email}?`,
  removeText: 'They can’t sign in on beta any more, and their beta account and progress are deleted. Live isn’t touched.',
  removed: (email: string) => `${email} removed.`,
  loadFailed: 'Couldn’t load the testers. Try again.',
};

// --- Dev mode (founders only; plain, literal) --------------------------------
// screens/dev.ts: testing tools that change the founder's own account for real.

export const dev = {
  title: 'Dev mode',
  intro: 'Testing tools that change this account for real, so you can test every screen without grinding.',
  switchTitle: 'Dev mode',
  switchHelp: 'While it’s on, games show Solve now and Lose now, solves have no daily limit, and the Stardust and parts and Account tools work.',
  groups: { players: 'Leaderboard', resources: 'Stardust and Spirits', parts: 'Parts', next: 'Next solve', account: 'Account' },
  /** One switch for every founder account (they're test accounts, off the lists by default). */
  showFounders: 'Show founders to players',
  showFoundersHelp: 'On: founder accounts appear on the leaderboard, in search and on player cards, for everyone. They still earn no influence or month rewards. Elo and Stardust set with the dev tools show too.',
  foundersShown: 'Founders are on the leaderboard.',
  foundersHidden: 'Founders are hidden from players.',
  fill: 'Fill up: 999999 Stardust, 99 Spirits',
  empty: 'Empty both to 0',
  unlockAll: 'Unlock every part',
  clearParts: 'Remove every part',
  nextPart: 'Rarity of the next part',
  nextPartHelp: 'Your next solve brings a part of this rarity.',
  nextSpirit: 'Next solve brings a Spirit',
  elo: 'Elo',
  eloHelp: 'From 0 to 2000. Set it to see each rank and promotion.',
  setElo: 'Set Elo',
  level: 'Level',
  levelHelp: 'Sets your XP to that level’s and puts on its newest plate.',
  forgetAffinity: 'Forget my faction',
  forgetAffinityHelp: 'Your Profile asks you to choose again.',
  done: 'Done.',
  nextPartSet: (rarity: string) => `Your next solve brings a ${rarity} part.`,
  // in a game
  solveNow: 'Solve now',
  loseNow: 'Lose now',
  a11yBar: 'Dev mode tools',
};
// --- Review (founders only; neutral, no jokes) ------------------------------

export const review = {
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
  actions: { clear: 'Clear flags', banUntilLifted: 'Ban until lifted', ban30Instead: 'Ban 30 days instead', ban30: 'Ban from Ranked 30 days', lift: 'Lift ban' },
  confirm: {
    clear: (name: string) => `${name}’s flags are cleared, and any Ranked ban is lifted.`,
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
  verdict: { unchecked: 'Not checked', veryLikely: 'Very likely copied', likely: 'Likely copied', scripted: 'Likely scripted' },
  why: {
    unchecked: 'the app never sent its moves for checking, usually a dropped connection.',
    invalid: 'the square it reported was not a valid sudoku.',
    puzzle: 'the square it solved was not the one this game dealt.',
    timing: 'the moves came faster than a person places numbers, or after the game’s own clock.',
    tooQuick: 'it was solved in under a fifth of par on the server’s clock.',
    leaps: (leaps: number | null, placements: number | null) => `${leaps} of ${placements} cells were filled in before they could be worked out.`,
  },
  until: (day: string) => `until ${day}`,
  /** A ban with an end date, and how long it has to run. */
  untilDays: (day: string, days: number) => `until ${day}, ${plural(days, 'day')} left`,
  untilLifted: 'until lifted',
  decision: {
    clear: 'Flags cleared',
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
