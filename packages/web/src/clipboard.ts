import { h, toast } from './ui.ts';
import * as copy from './copy/en.ts';

/**
 * Copying and pasting codes (Clash codes, square codes, share links).
 * Browsers only allow it in reply to a tap, and some don't offer it at all
 * (no clipboard API outside https), so every helper says what happened.
 */

/** Copies `text`: true when copied, false when the browser refused, null when it has no clipboard. */
export async function copyText(text: string): Promise<boolean | null> {
  if (!navigator.clipboard) return null;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * A field's own paste (long-press Paste, Ctrl+V) goes through `fill` instead,
 * which picks the code out of whatever was pasted (a whole message, a link).
 */
export function routePaste(field: HTMLInputElement, fill: (text: string) => void): void {
  field.addEventListener('paste', (event) => {
    const text = event.clipboardData?.getData('text');
    if (text == null) return;
    event.preventDefault();
    fill(text);
  });
}

/**
 * A "Paste" button that reads the clipboard into `fill`: iOS's own long-press
 * Paste is unreliable on some fields. Null where the browser can't read the
 * clipboard; `blocked` is shown when the player declines.
 */
export function pasteButton(fill: (text: string) => void, blocked: string): HTMLButtonElement | null {
  if (!('readText' in (navigator.clipboard ?? {}))) return null;
  return h('button', {
    class: 'btn btn-compact paste-btn',
    text: copy.common.paste,
    onclick: async () => {
      try {
        fill(await navigator.clipboard.readText());
      } catch {
        toast(blocked);
      }
    },
  });
}
