import { h } from './ui.ts';

/**
 * The settings pages' building blocks (Setup, Accessibility, Leaderboard and card, Dev mode):
 * a row of options, a titled choice, and a titled group of choices. One copy each, so the
 * pages look and behave alike (styles.css: .segmented, .choice, .setting-group).
 */

interface SegmentOption<T> {
  value: T;
  label: string;
  /** An icon drawn before the label (SVG markup, decorative). */
  icon?: string;
}

export interface Segmented {
  el: HTMLElement;
  /** Marks the current value again (after a change made elsewhere, such as another device). */
  paint: () => void;
}

/**
 * A radio group of segments, the current one marked .on and aria-checked. Picking one calls
 * `pick`, then marks the current value again (after `pick`'s promise, if it returns one).
 * Named by `labelledBy` (the id of its title) or `label`. `cols` adds the cols-N class.
 */
export function segmented<T>(opts: {
  options: SegmentOption<T>[];
  current: () => T;
  pick: (value: T) => void | Promise<unknown>;
  labelledBy?: string;
  label?: string;
  cols?: boolean;
}): Segmented {
  const buttons = opts.options.map((o) =>
    h(
      'button',
      {
        class: 'segment',
        text: o.icon ? undefined : o.label,
        attrs: { role: 'radio', type: 'button' },
        onclick: () => {
          const done = opts.pick(o.value);
          if (done instanceof Promise) void done.then(paint);
          else paint();
        },
      },
      o.icon ? h('span', { class: 'segment-icon', html: o.icon }) : null,
      o.icon ? h('span', { text: o.label }) : null,
    ),
  );
  const paint = () => {
    const now = opts.current();
    buttons.forEach((b, i) => {
      const on = opts.options[i].value === now;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
  };
  paint();
  const name: Record<string, string> = opts.labelledBy ? { 'aria-labelledby': opts.labelledBy } : opts.label ? { 'aria-label': opts.label } : {};
  const el = h('div', { class: opts.cols ? `segmented cols-${buttons.length}` : 'segmented', attrs: { role: 'radiogroup', ...name } }, ...buttons);
  return { el, paint };
}

/** One choice in a group: its title (with `id`, for the control to point at), a help line, then its controls. */
export const choice = (id: string, title: string, help: string | null, ...controls: HTMLElement[]): HTMLElement =>
  h('div', { class: 'choice' }, h('h3', { text: title, attrs: { id } }), help ? h('p', { text: help }) : null, ...controls);

/** A titled group: a small title over one card (a framed panel) holding its choices. `card` is the card's class. */
export const settingGroup = (title: string, items: (HTMLElement | null)[], card = 'setting choice-list'): HTMLElement =>
  h('section', { class: 'setting-group' }, h('h2', { text: title }), h('div', { class: `panel ${card}` }, ...items));
