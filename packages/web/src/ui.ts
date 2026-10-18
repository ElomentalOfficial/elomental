import { reducedMotion } from './a11y.ts';
import { ICONS } from './icons.ts';
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
  document.title = screen.title ? copy.common.pageTitle(screen.title) : copy.common.appName;
  const scroller = screen.el.classList.contains('scrollable') ? screen.el : screen.el.querySelector<HTMLElement>(':scope > .sub-body');
  if (scroller) watchEdges(scroller);
}

/**
 * A page under Home or Setup: a header that stays put (back button, title)
 * over a body that scrolls when it outgrows the screen, so Back is always in
 * reach. `className` keeps each page's own styles and entry animation.
 */
export function subPage(options: { className: string; title: string | HTMLElement; onBack: () => void }, ...body: Child[]): HTMLElement {
  const title = typeof options.title === 'string' ? h('h1', { text: options.title }) : options.title;
  return h(
    'div',
    { class: `screen sub ${options.className}` },
    h(
      'header',
      { class: 'subbar' },
      h('button', { class: 'icon-btn', html: ICONS.back, attrs: { 'aria-label': copy.common.back }, onclick: options.onBack }),
      title,
      h('span', { class: 'icon-btn-spacer' }),
    ),
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
/** Points `dialog`'s accessible name at its first heading (giving the heading an id). */
export function labelByHeading(dialog: HTMLElement): void {
  const heading = dialog.querySelector<HTMLElement>('h1, h2, h3');
  if (!heading) return;
  heading.id ||= `dialog-title-${++labelIds}`;
  dialog.setAttribute('aria-labelledby', heading.id);
}

/**
 * A scrolling page fades out at an edge while more content lies past it
 * (styles.css .fade-top / .fade-bottom), instead of cutting off hard.
 */
function watchEdges(area: HTMLElement): void {
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
    leaving.style.transformOrigin = '0 50%';
    await leaving
      .animate(
        [
          { transform: 'perspective(1200px) rotateY(0deg)', opacity: 1 },
          { transform: 'perspective(1200px) rotateY(55deg)', opacity: 0 },
        ],
        { duration: 240, easing: 'cubic-bezier(0.7, 0, 1, 0.5)', fill: 'forwards' },
      )
      .finished.catch(() => undefined);
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
  const panel = h('div', { class: `modal ${options.class ?? ''}`, attrs: { role: 'dialog', 'aria-modal': 'true' } }, content);
  const backdrop = h('div', { class: 'backdrop scrollable' }, panel);
  const dismissible = options.dismissible !== false;
  let release = () => {};
  const close = () => {
    openModals.delete(close);
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
