import { reducedMotion } from '../a11y.ts';
import { ICONS } from '../icons.ts';
import { dailyBadgeNeed, dailyGoal, dailyKey, dailyStreak, dateKey, loadProfile, nextResetIn } from '../profile.ts';
import { badgeMonth } from '../badges.ts';
import { cachedAccount, refreshAccount } from '../backend/account.ts';
import { MEND_COST, MENDS_A_MONTH, mendDaily } from '../backend/forge.ts';
import { miniBoard, sampleGivens } from '../miniBoard.ts';
import { holdToConfirm } from '../hold.ts';
import { closeButton, goBack, h, mount, openModal, rebuildOnLayout, subPage, toast, wideLayout, type Screen } from '../ui.ts';
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
/**
 * A missed day this month: fill it in for Stardust (3 a month), or say why not. `badgeNote`
 * says honestly what this fill-in does for the month's badge.
 */
function openMend(key: string, label: string, left: number, badgeNote: string): void {
  const account = cachedAccount();
  if (!account) {
    toast(copy.daily.mendOffline);
    return;
  }
  let action: HTMLElement;
  if (left <= 0) action = h('p', { class: 'note', text: copy.daily.mendNoneLeft });
  else {
    const btn = h('button', { class: 'btn btn-primary', text: copy.daily.mend(MEND_COST) });
    btn.disabled = account.stardust < MEND_COST;
    // spends Stardust: held to confirm (hold.ts)
    action = holdToConfirm(btn, () => {
      btn.disabled = true;
      void mendDaily(key).then(async ({ error, badge }) => {
        close();
        if (error) return toast(error);
        toast(badge ? copy.result.monthBadgeEarned(badgeMonth(badge)) : copy.daily.mended(label));
        await refreshAccount();
        mount(dailyScreen());
      });
    });
  }
  const close = openModal(
    h(
      'div',
      { class: 'sheet mend-sheet' },
      closeButton(() => close()),
      h('h2', { text: copy.daily.mendTitle(label) }),
      h('p', { text: copy.daily.mendText }),
      h('p', { text: badgeNote }),
      h('p', { class: 'note', text: copy.daily.mendLeft(Math.max(0, left), account.stardust) }),
      action,
    ),
  );
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

  // Fill-ins and badges live on the server: without an account there are none to use.
  const account = cachedAccount();
  const mended = account?.mended ?? {};
  const prefix = today.slice(0, 8);
  const mendsLeft = account ? Math.max(0, MENDS_A_MONTH - Object.keys(mended).filter((k) => k.startsWith(prefix)).length) : 0;

  const saved = loadSavedGame('daily');
  const resumable = saved?.config.mode === 'daily' && saved.config.dateKey === today ? saved : null;
  const doneToday = !!profile.daily[today];
  const playToday = () =>
    resumable ? resumeGame(resumable) : void startGame({ mode: 'daily', difficulty: 'medium', seed: `daily:${today}`, dateKey: today });

  type DayState = 'done' | 'mended' | 'missed' | 'today' | 'future';
  const states: DayState[] = [];
  for (let d = 1; d <= days; d++) {
    const key = dateKey(year, month - 1, d);
    states.push(profile.daily[key] ? (mended[key] ? 'mended' : 'done') : d < day ? 'missed' : d === day ? 'today' : 'future');
  }
  const done = states.filter((s) => s === 'done' || s === 'mended').length;
  const missed = states.filter((s) => s === 'missed').length;

  // The month's badge: 20 days solved or filled in. Out of reach once even every day left plus
  // every fill-in can't get there; fill-ins are only worth suggesting when solving alone can't.
  const need = dailyBadgeNeed(days);
  const earned = done >= need;
  const bySolving = done + (days - day) + (doneToday ? 0 : 1);
  const reach = bySolving + Math.min(missed, mendsLeft);
  const nextMonth = new Date(year, month, 1).toLocaleString('en', { month: 'long' });
  const badgeLine = !account
    ? copy.daily.badgeNeedsAccount
    : earned
      ? copy.daily.badgeEarned
      : reach < need
        ? copy.daily.badgeOutOfReach(nextMonth)
        : copy.daily.badgeHow(need);
  const mendHint =
    account && !earned && bySolving < need && reach >= need ? h('p', { class: 'note mend-hint', text: copy.daily.mendHint(MEND_COST, mendsLeft) }) : null;
  const mendBadgeNote = earned ? copy.daily.mendBadgeHeld(monthName) : reach < need ? copy.daily.mendNoBadge(monthName) : copy.daily.mendToward(done + 1, need);

  states.forEach((state, i) => {
    const d = i + 1;
    const key = dateKey(year, month - 1, d);
    const label = copy.daily.a11yDay(monthName, d, state);
    const icon = state === 'done' || state === 'mended' ? ICONS.check : '';
    calendar.append(
      h(
        'button',
        {
          class: `day ${state}`,
          attrs: {
            'aria-label': state === 'today' && !doneToday ? copy.daily.a11yPlayToday(label, !!resumable) : state === 'missed' ? copy.daily.a11yFillIn(label) : label,
            // solved and coming days do nothing when tapped
            ...(state === 'done' || state === 'mended' || state === 'future' ? { 'aria-disabled': 'true' } : {}),
          },
          onclick: () => {
            if (state === 'missed') openMend(key, `${monthName} ${d}`, mendsLeft, mendBadgeNote);
            else if (state === 'today') playToday();
          },
        },
        // Done days show a check instead of the number; every other day shows its number.
        icon ? h('span', { class: 'day-icon', html: icon }) : h('span', { class: 'day-num', text: String(d) }),
      ),
    );
  });

  const untilReset = nextResetIn();
  const hours = Math.floor(untilReset / 3_600_000);
  const minutes = Math.floor((untilReset % 3_600_000) / 60_000);

  const action = doneToday
    ? h('div', { class: 'done-today', html: `${ICONS.check}<span>${copy.daily.doneToday}</span>` })
    : h('button', { class: 'btn btn-primary', text: resumable ? copy.daily.continue : copy.daily.play, onclick: playToday });

  // the streak: days in a row, and what keeps it going today (days.ts dailyStreak)
  const run = dailyStreak(profile.daily, today);
  const streak = h('p', {
    class: 'daily-streak',
    text: run ? (doneToday ? copy.daily.streakTomorrow(run) : copy.daily.streakToday(run)) : copy.daily.streakStart,
  });

  const progress = h('div', { class: 'month-progress', attrs: { 'aria-hidden': 'true' } }, h('span'));
  // the count and bar go toward the badge's 20 until it's earned, then the whole month
  const goal = dailyGoal(done, days);
  progress.firstElementChild!.setAttribute('style', `width:${Math.min(1, done / goal) * 100}%`);

  const monthCard = h(
    'section',
    { class: 'panel month-card' },
    h(
      'div',
      { class: 'month-head' },
      h('h2', { text: `${monthName} ${year}` }),
      h('span', { class: 'month-count', text: copy.daily.monthCount(done, goal) }),
    ),
    progress,
    streak,
    calendar,
    mendHint,
  );
  const reward = h(
    'div',
    { class: 'panel reward-card' },
    h('span', { class: `avatar-reward ${earned ? 'unlocked' : ''}`, html: earned ? ICONS.crown : ICONS.lock }),
    h('div', {}, h('strong', { text: copy.daily.monthBadge(monthName) }), h('p', { text: badgeLine })),
  );
  const resetNote = h('p', { class: 'reset-note', text: copy.daily.nextIn(hours, minutes) });

  // Wide screens (banner.css): the calendar on the banner with the month's count at its
  // foot; the month beside today's door (its square, waiting or new: one click plays it) and the
  // month's badge. Phones: header, then one block centred below it: the month card, the month's
  // badge and the play button.
  const wide = wideLayout();
  const doorLine = h('span', { class: 'door-line', text: copy.daily.nextIn(hours, minutes) });
  const todayDoor = doneToday
    ? h('div', { class: 'panel today-card' }, action, resetNote)
    : h(
        'button',
        { class: 'door today-door', attrs: { type: 'button' }, onclick: playToday },
        h('span', { class: 'door-pic', attrs: { 'aria-hidden': 'true' } },
          h('span', { class: 'dealt' }, resumable ? miniBoard(resumable.config.puzzle, resumable.values.map((v) => v || 0).join('')) : miniBoard(sampleGivens(32, day)))),
        h('span', { class: 'door-title', text: resumable ? copy.daily.continue : copy.daily.play }),
        doorLine,
      );
  const el = subPage(
    {
      className: 'daily',
      title: copy.daily.title,
      onBack: () => void goBack(homeScreen),
      banner: {
        art: wide ? tearOffCalendar() : null,
        help: copy.daily.bannerHelp,
        // every Daily you've solved (the month is in the card beside it), as Casual counts its squares
        foot: h('p', { class: 'banner-stat' },
          h('strong', { text: copy.formatNumber(Object.keys(profile.daily).length) }),
          h('span', { text: copy.daily.bannerStat })),
      },
    },
    wide
      // today's door first, for the keyboard and at large text (one column); the month sits left of it (pages.css)
      ? h('div', { class: 'daily-field field-grid' }, h('div', { class: 'daily-side' }, todayDoor, reward), monthCard)
      : h('div', { class: 'daily-body' }, tearOffCalendar(), monthCard, reward, h('div', { class: 'daily-actions' }, action, resetNote)),
  );
  rebuildOnLayout(el, dailyScreen);
  // (a wide screen's field may scroll: there the month keeps its square days)
  const stopFit = wide ? () => undefined : fitWithoutScrolling(el, calendar, Math.ceil((firstWeekday + days) / 7));
  // the countdown keeps time, and at the reset the page turns to the new day's square
  const tick = window.setInterval(() => {
    if (!el.isConnected) return;
    const left = nextResetIn();
    if (dailyKey() !== today) return mount(dailyScreen());
    const text = copy.daily.nextIn(Math.floor(left / 3_600_000), Math.floor((left % 3_600_000) / 60_000));
    doorLine.textContent = text;
    resetNote.textContent = text;
  }, 30_000);
  return { el, title: copy.daily.title, destroy: () => { stopFit(); clearInterval(tick); } };
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
