import { reducedMotion } from '../a11y.ts';
import { ICONS } from '../icons.ts';
import { dailyKey, dateKey, loadProfile, nextResetIn } from '../profile.ts';
import { goBack, h, subPage, toast, type Screen } from '../ui.ts';
import { loadSavedGame, resumeGame, startGame } from './game.ts';
import { homeScreen } from './home.ts';
import * as copy from '../copy/en.ts';

const WEEKDAYS = copy.daily.weekdays;

/**
 * The page's calendar, like the Casual feather: its front page lifts in a breeze now and
 * then (CSS), and a tap or click flips it right over the rings to the next day's page;
 * then the turned page fades and settles back in place. Purely decorative: no role, not in the tab order, still when motion is off.
 */
function flippingCalendar(): HTMLElement {
  const el = h('span', { class: 'daily-art', html: ICONS.dailyLive, attrs: { 'aria-hidden': 'true' } });
  const turn = el.querySelector<HTMLElement>('.calendar-turn')!;
  // the page's two sides (the turning box itself can't fade: that would flatten its 3D)
  const sides = [...turn.children] as HTMLElement[];
  let flipping = false;
  // The hinge is the binder rings, tilted with the drawing (-6deg), so the page turns about them.
  const at = (deg: number) => `perspective(420px) rotate(-6deg) rotateX(${deg}deg) rotate(6deg)`;
  el.addEventListener('pointerdown', () => {
    if (reducedMotion() || flipping) return;
    flipping = true;
    const flip = turn.animate(
      [
        { transform: at(0), easing: 'cubic-bezier(0.45, 0, 0.25, 1)' },
        { transform: at(180), offset: 0.5 },
        { transform: at(180), offset: 1 },
      ],
      { duration: 1300 },
    );
    // once it lies over the top, the turned page fades and the next one fades in below
    for (const side of sides) {
      side.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0, offset: 0.8 }, { opacity: 0 }], { duration: 1300 });
    }
    void flip.finished.then(
      () => {
        // (the front side only: the back keeps its own turned-round transform, out of sight)
        sides[0].animate([{ opacity: 0, translate: '0 -3%' }, { opacity: 1, translate: '0 0' }], { duration: 320, easing: 'ease-out' });
        flipping = false;
      },
      () => (flipping = false),
    );
  });
  return el;
}

export function dailyScreen(): Screen {
  const profile = loadProfile();
  const today = dailyKey();
  const [year, month, day] = today.split('-').map(Number);
  const days = new Date(year, month, 0).getDate();
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Monday first
  const monthName = new Date(year, month - 1, 1).toLocaleString('en', { month: 'long' });

  const calendar = h('div', { class: 'calendar' });
  for (const w of WEEKDAYS) calendar.append(h('span', { class: 'weekday', text: w }));
  for (let i = 0; i < firstWeekday; i++) calendar.append(h('span'));

  let done = 0;
  for (let d = 1; d <= days; d++) {
    const key = dateKey(year, month - 1, d);
    const completed = !!profile.daily[key];
    if (completed) done++;
    const state = completed ? 'done' : d < day ? 'missed' : d === day ? 'today' : 'future';
    const icon = state === 'done' ? ICONS.check : state === 'missed' ? ICONS.close : '';
    calendar.append(
      h(
        'button',
        {
          class: `day ${state}`,
          attrs: { 'aria-label': copy.daily.a11yDay(monthName, d, state) },
          onclick: () => {
            if (state === 'missed') toast(copy.daily.missedLater);
          },
        },
        // Done days show a check instead of the number; every other day shows its number.
        state === 'done' ? h('span', { class: 'day-icon', html: icon }) : h('span', { class: 'day-num', text: String(d) }),
      ),
    );
  }

  const saved = loadSavedGame();
  const resumable = saved?.config.mode === 'daily' && saved.config.dateKey === today ? saved : null;
  const doneToday = !!profile.daily[today];
  const untilReset = nextResetIn();
  const hours = Math.floor(untilReset / 3_600_000);
  const minutes = Math.floor((untilReset % 3_600_000) / 60_000);

  const action = doneToday
    ? h('div', { class: 'done-today', html: `${ICONS.check}<span>${copy.daily.doneToday}</span>` })
    : h('button', {
        class: 'btn btn-primary',
        text: resumable ? copy.daily.continue : copy.daily.play,
        onclick: () =>
          resumable
            ? resumeGame(resumable)
            : void startGame({ mode: 'daily', difficulty: 'medium', seed: `daily:${today}`, dateKey: today }),
      });

  const progress = h('div', { class: 'month-progress', attrs: { 'aria-hidden': 'true' } }, h('span'));
  progress.firstElementChild!.setAttribute('style', `width:${(done / days) * 100}%`);

  // Header, then one block centred in the space below it: the month card
  // (title, progress, calendar), the avatar reward and the play button.
  const el = subPage(
    { className: 'daily', title: copy.daily.title, onBack: () => void goBack(homeScreen) },
    h(
      'div',
      { class: 'daily-body' },
      flippingCalendar(),
      h(
        'section',
        { class: 'month-card' },
        h(
          'div',
          { class: 'month-head' },
          h('h2', { text: `${monthName} ${year}` }),
          h('span', { class: 'month-count', text: copy.daily.monthCount(done, days) }),
        ),
        progress,
        calendar,
      ),
      h(
        'div',
        { class: 'reward-card' },
        h('span', { class: `avatar-reward ${done === days ? 'unlocked' : ''}`, html: done === days ? ICONS.crown : ICONS.lock }),
        h(
          'div',
          {},
          h('strong', { text: copy.daily.avatar(monthName) }),
          h('p', { text: done === days ? copy.daily.avatarUnlocked : copy.daily.avatarLocked }),
        ),
      ),
      h('div', { class: 'daily-actions' }, action, h('p', { class: 'reset-note', text: copy.daily.nextIn(hours, minutes) })),
    ),
  );
  return { el, title: copy.daily.title };
}
