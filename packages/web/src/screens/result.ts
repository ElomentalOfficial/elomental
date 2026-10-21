import { reducedMotion } from '../a11y.ts';
import { signUpForm } from '../accountForm.ts';
import { affinityDue } from '../backend/affinity.ts';
import { cachedAccount, registered, signedIn } from '../backend.ts';
import { badgeMonth } from '../badges.ts';
import type { ClashResult } from '../clash.ts';
import { clashTable, clashVerdict, shareButton } from '../clashView.ts';
import { ICONS } from '../icons.ts';
import { rankName } from '../rankName.ts';
import { addToHomeResultNote } from '../install.ts';
import { TECHNIQUE_BY_ID } from '@elomental/engine';
import { dailyGoal, parMs, promoted, rankTier, type Outcome } from '../profile.ts';
import { rankProgress } from '../rankBar.ts';
import { dropReveal, influenceLine, progressLine } from '../reward.ts';
import { readJson, writeJson } from '../storage.ts';
import { formatTime, goBack, h, openModal } from '../ui.ts';
import { affinityScreen } from './affinity.ts';
import { dailyScreen } from './daily.ts';
import { forgeScreen } from './forge.ts';
import { startGame, type SavedGame } from './game.ts';
import { homeScreen } from './home.ts';
import * as copy from '../copy/en.ts';

/**
 * The end of a game (game.ts finish): the result dialog, the Clash comparison, and the one
 * optional line under either.
 */

export type FinishReason = 'solved' | 'mistakes' | 'concede';

/** The mistake rule the game ran under: `max` mistakes, or no limit (`on` false, Casual's setting). */
export interface MistakeRule {
  max: number;
  on: boolean;
}

export function showClashResult(code: string, mine: ClashResult, theirs: ClashResult | null, outcome: Outcome, notice?: string, online = false) {
  const verdict = clashVerdict(mine, theirs);
  const rewards = h('div', { class: 'rewards' });
  if (outcome.dust) rewards.append(h('div', { class: 'reward' }, h('span', { html: ICONS.dust }), h('span', { text: copy.common.plusStardust(outcome.dust) })));
  if (outcome.spirit) rewards.append(h('div', { class: 'reward rare', html: `${ICONS.spirit}<span>${copy.common.rareSpirit}</span>` }));
  rewards.append(...capLines(outcome));
  openModal(
    h(
      'div',
      { class: 'result clash-result' },
      h('h2', { class: verdict.tone, text: verdict.title }),
      notice ? h('p', { class: 'note', text: notice }) : null,
      h('p', {
        class: 'note',
        text: online
          ? theirs
            ? copy.clash.resultNote.onlineAnswered
            : copy.clash.resultNote.onlineWaiting
          : theirs
            ? copy.clash.resultNote.offlineAnswered
            : copy.clash.resultNote.offlineWaiting,
      }),
      clashTable(code, mine, theirs),
      rewards.childElementCount ? rewards : null,
      resultExtra(mine.solved, !!outcome.drop),
      h(
        'div',
        { class: 'actions' },
        shareButton(code, mine, theirs ? copy.clash.sendResult : copy.clash.challengeFriend),
        h('button', { class: 'btn', text: copy.common.home, onclick: () => void goBack(homeScreen) }),
      ),
    ),
    { dismissible: false },
  );
}

export function showResult(game: SavedGame, won: boolean, reason: FinishReason, outcome: Outcome, mistakes: MistakeRule, notice?: string) {
  const { config } = game;
  const ranked = config.mode === 'ranked';
  const titles = copy.result.titles;
  // One line on how it went: a win line that fits the game, or a kind word after a loss
  // (a failed Daily has its own retry note below instead).
  const line = won
    ? copy.result.winLine({ mistakes: game.mistakes, hints: game.hints, maxMistakes: mistakes.max }, config.seed)
    : config.mode === 'daily'
      ? null
      : copy.result.lossLine(reason === 'mistakes' ? 'mistakes' : 'concede');
  const rows: (HTMLElement | null)[] = [
    notice ? h('p', { class: 'note', text: notice }) : null,
    line ? h('p', { class: 'note result-line', text: line }) : null,
    statRow(copy.result.time, formatTime(game.elapsedMs)),
    statRow(copy.result.mistakes, copy.result.mistakesOf(game.mistakes, mistakes.on ? mistakes.max : null)),
  ];
  if (game.hints) rows.push(statRow(copy.result.hints, String(game.hints)));
  let promotedNow = false;
  if (outcome.elo) {
    const delta = outcome.elo.after - outcome.elo.before;
    const eloRow = statRow(copy.result.elo, copy.result.eloChange(outcome.elo.before, outcome.elo.after), delta > 0 ? 'good' : '');
    // The new rating counts up from the old one.
    countUp(eloRow.querySelector('strong')!, outcome.elo.before, outcome.elo.after, (n) => copy.result.eloChange(outcome.elo!.before, n, delta));
    // a speed bonus is a small line inside the Elo row, not a block of its own; cuts (a slow
    // solve, hints) are said there too, never applied in silence
    const sub = (text: string, cls = 'stat-sub') => eloRow.append(h('span', { class: cls, text }));
    if (!outcome.elo.unrated && outcome.elo.bonus > 0) sub(copy.result.speedBonus(Math.round(outcome.elo.bonus * 100)));
    else if (!outcome.elo.unrated && outcome.elo.bonus < 0) sub(copy.result.slowCut(Math.round((2 * parMs(config.target ?? config.rating)) / 60_000)), 'stat-sub plain');
    if (!outcome.elo.unrated && outcome.elo.hintCut > 0) sub(copy.game.hintEloCut(Math.round(outcome.elo.hintCut * 100)), 'stat-sub plain');
    rows.push(eloRow);
    // the rank shown before and after (the server's, with its grace; a local guest's own)
    const tierBefore = outcome.elo.tierBefore ?? rankTier(outcome.elo.before).tier;
    const tierAfter = outcome.elo.tier ?? rankTier(outcome.elo.after).tier;
    // A step up in rank gets its moment: the new rank's name stamps in, in its colours.
    promotedNow = !outcome.elo.unrated && promoted(tierBefore, tierAfter);
    if (promotedNow) {
      const tier = rankTier(outcome.elo.after, tierAfter);
      rows.push(
        h(
          'p',
          { class: 'promotion good' },
          h('span', { text: copy.result.promoted }),
          rankName(tier.tier, tier.label),
        ),
      );
    }
    // how far the next rank is now, on its bar (at the top there's no next)
    rows.push(rankProgress(outcome.elo.after, tierAfter, 'result-next-rank'));
    // what made the square hard, once it needed more than singles (after a loss most of all)
    const key = config.hardest ? TECHNIQUE_BY_ID[config.hardest] : null;
    if (key && key.level > 1) rows.push(h('p', { class: 'note', text: copy.result.keyStep(copy.techniqueName(key.name)) }));
    if (!won && outcome.elo.comeback) rows.push(h('p', { class: 'note', text: copy.result.comeback }));
    // Only what went well here; no coaching tips (docs/AUDIT.md: a quieter result).
    if (outcome.elo.unrated) {
      rows.push(
        h('p', {
          class: 'note',
          text:
            copy.result.unrated[outcome.elo.unrated],
        }),
      );
    }
    if (outcome.elo.protectedLoss) rows.push(h('p', { class: 'note', text: copy.result.protectedLoss }));
  }
  if (outcome.daily) {
    rows.push(statRow(copy.result.thisMonth, copy.result.monthOf(outcome.daily.done, dailyGoal(outcome.daily.done, outcome.daily.days))));
    if (outcome.daily.badgeNew && outcome.daily.badge) rows.push(h('p', { class: 'note good', text: copy.result.monthBadgeEarned(badgeMonth(outcome.daily.badge)) }));
  }

  const rewards = h('div', { class: 'rewards' });
  if (outcome.dust) {
    const amount = h('span', { text: copy.common.plusStardust(outcome.dust) });
    countUp(amount, 0, outcome.dust, copy.common.plusStardust);
    rewards.append(h('div', { class: 'reward' }, h('span', { html: ICONS.dust }), amount));
  }
  if (outcome.spirit) rewards.append(h('div', { class: 'reward rare', html: `${ICONS.spirit}<span>${copy.common.rareSpirit}</span>` }));

  // One strip for everything earned: Stardust, a Spirit, influence, and (between parts)
  // how close the next part is.
  if (outcome.influence) rewards.append(influenceLine(outcome.influence));
  if (outcome.progress && !outcome.drop) rewards.append(progressLine(outcome.progress));
  // the day's counted solves are used up: say so, rather than the strip just going quiet
  rewards.append(...capLines(outcome));

  // A failed Daily can be retried (same square) until it's solved; only a solve marks the day.
  const retryDaily = config.mode === 'daily' && !won;
  if (retryDaily) rows.push(h('p', { class: 'note', text: copy.result.dailyRetry }));
  const again =
    retryDaily
      ? h('button', {
          class: 'btn btn-primary',
          text: copy.result.tryAgain,
          onclick: () => void startGame({ mode: 'daily', difficulty: config.difficulty, seed: config.seed, dateKey: config.dateKey }),
        })
      : config.mode === 'daily'
      ? h('button', { class: 'btn btn-primary', text: copy.result.calendar, onclick: () => void goBack(dailyScreen) })
      : h('button', {
          class: 'btn btn-primary',
          text: ranked ? copy.result.nextRanked : copy.result.newSquare,
          onclick: () => void startGame({ mode: config.mode, difficulty: config.difficulty }),
        });

  openModal(
    h(
      'div',
      { class: 'result' },
      h('h2', { class: won ? 'good' : '', text: titles[reason] }),
      h('div', { class: 'stats' }, ...rows),
      rewards.childElementCount ? rewards : null,
      // last beat: the drop cools out of the forge, then the affinity's share
      outcome.drop ? dropReveal(outcome.drop, () => void goBack(forgeScreen)) : null,
      resultExtra(won, !!outcome.drop || promotedNow || !!outcome.daily?.badgeNew),
      h('div', { class: 'actions' }, again, h('button', { class: 'btn', text: copy.common.home, onclick: () => void goBack(homeScreen) })),
    ),
    { dismissible: false },
  );
}

/**
 * At most one optional block on a result (full review H9), and none when the result already
 * has its moment (a part, a promotion, the month's badge): the install note when it's due,
 * otherwise, for guests, the sign-up line. Each counts only the results it was offered on,
 * so the two never land together.
 */
function resultExtra(won: boolean, busy: boolean): HTMLElement | null {
  if (busy) return null;
  return firstWinLine(won) ?? sideLine(won) ?? addToHomeResultNote(won) ?? signupPrompt();
}

const SIDE_ASKED_KEY = 'elomental:affinity-result';

/** Once, when it's time to choose a side: the way to it on any screen (Home's line can't fit everywhere). */
function sideLine(won: boolean): HTMLElement | null {
  if (!won || !affinityDue() || readJson<boolean>(SIDE_ASKED_KEY)) return null;
  writeJson(SIDE_ASKED_KEY, true);
  return h(
    'div',
    { class: 'first-win' },
    h('p', { text: copy.result.chooseSide }),
    h('button', { class: 'link-btn', text: copy.home.line.chooseSide, attrs: { type: 'button' }, onclick: () => void goBack(affinityScreen) }),
  );
}

const FIRST_WIN_KEY = 'elomental:first-win';

/** Once, on a signed-in player's first solve: what parts and Stardust are for, and the way to the Forge. */
function firstWinLine(won: boolean): HTMLElement | null {
  const account = cachedAccount();
  if (!won || !account || account.solved > 1 || readJson<boolean>(FIRST_WIN_KEY)) return null;
  writeJson(FIRST_WIN_KEY, true);
  return h(
    'div',
    { class: 'first-win' },
    h('p', { text: copy.result.firstWin }),
    h('button', { class: 'link-btn', text: copy.forge.openForge, attrs: { type: 'button' }, onclick: () => void goBack(forgeScreen) }),
  );
}

const RESULTS_KEY = 'elomental:results';
/** Every 5th result it's offered on (3rd, 8th, 13th…). */
const SIGNUP_EVERY = 5;

/**
 * Guests only: one line ("Keep this on any device. Sign up") that opens the sign-up form.
 * A guest account (anonymous) keeps everything it earned when an email is added; a local
 * guest saves from the next game on.
 */
function signupPrompt(): HTMLElement | null {
  if (registered()) return null;
  const results = (readJson<number>(RESULTS_KEY) ?? 0) + 1;
  writeJson(RESULTS_KEY, results);
  if (results % SIGNUP_EVERY !== 3) return null;
  const keeps = signedIn(); // anonymous account: this game is already on the server
  const box = signUpForm({
    collapsed: true,
    line: keeps ? copy.account.keepLine : copy.account.saveLine,
    title: keeps ? copy.account.keepRewards : copy.account.saveProgress,
    text: keeps ? copy.account.keepRewardsText : copy.account.saveProgressText,
    // saved to this guest (everything kept), or signed in to another account (this guest stays behind)
    onDone: (kind) => box.replaceChildren(h('p', { class: 'signup-done', text: kind === 'email_change' ? copy.account.signedUp : copy.account.signedInSwitched })),
  });
  return box;
}

/** The day's limits, when this result met one: Stardust after 20 squares, parts after 3. */
function capLines(outcome: Outcome): HTMLElement[] {
  const lines: HTMLElement[] = [];
  if (outcome.dustCapped) lines.push(h('p', { class: 'part-progress', text: copy.result.dustCapped }));
  if (outcome.partsCapped) lines.push(h('p', { class: 'part-progress', text: copy.result.partsCapped }));
  return lines;
}

function statRow(label: string, value: string, valueClass = ''): HTMLElement {
  return h('div', { class: 'stat' }, h('span', { text: label }), h('strong', { class: valueClass, text: value }));
}

/**
 * Count a number up in `target` (ease-out, ~0.7s, after the modal settles).
 * The final text is set immediately for screen readers and reduced motion.
 */
function countUp(target: HTMLElement, from: number, to: number, format: (n: number) => string): void {
  target.textContent = format(to);
  if (from === to || reducedMotion()) return;
  target.textContent = format(from);
  const duration = 700;
  let start = 0;
  const step = (now: number) => {
    start ||= now;
    const t = Math.min(1, (now - start) / duration);
    target.textContent = format(Math.round(from + (to - from) * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  setTimeout(() => requestAnimationFrame(step), 250);
}
