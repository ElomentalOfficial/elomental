/**
 * Icons approximating the Figma set. Cut-outs use `fill-rule="evenodd"` so
 * they show whatever is behind the icon, which keeps them right in both themes.
 */

const stroke = (body: string, width = 1.8) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const fill = (d: string) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="${d}"/></svg>`;

function gearPath(): string {
  const teeth = 8;
  const points: string[] = [];
  for (let i = 0; i < teeth * 4; i++) {
    const angle = (i / (teeth * 4)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 4 < 2 ? 11 : 8;
    points.push(`${(12 + r * Math.cos(angle)).toFixed(2)} ${(12 + r * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${points.join('L')}Z M15 12a3 3 0 1 0-6 0a3 3 0 1 0 6 0Z`;
}

export const ICONS = {
  gear: fill(gearPath()),
  gem: fill('M1.5 8.6 5.6 3.5h12.8l4.1 5.1L12 20.5Z M6.6 9.2h10.8L12 15.2Z'),
  burst: fill('M9.8 21 1.8 13.6l2.6-2Z M10.6 21 6.2 5.4l3.3-.7Z M12 21l1.9-17.2 3.4.5Z M13 21l7.4-11.6 2.4 2.1Z'),
  clock: fill('M3.5 2.5h17a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1Z M11 6.5v6.2l4.6 4.6 1.3-1.3-4.1-4.1V6.5Z'),
  leaf: fill('M21.5 2.5C13 3 7.5 7.5 6.6 15l-4.1 6.5 1.4.9 4-6.4c7.4-.6 12.6-5.8 13.6-13.5Z M8.7 14.6 16.8 7.2l.9 1-8.1 7.4Z'),
  flame: fill(
    'M12 1.5c.6 3.4 2.6 5 4.2 7 1.7 2.1 3.3 4.2 3.3 7.4A7.5 7.5 0 0 1 4.5 15.9c0-2.7 1.2-4.6 2.7-6.2.2 1.6.9 2.8 2.2 3.4-.7-4.4.6-8.6 2.6-11.6Z M10 12.3v6.4l5.2-3.2Z',
  ),
  skull: fill(
    'M12 2.5c5 0 8.5 3.4 8.5 8 0 2.6-1.2 4.4-3 5.4v3.1a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-3.1c-1.8-1-3-2.8-3-5.4 0-4.6 3.5-8 8.5-8Z M8.3 9.3a2 2 0 1 0 0 4 2 2 0 1 0 0-4Z M15.7 9.3a2 2 0 1 0 0 4 2 2 0 1 0 0-4Z M12 13.6l-1.2 2.2h2.4Z',
  ),
  eraser: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.2 3.6a1.5 1.5 0 0 1 2.1 0l4.1 4.1a1.5 1.5 0 0 1 0 2.1l-6.3 6.3-6.2-6.2Z" fill="currentColor"/><path d="M7.9 9.9l6.2 6.2-2.6 2.6H7.4l-3.8-3.8a1.5 1.5 0 0 1 0-2.1Z" fill="currentColor" opacity=".55"/><rect x="7" y="20.5" width="10" height="1.8" rx=".9" fill="currentColor"/></svg>`,
  bulb: stroke('<path d="M9 18h6M10 21h4"/><path d="M8.2 14.5A6 6 0 1 1 15.8 14.5c-.6.5-.8 1.1-.8 1.8V17H9v-.7c0-.7-.2-1.3-.8-1.8Z"/>', 1.5),
  undo: stroke('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 3.8v4h4"/>', 1.6),
  pause: stroke('<path d="M9 5v14M15 5v14"/>', 1.6),
  play: fill('M8 5.2v13.6a.6.6 0 0 0 .9.5l10.6-6.8a.6.6 0 0 0 0-1L8.9 4.7a.6.6 0 0 0-.9.5Z'),
  close: stroke('<path d="M6 6l12 12M18 6 6 18"/>', 2.4),
  back: stroke('<path d="M15 5l-7 7 7 7"/>', 2.4),
  check: stroke('<path d="M5 12.5l4.5 4.5L19 7"/>', 2.6),
  lock: stroke('<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  crown: fill('M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5Z M5 19h14v2H5Z'),
  dust: fill('M12 2.5 18 9l-6 12.5L6 9Z M5 4.5l1 1.8L8 7 6 7.8 5 9.8 4 7.8 2 7l2-.7Z'),
  pencil: stroke('<path d="M4 20l1-4.5L16 4.5l3.5 3.5-11 11z"/><path d="M13.5 7l3.5 3.5"/>'),
  sun: stroke('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  moon: fill('M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5 8.5 8.5 0 1 0 20.5 14.6Z'),
} as const;
