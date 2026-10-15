/** Placeholder line icons in the spirit of the Figma sketches; swap for the real assets later. */

const stroke = (body: string, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;
const fill = (body: string) => `<svg viewBox="0 0 24 24" fill="currentColor">${body}</svg>`;

function gearPath(): string {
  const teeth = 8;
  const points: string[] = [];
  for (let i = 0; i < teeth * 4; i++) {
    const angle = (i / (teeth * 4)) * Math.PI * 2;
    const r = i % 4 < 2 ? 10.5 : 7.8;
    points.push(`${(12 + r * Math.cos(angle)).toFixed(2)} ${(12 + r * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${points.join('L')}Z M15.2 12a3.2 3.2 0 1 0-6.4 0a3.2 3.2 0 1 0 6.4 0Z`;
}

export const ICONS = {
  gear: `<svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="${gearPath()}"/></svg>`,
  bag: stroke('<path d="M5.5 8.5h13l-1.2 11.5H6.7z"/><path d="M9 8.5V6.8a3 3 0 0 1 6 0v1.7"/><path d="M10 13.5h4"/>'),
  star: fill('<path d="M12 1.8 14 10l8.2 2-8.2 2-2 8.2-2-8.2-8.2-2L10 10z"/>'),
  flag: stroke('<path d="M5 21V3.5"/><path d="M5 4h12l-2.5 4L17 12H5"/>'),
  feather: stroke('<path d="M20 3.5C11 4 6 9.5 5.2 18.8"/><path d="M5.6 15.5c5.5 0 11-3.5 13.2-10.6"/><path d="M8 12.5h6"/><path d="M3.5 20.5l2-2"/>'),
  calendar: stroke('<rect x="3.5" y="5" width="17" height="15.5" rx="1"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17.5h2"/>'),
  sword: stroke(
    '<path d="M20.5 3.5 19.6 7.4 10.4 16.6 7.4 13.6 16.6 4.4z" fill="currentColor" stroke-width="1"/>' +
      '<path d="M6 12.2l5.8 5.8" stroke-width="2.2"/><path d="M8.6 15.4 5.2 18.8" stroke-width="2.2"/>' +
      '<circle cx="4.4" cy="19.6" r="1.4" fill="currentColor" stroke="none"/>',
  ),
  pause: fill('<rect x="5.5" y="4" width="4.5" height="16" rx="0.5"/><rect x="14" y="4" width="4.5" height="16" rx="0.5"/>'),
  play: fill('<path d="M8 5.2v13.6a.6.6 0 0 0 .9.5l10.6-6.8a.6.6 0 0 0 0-1L8.9 4.7a.6.6 0 0 0-.9.5z"/>'),
  close: stroke('<path d="M6 6l12 12M18 6 6 18"/>', 'stroke-width="2.6"'),
  undo: stroke('<path d="M9 7 4.5 11.5 9 16"/><path d="M5 11.5h9a5 5 0 0 1 0 10h-3"/>'),
  pencil: stroke('<path d="M4 20l1-4.5L16 4.5l3.5 3.5-11 11z"/><path d="M13.5 7l3.5 3.5"/>'),
  crown: fill('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z"/><rect x="5" y="19" width="14" height="2" rx=".5"/>'),
  dust: fill('<path d="M12 2.5 18 9l-6 12.5L6 9z" opacity=".9"/><path d="M5 4.5l1 1.8L8 7 6 7.8 5 9.8 4 7.8 2 7l2-.7z"/><path d="M19.5 15l.7 1.3 1.3.7-1.3.7-.7 1.3-.7-1.3-1.3-.7 1.3-.7z"/>'),
  back: stroke('<path d="M15 5l-7 7 7 7"/>', 'stroke-width="2.4"'),
  check: stroke('<path d="M5 12.5l4.5 4.5L19 7"/>', 'stroke-width="2.6"'),
  lock: stroke('<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  info: stroke('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.5"/>', 'stroke-width="2"'),
} as const;
