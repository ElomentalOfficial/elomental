/**
 * Add to Home Screen. Elomental is already installable (manifest, the iOS
 * meta tags); this only tells phone players they can. Android Chrome offers
 * its own install prompt, kept here for our button; iOS has no prompt, so
 * we show the Share steps. Nothing shows once it runs from the home screen.
 */
import { ICONS } from './icons.ts';
import { readJson, writeJson } from './storage.ts';
import { tutorialDone } from './tutorial.ts';
import { closeButton, h, openModal, toast } from './ui.ts';
import * as copy from './copy/en.ts';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;

/** Keeps Chrome's install prompt for our own button instead of its banner. */
export function installAddToHome(): void {
  addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    writeJson(NOTE_KEY, NOTE_DONE);
  });
}

/** Running from the home screen (index.html sets the class). */
const installed = () => document.documentElement.classList.contains('standalone') || matchMedia('(display-mode: standalone)').matches;
/** Phones and tablets: a touch screen without a mouse. */
const touchDevice = () => matchMedia('(pointer: coarse)').matches;
const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

/** Worth suggesting here: a phone or tablet, not yet on its home screen. */
export const canAddToHome = (): boolean => !installed() && touchDevice();

/** Android's one-tap install when the browser offers it, otherwise the steps for this phone. */
export async function addToHome(): Promise<void> {
  if (deferred) {
    const prompt = deferred;
    deferred = null;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') toast(copy.install.added);
    return;
  }
  showSteps();
}

/** The Share/menu steps for this phone, as a numbered list. */
function stepsList(): HTMLElement {
  const t = copy.install;
  const steps = ios() ? t.stepsIos : t.stepsAndroid;
  return h('ol', { class: 'install-steps' }, ...steps.map((step, i) => h('li', {}, h('span', { class: 'install-step-num', text: String(i + 1) }), h('span', { text: step }))));
}

function showSteps(): void {
  const t = copy.install;
  let close = () => {};
  const content = h(
    'div',
    { class: 'install-sheet' },
    closeButton(() => close()),
    h('span', { class: 'install-icon', html: ICONS.phone }),
    h('h2', { text: t.title }),
    h('p', { text: t.why }),
    stepsList(),
    h('button', { class: 'btn', text: t.done, onclick: () => close() }),
  );
  close = openModal(content);
}

/*
 * The note on Home: once the player has finished the tutorial game, until
 * they close it or follow it, and at most a few visits so it never nags.
 */
const NOTE_KEY = 'elomental:install-note';
const NOTE_DONE = -1;
const NOTE_VISITS = 5;

const noteVisits = () => readJson<number>(NOTE_KEY) ?? 0;

/** Home keeps the note only where it fits (a short screen has no room for it); then it counts as a visit. */
export function countNoteVisit(): void {
  writeJson(NOTE_KEY, noteVisits() + 1);
}

export function addToHomeNote(): HTMLElement | null {
  const seen = noteVisits();
  if (seen === NOTE_DONE || seen >= NOTE_VISITS || !canAddToHome() || !tutorialDone()) return null;
  const done = () => {
    writeJson(NOTE_KEY, NOTE_DONE);
    note.remove();
  };
  const note = noteRow(
    () => {
      done();
      void addToHome();
    },
    done,
  );
  return note;
}

/** One quiet row: phone icon, the line, How, and ✕. */
function noteRow(onHow: () => void, onClose: () => void): HTMLElement {
  const t = copy.install;
  return h(
    'div',
    { class: 'install-note', attrs: { role: 'note' } },
    h('span', { class: 'install-note-icon', html: ICONS.phone }),
    h('span', { class: 'install-note-text', text: t.note }),
    h('button', { class: 'install-note-how', text: t.how, attrs: { 'aria-label': t.howLabel }, onclick: onHow }),
    h('button', { class: 'install-note-close', html: ICONS.close, attrs: { 'aria-label': t.closeNote }, onclick: onClose }),
  );
}

/*
 * The same note in the result pop-up, for phones where Home has no room for it: after
 * the first solved square (any mode), then every 5th solve (6th, 11th, …), until
 * Elomental runs from the home screen. ✕ hides it for this result only.
 */
const SOLVES_KEY = 'elomental:install-solves';
const SOLVES_EVERY = 5;

export function addToHomeResultNote(won: boolean): HTMLElement | null {
  if (!won || !canAddToHome()) return null;
  const solves = (readJson<number>(SOLVES_KEY) ?? 0) + 1;
  writeJson(SOLVES_KEY, solves);
  if ((solves - 1) % SOLVES_EVERY !== 0) return null;
  const box = h('div', { class: 'install-result' });
  const row = noteRow(
    () => {
      // A pop-up never opens another: Android's own prompt, or the steps right here.
      if (deferred) return void addToHome().then(() => box.remove());
      const title = h('p', { class: 'install-result-title', text: copy.install.why, attrs: { tabindex: '-1' } });
      row.replaceWith(title, stepsList());
      title.focus(); // the How button is gone: keep focus in the pop-up, on what replaced it
    },
    () => box.remove(),
  );
  box.append(row);
  return box;
}
