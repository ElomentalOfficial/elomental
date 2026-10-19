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

function showSteps(): void {
  const t = copy.install;
  const steps = ios() ? t.stepsIos : t.stepsAndroid;
  let close = () => {};
  const content = h(
    'div',
    { class: 'install-sheet' },
    closeButton(() => close()),
    h('span', { class: 'install-icon', html: ICONS.phone }),
    h('h2', { text: t.title }),
    h('p', { text: t.why }),
    h('ol', { class: 'install-steps' }, ...steps.map((step, i) => h('li', {}, h('span', { class: 'install-step-num', text: String(i + 1) }), h('span', { text: step })))),
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
  const t = copy.install;
  const done = () => {
    writeJson(NOTE_KEY, NOTE_DONE);
    note.remove();
  };
  const note = h(
    'div',
    { class: 'install-note', attrs: { role: 'note' } },
    h('span', { class: 'install-note-icon', html: ICONS.phone }),
    h('span', { class: 'install-note-text', text: t.note }),
    h('button', {
      class: 'install-note-how',
      text: t.how,
      attrs: { 'aria-label': t.howLabel },
      onclick: () => {
        done();
        void addToHome();
      },
    }),
    h('button', { class: 'install-note-close', html: ICONS.close, attrs: { 'aria-label': t.closeNote }, onclick: done }),
  );
  return note;
}
