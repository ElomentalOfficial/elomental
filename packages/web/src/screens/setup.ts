import { TEXT_SIZES, a11yPrefs } from '../a11y.ts';
import { signUpForm } from '../accountForm.ts';
import { avatarSvg } from '../avatar.ts';
import {
  NAME_COOLDOWN_DAYS,
  cachedAccount,
  formatDay,
  isFounder,
  onAccountChange,
  registered,
  saveSettings,
  setDisplayName,
  signOut,
} from '../backend.ts';
import { cachedLoadout, cachedPolish } from '../backend/forge.ts';
import { choice, segmented } from '../controls.ts';
import { ICONS } from '../icons.ts';
import { addToHome, canAddToHome } from '../install.ts';
import { openLazy } from '../lazy.ts';
import { miniBoard, sampleGivens } from '../miniBoard.ts';
import { notesWheelOn } from '../settings.ts';
import { getTheme, type Theme } from '../theme.ts';
import { deviceInfo } from '../viewport.ts';
import { closeButton, goBack, h, mount, openModal, rebuildOnLayout, subPage, toast, wideLayout, type Banner, type Screen } from '../ui.ts';
import { accessibilityScreen } from './accessibility.ts';
import { homeScreen } from './home.ts';
import { founderUnlocked, hasAuthenticator, startEnrolment, verifyCode } from '../backend/founder.ts';
import { IS_BETA } from '../backend/client.ts';
import * as copy from '../copy/en.ts';

export function setupScreen(): Screen {
  if (wideLayout()) return setupDoors();
  const [themeRow, wheelRow, tutorialRow] = lookSections();

  // Hidden diagnostics: five taps on the title show what the phone reports about its screen.
  const title = h('h1', { text: copy.setup.title });
  const info = h('pre', { class: 'device-info' });
  let taps = 0;
  title.addEventListener('click', () => {
    if (++taps < 5) return;
    taps = 0;
    info.textContent = info.textContent ? '' : deviceInfo().join('\n');
  });

  const el = subPage(
    { className: 'setup', title, onBack: () => void goBack(homeScreen) },
    accountSection(),
    founderGate(),
    devSection(),
    themeRow,
    wheelRow,
    accessibilityLink(),
    privacyLink(),
    addToHomeRow(),
    tutorialRow,
    info,
    buildLine(),
  );
  rebuildOnLayout(el, setupScreen);
  return { el, title: copy.setup.title };
}

/** Theme, the notes wheel and the tutorial: Setup's rows on a phone, Look and play on a wide screen. */
function lookSections(): HTMLElement[] {
  const theme = segmented<Theme>({
    options: [
      { value: 'dark', label: copy.setup.dark, icon: ICONS.moon },
      { value: 'light', label: copy.setup.light, icon: ICONS.sun },
    ],
    current: getTheme,
    pick: (value) => saveSettings({ theme: value }),
    label: copy.setup.theme,
  });
  const wheel = segmented({
    options: [{ value: true, label: copy.common.on }, { value: false, label: copy.common.off }],
    current: notesWheelOn,
    pick: (value) => saveSettings({ notesWheel: value }),
    label: copy.setup.notesWheel,
  });
  // Settings saved on another device arrive with the account refresh.
  const stopSync = onAccountChange(() => {
    if (!wheel.el.isConnected) return stopSync();
    theme.paint();
    wheel.paint();
  });
  const tutorial = h('button', {
    class: 'btn',
    text: copy.setup.tutorialReplay,
    onclick: () => {
      saveSettings({ tutorialDone: false });
      toast(copy.setup.tutorialQueued);
    },
  });
  // a wide screen's Look and play page: one card of choices, as Accessibility's (the banner beside it
  // gives the title)
  if (wideLayout()) {
    return [
      h('div', { class: 'panel setting choice-list' },
        choice('setup-theme', copy.setup.theme, copy.setup.themeHelp, theme.el),
        choice('setup-wheel', copy.setup.notesWheel, copy.setup.notesWheelHelp, wheel.el),
        choice('setup-tutorial', copy.setup.tutorial, copy.setup.tutorialHelp, tutorial)),
    ];
  }
  return [
    h('section', { class: 'panel setting' }, h('div', {}, h('h2', { text: copy.setup.theme }), h('p', { text: copy.setup.themeHelp })), theme.el),
    h('section', { class: 'panel setting' }, h('div', {}, h('h2', { text: copy.setup.notesWheel }), h('p', { text: copy.setup.notesWheelHelp })), wheel.el),
    h('section', { class: 'panel setting' }, h('div', {}, h('h2', { text: copy.setup.tutorial }), h('p', { text: copy.setup.tutorialHelp })), tutorial),
  ];
}

/** Setup's banner on a wide screen (and its pages'): the cog, a line, and you with the build at its foot. */
export function setupBanner(help: string): Banner {
  const avatar = h('span', { class: 'avatar worn setup-you-avatar', attrs: { 'aria-hidden': 'true' } });
  const name = h('strong', { class: 'setup-you-name' });
  const foot = h('div', { class: 'setup-you' }, avatar, name, buildLine());
  // a new name, a sign-out or a sign-in shows at once
  const paint = () => {
    avatar.innerHTML = avatarSvg(cachedLoadout(), cachedPolish());
    name.textContent = cachedAccount()?.name ?? '';
    name.hidden = !name.textContent;
  };
  paint();
  let shown = false;
  const stop = onAccountChange(() => {
    if (shown && !foot.isConnected) return stop();
    shown ||= foot.isConnected;
    paint();
  });
  return { art: h('span', { class: 'setup-banner-art', html: ICONS.setup }), help, foot };
}

/** One of Setup's pages on a wide screen: its rows in a column beside the Setup banner. */
function setupTopic(title: string, help: string, ...rows: (HTMLElement | null)[]): Screen {
  const el = subPage({ className: 'setup setup-topic', title, onBack: () => void goBack(setupScreen), banner: setupBanner(help) }, ...rows);
  // back to the phone's long Setup if the window narrows
  rebuildOnLayout(el, setupScreen);
  return { el, title };
}

/**
 * Setup on a wide screen (banner.css): a door for each part, its picture and a bold line saying
 * what's set behind it, so you can check your setup without opening a thing. Account, Look and
 * play, Accessibility and Privacy always; installing where the browser allows it; the founder
 * tools for founders.
 */
function setupDoors(): Screen {
  const d = copy.setup.doors;
  const door = (cls: string, pic: Node, title: string, line: string, state: string | null, onTap: () => void) =>
    h(
      'button',
      { class: `door setup-door ${cls}`, attrs: { type: 'button' }, onclick: onTap },
      h('span', { class: 'door-pic', attrs: { 'aria-hidden': 'true' } }, pic),
      h('span', { class: 'door-title', text: title }),
      h('span', { class: 'door-line', text: line }),
      state ? h('span', { class: 'door-state', text: state }) : null,
    );
  const openAccount = () => mount(setupTopic(copy.account.title, cachedAccount() && !cachedAccount()!.anonymous ? d.accountLine : d.accountGuestLine, accountSection()));

  function doors(): HTMLElement[] {
    const account = cachedAccount();
    const guest = !account || account.anonymous;
    const prefs = a11yPrefs();
    const avatar = () => h('span', { class: 'avatar worn', html: avatarSvg(cachedLoadout(), cachedPolish()) });
    // the current theme's square dealt on top of the other's
    const dark = getTheme() === 'dark';
    const squares = h('span', { class: `look-pic${dark ? '' : ' light-on-top'}` },
      h('span', { class: 'as-dark' }, miniBoard(sampleGivens(34, 5), sampleGivens(48, 5))),
      h('span', { class: 'as-light' }, miniBoard(sampleGivens(34, 9), sampleGivens(48, 9))));
    const sizes = h('span', { class: 'a11y-pic' },
      ...TEXT_SIZES.map((size) => h('span', { class: size === prefs.textSize ? 'on' : '', text: 'Aa', attrs: { style: `--size: ${size / 100}` } })));
    const unlocked = founderUnlocked();
    return [
      door('account-door', h('span', { class: 'name-pic' }, h('span', { text: account?.name ?? '' })), copy.account.title,
        guest ? d.accountGuestLine : d.accountLine, guest ? d.guest : d.signedIn, openAccount),
      door('look-door', squares, d.look, d.lookLine, d.lookState(dark ? copy.setup.dark : copy.setup.light, notesWheelOn()),
        () => mount(setupTopic(d.look, d.lookLine, ...lookSections()))),
      door('a11y-door', sizes, copy.setup.a11y.title, d.a11yLine, d.a11yState(prefs.textSize, prefs.sounds), () => mount(accessibilityScreen())),
      door('privacy-door', h('span', { class: 'privacy-pic' }, avatar(), h('i'), h('i'), h('i'), h('span', { class: 'privacy-eye', html: !guest && account?.lbHidden ? ICONS.eyeOff : ICONS.eye })),
        copy.privacy.title, d.privacyLine, guest ? d.privacyGuest : d.privacyState(!account?.lbHidden),
        guest ? openAccount : () => openLazy(() => import('./privacy.ts'), (m) => mount(m.privacyScreen()))),
      canAddToHome()
        ? door('app-door', h('span', { class: 'app-pic' }, h('img', { attrs: { src: document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href ?? '', alt: '' } })),
            copy.install.title, copy.install.help, null, () => void addToHome())
        : null,
      isFounder() && !guest
        ? door('founder-door', h('span', { class: 'founder-pic' }, ...['s0-avatar-happy', 's0-avatar-calm', 's0-avatar-silly'].map((id) => h('span', { class: 'avatar worn', html: avatarSvg({ avatar: id }) })), h('i', { class: 'lens' })),
            copy.founder.title, d.founderLine, d.founderState(unlocked, !!account?.devMode),
            () => (founderUnlocked()
              ? openLazy(() => import('./founderConsole.ts'), (m) => mount(m.founderConsole()))
              : void hasAuthenticator().then((has) => (has === false ? openSetUp() : openCode()))))
        : null,
    ].filter((x): x is HTMLButtonElement => !!x);
  }
  // on the layout grid (banner.css): four doors two across, otherwise three
  const row = h('div', { class: 'door-row field-grid setup-doors' });
  const paint = () => {
    const list = doors();
    row.classList.toggle('two-up', list.length === 4);
    row.replaceChildren(...list);
  };
  paint();
  const el = subPage({ className: 'setup', title: copy.setup.title, onBack: () => void goBack(homeScreen), banner: setupBanner(copy.setup.bannerHelp) }, row);
  // what's set behind each door follows the account (a theme picked on another device, a sign-up)
  const stop = onAccountChange(() => {
    if (!el.isConnected) return stop();
    paint();
  });
  rebuildOnLayout(el, setupScreen);
  return { el, title: copy.setup.title, destroy: stop };
}

/** Which version this is, at the very bottom (vite.config.ts stamps it; build.json has the date and commit too). */
function buildLine(): HTMLElement {
  return h('p', { class: 'build-line', text: copy.setup.build(import.meta.env.VITE_BUILD_NUMBER ?? '0', IS_BETA) });
}

/** Setup's way into the Accessibility page (screens/accessibility.ts). */
function accessibilityLink(): HTMLElement {
  const t = copy.setup.a11y;
  return h(
    'section',
    { class: 'panel setting' },
    h('div', {}, h('h2', { text: t.title }), h('p', { text: t.summary })),
    h('button', { class: 'btn', text: t.open, onclick: () => mount(accessibilityScreen()) }),
  );
}

/**
 * Setup's way into Leaderboard and card (screens/privacy.ts); signed-in players only. A guest
 * is never listed, so the row says how to get there instead (the Account section above
 * signs up).
 */
function privacyLink(): HTMLElement | null {
  const account = cachedAccount();
  if (!account) return null;
  const t = copy.privacy;
  if (account.anonymous) return h('section', { class: 'panel setting' }, h('div', {}, h('h2', { text: t.title }), h('p', { text: t.guestRow })));
  return h(
    'section',
    { class: 'panel setting' },
    h('div', {}, h('h2', { text: t.title }), h('p', { text: t.summary })),
    h('button', { class: 'btn', text: t.open, attrs: { 'aria-label': t.a11yOpen }, onclick: () => openLazy(() => import('./privacy.ts'), (m) => mount(m.privacyScreen())) }),
  );
}

/** Phones and tablets in the browser: how to put Elomental on the Home Screen (install.ts). */
function addToHomeRow(): HTMLElement | null {
  if (!canAddToHome()) return null;
  const t = copy.install;
  return h(
    'section',
    { class: 'panel setting' },
    h('div', {}, h('h2', { text: t.title }), h('p', { text: t.help })),
    h('button', { class: 'btn', text: t.open, onclick: () => void addToHome() }),
  );
}

/**
 * Founders whose session hasn't given an authenticator code yet: the one way to unlock
 * Review and Dev mode. Set up the authenticator the first time, then enter a code.
 */
function founderGate(): HTMLElement {
  const t = copy.founder;
  const button = h('button', { class: 'btn', text: t.unlock, attrs: { type: 'button' } });
  const section = h('section', { class: 'panel setting' }, h('div', {}, h('h2', { text: t.title }), h('p', { text: t.lockedHelp })), button);
  let enrolled: boolean | null = null;
  button.addEventListener('click', () => (enrolled === false ? openSetUp() : openCode()));
  const paint = () => {
    section.hidden = !isFounder() || !!cachedAccount()?.anonymous || founderUnlocked();
    if (section.hidden) return;
    void hasAuthenticator().then((has) => {
      enrolled = has;
      button.textContent = has === false ? t.setUp : t.unlock;
    });
  };
  paint();
  const stop = onAccountChange(() => {
    if (!section.isConnected) return stop();
    paint();
  });
  return section;
}

/** A 6-digit code field, a Verify button and an error line, for the founder sheets. */
function codeForm(check: (code: string) => Promise<string | null>, done: () => void): HTMLElement {
  const t = copy.founder;
  const field = h('input', {
    class: 'text-field mfa-code',
    attrs: { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', pattern: '[0-9]*', 'aria-label': t.codeLabel, placeholder: '000000' },
  });
  const error = h('p', { class: 'field-error', attrs: { role: 'alert' } });
  const verify = h('button', { class: 'btn btn-primary', text: t.verify, attrs: { type: 'submit' } });
  const form = h('form', { class: 'code-form' }, field, error, verify);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const code = field.value.replace(/\D/g, '');
    if (code.length !== 6) return void (error.textContent = t.wrongCode);
    verify.disabled = true;
    void check(code).then((err) => {
      verify.disabled = false;
      if (err) {
        error.textContent = err;
        field.select();
        return;
      }
      toast(t.unlocked);
      done();
    });
  });
  return form;
}

/** Enter a code from the authenticator that's already set up. */
function openCode(): void {
  const t = copy.founder;
  const close = openModal(
    h('div', { class: 'sheet founder-sheet' }, closeButton(() => close()), h('h2', { text: t.unlockTitle }), h('p', { text: t.unlockText }),
      codeForm((code) => verifyCode(code), () => close())),
  );
}

/** The first time: a QR code (and its key) for the authenticator app, then its code. */
function openSetUp(): void {
  const t = copy.founder;
  void startEnrolment().then((e) => {
    if (typeof e === 'string') return toast(e);
    const close = openModal(
      h('div', { class: 'sheet founder-sheet' }, closeButton(() => close()), h('h2', { text: t.setUpTitle }), h('p', { text: t.setUpSteps }),
        h('img', { class: 'founder-qr', attrs: { src: e.qr, alt: t.a11yQr, width: '180', height: '180' } }),
        h('p', { class: 'founder-key' }, h('span', { text: `${t.keyLabel} ` }), h('code', { text: e.secret.replace(/(.{4})(?=.)/g, '$1 ') })),
        codeForm((code) => verifyCode(code, e.factorId), () => close())),
    );
  });
}

/** Founders only: the way into the founder tools (screens/founderConsole.ts; the server checks every tool). */
function devSection(): HTMLElement {
  const help = h('p');
  const section = h(
    'section',
    { class: 'panel setting' },
    h('div', {}, h('h2', { text: copy.setup.dev }), help),
    h('button', { class: 'btn', text: copy.setup.openDev, onclick: () => openLazy(() => import('./founderConsole.ts'), (m) => mount(m.founderConsole())) }),
  );
  const paint = () => {
    section.hidden = !founderUnlocked();
    help.textContent = IS_BETA ? copy.setup.devHelp(!!cachedAccount()?.devMode) : copy.setup.devHelpLive;
  };
  paint();
  const stop = onAccountChange(() => {
    if (!section.isConnected) return stop();
    paint();
  });
  return section;
}

/** Registered: name and sign-out. Guest: the passwordless sign-up form. */
function accountSection(): HTMLElement {
  const section = h('section', { class: 'panel setting account' });
  let busy = false;

  const field = (attrs: Record<string, string>) => h('input', { class: 'text-field', attrs: { autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', ...attrs } });
  const error = h('p', { class: 'field-error', attrs: { role: 'alert' } });
  const fail = (message: string | null) => {
    error.textContent = message ?? '';
    return !message;
  };
  const run = async (button: HTMLButtonElement, task: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      await task();
    } finally {
      busy = false;
      button.disabled = false;
    }
  };

  function paint() {
    const account = cachedAccount();
    error.textContent = '';
    if (account && !account.anonymous) {
      // A name can change once every 15 days; while locked, the field just shows it.
      const locked = account.nextNameChange;
      const name = field({ type: 'text', maxlength: '20', 'aria-label': copy.account.playerName, value: account.name });
      name.disabled = !!locked;
      const save = h('button', { class: 'btn', text: copy.account.saveName });
      save.addEventListener('click', () =>
        run(save, async () => {
          if (name.value.trim() === account.name) return;
          if (!fail(await setDisplayName(name.value))) return;
          toast(copy.account.nameSaved);
          paint();
        }),
      );
      const out = h('button', { class: 'btn', text: copy.account.signOut });
      out.addEventListener('click', () => run(out, async () => {
        const notYet = await signOut();
        if (notYet) toast(notYet);
      }));
      section.replaceChildren(
        h('div', {}, h('h2', { text: copy.account.title }), h('p', { text: copy.account.signedInAs(account.email) })),
        h('label', { class: 'field-label', text: copy.account.playerName }),
        name,
        h('p', {
          class: 'field-hint',
          text: locked
            ? copy.account.nameAgainOn(formatDay(locked))
            : copy.account.nameCooldown(NAME_COOLDOWN_DAYS),
        }),
        ...(locked ? [] : [save]),
        error,
        out,
      );
      return;
    }

    section.replaceChildren(
      signUpForm({
        title: copy.account.title,
        text: account?.anonymous ? copy.account.guestIntro : copy.account.signInIntro,
      }),
    );
  }

  // Repaint only when the account kind changes, so a background refresh
  // never throws away a half-typed email or code.
  let shown = registered();
  paint();
  const stop = onAccountChange(() => {
    if (!section.isConnected) return stop();
    if (registered() === shown) return;
    shown = registered();
    paint();
  });
  return section;
}
