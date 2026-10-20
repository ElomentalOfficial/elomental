import { cachedAccount, onAccountChange } from '../backend.ts';
import { devAction, foundersShown, setDevMode, setFoundersShown, type DevAction } from '../backend/dev.ts';
import { loadFounderActivity } from '../backend/founder.ts';
import { choice, segmented, settingGroup } from '../controls.ts';
import { RARITIES, type Rarity } from '../profile.ts';
import { rarityName } from '../reward.ts';
import { goBack, h, mount, subPage, toast, type Screen } from '../ui.ts';
import { reviewScreen } from './review.ts';
import { setupScreen } from './setup.ts';
import * as copy from '../copy/en.ts';

/**
 * Setup > Dev mode (founders only; the server checks every call): the way into Review, a
 * switch, then the testing tools, grouped. They change the founder's own account for real. While dev mode
 * is on, games also show Solve now and Lose now (game.ts).
 */
export function devScreen(): Screen {
  const t = copy.dev;
  const tools: HTMLButtonElement[] = [];

  /** A tool button: runs the action, then says it's done (or why not). */
  const tool = (label: string, action: DevAction, value?: () => string | number | null, done?: () => string) => {
    const btn = h('button', { class: 'btn', text: label, attrs: { type: 'button' } });
    btn.addEventListener('click', () => {
      const v = value?.();
      if (v === null) return;
      btn.disabled = true;
      void devAction(action, v).then((err) => {
        btn.disabled = !on();
        loadActivity();
        toast(err ?? done?.() ?? t.done);
      });
    });
    tools.push(btn);
    return btn;
  };
  const on = () => !!cachedAccount()?.devMode;
  const activity = h('ul', { class: 'activity-list' }, h('li', { text: copy.common.loading }));

  // the switch: On / Off (the account refresh repaints the page)
  const devSwitch = segmented({
    options: [{ value: true, label: copy.common.on }, { value: false, label: copy.common.off }],
    current: on,
    pick: (value) => {
      if (value === on()) return;
      return setDevMode(value).then((err) => (err ? toast(err) : loadActivity()));
    },
    labelledBy: 'dev-switch',
    cols: true,
  });

  // Show founders to players: one switch for every founder, on or off whatever dev mode is (the
  // server keeps the state; nothing is marked until it has answered)
  let shown: boolean | null = null;
  const showSwitch = segmented<boolean | null>({
    options: [{ value: true, label: copy.common.on }, { value: false, label: copy.common.off }],
    current: () => shown,
    pick: (value) => {
      if (value === null || value === shown) return;
      return setFoundersShown(value).then((err) => {
        if (err) return toast(err);
        shown = value;
        toast(value ? t.foundersShown : t.foundersHidden);
        loadActivity();
      });
    },
    labelledBy: 'dev-show',
    cols: true,
  });
  void foundersShown().then((value) => {
    shown = value;
    showSwitch.paint();
  });

  const eloField = h('input', {
    class: 'text-field',
    attrs: { type: 'number', inputmode: 'numeric', min: '0', max: '4800', step: '1', 'aria-labelledby': 'dev-elo' },
  });
  const plateButtons = [0, 1, 2, 3, 4].map((n) => {
    const btn = tool(copy.forge.plates[n], 'plate', () => n);
    btn.classList.replace('btn', 'segment');
    return btn;
  });

  const group = (title: string, ...items: (HTMLElement | null)[]) => settingGroup(title, items);

  const el = subPage(
    { className: 'setup dev', title: t.title, onBack: () => void goBack(setupScreen) },
    h('p', { class: 'page-intro', text: t.intro }),
    // Review works whether dev mode is on or off (it only needs the founder code)
    group(copy.setup.review, h('p', { class: 'field-hint', text: copy.setup.reviewHelp }), h('button', { class: 'btn', text: copy.setup.openReview, attrs: { type: 'button' }, onclick: () => mount(reviewScreen()) })),
    group(
      t.switchTitle,
      choice('dev-switch', t.switchTitle, t.switchHelp, devSwitch.el),
    ),
    group(t.groups.players, choice('dev-show', t.showFounders, t.showFoundersHelp, showSwitch.el)),
    group(t.groups.resources, tool(t.fill, 'fill'), tool(t.empty, 'empty')),
    group(t.groups.parts, tool(t.unlockAll, 'unlock_all'), tool(t.clearParts, 'clear_parts')),
    group(
      t.groups.next,
      choice('dev-next', t.nextPart, t.nextPartHelp,
        h('div', { class: 'segmented cols-2' }, ...RARITIES.map((r) => {
          const btn = tool(rarityName(r), 'next_drop', () => r, () => t.nextPartSet(rarityName(r)));
          btn.classList.replace('btn', 'segment');
          return btn;
        }))),
      tool(t.nextSpirit, 'next_spirit'),
    ),
    group(
      t.groups.account,
      choice('dev-elo', t.elo, t.eloHelp,
        h('div', { class: 'dev-row' }, eloField, tool(t.setElo, 'elo', () => {
          const n = Number(eloField.value);
          if (eloField.value === '' || !Number.isInteger(n) || n < 0 || n > 4800) {
            toast(copy.refusals.dev.bad_request);
            return null;
          }
          return n;
        }))),
      choice('dev-plate', t.plate, null, h('div', { class: 'segmented cols-3', attrs: { role: 'group', 'aria-labelledby': 'dev-plate' } }, ...plateButtons)),
      choice('dev-affinity', t.forgetAffinity, t.forgetAffinityHelp, tool(t.forgetAffinity, 'forget_affinity')),
    ),
    // what founders did lately (Dev mode and Review), to spot anything that wasn't you
    group(copy.founder.activity, h('p', { class: 'field-hint', text: copy.founder.activityHelp }), activity),
  );
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const loadActivity = () =>
    void loadFounderActivity(30).then((rows) => {
      if (!rows) return;
      activity.replaceChildren(
        ...(rows.length
          ? rows.map((r) =>
              h('li', {},
                h('span', { class: 'activity-what', text: [copy.founder.actions[r.action] ?? r.action, r.action === 'next_drop' && r.detail ? rarityName(r.detail as Rarity) : r.detail].filter(Boolean).join(': ') }),
                h('span', { class: 'activity-who', text: [r.founder, when(r.at)].filter(Boolean).join(' · ') })))
          : [h('li', { text: copy.founder.activityEmpty })]),
      );
    });
  loadActivity();

  const paint = () => {
    const isOn = on();
    devSwitch.paint();
    for (const b of tools) b.disabled = !isOn;
    eloField.disabled = !isOn;
    if (!eloField.value) eloField.value = String(cachedAccount()?.elo ?? '');
    const plate = cachedAccount()?.plate ?? 0;
    plateButtons.forEach((b, n) => b.classList.toggle('on', n === plate));
  };
  paint();
  const stop = onAccountChange(() => {
    if (!el.isConnected) return stop();
    paint();
  });
  return { el, title: t.title, destroy: stop };
}
