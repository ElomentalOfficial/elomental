import { reducedMotion } from './a11y.ts';
import { WIDE_QUERY } from './scale.ts';
import backArt from './art/screens/back.svg';
import { ICONS } from './icons.ts';
import { turnstileIn, turnstileOut } from './motion.ts';
import { pageBanner } from './pageBanner.ts';
import * as copy from './copy/en.ts';

type Child = Node | string | null | undefined | false;

interface Props {
  class?: string;
  text?: string;
  /** Only ever pass trusted, static markup (our own icons). */
  html?: string;
  attrs?: Record<string, string>;
  onclick?: (event: MouseEvent) => void;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text != null) el.textContent = props.text;
  if (props.html != null) el.innerHTML = props.html;
  if (props.attrs) for (const [key, value] of Object.entries(props.attrs)) el.setAttribute(key, value);
  if (props.onclick) (el as HTMLElement).addEventListener('click', props.onclick);
  for (const child of children) if (child) el.append(child);
  return el;
}

/** Where a player name (no spaces) may break: after each _ . or -, never inside a word. */
export const NAME_BREAKS = /(?<=[_.-])/;

/** A player name as text with a line-break chance after each _ . or - (NAME_BREAKS). */
export const nameParts = (name: string): (string | HTMLElement)[] =>
  name.split(NAME_BREAKS).flatMap((part, i) => (i ? [h('wbr'), part] : [part]));

/**
 * Keeps every word of `el` (a heading, a name) whole: when its longest word, or a name's longest
 * part (NAME_BREAKS), is wider than the line, the type steps down until it fits, never below
 * --fs-small (past that a word may break). Lines still wrap between words. Follows the element's
 * width and Setup's Text size while it's on screen: the fitted size is written in Text-size
 * units, so a new Text size resizes the element and it is measured again.
 */
export function fitWords(el: HTMLElement): void {
  let measured = '';
  let shown = false;
  const draw = () => {
    // (built before it's on the page: wait for it; once taken off the page, let it go)
    if (!el.isConnected) return shown && observer.disconnect();
    shown = true;
    const scale = parseFloat(getComputedStyle(el).getPropertyValue('--text-scale')) || 1;
    if (`${el.clientWidth}|${scale}` === measured) return;
    // the brand fonts not in yet: measure again once they are (the fallback is a different width)
    if (document.fonts?.status === 'loading') {
      void document.fonts.ready.then(() => {
        measured = '';
        requestAnimationFrame(draw);
      });
    }
    el.style.fontSize = '';
    const s = getComputedStyle(el);
    // (a pixel spare: the width is rounded, and a word sized to the exact width can still tip over)
    const room = el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - 1;
    // measured in the words' own box (a plate's name sits in a span with its own case)
    const words = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()?.parentElement ?? el;
    const probe = h('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
    words.append(probe);
    let longest = 0;
    for (const word of (el.textContent ?? '').split(/\s+/).flatMap((w) => w.split(NAME_BREAKS))) {
      probe.textContent = word;
      // (layout width: a rect would take in the page's turn animation and the screen's zoom)
      longest = Math.max(longest, probe.offsetWidth);
    }
    probe.remove();
    if (longest > room) {
      const px = Math.max(14 * scale, (parseFloat(s.fontSize) * room) / longest);
      el.style.fontSize = `calc(${(px / scale).toFixed(2)}px * var(--text-scale))`;
    }
    measured = `${el.clientWidth}|${scale}`;
  };
  const observer = new ResizeObserver(() => requestAnimationFrame(draw));
  observer.observe(el);
}

export interface Screen {
  el: HTMLElement;
  /** The page title's first part ("Daily Square" → "Daily Square · Elomental"); Home leaves it out. */
  title?: string;
  destroy?(): void;
}

let current: Screen | null = null;

export function mount(screen: Screen): void {
  current?.destroy?.();
  closeAllModals();
  current = screen;
  document.getElementById('app')!.replaceChildren(screen.el);
  const title = screen.title ? copy.common.pageTitle(screen.title) : copy.common.appName;
  // the beta site's tabs say so (beta.ts)
  document.title = document.documentElement.dataset.env === 'beta' ? copy.common.betaTitle(title) : title;
  const scroller = screen.el.classList.contains('scrollable') ? screen.el : screen.el.querySelector<HTMLElement>(':scope > .sub-body');
  if (scroller) watchEdges(scroller);
  if (scroller && screen.el.classList.contains('has-banner')) tilesIn(scroller, navigatingBack());
}

/**
 * The cards of a banner page's field (banner.css): each turns in and out on its own, staggered
 * in reading order, like Home's tiles (motion.ts), while the banner drops in beside them.
 */
const FIELD_TILES =
  '.door, .door-heading, .page-intro, .setting, .month-card, .reward-card, .today-card, .lb-controls, .lb-meta-row, .lb-notice, ' +
  '.lb-podium, .lb-faction, .lb-row, .profile-section, .forge-lead, .forge-spirits, .forge-heading-row, .forge-group > h2, .part-card, .forge-status';
function fieldTiles(field: HTMLElement): HTMLElement[] {
  const view = field.getBoundingClientRect();
  // only what's in view: the rest is never seen turning
  return [...field.querySelectorAll<HTMLElement>(FIELD_TILES)].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > view.top && r.top < view.bottom;
  });
}
function tilesIn(field: HTMLElement, backward: boolean): void {
  const seen = new WeakSet<HTMLElement>();
  const run = () => {
    const fresh = fieldTiles(field).filter((el) => !seen.has(el));
    fresh.forEach((el) => seen.add(el));
    if (fresh.length) turnstileIn(field, fresh, backward);
  };
  // (at once: a card left a frame unturned would flash in place)
  run();
  // cards that arrive a moment later (the Forge's parts, the leaderboard's rows) turn in too
  const late = new MutationObserver(run);
  late.observe(field, { childList: true, subtree: true });
  setTimeout(() => late.disconnect(), 1200);
}

/** The wide layout (wide.css): tablets on their side, laptops and desktops. */
const wideMedia = matchMedia(WIDE_QUERY);
export const wideLayout = (): boolean => wideMedia.matches;
/** Calls `fn` when the window crosses into or out of the wide layout; returns the way to stop. */
export function onWideChange(fn: () => void): () => void {
  wideMedia.addEventListener('change', fn);
  return () => wideMedia.removeEventListener('change', fn);
}

/**
 * A page built for one layout (a banner page on a wide screen, the column on a phone) is
 * built again for the other when the window changes over (a tablet turned, a window
 * resized), while it's still the page on screen.
 */
export function rebuildOnLayout(el: HTMLElement, rebuild: () => Screen): void {
  // one page is on screen at a time: the latest to ask is the one rebuilt
  layoutPage = { el, rebuild };
}
let layoutPage: { el: HTMLElement; rebuild: () => Screen } | null = null;
wideMedia.addEventListener('change', () => {
  if (layoutPage?.el.isConnected) mount(layoutPage.rebuild());
});

/**
 * A wide page's banner (pageBanner.ts): the splash ribbon hung from the top edge on the left, it
 * carries Back and the title, the page's own art, a line on what the page is for, and something of
 * yours at its foot. Phones keep the plain header.
 */
export interface Banner {
  art?: Child;
  help?: string;
  foot?: Child;
}

/**
 * A page under Home or Setup: a header that stays put (back button, title)
 * over a body that scrolls when it outgrows the screen, so Back is always in
 * reach. `className` keeps each page's own styles and entry animation. With a
 * `banner`, a wide screen hangs the header in a banner beside the body instead.
 */
export function subPage(options: { className: string; title: string | HTMLElement; onBack: () => void; banner?: Banner }, ...body: Child[]): HTMLElement {
  // long titles ("Leaderboard and card") take the smaller size, so they fit in two short lines; a
  // word too wide for a narrow screen steps the size down instead of splitting, and a player's
  // name (a player page) breaks only after its _ . or -
  let title = options.title;
  if (typeof title === 'string') {
    title = h('h1', { class: title.length > 16 ? 'long' : '' }, ...nameParts(title));
    fitWords(title);
  }
  const wide = !!options.banner && wideLayout();
  // Back: the owner's Deco arrowhead on phones and tablets; on the ribbon the plain chevron, the
  // arrowhead being the big Back right under it (pageBanner.ts)
  const back = wide
    ? h('button', { class: 'icon-btn', html: ICONS.back, attrs: { 'aria-label': copy.common.back }, onclick: options.onBack })
    : h('button', { class: 'icon-btn sub-back', attrs: { 'aria-label': copy.common.back }, onclick: options.onBack },
      h('img', { class: 'sub-back-art', attrs: { src: backArt, alt: '', draggable: 'false' } }));
  const header = h('header', { class: 'subbar' }, back, title, h('span', { class: 'icon-btn-spacer' }));
  const banner = wide ? pageBanner(header, options.banner!, options.onBack) : null;
  return h(
    'div',
    { class: `screen sub ${options.className}${banner ? ' has-banner' : ''}` },
    banner ?? header,
    h('div', { class: 'sub-body scrollable' }, ...body),
  );
}

/** A visually hidden heading: screen readers can jump to it, the design doesn't show it. */
export const hiddenHeading = (text: string): HTMLHeadingElement => h('h1', { class: 'sr-only', text });

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const visible = (el: HTMLElement) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed';

/** Everything that holds keyboard focus right now, innermost last. */
const holds: HTMLElement[] = [];

/**
 * Keeps keyboard focus inside `box` (a pop-up, the tutorial card) until the
 * returned function is called: the rest of the app becomes inert, Tab wraps
 * inside the box, Esc calls `onEscape`, and focus then goes back to where it
 * was. `initial` is focused first (default: the box's heading, so a screen
 * reader reads the title, then the first control).
 */
export function holdFocus(box: HTMLElement, options: { onEscape?: () => void; initial?: HTMLElement | null } = {}): () => void {
  const before = document.activeElement as HTMLElement | null;
  // Everything else on the page: the app and any layer under this one. Toasts stay
  // live (an inert status message is never announced).
  const layers = [document.getElementById('app'), ...document.querySelectorAll<HTMLElement>('body > .backdrop, body > .coach-layer, body > .hint-layer')]
    .filter((el): el is HTMLElement => !!el && !el.contains(box));
  const wasInert = layers.map((el) => el.inert);
  for (const el of layers) el.inert = true;
  holds.push(box);

  const onKey = (event: KeyboardEvent) => {
    if (holds[holds.length - 1] !== box) return;
    if (event.key === 'Escape' && options.onEscape) {
      event.preventDefault();
      event.stopImmediatePropagation();
      options.onEscape();
    } else if (event.key === 'Tab') {
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
      if (!items.length) return event.preventDefault();
      const first = items[0];
      const last = items[items.length - 1];
      const inside = box.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener('keydown', onKey, true);

  const heading = box.querySelector<HTMLElement>('h1, h2, h3');
  const target = options.initial ?? heading ?? box.querySelector<HTMLElement>(FOCUSABLE);
  if (target) {
    if (target === heading) target.tabIndex = -1;
    requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    document.removeEventListener('keydown', onKey, true);
    layers.forEach((el, i) => (el.inert = wasInert[i]));
    holds.splice(holds.indexOf(box), 1);
    if (before?.isConnected && !before.closest('[inert]')) before.focus({ preventScroll: true });
  };
}

let labelIds = 0;
/**
 * Points `dialog`'s accessible name at its first heading (giving it an id); a confirm with no
 * heading is named by its question (WCAG 4.1.2: every dialog has a name).
 */
export function labelByHeading(dialog: HTMLElement): void {
  const heading = dialog.querySelector<HTMLElement>('h1, h2, h3') ?? dialog.querySelector<HTMLElement>('.confirm > p');
  if (!heading) return;
  heading.id ||= `dialog-title-${++labelIds}`;
  if (dialog.getAttribute('aria-labelledby') !== heading.id) dialog.setAttribute('aria-labelledby', heading.id);
}

/**
 * A scrolling page fades out at an edge while more content lies past it
 * (styles.css .fade-top / .fade-bottom), instead of cutting off hard.
 */
export function watchEdges(area: HTMLElement): void {
  const update = () => {
    area.classList.toggle('fade-top', area.scrollTop > 1);
    area.classList.toggle('fade-bottom', area.scrollTop + area.clientHeight < area.scrollHeight - 1);
  };
  area.addEventListener('scroll', update, { passive: true });
  // Content can grow without the page resizing (the account form changing step).
  const resize = new ResizeObserver(update);
  resize.observe(area);
  for (const child of area.children) resize.observe(child);
  requestAnimationFrame(update);
}

/** True while a backward navigation is landing; screens use it to play their entry in reverse. */
export const navigatingBack = (): boolean => document.documentElement.dataset.nav === 'back';

/**
 * Go back toward Home: the current page swings back out on its left hinge
 * (the reverse of how it came in), then the previous screen enters reversed.
 */
export async function goBack(next: () => Screen): Promise<void> {
  const leaving = current?.el;
  closeAllModals();
  if (leaving && !reducedMotion()) {
    // The game's banner and a page's banner (wide layouts, with the Back under it) roll up out of
    // sight first, so they don't swing with the page.
    const banner = leaving.querySelector<HTMLElement>('.brand-banner, .banner-col');
    const rollUp = !!banner && banner.offsetParent !== null;
    if (rollUp) {
      await banner!
        // Hidden at the end: parked above the top edge, the page turn would tilt it back into view.
        .animate([{ transform: 'translateY(0)', visibility: 'visible' }, { transform: 'translateY(-101%)', visibility: 'hidden' }], {
          duration: 110,
          easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)',
          fill: 'forwards',
        })
        .finished.catch(() => undefined);
    }
    // A banner page's cards fold away one by one, as Home's tiles do; other pages turn as one
    const field = leaving.classList.contains('has-banner') ? leaving.querySelector<HTMLElement>(':scope > .sub-body') : null;
    if (field) await turnstileOut(field, fieldTiles(field));
    else {
    leaving.style.transformOrigin = '0 50%';
    await leaving
      .animate(
        [
          { transform: 'perspective(1200px) rotateY(0deg)', opacity: 1 },
          { transform: 'perspective(1200px) rotateY(55deg)', opacity: 0 },
        ],
        { duration: rollUp ? 200 : 240, easing: 'cubic-bezier(0.7, 0, 1, 0.5)', fill: 'forwards' },
      )
      .finished.catch(() => undefined);
    }
  }
  document.documentElement.dataset.nav = 'back';
  const screen = next();
  // The entering screen keeps this class for good: its CSS entry (page-back-in)
  // must not change name later, or the browser plays the other entry again.
  screen.el.classList.add('from-back');
  mount(screen);
  setTimeout(() => delete document.documentElement.dataset.nav, 800);
}

const openModals = new Set<() => void>();

/**
 * A pop-up: a modal dialog named by its heading. Focus moves into it and stays
 * there, Esc closes it (when it can be dismissed), and focus returns to what
 * opened it.
 */
export function openModal(content: HTMLElement, options: { dismissible?: boolean; class?: string } = {}): () => void {
  const panel = h('div', { class: `panel modal ${options.class ?? ''}`, attrs: { role: 'dialog', 'aria-modal': 'true' } }, content);
  const backdrop = h('div', { class: 'backdrop scrollable' }, panel);
  const dismissible = options.dismissible !== false;
  let release = () => {};
  // Sheets that load their content (the Ranks sheet, a player's card) get their heading
  // later: name the dialog again whenever its content changes.
  const relabel = new MutationObserver(() => labelByHeading(panel));
  const close = () => {
    openModals.delete(close);
    relabel.disconnect();
    backdrop.remove();
    release();
    syncScrimEdges();
  };
  if (dismissible) {
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close();
    });
  }
  openModals.add(close);
  document.body.append(backdrop);
  labelByHeading(panel);
  relabel.observe(panel, { childList: true, subtree: true });
  release = holdFocus(panel, { onEscape: dismissible ? close : undefined });
  syncScrimEdges();
  return close;
}

/**
 * While a pop-up is open, the screen edges iOS paints itself (the status-bar
 * blur at the top, the strip by the home indicator) take the dimmed colour
 * instead of the bright page colour (styles.css, html.modal-open).
 */
function syncScrimEdges(): void {
  document.documentElement.classList.toggle('modal-open', openModals.size > 0);
}

function closeAllModals(): void {
  for (const close of [...openModals]) close();
}

export function toast(message: string): void {
  for (const old of document.querySelectorAll('.toast')) old.remove(); // one at a time
  const el = h('div', { class: 'toast', attrs: { role: 'status' }, text: message });
  document.body.append(el);
  // Long enough to read: 2.4s, more for longer messages.
  const shown = Math.max(2400, message.length * 55);
  setTimeout(() => el.classList.add('out'), shown);
  setTimeout(() => el.remove(), shown + 400);
}

/** The ✕ in the corner of a pop-up sheet. */
export function closeButton(onClose: () => void): HTMLElement {
  return h('button', { class: 'close-btn', html: ICONS.close, attrs: { 'aria-label': copy.common.close }, onclick: onClose });
}

/** 75 → "1:15": a duration in whole seconds, as the clock and results show it. */
export function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** The same, from milliseconds (the game clock). */
export const formatTime = (ms: number): string => formatSeconds(ms / 1000);
