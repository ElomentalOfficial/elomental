import { cachedAccount, onAccountChange } from '../backend.ts';
import { setCardPrivacy } from '../backend/leaderboard.ts';
import { choice, segmented, settingGroup } from '../controls.ts';
import { goBack, h, rebuildOnLayout, subPage, toast, type Screen } from '../ui.ts';
import { setupBanner, setupScreen } from './setup.ts';
import * as copy from '../copy/en.ts';

/**
 * Setup > Leaderboard and card: whether you're listed at all, and whether your card shows your
 * stats. Saved on the server.
 */
export function privacyScreen(back: () => Screen = setupScreen): Screen {
  const t = copy.privacy;
  const account = cachedAccount();
  // repaint on account changes while the page is open; let go of them when it closes
  const unsubscribes: (() => void)[] = [];

  const onOff = (id: string, get: () => boolean, set: (v: boolean) => Promise<string | null>) => {
    const control = segmented({
      options: [{ value: true, label: copy.common.on }, { value: false, label: copy.common.off }],
      current: get,
      pick: (v) => set(v).then((err) => toast(err ?? t.saved)),
      labelledBy: id,
      cols: true,
    });
    unsubscribes.push(onAccountChange(control.paint));
    return control.el;
  };

  const el = subPage(
    { className: 'setup privacy', title: t.title, onBack: () => void goBack(back), banner: setupBanner(t.summary) },
    h('p', { class: 'page-intro', text: account?.anonymous ? t.guest : t.intro }),
    settingGroup(t.group, [
      choice('privacy-listed', t.listed, t.listedHelp, onOff('privacy-listed', () => !cachedAccount()?.lbHidden, (v) => setCardPrivacy(!v, null))),
      choice('privacy-stats', t.stats, t.statsHelp, onOff('privacy-stats', () => cachedAccount()?.cardStats !== false, (v) => setCardPrivacy(null, v))),
    ]),
  );
  rebuildOnLayout(el, () => privacyScreen(back));
  return { el, title: t.title, destroy: () => unsubscribes.forEach((off) => off()) };
}
