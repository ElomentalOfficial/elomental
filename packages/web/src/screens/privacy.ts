import { cachedAccount, onAccountChange } from '../backend.ts';
import { setCardPrivacy, setCountry } from '../backend/leaderboard.ts';
import { countryName } from '../playerCard.ts';
import { ICONS } from '../icons.ts';
import { closeButton, goBack, h, openModal, subPage, toast, type Screen } from '../ui.ts';
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
  // repaint on account changes while the page is open; let go of them when it closes
  const unsubscribes: (() => void)[] = [];
  // the country: a field that opens a picker sheet (search, then a padded list)
  const countryField = h('button', { class: 'text-field picker-field', attrs: { type: 'button', 'aria-haspopup': 'dialog' } });
  const paintCountry = () => {
    const code = cachedAccount()?.country ?? null;
    const label = code ? countryName(code) : t.noCountry;
    countryField.replaceChildren(h('span', { text: label }), h('span', { class: 'picker-chevron', html: ICONS.chevronDown, attrs: { 'aria-hidden': 'true' } }));
    countryField.setAttribute('aria-label', t.a11yCountry(label));
  };
  paintCountry();
  unsubscribes.push(onAccountChange(paintCountry));
  countryField.addEventListener('click', () => openCountryPicker(cachedAccount()?.country ?? null, (code) => {
    void setCountry(code).then((err) => {
      toast(err ?? t.saved);
      paintCountry();
    });
  }));

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
    unsubscribes.push(onAccountChange(paint));
    return h('div', { class: 'segmented cols-2', attrs: { role: 'radiogroup', 'aria-labelledby': id } }, ...buttons);
  };
  const choice = (id: string, title: string, help: string, control: HTMLElement) =>
    h('div', { class: 'choice' }, h('h3', { text: title, attrs: { id } }), h('p', { text: help }), control);

  const el = subPage(
    { className: 'setup privacy', title: t.title, onBack: () => void goBack(back) },
    h('p', { class: 'page-intro', text: account?.anonymous ? t.guest : t.intro }),
    h('section', { class: 'setting-group' }, h('h2', { text: t.group }),
      h('div', { class: 'setting choice-list' },
        choice('privacy-country', t.country, t.countryHelp, countryField),
        choice('privacy-listed', t.listed, t.listedHelp, onOff('privacy-listed', () => !cachedAccount()?.lbHidden, (v) => setCardPrivacy(!v, null))),
        choice('privacy-stats', t.stats, t.statsHelp, onOff('privacy-stats', () => cachedAccount()?.cardStats !== false, (v) => setCardPrivacy(null, v))))),
  );
  return { el, title: t.title, destroy: () => unsubscribes.forEach((off) => off()) };
}

/** The country list as a sheet: a search field, then every country, the chosen one ticked. */
function openCountryPicker(current: string | null, choose: (code: string | null) => void): void {
  const t = copy.privacy;
  const all = [{ code: null as string | null, name: t.noCountry }, ...CODES.map((c) => ({ code: c as string | null, name: countryName(c) })).sort((a, b) => a.name.localeCompare(b.name, 'en-GB'))];
  const search = h('input', { class: 'text-field picker-search', attrs: { type: 'search', placeholder: t.countrySearch, 'aria-label': t.countrySearch, autocomplete: 'off' } });
  const list = h('ul', { class: 'picker-list', attrs: { 'aria-label': t.country } });
  const empty = h('p', { class: 'note', text: t.noMatch });
  const paint = () => {
    const q = search.value.trim().toLocaleLowerCase('en-GB');
    const shown = all.filter((c) => !q || c.name.toLocaleLowerCase('en-GB').includes(q) || (c.code ?? '').toLowerCase() === q);
    list.replaceChildren(...shown.map((c) => {
      const chosen = c.code === current;
      return h('li', {},
        h('button', { class: `picker-option${chosen ? ' on' : ''}`, attrs: chosen ? { type: 'button', 'aria-current': 'true' } : { type: 'button' }, onclick: () => { close(); choose(c.code); } },
          h('span', { text: c.name }),
          chosen ? h('span', { class: 'picker-check', html: ICONS.check, attrs: { 'aria-hidden': 'true' } }) : null));
    }));
    empty.hidden = shown.length > 0;
  };
  search.addEventListener('input', paint);
  paint();
  const close = openModal(h('div', { class: 'sheet picker-sheet' }, closeButton(() => close()), h('h2', { text: t.countryPick }), search, empty, list));
  // start at the chosen country
  requestAnimationFrame(() => list.querySelector('.picker-option.on')?.scrollIntoView({ block: 'center' }));
}