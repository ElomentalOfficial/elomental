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
/** How far each strip is bent, in total, at the strongest breath: more and more towards the bottom. */
const CURL_MAX = [6, 15, 27, 42, 58, 75];
/** How far the whole page tips up from the rings at the strongest breath of wind. */
const LIFT_MAX = 18;
/** One rise and settle of the page, in seconds: the same slow pace as the Casual feather's float. */
const BREATH_S = 4.2;

/**
 * The breeze: the page never stops and never lies flat. It sways up and down once every
 * 4.2s, as slow and soft as the feather's float, with a faint quicker flutter on top.
 * Underneath, the strength drifts on two long, out-of-step waves (19s and 31s), so most of
 * the time it's a clear, gentle curl and now and then it builds into a full one, never on a
 * pattern you can hear ticking. Each frame tips the page from the
 * rings and curls its strips; every strip is moved up by how much the ones above it
 * shortened, so the page stays in one piece (styles.css). Still with Reduce motion.
 */
function breeze(art: HTMLElement): void {
  const turn = art.querySelector<HTMLElement>('.calendar-turn')!;
  const strips = [...art.querySelectorAll<HTMLElement>('.curl')];
  const lengths = CURL_TOPS.slice(1).map((top, i) => top - CURL_TOPS[i]);
  const start = Math.random() * 600; // each visit starts somewhere else in the drift
  const wave = (t: number, period: number, phase = 0) => Math.sin((2 * Math.PI * t) / period + phase);
  const pose = (f: number) => {
    turn.style.transform = f ? `perspective(1400px) rotate(-6deg) rotateX(${(LIFT_MAX * f).toFixed(2)}deg) rotate(6deg)` : '';
    strips.forEach((strip, k) => {
      let shift = 0;
      for (let j = 0; j < k; j++) shift += lengths[j] * (Math.cos((CURL_MAX[j] * f * Math.PI) / 180) - 1);
      const angle = CURL_MAX[k] * f;
      strip.style.transform = f ? `perspective(1400px) translateY(${shift.toFixed(2)}%) rotateX(${angle.toFixed(2)}deg)` : '';
      strip.style.filter = f ? `brightness(${(1 - (0.16 * angle) / 90).toFixed(3)})` : '';
    });
  };
  const frame = (now: number) => {
    if (!art.isConnected) return;
    if (reducedMotion()) pose(0);
    else {
      const t = now / 1000 + start;
      // a clear curl most of the time (0.4), sometimes all the way (1), always changing smoothly
      const drift = (wave(t, 19) + wave(t, 31, 1.3)) / 2;
      const strength = 0.4 + 0.6 * Math.max(0, drift) ** 2;
      // it never lies flat: it sways between a third and all of that strength, with a faint
      // quicker flutter on top so it feels like moving air, not a metronome
      const sway = (1 - Math.cos((2 * Math.PI * t) / BREATH_S)) / 2;
      const flutter = 0.06 * wave(t, 1.7, 0.4) + 0.04 * wave(t, 2.9, 2.1);
      pose(Math.max(0, strength * (0.32 + 0.68 * sway + flutter)));
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
/**
 * The page's calendar, like the Casual feather: its front page lifts and curls in a slow,
 * endless breeze (`breeze`), and taps tear it off along its zig-zag perforation. The first two taps or
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
  // only the drawing takes taps, not the empty row around it (like the feather's own box)
  const drawing = el.querySelector<HTMLElement>('.calendar-live')!;
  drawing.addEventListener('pointerdown', () => {
    if (reducedMotion() || falling) return;
    const from = HANGING[taps];
    taps++;
    // tomorrow's page shows through the tear only once there is one (styles.css)
    drawing.classList.add('tearing');
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
      drawing.classList.remove('tearing');
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
