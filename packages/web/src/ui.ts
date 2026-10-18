import { ICONS } from './icons.ts';

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
  destroy?(): void;
}

let current: Screen | null = null;

export function mount(screen: Screen): void {
  current?.destroy?.();
  closeAllModals();
  current = screen;
  document.getElementById('app')!.replaceChildren(screen.el);
  if (screen.el.classList.contains('scrollable')) watchEdges(screen.el);
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
  if (leaving && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
  mount(next());
  setTimeout(() => delete document.documentElement.dataset.nav, 800);
}

const openModals = new Set<() => void>();

export function openModal(content: HTMLElement, options: { dismissible?: boolean; class?: string } = {}): () => void {
  const panel = h('div', { class: `modal ${options.class ?? ''}` }, content);
  const backdrop = h('div', { class: 'backdrop scrollable' }, panel);
  const close = () => {
    openModals.delete(close);
    backdrop.remove();
    syncScrimEdges();
  };
  if (options.dismissible !== false) {
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close();
    });
  }
  openModals.add(close);
  document.body.append(backdrop);
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
  return h('button', { class: 'close-btn', html: ICONS.close, attrs: { 'aria-label': 'Close' }, onclick: onClose });
}

/** 75 → "1:15": a duration in whole seconds, as the clock and results show it. */
export function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** The same, from milliseconds (the game clock). */
export const formatTime = (ms: number): string => formatSeconds(ms / 1000);
