import './styles.css';
import './frames.css';
import { cachedAccount, initBackend, onAccountChange, refreshAccount } from './backend.ts';
import { readJson, writeJson } from './storage.ts';
import { flushPending, pendingResults } from './backend/pending.ts';
import { installWheelScroll, installZoomGuards } from './gestures.ts';
import { dailyScreen } from './screens/daily.ts';
import { homeScreen } from './screens/home.ts';
import { splashDue, welcomeScreen } from './screens/welcome.ts';
import { installA11y } from './a11y.ts';
import { applyTheme } from './theme.ts';
import { h, mount, openModal, toast } from './ui.ts';
import * as copy from './copy/en.ts';
import { installStandaloneFixes } from './viewport.ts';
import { installUiScale } from './scale.ts';
import { installCursorZoom } from './cursor.ts';
import { applyGrain } from './grain.ts';
import { installAddToHome } from './install.ts';
import { installUpdateCheck } from './update.ts';
import { betaGateScreen, betaLocked, installBetaMark } from './beta.ts';
import { emailOff } from './reminders.ts';

applyTheme();
installBetaMark();
installA11y();
applyGrain();
installUiScale();
installCursorZoom();
installZoomGuards();
installWheelScroll();
installStandaloneFixes();
installAddToHome();
installUpdateCheck();
initBackend();

// Results that finished without a connection (backend/pending.ts): sent on launch and
// whenever the connection comes back.
const sendPending = () => {
  if (!pendingResults().length) return;
  void flushPending().then(({ sent, refused }) => {
    // counted, or the server's reason it wasn't (e.g. already counted when its first answer was lost)
    if (sent) toast(copy.game.pendingSent(sent));
    else if (refused.length) toast(refused[0]);
    if (sent || refused.length) void refreshAccount();
  });
};
window.addEventListener('online', sendPending);
sendPending();

// A guest who played offline, then got an account in this session (a guest account, or a
// sign-up): once, say plainly that the offline games didn't move over (decision D9; the
// server never takes progress from the device). Shown as a pop-up on Home, after the splash
// and never over another pop-up, so it's read; not for players who had an account already.
const OFFLINE_NOTE_KEY = 'elomental:offline-note';
const hadAccount = !!cachedAccount();
const offlineProgress = () => {
  const local = readJson<{ rankedGames?: number; dust?: number; daily?: Record<string, true> }>('elomental:profile');
  return !!local && !!(local.rankedGames || local.dust || Object.keys(local.daily ?? {}).length);
};
let offlineNoteQueued = false;
onAccountChange(() => {
  if (hadAccount || offlineNoteQueued || !cachedAccount() || readJson<boolean>(OFFLINE_NOTE_KEY) || !offlineProgress()) return;
  offlineNoteQueued = true;
  const show = () => {
    if (!document.querySelector('.tile.area-casual') || document.querySelector('.modal')) return void setTimeout(show, 800);
    writeJson(OFFLINE_NOTE_KEY, true);
    const close = openModal(
      h('div', { class: 'confirm' },
        h('h2', { text: copy.account.offlineTitle }),
        h('p', { text: copy.account.offlineText }),
        h('button', { class: 'btn btn-primary', text: copy.account.offlineOk, attrs: { type: 'button' }, onclick: () => close() })),
    );
  };
  setTimeout(show, 800);
});

// Beta: only the sign-in until an invited tester has signed in, and back to it on signing out.
onAccountChange(() => {
  const gate = !!document.querySelector('.screen.beta-gate');
  if (betaLocked() && !gate) mount(betaGateScreen());
  else if (!betaLocked() && gate) mount(homeScreen());
});

// A Daily reminder's tap or link (?open=daily, reminders.ts) opens straight at the Daily Square;
// the email's turn-off link (?reminders-off=<token>) asks first, then turns the emails off.
const params = new URLSearchParams(location.search);
const openDaily = params.get('open') === 'daily';
const offToken = params.get('reminders-off');
if (openDaily || offToken) history.replaceState(null, '', location.pathname);

// A reminder tapped while the game is open (public/sw.js): the Daily, unless a game is in progress.
navigator.serviceWorker?.addEventListener('message', (event: MessageEvent<{ type?: string }>) => {
  if (event.data?.type !== 'open-daily' || betaLocked()) return;
  if (document.querySelector('.screen.game')) toast(copy.reminders.waiting);
  else mount(dailyScreen());
});

/** The turn-off link's question, over whatever screen opened. */
function askEmailOff(token: string) {
  const t = copy.reminders;
  const result = h('p', { attrs: { role: 'status' } });
  const done = h('button', { class: 'btn', text: copy.common.close, attrs: { type: 'button' }, onclick: () => close() });
  const yes = h('button', {
    class: 'btn btn-primary',
    text: t.offYes,
    attrs: { type: 'button' },
    onclick: async () => {
      yes.disabled = true;
      result.textContent = await emailOff(token);
      actions.replaceChildren(done);
      done.focus();
    },
  });
  const actions = h('div', { class: 'actions' }, yes, h('button', { class: 'btn', text: t.offKeep, attrs: { type: 'button' }, onclick: () => close() }));
  const close = openModal(h('div', { class: 'confirm' }, h('h2', { text: t.offAsk }), result, actions));
}

// The splash once a day (full review M21); other launches fade straight into Home.
if (betaLocked()) mount(betaGateScreen());
else if (openDaily) mount(dailyScreen());
else if (splashDue()) mount(welcomeScreen());
else {
  mount(homeScreen());
  document.querySelector('.screen.home')?.classList.add('launch');
}
if (offToken) askEmailOff(offToken);
