import { cachedAccount } from '../backend.ts';
import { choice, segmented, settingGroup } from '../controls.ts';
import {
  DEFAULT_HOUR,
  REMINDER_HOURS,
  disablePush,
  enablePush,
  getReminder,
  hourLabel,
  pushBlocked,
  pushHere,
  setReminder,
  timeZone,
  type Reminder,
} from '../reminders.ts';
import { writeJson } from '../storage.ts';
import { h, toast } from '../ui.ts';
import * as copy from '../copy/en.ts';

/** Set once a reminder is on, so the Daily's result doesn't offer one (result.ts reminderOffer). */
export const REMINDER_ASKED_KEY = 'elomental:reminder-offer';

/**
 * The Daily reminder in Setup (the phone's list, and Look and play on a wide screen): on this
 * device, by email, and at what time. Null without an account (there's nowhere to keep it). The
 * choices show once the server has said what's set.
 */
export function reminderSetting(): HTMLElement | null {
  if (!cachedAccount()) return null;
  const t = copy.reminders;
  let rem: Reminder | null = null;
  let here = false;
  // one change at a time: a second tap while the first is saving does nothing
  let busy = false;
  const hour = () => rem?.hour ?? DEFAULT_HOUR;
  /** Push on for another device (the server's count, less this one). */
  const elsewhere = () => (rem ? Math.max(0, rem.devices - (here ? 1 : 0)) : 0);
  const anyOn = () => !!rem && (rem.email || (rem.push && rem.devices > 0));
  const at = () => hourLabel(hour());

  /** Saves the reminder with these changes: true when it worked, else false with the reason shown. */
  const save = async (change: { hour?: number; push?: boolean; email?: boolean }): Promise<boolean> => {
    if (!rem) return false;
    const next = { ...rem, hour: change.hour ?? hour(), push: change.push ?? rem.push, email: change.email ?? rem.email };
    const err = await setReminder(next.hour, next.push, next.email);
    if (err) {
      toast(err);
      return false;
    }
    rem = next;
    if (anyOn()) writeJson(REMINDER_ASKED_KEY, true);
    return true;
  };
  const once = <T>(pick: (value: T) => Promise<void>) => async (value: T) => {
    if (!rem || busy) return;
    busy = true;
    try {
      await pick(value);
    } finally {
      busy = false;
      paintHelp();
    }
  };

  const blocked = pushBlocked();
  const onOff = [{ value: true, label: copy.common.on }, { value: false, label: copy.common.off }];
  const push = segmented({
    options: onOff,
    current: () => here,
    labelledBy: 'setup-reminder-push',
    pick: once(async (on: boolean) => {
      if (!rem || on === here) return;
      if (on) {
        const err = await enablePush();
        if (err) return void toast(err);
        if (!(await save({ push: true }))) return;
        here = true;
        rem.devices += 1;
        toast(t.saved(at()));
      } else {
        // this device only: others the player turned it on for keep theirs
        await disablePush();
        here = false;
        rem.devices = Math.max(0, rem.devices - 1);
        if (rem.devices > 0) return void toast(t.offHere);
        // the last device: push is off for the account
        if (await save({ push: false })) toast(anyOn() ? t.offHere : t.off);
      }
    }),
  });
  const email = segmented({
    options: onOff,
    current: () => !!rem?.email,
    labelledBy: 'setup-reminder-email',
    pick: once(async (on: boolean) => {
      if (!rem || on === rem.email) return;
      if (!(await save({ email: on }))) return;
      toast(on ? t.emailOn(at()) : anyOn() ? t.emailOffToast : t.off);
    }),
  });
  const time = segmented({
    options: REMINDER_HOURS.map((value) => ({ value, label: hourLabel(value) })),
    current: hour,
    labelledBy: 'setup-reminder-time',
    pick: once(async (value: number) => {
      if (!rem || value === hour()) return;
      // nothing on yet: the time is kept for when it is
      if (!anyOn()) return void (rem = { ...rem, hour: value });
      if (await save({ hour: value })) toast(t.saved(hourLabel(value)));
    }),
  });

  const pushHelp = h('p', { text: blocked ?? t.pushHelp });
  const paintHelp = () => {
    if (!blocked) pushHelp.textContent = !here && elsewhere() ? t.pushElsewhere(elsewhere()) : t.pushHelp;
  };
  const pushRow = h('div', { class: 'choice' }, h('h3', { text: t.push, attrs: { id: 'setup-reminder-push' } }), pushHelp, blocked ? null : push.el);
  const group = settingGroup(t.title, [], undefined, t.help);
  group.classList.add('reminder-setting');
  const card = group.querySelector<HTMLElement>('.panel')!;
  card.hidden = true;

  void Promise.all([getReminder(), pushHere()]).then(([got, subscribed]) => {
    card.hidden = false;
    if (!got) return void card.replaceChildren(h('p', { class: 'note', text: t.loadFailed }));
    rem = got;
    here = subscribed && got.push;
    // moved since it was set (travel): the hour keeps meaning their own time
    if (anyOn() && got.hour !== null && got.tz !== timeZone()) void setReminder(got.hour, got.push, got.email);
    card.replaceChildren(
      pushRow,
      choice('setup-reminder-email', t.email, got.emailOk ? t.emailHelp : t.emailGuest, ...(got.emailOk ? [email.el] : [])),
      choice('setup-reminder-time', t.time, t.timeHelp, time.el),
    );
    push.paint();
    email.paint();
    time.paint();
    paintHelp();
  });
  return group;
}
