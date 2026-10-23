import { badgeArt, badgeLabel } from './badges.ts';
import { refreshAccount } from './backend/account.ts';
import { setShowcase } from './backend/leaderboard.ts';
import { closeButton, h, openModal, toast } from './ui.ts';
import * as copy from './copy/en.ts';

/**
 * Choose up to three of your badges for your show-off card (Profile > Badges, and the profile
 * card's badge slots on Home). With none earned yet, it says how to earn one.
 */
export function openBadgePicker(owned: string[], current: string[], done: (chosen: string[]) => void = () => {}): void {
  const t = copy.badges;
  if (!owned.length) {
    const close = openModal(h('div', { class: 'sheet badge-sheet' }, closeButton(() => close()), h('h2', { text: t.chooseTitle }), h('p', { class: 'note', text: t.none })));
    return;
  }
  const chosen = current.filter((id) => owned.includes(id));
  const buttons: HTMLButtonElement[] = [];
  const paintAll = () => buttons.forEach((btn, i) => {
    const id = owned[i];
    const on = chosen.includes(id);
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', t.a11yPick(badgeLabel(id).text, on));
  });
  for (const id of owned) {
    const btn = h('button', { class: 'panel badge-pick', attrs: { type: 'button' } },
      h('span', { class: 'badge-medal', html: badgeArt(id), attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'badge-name', text: badgeLabel(id).text, attrs: { 'aria-hidden': 'true' } }));
    btn.addEventListener('click', () => {
      const i = chosen.indexOf(id);
      if (i >= 0) chosen.splice(i, 1);
      else if (chosen.length < 3) chosen.push(id);
      paintAll();
    });
    buttons.push(btn);
  }
  paintAll();
  const save = h('button', { class: 'btn btn-primary', text: t.save, attrs: { type: 'button' } });
  save.addEventListener('click', () => {
    save.disabled = true;
    void setShowcase(chosen).then(async (err) => {
      save.disabled = false;
      if (err) return toast(err);
      await refreshAccount();
      close();
      toast(t.saved);
      done([...chosen]);
    });
  });
  const close = openModal(
    h('div', { class: 'sheet badge-sheet' }, closeButton(() => close()), h('h2', { text: t.chooseTitle }), h('p', { class: 'note', text: t.pick }),
      h('div', { class: 'badge-pick-grid' }, ...buttons), save),
  );
}
