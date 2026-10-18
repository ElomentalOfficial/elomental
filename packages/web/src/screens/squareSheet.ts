import { fetchSquare } from '../backend.ts';
import { pasteButton, routePaste } from '../clipboard.ts';
import { ICONS } from '../icons.ts';
import { formatSquareCode, readSquareInput } from '../squareCode.ts';
import { closeButton, h, openModal } from '../ui.ts';
import { startGame } from './game.ts';
/**
 * Square code: play the exact square a friend sent (their code, or a standard
 * 81-digit sudoku string from anywhere). It plays as Casual, at the square's
 * own difficulty.
 */
export function openSquareCode(leave: (go: () => void) => void) {
  let busy = false;
  const field = h('input', {
    class: 'text-field square-field',
    attrs: {
      type: 'text',
      placeholder: 'K7P2-QX9M',
      autocapitalize: 'characters',
      autocomplete: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      enterkeyhint: 'go',
      'aria-label': 'Square code or 81-digit sudoku',
    },
  });
  const status = h('p', { class: 'note square-status', attrs: { role: 'status' } });
  const play = h('button', { class: 'btn btn-primary', text: 'Play square' });

  /** `typed`: the field changed, so the line under it describes the new input. */
  const update = (typed = true) => {
    const input = readSquareInput(field.value);
    play.disabled = busy || input.kind === 'partial';
    if (!typed) return;
    status.textContent =
      input.kind === 'grid' ? `Sudoku string with ${input.givens.replace(/0/g, '').length} numbers.` : '';
  };
  const fill = (text: string) => {
    const input = readSquareInput(text);
    field.value = input.kind === 'code' ? formatSquareCode(input.code) : input.kind === 'grid' ? input.givens : text.trim();
    update();
  };
  field.addEventListener('input', () => update());
  // A pasted message is cut down to the code (or the grid) it carries.
  routePaste(field, fill);
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !play.disabled) play.click();
  });

  play.addEventListener('click', async () => {
    const input = readSquareInput(field.value);
    if (input.kind === 'partial' || busy) return;
    if (input.kind === 'grid') {
      close();
      leave(() => void startGame({ mode: 'casual', difficulty: 'easy', square: { givens: input.givens } }));
      return;
    }
    busy = true;
    update(false);
    status.textContent = 'Finding the square…';
    try {
      const square = await fetchSquare(input.code);
      if (!square) {
        status.textContent = 'No square has that code. Check it with your friend.';
        return;
      }
      close();
      leave(() => void startGame({ mode: 'casual', difficulty: square.difficulty, square: { givens: square.givens, code: square.code } }));
    } catch (error) {
      status.textContent = (error as Error).message;
    } finally {
      busy = false;
      if (play.isConnected) update(false);
    }
  });

  const close = openModal(
    h(
      'div',
      { class: 'sheet square-sheet' },
      closeButton(() => close()),
      h('span', { class: 'sheet-icon clash', html: ICONS.hash }),
      h('h2', { text: 'Square code' }),
      h('p', { text: 'Play the exact square a friend sent you. Every game shows its code at the top.' }),
      h(
        'div',
        { class: 'clash-label-row' },
        h('label', { class: 'clash-label', text: 'Code or sudoku string' }),
        pasteButton(fill, 'Paste blocked. Long-press the box instead.'),
      ),
      field,
      status,
      play,
    ),
  );
  update();
  setTimeout(() => field.focus(), 260);
}

