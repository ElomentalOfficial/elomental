import { readJson, writeJson } from './storage.ts';

const NOTES_WHEEL_KEY = 'elomental:notes-wheel';

/** The long-press notes wheel is on by default; off swaps it for a Notes button under the keypad. */
export function notesWheelOn(): boolean {
  return readJson<boolean>(NOTES_WHEEL_KEY) !== false;
}

export function setNotesWheel(on: boolean): void {
  writeJson(NOTES_WHEEL_KEY, on);
}
