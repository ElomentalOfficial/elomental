import { reducedMotion } from '../a11y.ts';
import { ICONS } from '../icons.ts';
import { dailyKey, dateKey, loadProfile, nextResetIn } from '../profile.ts';
import { goBack, h, subPage, toast, type Screen } from '../ui.ts';
import { loadSavedGame, resumeGame, startGame } from './game.ts';
import { homeScreen } from './home.ts';
import * as copy from '../copy/en.ts';

const WEEKDAYS = copy.daily.weekdays;

/** Where each curl strip's top edge sits, in % of the drawing's height (styles.css `.curl-*`). */
const CURL_TOPS = [34, 46, 57, 67, 76, 85];
/** How far each strip is bent, in total, at the strongest gust: more and more towards the bottom. */
const CURL_MAX = [6, 15, 27, 42, 58, 75];
/** How far the whole page tips up from the rings at the strongest gust. */
const LIFT_MAX = 18;
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/**
 * The breeze: gusts at random times (every 4 to 6s), each with its own strength, length and
 * flutter, so it never repeats like a loop. Most are a clear lift and curl, some stronger.
 * Each gust tips the page from the rings and curls its strips; every strip is moved up by
 * how much the ones above it shortened, so the page stays in one piece (styles.css).
 */
function breeze(art: HTMLElement): void {
  const turn = art.querySelector<HTMLElement>('.calendar-turn')!;
  const strips = [...art.querySelectorAll<HTMLElement>('.curl')];
  const lengths = CURL_TOPS.slice(1).map((top, i) => top - CURL_TOPS[i]);
  const gust = () => {
    if (!art.isConnected) return;
    if (!reducedMotion() && !document.hidden) {
      const strength = Math.random() < 0.75 ? rand(0.75, 1) : rand(1, 1.2);
      // the gust's shape over time: a lift, then a few flutters that die away
      const shape = [{ offset: 0, f: 0 }];
      const rise = rand(0.18, 0.32);
      shape.push({ offset: rise, f: 1 });
      const flutters = Math.floor(rand(1, 4));
      let high = 1;
      for (let i = 0; i < flutters; i++) {
        const low = high * rand(0.15, 0.5);
        high *= rand(0.4, 0.8);
        const step = (1 - rise) / (flutters * 2 + 1);
        shape.push({ offset: rise + step * (i * 2 + 1), f: low }, { offset: rise + step * (i * 2 + 2), f: high });
      }
      shape.push({ offset: 1, f: 0 });
      const options = { duration: rand(1100, 2200), easing: 'linear' };
      const keyframe = (offset: number, transform: string, extra = {}) => ({ offset, transform, easing: 'ease-in-out', ...extra });
      turn.animate(shape.map(({ offset, f }) => keyframe(offset, `perspective(1400px) rotate(-6deg) rotateX(${LIFT_MAX * strength * f}deg) rotate(6deg)`)), options);
      strips.forEach((strip, k) => {
        strip.animate(
          shape.map(({ offset, f }) => {
            const bend = (j: number) => (CURL_MAX[j] * strength * f * Math.PI) / 180;
            let shift = 0;
            for (let j = 0; j < k; j++) shift += lengths[j] * (Math.cos(bend(j)) - 1);
            const angle = CURL_MAX[k] * strength * f;
            return keyframe(offset, `perspective(1400px) translateY(${shift.toFixed(2)}%) rotateX(${angle.toFixed(1)}deg)`, { filter: `brightness(${(1 - (0.16 * angle) / 90).toFixed(3)})` });
          }),
          options,
        );
      });
    }
    setTimeout(gust, rand(4000, 6000));
  };
  setTimeout(gust, rand(800, 2200));
}

/**
 * The page's calendar, like the Casual feather: its front page lifts in a breeze now and
 * then (`breeze`), and taps tear it off along its zig-zag perforation. The first two taps or
 * clicks only rip it further from the right, and it stays hanging by its left corner;
 * the third tears it free and it drops away, showing the next day's page, while the stub
 * stays on the rings. Then today's page settles back in place. Purely decorative: no
 * role, not in the tab order, still when motion is off.
 */
function tearOffCalendar(): HTMLElement {
  const el = h('span', { class: 'daily-art', html: ICONS.dailyLive, attrs: { 'aria-hidden': 'true' } });
  const page = el.querySelector<HTMLElement>('.calendar-fall')!;
  // how far it hangs after each of the first taps; it pivots on the tear's left end
  // (styles.css sets the origin)
  const HANGING = ['none', 'translate(0.4%, 1%) rotate(5.5deg)', 'translate(0.9%, 2.2%) rotate(10deg)'];
  breeze(el);
  let taps = 0;
  let falling = false;
  el.addEventListener('pointerdown', () => {
    if (reducedMotion() || falling) return;
    const from = HANGING[taps];
    taps++;
    page.getAnimations().forEach((a) => a.cancel());
    if (taps < 3) {
      // a jerk past the new tear, then it sags back and stays there
      const to = HANGING[taps];
      page.animate(
        [
          { transform: from },
          { transform: `${to} rotate(2.5deg)`, offset: 0.35 },
          { transform: `${to} rotate(-0.8deg)`, offset: 0.7 },
          { transform: to },
        ],
        { duration: 420, easing: 'ease-out', fill: 'forwards' },
      );
      return;
    }
    falling = true;
    const rip = page.animate(
      [
        { transform: from, opacity: 1, easing: 'cubic-bezier(0.3, 0, 0.4, 1)' },
        { transform: 'translate(1.5%, 3.5%) rotate(12deg)', offset: 0.14, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)' },
        { transform: 'translate(8%, 60%) rotate(20deg)', opacity: 1, offset: 0.55 },
        { transform: 'translate(14%, 130%) rotate(30deg)', opacity: 0 },
      ],
      { duration: 1200 },
    );
    const done = () => {
      taps = 0;
      falling = false;
    };
    void rip.finished.then(
      () => {
        page.animate([{ opacity: 0, transform: 'translateY(-4%)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 700, easing: 'ease-out', fill: 'backwards' })
          .finished.then(done, done);
      },
      done,
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
  const stopFit = fitWithoutScrolling(el, calendar, Math.ceil((firstWeekday + days) / 7));
  return { el, title: copy.daily.title, destroy: stopFit };
}

/**
 * One mode, one action: the Daily page never scrolls. When the screen is too short for
 * everything at full size, the month's days turn from squares into shorter tiles, just
 * enough to fit (down to 24px); only then does the calendar drawing above give up some
 * of its height. Not with large text, which may scroll. Runs again on every resize.
 */
function fitWithoutScrolling(page: HTMLElement, calendar: HTMLElement, weeks: number): () => void {
  const body = page.querySelector<HTMLElement>('.sub-body')!;
  const art = page.querySelector<HTMLElement>('.daily-art')!;
  const fit = () => {
    calendar.classList.remove('fitted');
    calendar.style.removeProperty('--day-h');
    art.style.minHeight = '';
    if (!page.isConnected || document.documentElement.hasAttribute('data-large-text')) return;
    let over = body.scrollHeight - body.clientHeight;
    if (over <= 0) return;
    const square = calendar.querySelector<HTMLElement>('.day')!.offsetHeight;
    calendar.style.setProperty('--day-h', `${Math.max(24, Math.floor(square - over / weeks))}px`);
    calendar.classList.add('fitted');
    over = body.scrollHeight - body.clientHeight;
    if (over > 0) art.style.minHeight = `${Math.max(64, art.offsetHeight - over)}px`;
  };
  const watch = new ResizeObserver(() => fit());
  watch.observe(body);
  return () => watch.disconnect();
}
