import type { Difficulty } from '@elomental/engine';
import { fetchClash, fetchMyClashes, signedIn } from '../backend.ts';
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
import * as copy from '../copy/en.ts';
/**
 * Clash: join a friend's code, or make one. `prefill` comes from a shared
 * link; their result (if any) is already stored by then.
 */
export function openClash(leave: (go: () => void) => void, prefill = '') {
  const saved = loadSavedGame('clash');
  const play = (code: string) => {
    const record = getClash(code);
    close();
    // Each code is played once: a finished clash shows the comparison instead.
    if (record.mine) return showClashRecord(code);
    leave(() => void startGame({ mode: 'clash', difficulty: difficultyOf(code), seed: seedOf(code), clash: { code, theirs: record.theirs } }));
  };

  // A typed code nobody has played yet may be a typo: say so once, and the second tap starts it.
  // A link's or a pasted code can't be mistyped, and a friend's fresh code is often unplayed.
  let unconfirmed: string | null = null;
  let pasted = '';
  const joinNote = h('p', { class: 'note clash-unknown', attrs: { 'aria-live': 'polite' } });
  const join = h('button', { class: 'btn btn-primary', text: copy.clash.join, attrs: { type: 'button' } });
  join.addEventListener('click', async () => {
    const code = input.value();
    const known = getClash(code);
    if (code === unconfirmed || code === pasted || code === normalizeCode(prefill) || known.theirs || known.mine || !signedIn()) return play(code);
    join.disabled = true;
    const entries = await fetchClash(code);
    join.disabled = false;
    // offline (null), or someone has played it: just go
    if (entries === null || entries.length) return play(code);
    unconfirmed = code;
    joinNote.textContent = copy.clash.unknownCode;
    join.textContent = copy.clash.joinAnyway;
  });
  const input = codeInput(prefill, (text) => (pasted = text), (code) => {
    join.disabled = !isValidCode(code);
    if (code !== unconfirmed) {
      unconfirmed = null;
      joinNote.textContent = '';
      join.textContent = copy.clash.join;
    }
  });

  const created = h('div', { class: 'clash-created' });
  const create = (difficulty: Difficulty) => {
    const code = newCode(difficulty);
    saveClash(code, {}); // listed in the log right away
    created.replaceChildren(
      h('p', { class: 'note', text: copy.clash.created(difficulty) }),
      h('div', { class: 'clash-code', attrs: { 'aria-label': copy.clash.a11y.code(code) } }, ...code.split('').map((ch) => h('span', { text: ch }))),
      h('div', { class: 'clash-actions' }, shareButton(code, undefined, copy.clash.shareCode, false), h('button', { class: 'btn btn-primary', text: copy.common.play, onclick: () => play(code) })),
    );
    // Once a code exists, the sheet is about that code only.
    sheet.classList.add('has-code');
  };
  const picker = h(
    'div',
    { class: 'clash-picker' },
    ...(['easy', 'medium', 'hard'] as const).map((d) =>
      h('button', { class: 'btn', text: copy.common.difficulty[d], attrs: { type: 'button' }, onclick: () => create(d) })),
  );
  // A wrong first choice is one tap away from undone, not a close-and-reopen (B12 UX).
  const backToChoice = () =>
    h('button', { class: 'link-btn clash-back', text: copy.common.back, attrs: { type: 'button' }, onclick: () => show('choose') });
  // Two jobs, one at a time: make a code for a friend, or join theirs (full review M20).
  const joinPart = h(
    'div',
    { class: 'clash-join' },
    h(
      'div',
      { class: 'clash-label-row' },
      h('label', { class: 'clash-label', text: copy.clash.enterCode }),
      // iOS's own long-press Paste is unreliable on a hidden field; this reads the clipboard directly.
      input.pasteButton,
    ),
    input.el,
    joinNote,
    join,
    prefill ? null : backToChoice(),
  );
  const createPart = h('div', { class: 'clash-create' }, h('p', { class: 'note', text: copy.clash.pickDifficulty }), picker, created, backToChoice());
  const choose = h(
    'div',
    { class: 'clash-choose' },
    h('button', { class: 'btn btn-primary', text: copy.clash.challengeFriend, attrs: { type: 'button' }, onclick: () => show('create') }),
    h('button', { class: 'btn', text: copy.clash.haveCode, attrs: { type: 'button' }, onclick: () => show('join') }),
  );
  const log =
    listClashes().length || signedIn()
      ? h('button', {
          class: 'btn btn-compact clash-log-btn',
          text: copy.clash.log,
          onclick: () => {
            close();
            openClashLog(leave);
          },
        })
      : null;
  const show = (part: 'choose' | 'join' | 'create', focus = true) => {
    choose.hidden = part !== 'choose';
    joinPart.hidden = part !== 'join';
    createPart.hidden = part !== 'create';
    // the log only beside the choice, so each step shows its own buttons alone
    if (log) log.hidden = part !== 'choose';
    // the keyboard only once the player says they have a code
    if (part === 'join' && focus) setTimeout(() => input.focus(), 60);
    if (part === 'create' && focus) createPart.querySelector('button')?.focus();
  };

  const resume = saved?.config.mode === 'clash' && saved.config.clash ? saved : null;
  const theirs = prefill ? getClash(prefill).theirs : undefined;
  const challenge = theirs
    ? h('p', {
        class: 'clash-challenge',
        text: theirs.solved
          ? copy.clash.challenge(formatSeconds(theirs.seconds), theirs.mistakes, theirs.hints)
          : copy.clash.challengeUnsolved,
      })
    : null;
  const sheet = h(
    'div',
    { class: 'sheet clash-sheet' },
    closeButton(() => close()),
    h('span', { class: 'sheet-icon clash', html: ICONS.clash }),
    h('h2', { text: copy.clash.title }),
    h('p', { text: copy.clash.intro }),
    challenge,
    resume
      ? h('button', {
          class: 'btn btn-primary clash-join',
          text: copy.clash.resume(resume.config.clash!.code),
          onclick: () => {
            close();
            leave(() => resumeGame(resume));
          },
        })
      : null,
    choose,
    joinPart,
    createPart,
    log,
  );
  const close = openModal(sheet);
  // a friend's link already holds the code: straight to joining it, without the keyboard
  show(prefill ? 'join' : 'choose', false);
}

/** Six boxes over one real text field: typing, backspace and paste all just work. */
function codeInput(initial: string, onPaste: (code: string) => void, onChange: (code: string) => void) {
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
      'aria-label': copy.clash.a11y.codeField,
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
    if (!code) return toast(copy.clash.noCodeOnClipboard);
    field.value = code;
    onPaste(code);
    paint();
  };
  // The system Paste (long-press) gets the same treatment as the button.
  routePaste(field, fill);
  return {
    el,
    value: () => normalizeCode(field.value),
    focus: () => field.focus(),
    pasteButton: pasteButton(fill, copy.clash.pasteBlocked),
  };
}

/**
 * The code in a pasted text: a link's ("…#clash=K7P2QX.6z…"), else a six-letter word made only of
 * code letters, in any case: the one after "code" if there is one, otherwise the last. A bare
 * code with a space or dash in it ("K7P 2QX") counts too. Never the first six letters of a whole
 * message (full review M8): '' when there's no code.
 */
function extractCode(text: string): string {
  const fromLink = text.match(/#clash=([A-Za-z0-9]{6})/)?.[1];
  if (fromLink) return normalizeCode(fromLink);
  const words = text.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const isCode = (w: string) => w.length === CODE_LENGTH && isValidCode(w.toUpperCase());
  const afterCode = words.findIndex((w, i) => i > 0 && /^code$/i.test(words[i - 1]) && isCode(w));
  if (afterCode >= 0) return words[afterCode].toUpperCase();
  const last = [...words].reverse().find(isCode);
  if (last) return last.toUpperCase();
  const bare = text.trim();
  return bare.length <= CODE_LENGTH + 2 && isValidCode(normalizeCode(bare)) ? normalizeCode(bare) : '';
}

const STATUS_LABEL: Record<ClashStatus, string> = copy.clash.status;

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
    const time = (r?: ClashResult) => (r ? (r.solved ? formatSeconds(r.seconds) : copy.clash.notFinished) : copy.clash.noTime);
    return h(
      'button',
      {
        class: 'log-row',
        attrs: { 'aria-label': copy.clash.a11y.logRow(code, record.difficulty, STATUS_LABEL[status]) },
        onclick: () => {
          close();
          if (record.mine) showClashRecord(code);
          else openClash(leave, code);
        },
      },
      h('span', { class: 'log-code' }, h('strong', { text: code }), h('small', { text: copy.capitalize(record.difficulty) })),
      h('span', { class: 'log-times', text: copy.clash.versus(time(record.mine), time(record.theirs)) }),
      h('span', { class: `log-status ${status}`, text: STATUS_LABEL[status] }),
    );
  };
  const close = openModal(
    h(
      'div',
      { class: 'sheet clash-log' },
      closeButton(() => close()),
      h('h2', { text: copy.clash.log }),
      h('p', {
        class: 'note',
        text: signedIn()
          ? copy.clash.logNoteOnline
          : copy.clash.logNoteOffline,
      }),
      entries.length
        ? h('div', { class: 'log-list' }, ...entries.map(row))
        : h('p', { class: 'note', text: copy.clash.logEmpty }),
    ),
  );
}

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
        : h('p', { class: 'note', text: signedIn() ? copy.clash.waitingForFriendOnline : copy.clash.waitingForFriend }),
      clashTable(code, record.mine, record.theirs),
      h('div', { class: 'actions' }, shareButton(code, record.mine, record.theirs ? copy.clash.sendResult : copy.clash.challengeFriend), h('button', { class: 'btn', text: copy.common.close, onclick: () => close() })),
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
