import type { Difficulty } from '@elomental/engine';
import { fetchMyClashes, signedIn } from '../backend.ts';
import {
  CODE_LENGTH,
  difficultyOf,
  getClash,
  isValidCode,
  listClashes,
  newCode,
  normalizeCode,
  saveClash,
  seedOf,
  statusOf,
  takeLinkFromUrl,
  type ClashResult,
  type ClashStatus,
} from '../clash.ts';
import { clashTable, clashVerdict, shareButton } from '../clashView.ts';
import { pasteButton, routePaste } from '../clipboard.ts';
import { ICONS } from '../icons.ts';
import { closeButton, formatSeconds, h, openModal, toast } from '../ui.ts';
import { loadSavedGame, resumeGame, startGame } from './game.ts';
/**
 * Clash: join a friend's code, or make one. `prefill` comes from a shared
 * link; their result (if any) is already stored by then.
 */
export function openClash(leave: (go: () => void) => void, prefill = '') {
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
        input.pasteButton,
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
  routePaste(field, fill);
  return {
    el,
    value: () => normalizeCode(field.value),
    focus: () => field.focus(),
    pasteButton: pasteButton(fill, 'Paste blocked. Long-press the boxes instead.'),
  };
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
export function handleClashLink(leave: (go: () => void) => void) {
  const link = takeLinkFromUrl();
  if (!link) return;
  if (link.theirs) saveClash(link.code, { theirs: link.theirs });
  if (getClash(link.code).mine) showClashRecord(link.code);
  else openClash(leave, link.code);
}
