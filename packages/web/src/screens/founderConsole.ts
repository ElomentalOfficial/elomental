import { onA11yChange } from '../a11y.ts';
import { cachedAccount, fetchReviewPage, onAccountChange, type ReviewView } from '../backend.ts';
import { foundersShown } from '../backend/dev.ts';
import { ICONS } from '../icons.ts';
import { readJson, writeJson } from '../storage.ts';
import { goBack, h, subPage, watchEdges, type Screen } from '../ui.ts';
import { devPanel, type DevSection } from './dev.ts';
import { reviewPanel } from './review.ts';
import { setupScreen } from './setup.ts';
import * as copy from '../copy/en.ts';

/**
 * Setup > Founder tools (founders with their code; the server checks every call). Its sections:
 * Players (To review, Banned, History, and a search that finds anyone), My account (Dev mode,
 * Show founders to players, Stardust and parts, Account) and Activity.
 *
 * Wide screens: a sidebar with the sections and their counts beside the open one, each scrolling
 * on its own. Phones (and wide screens at large text): the section list is the first view, like
 * iOS Settings; a section opens full width and Back returns to the list.
 */

type Section = ReviewView | DevSection | 'search';

const GROUPS: { title: string; sections: Section[] }[] = [
  { title: copy.founderConsole.groups.players, sections: ['open', 'banned', 'history'] },
  { title: copy.founderConsole.groups.account, sections: ['devmode', 'show', 'tools', 'account'] },
  { title: copy.founderConsole.groups.activity, sections: ['activity'] },
];
const LAST_KEY = 'elomental:console-section';
const WIDE = '(min-width: 900px)';
/** Typing pauses this long before the search opens. */
const SEARCH_DELAY = 400;

export function founderConsole(): Screen {
  const t = copy.founderConsole;
  let counts: Record<ReviewView, number> | null = null;
  let shown: boolean | null = null;
  /** The open section; null is the phone's section list. */
  let section: Section | null = null;
  let query = '';
  let panel: { el: HTMLElement; destroy: () => void } | null = null;
  /** The founder picked a section themself: counts arriving don't move them. */
  let chosen = false;
  const wideQuery = matchMedia(WIDE);
  const isWide = () => wideQuery.matches && !document.documentElement.hasAttribute('data-large-text');
  let wide = isWide();

  const title = h('h1');
  const setTitle = (text: string) => {
    title.textContent = text;
    title.classList.toggle('long', text.length > 16);
  };
  const label = (s: Section) => t.sections[s];

  // ---- the section list (the sidebar on wide screens)
  const rows = new Map<Section, { btn: HTMLButtonElement; detail: HTMLElement }>();
  const row = (s: Section) => {
    const detail = h('span', { class: 'console-detail' });
    const btn = h(
      'button',
      { class: 'console-row', attrs: { type: 'button' }, onclick: () => open(s, true) },
      h('span', { class: 'console-label', text: label(s) }),
      detail,
      h('span', { class: 'console-chevron', html: ICONS.back, attrs: { 'aria-hidden': 'true' } }),
    );
    rows.set(s, { btn, detail });
    return btn;
  };
  // a player search from the first view: it opens as its own section
  const input = h('input', {
    class: 'review-search-input',
    attrs: { type: 'search', placeholder: copy.review.searchPlaceholder, 'aria-label': copy.review.a11ySearch, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'search' },
  });
  const searchBox = h('label', { class: 'review-search' }, h('span', { class: 'review-search-icon', html: ICONS.search }), input);
  let searchTimer = 0;
  /** 	yping: a pause, not Enter; on a phone the field moves into the Search view, so the
      keyboard stays up there (Enter hides it on purpose, so the results show). */
  const search = (typing = false) => {
    clearTimeout(searchTimer);
    const term = input.value.trim();
    if (term.length < 2 || (section === 'search' && term === query)) return;
    query = term;
    open('search', true);
    if (typing && !wide) {
      const field = panel?.el.querySelector<HTMLInputElement>('.review-search-input');
      field?.focus();
      field?.setSelectionRange(field.value.length, field.value.length);
    }
  };
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => search(true), SEARCH_DELAY);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    search();
    input.blur(); // hides the phone keyboard so the results show
  });
  const nav = h(
    'nav',
    { class: 'console-nav', attrs: { 'aria-label': t.title } },
    searchBox,
    ...GROUPS.map((g) => h('section', { class: 'setting-group' }, h('h2', { text: g.title }), h('div', { class: 'console-rows' }, ...g.sections.map(row)))),
  );

  function paintNav() {
    const detail: Partial<Record<Section, string>> = {
      open: counts ? String(counts.open) : '',
      banned: counts ? String(counts.banned) : '',
      devmode: cachedAccount()?.devMode ? copy.common.on : copy.common.off,
      show: shown === null ? '' : shown ? copy.common.on : copy.common.off,
    };
    for (const [s, r] of rows) {
      r.detail.textContent = detail[s] ?? '';
      // to review: the one count that asks for something, in full text weight
      r.detail.classList.toggle('strong', s === 'open' && !!counts?.open);
      const current = wide && s === section;
      r.btn.classList.toggle('on', current);
      if (current) r.btn.setAttribute('aria-current', 'page');
      else r.btn.removeAttribute('aria-current');
    }
  }

  // ---- the open section
  const paneTitle = h('h2', { class: 'console-pane-title', attrs: { id: 'console-pane-title' } });
  // focusable, so the keyboard can scroll it even when every tool in it is off (dev mode off)
  const pane = h('div', { class: 'console-pane scrollable', attrs: { role: 'region', tabindex: '0', 'aria-labelledby': 'console-pane-title' } });
  const navPane = h('div', { class: 'console-side scrollable' });
  const grid = h('div', { class: 'console-grid' }, navPane, pane);
  watchEdges(pane);
  watchEdges(navPane);

  function build(s: Section) {
    if (s === 'open' || s === 'banned' || s === 'history') return reviewPanel({ view: s, onCounts: setCounts });
    if (s === 'search') {
      // clearing the search leaves it: back to the list (phone) or the last section (wide)
      const leave = () => {
        input.value = '';
        query = '';
        if (wide) open(startSection(), true);
        else showList();
      };
      return reviewPanel({ view: 'open', query, onCounts: setCounts, onClear: leave });
    }
    return devPanel(s, {
      shown: () => shown,
      setShown: (value) => {
        shown = value;
        paintNav();
      },
      changed: paintNav,
    });
  }

  function open(s: Section, byFounder: boolean) {
    if (byFounder) chosen = true;
    if (s !== 'search') writeJson(LAST_KEY, s);
    section = s;
    panel?.destroy();
    panel = build(s);
    render();
  }

  function showList() {
    panel?.destroy();
    panel = null;
    section = null;
    render();
  }

  const el = subPage({ className: 'setup console', title, onBack: () => (!wide && section !== null ? showList() : void goBack(setupScreen)) });
  const body = el.querySelector<HTMLElement>(':scope > .sub-body')!;

  function render() {
    el.classList.toggle('is-wide', wide);
    paintNav();
    if (wide) {
      setTitle(t.title);
      paneTitle.textContent = section ? label(section) : '';
      navPane.replaceChildren(nav);
      pane.replaceChildren(paneTitle, panel?.el ?? '');
      pane.scrollTop = 0;
      body.replaceChildren(grid);
    } else if (section === null) {
      setTitle(t.title);
      body.replaceChildren(nav);
    } else {
      setTitle(label(section));
      body.replaceChildren(panel!.el);
      body.scrollTop = 0;
    }
  }

  function setCounts(next: Record<ReviewView, number>) {
    counts = next;
    paintNav();
    // wide: flags waiting come first, unless the founder already went elsewhere
    if (wide && !chosen && next.open > 0 && section !== 'open') open('open', false);
  }

  /** The wide section to open: To review, or the last one used. */
  const startSection = (): Section => readJson<Section>(LAST_KEY) ?? 'open';

  function onLayout() {
    const now = isWide();
    if (now === wide) return;
    wide = now;
    if (wide && section === null) open(startSection(), false);
    else render();
  }
  wideQuery.addEventListener('change', onLayout);
  const stopA11y = onA11yChange(onLayout);
  const stopAccount = onAccountChange(() => {
    if (el.isConnected) paintNav();
  });

  if (wide) open(startSection(), false);
  else render();
  void fetchReviewPage('open', 0, 1).then((page) => setCounts(page.counts)).catch(() => undefined);
  void foundersShown().then((value) => {
    shown = value;
    paintNav();
  });

  return {
    el,
    title: t.title,
    destroy: () => {
      panel?.destroy();
      clearTimeout(searchTimer);
      wideQuery.removeEventListener('change', onLayout);
      stopA11y();
      stopAccount();
    },
  };
}
