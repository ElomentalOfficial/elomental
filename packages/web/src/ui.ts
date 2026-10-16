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
}

const openModals = new Set<() => void>();

export function openModal(content: HTMLElement, options: { dismissible?: boolean; class?: string } = {}): () => void {
  const panel = h('div', { class: `modal ${options.class ?? ''}` }, content);
  const backdrop = h('div', { class: 'backdrop' }, panel);
  const close = () => {
    openModals.delete(close);
    backdrop.remove();
  };
  if (options.dismissible !== false) {
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close();
    });
  }
  openModals.add(close);
  document.body.append(backdrop);
  return close;
}

function closeAllModals(): void {
  for (const close of [...openModals]) close();
}

export function toast(message: string): void {
  for (const old of document.querySelectorAll('.toast')) old.remove(); // one at a time
  const el = h('div', { class: 'toast', attrs: { role: 'status' }, text: message });
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), 2400);
  setTimeout(() => el.remove(), 2800);
}

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
