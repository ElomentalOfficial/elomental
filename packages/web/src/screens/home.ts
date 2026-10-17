import { difficultyForRating, type Difficulty } from '@elomental/engine';
import { ICONS } from '../icons.ts';
import { enableTilt, turnstileIn, turnstileOut } from '../motion.ts';
import { loadProfile, rankTitle, rankedTarget } from '../profile.ts';
import { h, mount, navigatingBack, openModal, toast, type Screen } from '../ui.ts';
import {
  CODE_LENGTH,
  difficultyOf,
  formatSeconds,
  getClash,
  isValidCode,
  listClashes,
  newCode,
  statusOf,
  type ClashResult,
  type ClashStatus,
  normalizeCode,
  saveClash,
  seedOf,
  takeLinkFromUrl,
} from '../clash.ts';
import { clashTable, clashVerdict, shareButton } from '../clashView.ts';
import { handleHandoffLink } from '../handoff.ts';
import { fetchMyClashes, onAccountChange, refreshAccount, signedIn } from '../backend.ts';
import { dailyScreen } from './daily.ts';
import { loadSavedGame, resumeGame, startGame } from './game.ts';
import { setupScreen } from './setup.ts';

/** Layout from the Figma home frame: profile card with the Setup notch, then the mode tiles. */
export function homeScreen(): Screen {
  const profile = loadProfile();
  let leaving = false;

  /** Play the turnstile-out with `from` last, then run `then`. */
  const leave = async (from: HTMLElement, then: () => void) => {
    if (leaving) return;
    leaving = true;
    await turnstileOut(grid, animated, from);
    then();
  };

  function tile(area: string, icon: string, label: string, onTap: (el: HTMLElement) => void, ...extra: (HTMLElement | null)[]) {
    const face = h('span', { class: 'tile-face' }, h('span', { class: 'tile-icon', html: icon }), h('span', { class: 'tile-label', text: label }));
    const el = h('button', { class: `tile area-${area}` }, face, ...extra);
    el.addEventListener('click', () => onTap(el));
    enableTilt(el);
    return el;
  }

  const setupTile = h(
    'button',
    { class: 'tile tile-setup' },
    h('span', { class: 'tile-face' }, h('span', { class: 'tile-icon', html: ICONS.setup }), h('span', { class: 'tile-label', text: 'Setup' })),
  );
  enableTilt(setupTile);

  const nameEl = h('strong', { class: 'profile-name' });
  const rankEl = h('span', { class: 'profile-rank' });
  const eloChip = stat('', 'Elo');
  const dustChip = stat('', 'Stardust', ICONS.dust);
  const crownChip = stat('', 'Crowns', ICONS.crown);
  /** Signed in, the numbers come from the server cache and update when it refreshes. */
  const paintProfile = () => {
    const p = loadProfile();
    nameEl.textContent = p.name;
    rankEl.textContent = p.title ?? rankTitle(p.elo);
    eloChip.querySelector('strong')!.textContent = String(p.elo);
    dustChip.querySelector('strong')!.textContent = String(p.dust);
    crownChip.querySelector('strong')!.textContent = String(p.crowns);
  };
  paintProfile();
  const stopProfile = onAccountChange(paintProfile);
  if (signedIn()) void refreshAccount();

  const profileCard = h(
    'section',
    { class: 'profile-card area-profile' },
    h(
      'div',
      { class: 'profile-main' },
      h('span', { class: 'avatar' }),
      nameEl,
      rankEl,
    ),
    h('div', { class: 'profile-stats' }, eloChip, dustChip, crownChip),
    h('div', { class: 'setup-notch' }, setupTile),
  );
  setupTile.addEventListener('click', () => leave(profileCard, () => mount(setupScreen())));

  const daily = tile('daily', ICONS.daily, 'Daily Square', (el) => leave(el, () => mount(dailyScreen())));
  const store = tile('store', ICONS.store, 'Store', () => toast('The store opens later'));
  const leader = tile('leader', ICONS.leaderboard, 'Leaderboard', () => toast('Leaderboards need accounts'));
  const casual = tile('casual', ICONS.casual, 'Casual', (el) => openCasual((go) => leave(el, go)));
  const ranked = tile('ranked', ICONS.ranked, 'Play Ranked', (el) => openRanked((go) => leave(el, go)));

  const animated = [profileCard, daily, store, leader, casual, ranked];
  const grid = h('div', { class: 'home-grid' }, ...animated);
  const el = h('div', { class: 'screen home' }, grid);

  // Runs before the first paint of the new screen, so tiles never flash in place.
  const backward = navigatingBack();
  requestAnimationFrame(() => turnstileIn(grid, animated, backward));
  setTimeout(() => handleClashLink((go) => leave(casual, go)), 420);
  setTimeout(() => void handleHandoffLink(), 420);

  return { el, destroy: stopProfile };
}

function stat(value: string, label: string, icon?: string): HTMLElement {
  return h(
    'div',
    { class: 'stat-chip' },
    icon ? h('span', { class: 'stat-icon', html: icon }) : null,
    h('strong', { text: value }),
    h('span', { text: label }),
  );
}

/** `leave` plays the home exit animation before the game screen takes over. */
function openCasual(leave: (go: () => void) => void) {
  const saved = loadSavedGame();
  const choose = (difficulty: Difficulty) => {
    close();
    leave(() => void startGame({ mode: 'casual', difficulty }));
  };
  const close = openModal(
    h(
      'div',
      { class: 'sheet' },
      closeButton(() => close()),
      h('span', { class: 'sheet-icon casual', html: ICONS.casual }),
      h('h2', { text: 'Casual' }),
      h('p', { text: 'No pressure, no elo.' }),
      saved?.config.mode === 'casual'
        ? h('button', {
            class: 'btn btn-primary',
            text: `Resume ${saved.config.difficulty}`,
            onclick: () => {
              close();
              leave(() => resumeGame(saved));
            },
          })
        : null,
      h('button', { class: 'btn', text: 'Easy', onclick: () => choose('easy') }),
      h('button', { class: 'btn', text: 'Medium', onclick: () => choose('medium') }),
      h('button', { class: 'btn', text: 'Hard', onclick: () => choose('hard') }),
      h('button', {
        class: 'btn btn-clash',
        html: `${ICONS.clash}<span>Clash a friend</span>`,
        onclick: () => {
          close();
          openClash(leave);
        },
      }),
    ),
  );
}

/**
 * Clash: join a friend's code, or make one. `prefill` comes from a shared
 * link; their result (if any) is already stored by then.
 */
function openClash(leave: (go: () => void) => void, prefill = '') {
  const saved = loadSavedGame();
  const play = (code: string) => {
    const record = getClash(code);
    close();
    // Each code is played once: a finished clash shows the comparison instead.
    if (record.mine) return showClashRecord(code);
    leave(() => void startGame({ mode: 'clash', difficulty: difficultyOf(code), seed: seedOf(code), clash: { code, theirs: record.theirs } }));
  };

  const join = h('button', { class: 'btn btn-primary', text: 'Join clash', onclick: () => play(input.value()) });
  const input = codeInput(prefill, (code) => {
    join.disabled = !isValidCode(code);
  });

  const created = h('div', { class: 'clash-created' });
  const create = (difficulty: Difficulty) => {
    const code = newCode(difficulty);
    saveClash(code, {}); // listed in the log right away
    created.replaceChildren(
      h('p', { class: 'note', text: `Your ${difficulty} code. Send it now or after you play: your time goes with the result.` }),
      h('div', { class: 'clash-code', attrs: { 'aria-label': `Code ${code.split('').join(' ')}` } }, ...code.split('').map((ch) => h('span', { text: ch }))),
      h('div', { class: 'clash-actions' }, shareButton(code, undefined, 'Share code', false), h('button', { class: 'btn btn-primary', text: 'Play', onclick: () => play(code) })),
    );
    // Once a code exists, the sheet is about that code only.
    sheet.classList.add('has-code');
  };
  const picker = h(
    'div',
    { class: 'clash-picker' },
    h('button', { class: 'btn', text: 'Easy', onclick: () => create('easy') }),
    h('button', { class: 'btn', text: 'Medium', onclick: () => create('medium') }),
    h('button', { class: 'btn', text: 'Hard', onclick: () => create('hard') }),
  );

  const resume = saved?.config.mode === 'clash' && saved.config.clash ? saved : null;
  const theirs = prefill ? getClash(prefill).theirs : undefined;
  const challenge = theirs
    ? h('p', {
        class: 'clash-challenge',
        text: theirs.solved
          ? `Your friend set ${formatSeconds(theirs.seconds)} with ${theirs.mistakes} mistake${theirs.mistakes === 1 ? '' : 's'} and ${theirs.hints} hint${theirs.hints === 1 ? '' : 's'}. Beat it.`
          : "Your friend couldn't crack this one. Can you?",
      })
    : null;
  const sheet = h(
    'div',
    { class: 'sheet clash-sheet' },
    closeButton(() => close()),
    h('span', { class: 'sheet-icon clash', html: ICONS.clash }),
    h('h2', { text: 'Clash' }),
    h('p', { text: 'Race a friend on the same square. Lowest time wins; hints and mistakes add seconds.' }),
    challenge,
    resume
      ? h('button', {
          class: 'btn btn-primary clash-join',
          text: `Resume ${resume.config.clash!.code}`,
          onclick: () => {
            close();
            leave(() => resumeGame(resume));
          },
        })
      : null,
    h(
      'div',
      { class: 'clash-join' },
      h(
        'div',
        { class: 'clash-label-row' },
        h('label', { class: 'clash-label', text: 'Enter a code' }),
        // iOS's own long-press Paste is unreliable on a hidden field; this reads the clipboard directly.
        'readText' in (navigator.clipboard ?? {}) ? h('button', { class: 'paste-btn', text: 'Paste', onclick: () => void input.paste() }) : null,
      ),
      input.el,
      join,
    ),
    h('div', { class: 'divider', text: 'or create one' }),
    picker,
    created,
    listClashes().length || signedIn()
      ? h('button', {
          class: 'btn clash-log-btn',
          text: 'Clash log',
          onclick: () => {
            close();
            openClashLog(leave);
          },
        })
      : null,
  );
  const close = openModal(sheet);
  if (!prefill) setTimeout(() => input.focus(), 260);
}

/** Six boxes over one real text field: typing, backspace and paste all just work. */
function codeInput(initial: string, onChange: (code: string) => void) {
  const field = h('input', {
    class: 'code-field',
    attrs: {
      type: 'text',
      inputmode: 'text',
      autocomplete: 'one-time-code',
      autocapitalize: 'characters',
      autocorrect: 'off',
      spellcheck: 'false',
      maxlength: '12',
      'aria-label': 'Clash code, 6 characters',
    },
  });
  const boxes = Array.from({ length: CODE_LENGTH }, () => h('span', { class: 'code-box' }));
  const el = h('div', { class: 'code-input' }, ...boxes, field);
  const paint = () => {
    const code = normalizeCode(field.value);
    if (field.value !== code) field.value = code;
    const focused = document.activeElement === field;
    boxes.forEach((box, i) => {
      box.textContent = code[i] ?? '';
      box.classList.toggle('active', focused && i === Math.min(code.length, CODE_LENGTH - 1));
      box.classList.toggle('filled', i < code.length);
    });
    onChange(code);
  };
  field.value = normalizeCode(initial);
  field.addEventListener('input', paint);
  field.addEventListener('focus', paint);
  field.addEventListener('blur', paint);
  // Keep the caret at the end so backspace always removes the last character.
  field.addEventListener('click', () => field.setSelectionRange(field.value.length, field.value.length));
  paint();
  const fill = (text: string) => {
    const code = extractCode(text);
    if (!code) return toast('No code on the clipboard');
    field.value = code;
    paint();
  };
  // The system Paste (long-press) gets the same treatment as the button.
  field.addEventListener('paste', (event) => {
    const text = event.clipboardData?.getData('text');
    if (text == null) return;
    event.preventDefault();
    fill(text);
  });
  const paste = async () => {
    try {
      fill(await navigator.clipboard.readText());
    } catch {
      toast('Paste blocked. Long-press the boxes instead.');
    }
  };
  return { el, value: () => normalizeCode(field.value), focus: () => field.focus(), paste };
}

/** A bare code, or the code inside a whole shared message/link ("…#clash=K7P2QX.6z…"). */
function extractCode(text: string): string {
  const fromLink = text.match(/#clash=([A-Za-z0-9]{6})/)?.[1];
  const upperWord = text.match(/\b[A-Z0-9]{6}\b/)?.[0];
  return normalizeCode(fromLink ?? upperWord ?? text);
}

const STATUS_LABEL: Record<ClashStatus, string> = {
  won: 'Won',
  lost: 'Lost',
  draw: 'Draw',
  waiting: 'Waiting',
  unplayed: 'Not played',
};

/** Signed in: copies every clash this account played (and the friends' results) from the server. */
async function syncClashes(): Promise<void> {
  if (!signedIn()) return;
  const clashes = await fetchMyClashes();
  if (!clashes) return;
  for (const [code, { difficulty, updated, entries }] of clashes) {
    saveClash(code, {
      difficulty,
      updated,
      mine: entries.find((e) => e.isMe)?.result,
      theirs: entries.find((e) => !e.isMe)?.result,
    });
  }
}

/**
 * Every clash on this device, newest first: who won, or what it is waiting
 * for. Tapping one opens its comparison (or starts it, if not played yet).
 */
async function openClashLog(leave: (go: () => void) => void) {
  await syncClashes();
  const entries = listClashes().slice(0, 8);
  const row = ({ code, record }: (typeof entries)[number]) => {
    const status = statusOf(record);
    const time = (r?: ClashResult) => (r ? (r.solved ? formatSeconds(r.seconds) : 'DNF') : '—');
    return h(
      'button',
      {
        class: 'log-row',
        attrs: { 'aria-label': `Clash ${code}, ${record.difficulty}, ${STATUS_LABEL[status]}` },
        onclick: () => {
          close();
          if (record.mine) showClashRecord(code);
          else openClash(leave, code);
        },
      },
      h('span', { class: 'log-code' }, h('strong', { text: code }), h('small', { text: capitalize(record.difficulty) })),
      h('span', { class: 'log-times', text: `${time(record.mine)} vs ${time(record.theirs)}` }),
      h('span', { class: `log-status ${status}`, text: STATUS_LABEL[status] }),
    );
  };
  const close = openModal(
    h(
      'div',
      { class: 'sheet clash-log' },
      closeButton(() => close()),
      h('h2', { text: 'Clash log' }),
      h('p', {
        class: 'note',
        text: signedIn()
          ? "You vs friend. Results arrive on their own once your friend finishes (they need an account too)."
          : 'You vs friend. A result appears once its link is opened on this phone. Sign in (Setup) to get results automatically.',
      }),
      entries.length
        ? h('div', { class: 'log-list' }, ...entries.map(row))
        : h('p', { class: 'note', text: 'No clashes yet. Create a code and send it to a friend.' }),
    ),
  );
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

/** The comparison for a clash this device has already played. */
async function showClashRecord(code: string) {
  await syncClashes();
  const record = getClash(code);
  if (!record.mine) return;
  const verdict = clashVerdict(record.mine, record.theirs);
  const close = openModal(
    h(
      'div',
      { class: 'result clash-result' },
      h('h2', { class: verdict.tone, text: verdict.title }),
      record.theirs
        ? null
        : h('p', { class: 'note', text: "Waiting for your friend's result. Open the result link they send you and it lands here." }),
      clashTable(code, record.mine, record.theirs),
      h('div', { class: 'actions' }, shareButton(code, record.mine, record.theirs ? 'Send result' : 'Challenge a friend'), h('button', { class: 'btn', text: 'Close', onclick: () => close() })),
    ),
  );
}

/** A `#clash=` link: store the friend's result, then show the duel or the join sheet. */
function handleClashLink(leave: (go: () => void) => void) {
  const link = takeLinkFromUrl();
  if (!link) return;
  if (link.theirs) saveClash(link.code, { theirs: link.theirs });
  if (getClash(link.code).mine) showClashRecord(link.code);
  else openClash(leave, link.code);
}

function openRanked(leave: (go: () => void) => void) {
  const saved = loadSavedGame();
  if (saved?.config.mode === 'ranked') return leave(() => resumeGame(saved));
  const profile = loadProfile();
  const difficulty = difficultyForRating(rankedTarget(profile.elo));
  const close = openModal(
    h(
      'div',
      { class: 'sheet' },
      closeButton(() => close()),
      h('span', { class: 'sheet-icon ranked', html: ICONS.ranked }),
      h('h2', { text: 'Ranked' }),
      h('p', { class: 'ranked-copy', text: 'A square matched to your level. Solve it to climb.' }),
      h('button', {
        class: 'btn btn-primary btn-start',
        text: 'Start',
        onclick: () => {
          close();
          leave(() => void startGame({ mode: 'ranked', difficulty }));
        },
      }),
    ),
  );
}

export function closeButton(onClose: () => void): HTMLElement {
  return h('button', { class: 'close-btn', html: ICONS.close, attrs: { 'aria-label': 'Close' }, onclick: onClose });
}
