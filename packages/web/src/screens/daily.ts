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
 * then (CSS), and a tap or click tears it off along its zig-zag perforation: it rips from
 * the right, hangs a moment by its left corner, then drops away, showing the next day's
 * page; the stub stays on the rings. Then today's page settles back in place. Purely
 * decorative: no role, not in the tab order, still when motion is off.
 */
function tearOffCalendar(): HTMLElement {
  const el = h('span', { class: 'daily-art', html: ICONS.dailyLive, attrs: { 'aria-hidden': 'true' } });
  const page = el.querySelector<HTMLElement>('.calendar-fall')!;
  let tearing = false;
  el.addEventListener('pointerdown', () => {
    if (reducedMotion() || tearing) return;
    tearing = true;
    // pivots on the tear's left end until that lets go too (styles.css sets the origin)
    const rip = page.animate(
      [
        { transform: 'none', opacity: 1, easing: 'cubic-bezier(0.3, 0, 0.4, 1)' },
        { transform: 'rotate(6deg)', offset: 0.1 },
        { transform: 'translate(0.5%, 1.5%) rotate(9deg)', offset: 0.2 },
        { transform: 'translate(1.5%, 3.5%) rotate(11deg)', offset: 0.3, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)' },
        { transform: 'translate(8%, 60%) rotate(20deg)', opacity: 1, offset: 0.62 },
        { transform: 'translate(14%, 130%) rotate(30deg)', opacity: 0 },
      ],
      { duration: 1500 },
    );
    void rip.finished.then(
      () => {
        page.animate([{ opacity: 0, transform: 'translateY(-4%)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 700, easing: 'ease-out', fill: 'backwards' })
          .finished.then(() => (tearing = false), () => (tearing = false));
      },
      () => (tearing = false),
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
      tearOffCalendar(),
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
