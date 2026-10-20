import { cachedAccount, onAccountChange } from '../backend.ts';
import { setCardPrivacy, setCountry } from '../backend/leaderboard.ts';
import { countryName } from '../playerCard.ts';
import { goBack, h, subPage, toast, type Screen } from '../ui.ts';
import { setupScreen } from './setup.ts';
import * as copy from '../copy/en.ts';

/** ISO 3166 alpha-2 codes offered in the country list (names come from the browser). */
const CODES = 'AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS XK YE ZA ZM ZW'.split(' ');

/**
 * Setup > Leaderboard and card: the optional country (the Country list and the card), whether
 * you're listed at all, and whether your card shows your stats. Saved on the server.
 */
export function privacyScreen(back: () => Screen = setupScreen): Screen {
  const t = copy.privacy;
  const account = cachedAccount();
  const select = h('select', { class: 'text-field', attrs: { 'aria-labelledby': 'privacy-country' } },
    h('option', { text: t.noCountry, attrs: { value: '' } }),
    ...CODES.map((c) => ({ c, name: countryName(c) })).sort((a, b) => a.name.localeCompare(b.name, 'en-GB'))
      .map(({ c, name }) => h('option', { text: name, attrs: { value: c } })));
  select.value = account?.country ?? '';
  select.addEventListener('change', () => void setCountry(select.value || null).then((err) => toast(err ?? t.saved)));

  const onOff = (id: string, get: () => boolean, set: (v: boolean) => Promise<string | null>) => {
    const buttons = [true, false].map((v) => h('button', {
      class: 'segment', text: v ? copy.common.on : copy.common.off, attrs: { role: 'radio', type: 'button' },
      onclick: () => void set(v).then((err) => { toast(err ?? t.saved); paint(); }),
    }));
    const paint = () => buttons.forEach((b, i) => {
      const on = (i === 0) === get();
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    paint();
    onAccountChange(paint);
    return h('div', { class: 'segmented cols-2', attrs: { role: 'radiogroup', 'aria-labelledby': id } }, ...buttons);
  };
  const choice = (id: string, title: string, help: string, control: HTMLElement) =>
    h('div', { class: 'choice' }, h('h3', { text: title, attrs: { id } }), h('p', { text: help }), control);

  const el = subPage(
    { className: 'setup privacy', title: t.title, onBack: () => void goBack(back) },
    h('p', { class: 'page-intro', text: account?.anonymous ? t.guest : t.intro }),
    h('section', { class: 'setting-group' }, h('h2', { text: t.group }),
      h('div', { class: 'setting choice-list' },
        choice('privacy-country', t.country, t.countryHelp, select),
        choice('privacy-listed', t.listed, t.listedHelp, onOff('privacy-listed', () => !cachedAccount()?.lbHidden, (v) => setCardPrivacy(!v, null))),
        choice('privacy-stats', t.stats, t.statsHelp, onOff('privacy-stats', () => cachedAccount()?.cardStats !== false, (v) => setCardPrivacy(null, v))))),
  );
  return { el, title: t.title };
}
