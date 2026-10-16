import { ICONS } from '../icons.ts';
import { dailyKey, dateKey, loadProfile, nextResetIn } from '../profile.ts';
import { h, mount, toast, type Screen } from '../ui.ts';
import { loadSavedGame, resumeGame, startGame } from './game.ts';
import { homeScreen } from './home.ts';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

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
          attrs: { 'aria-label': `${monthName} ${d}: ${state}` },
          onclick: () => {
            if (state === 'missed') toast('Missed squares can be restored with tokens — coming later');
          },
        },
        h('span', { class: 'day-num', text: String(d) }),
        icon ? h('span', { class: 'day-icon', html: icon }) : null,
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
    ? h('div', { class: 'done-today', html: `${ICONS.check}<span>Today's square is complete</span>` })
    : h('button', {
        class: 'btn btn-primary',
        text: resumable ? "Continue today's square" : "Play today's square",
        onclick: () =>
          resumable
            ? resumeGame(resumable)
            : void startGame({ mode: 'daily', difficulty: 'medium', seed: `daily:${today}`, dateKey: today }),
      });

  const el = h(
    'div',
    { class: 'screen daily' },
    h(
      'div',
      { class: 'subbar' },
      h('button', { class: 'icon-btn', html: ICONS.back, attrs: { 'aria-label': 'Back' }, onclick: () => mount(homeScreen()) }),
      h('h1', { text: 'Daily Square' }),
      h('span', { class: 'icon-btn-spacer' }),
    ),
    h('div', { class: 'month-head' }, h('h2', { text: `${monthName} ${year}` }), h('span', { text: `${done} / ${days}` })),
    calendar,
    h(
      'div',
      { class: 'reward-card' },
      h('span', { class: `avatar-reward ${done === days ? 'unlocked' : ''}`, html: done === days ? ICONS.crown : ICONS.lock }),
      h(
        'div',
        {},
        h('strong', { text: `${monthName} avatar` }),
        h('p', { text: done === days ? 'Unlocked — well played.' : 'Complete every square this month to unlock it.' }),
      ),
    ),
    action,
    h('p', { class: 'reset-note', text: `New square in ${hours}h ${minutes}m · resets daily at 3:00` }),
  );
  return { el };
}
