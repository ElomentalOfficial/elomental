import { cachedAccount, onAccountChange } from '../backend.ts';
import { addTester, devAction, loadTesters, removeTester, setDevMode, setFoundersShown, type DevAction, type Tester } from '../backend/dev.ts';
import { loadFounderActivity } from '../backend/founder.ts';
import { choice, segmented, settingGroup } from '../controls.ts';
import { RARITIES, type Rarity } from '../profile.ts';
import { rarityName } from '../reward.ts';
import { h, openModal, toast } from '../ui.ts';
import { PLATE_LEVELS, xpLevel } from '../xp.ts';
import * as copy from '../copy/en.ts';

/**
 * The founder tools' own sections (founderConsole.ts lays them out; the server checks every
 * call): the Dev mode switch, Show founders to players, the testing tools that change the
 * founder's own account for real, beta's testers, and the founders' activity log. While dev mode
 * is on, games also show Solve now and Lose now (game.ts). All but the log are beta only.
 */
export type DevSection = 'devmode' | 'show' | 'tools' | 'account' | 'testers' | 'activity';

/** What the console shares with a section: the Show founders state, and "something changed". */
export interface DevContext {
  shown: () => boolean | null;
  setShown: (value: boolean) => void;
  changed: () => void;
}

export function devPanel(section: DevSection, ctx: DevContext): { el: HTMLElement; destroy: () => void } {
  const t = copy.dev;
  const tools: HTMLButtonElement[] = [];
  const on = () => !!cachedAccount()?.devMode;
  const group = (title: string, ...items: (HTMLElement | null)[]) => settingGroup(title, items);
  // a section with one group: just its card (the section's own title names it)
  const card = (...items: (HTMLElement | null)[]) => h('div', { class: 'setting choice-list' }, ...items);

  /** A tool button: runs the action, then says it's done (or why not). */
  const tool = (label: string, action: DevAction, value?: () => string | number | null, done?: () => string) => {
    const btn = h('button', { class: 'btn', text: label, attrs: { type: 'button' } });
    btn.addEventListener('click', () => {
      const v = value?.();
      if (v === null) return;
      btn.disabled = true;
      void devAction(action, v).then((err) => {
        btn.disabled = !on();
        ctx.changed();
        toast(err ?? done?.() ?? t.done);
      });
    });
    tools.push(btn);
    return btn;
  };

  let el: HTMLElement;
  let paint = () => {};
  if (section === 'devmode') {
    // the switch: On / Off (the account refresh repaints it)
    const devSwitch = segmented({
      options: [{ value: true, label: copy.common.on }, { value: false, label: copy.common.off }],
      current: on,
      pick: (value) => {
        if (value === on()) return;
        return setDevMode(value).then((err) => (err ? toast(err) : ctx.changed()));
      },
      labelledBy: 'dev-switch',
      cols: true,
    });
    el = h('div', { class: 'console-section' },
      h('p', { class: 'page-intro', text: t.intro }),
      card(choice('dev-switch', t.switchTitle, t.switchHelp, devSwitch.el)));
    paint = () => devSwitch.paint();
  } else if (section === 'show') {
    // one switch for every founder, on or off whatever dev mode is (the server keeps the state;
    // nothing is marked until it has answered)
    const showSwitch = segmented<boolean | null>({
      options: [{ value: true, label: copy.common.on }, { value: false, label: copy.common.off }],
      current: ctx.shown,
      pick: (value) => {
        if (value === null || value === ctx.shown()) return;
        return setFoundersShown(value).then((err) => {
          if (err) return toast(err);
          ctx.setShown(value);
          toast(value ? t.foundersShown : t.foundersHidden);
        });
      },
      labelledBy: 'dev-show',
      cols: true,
    });
    el = h('div', { class: 'console-section' }, card(choice('dev-show', t.showFounders, t.showFoundersHelp, showSwitch.el)));
    paint = () => showSwitch.paint();
  } else if (section === 'tools') {
    el = h('div', { class: 'console-section' },
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
        // its own item in the card, so the hairline and gap between items apply
        h('div', { class: 'choice' }, tool(t.nextSpirit, 'next_spirit')),
      ));
    paint = () => {
      for (const b of tools) b.disabled = !on();
    };
  } else if (section === 'account') {
    const eloField = h('input', {
      class: 'text-field',
      attrs: { type: 'number', inputmode: 'numeric', min: '0', max: '2000', step: '1', 'aria-labelledby': 'dev-elo' },
    });
    // level 1 and each plate's level: sets the XP to the start of it, and wears its plate
    const levels = [1, ...PLATE_LEVELS];
    const levelButtons = levels.map((n) => {
      const btn = tool(String(n), 'level', () => n);
      btn.classList.replace('btn', 'segment');
      btn.setAttribute('aria-label', copy.level.label(n));
      return btn;
    });
    el = h('div', { class: 'console-section' },
      card(
        choice('dev-elo', t.elo, t.eloHelp,
          h('div', { class: 'dev-row' }, eloField, tool(t.setElo, 'elo', () => {
            const n = Number(eloField.value);
            if (eloField.value === '' || !Number.isInteger(n) || n < 0 || n > 2000) {
              toast(copy.refusals.dev.bad_request);
              return null;
            }
            return n;
          }))),
        choice('dev-level', t.level, t.levelHelp, h('div', { class: 'segmented cols-3', attrs: { role: 'group', 'aria-labelledby': 'dev-level' } }, ...levelButtons)),
        choice('dev-affinity', t.forgetAffinity, t.forgetAffinityHelp, tool(t.forgetAffinity, 'forget_affinity')),
      ));
    paint = () => {
      const isOn = on();
      for (const b of tools) b.disabled = !isOn;
      eloField.disabled = !isOn;
      if (!eloField.value) eloField.value = String(cachedAccount()?.elo ?? '');
      const level = xpLevel(cachedAccount()?.xp ?? 0).level;
      levelButtons.forEach((b, i) => b.classList.toggle('on', levels[i] === level));
    };
  } else if (section === 'testers') {
    el = testersSection();
  } else {
    // what founders did lately (Dev mode and Review), to spot anything that wasn't you
    const activity = h('ul', { class: 'activity-list' }, h('li', { text: copy.common.loading }));
    const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
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
    el = h('div', { class: 'console-section' }, card(h('p', { class: 'field-hint', text: copy.founder.activityHelp }), activity));
  }

  paint();
  const stop = onAccountChange(() => {
    if (!el.isConnected) return;
    paint();
  });
  return { el, destroy: stop };
}

/** Beta's testers: add an email, see who has signed in, remove one (with their beta account). */
function testersSection(): HTMLElement {
  const t = copy.testers;
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const field = h('input', {
    class: 'text-field',
    attrs: { type: 'email', inputmode: 'email', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: copy.account.emailPlaceholder, 'aria-labelledby': 'tester-add' },
  });
  const add = h('button', { class: 'btn btn-primary', text: t.add, attrs: { type: 'button' } });
  const submit = () => {
    const email = field.value.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast(copy.refusals.dev.bad_email);
    add.disabled = true;
    void addTester(email).then((err) => {
      add.disabled = false;
      if (err) return toast(err);
      field.value = '';
      toast(t.added(email));
      void load();
    });
  };
  add.addEventListener('click', submit);
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit();
  });

  const list = h('ul', { class: 'activity-list tester-list' }, h('li', { text: copy.common.loading }));
  const confirmRemove = (email: string) => {
    const status = h('p', { class: 'note', attrs: { role: 'status' } });
    const go = h('button', { class: 'btn btn-primary', text: t.remove, attrs: { type: 'button' } });
    const close = openModal(
      h('div', { class: 'sheet review-confirm' },
        h('h2', { text: t.removeTitle(email) }),
        h('p', { text: t.removeText }),
        status,
        go,
        h('button', { class: 'btn', text: copy.common.cancel, attrs: { type: 'button' }, onclick: () => close() })),
    );
    go.addEventListener('click', () => {
      go.disabled = true;
      void removeTester(email).then((err) => {
        if (err) {
          status.textContent = err;
          go.disabled = false;
          return;
        }
        close();
        toast(t.removed(email));
        void load();
      });
    });
  };
  const row = (tester: Tester) =>
    h('li', {},
      h('div', { class: 'tester-text' },
        h('span', { class: 'activity-what', text: tester.email }),
        h('span', { class: 'activity-who', text: tester.lastSeen ? t.lastSeen(tester.name, when(tester.lastSeen)) : t.notJoined })),
      h('button', { class: 'link-btn', text: t.remove, attrs: { type: 'button', 'aria-label': t.a11yRemove(tester.email) }, onclick: () => confirmRemove(tester.email) }));
  async function load() {
    const testers = await loadTesters();
    list.replaceChildren(
      ...(testers === null ? [h('li', { text: t.loadFailed })] : testers.length ? testers.map(row) : [h('li', { text: t.empty })]),
    );
  }
  void load();

  return h('div', { class: 'console-section' },
    h('p', { class: 'page-intro', text: t.intro }),
    h('div', { class: 'setting choice-list' }, choice('tester-add', t.addTitle, t.addHelp, h('div', { class: 'dev-row' }, field, add))),
    settingGroup(t.listTitle, [list]));
}
