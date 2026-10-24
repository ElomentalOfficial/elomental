import { SUPABASE_URL, rpcCall, rpcData, supabase } from './backend/client.ts';
import * as copy from './copy/en.ts';

/**
 * Daily reminders (owner, 2026-10-24; migration daily_reminders, Edge Function send-reminders):
 * at an hour the player picks, in their own time zone, if today's Daily isn't solved yet, a web
 * push to each device they turned it on for and/or an email. The server keeps the setting and the
 * devices; this module reads and writes them and asks the browser for push.
 */

export interface Reminder {
  /** Null when no reminder is set. */
  hour: number | null;
  tz: string | null;
  push: boolean;
  email: boolean;
  /** The account can get email (a confirmed address, not a guest). */
  emailOk: boolean;
  /** Devices with push on, this one included. */
  devices: number;
}

/** The public half of the push key (public by design: the browser needs it to subscribe). */
const PUSH_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

/** The player's time zone, as the server checks it (an IANA name). */
export const timeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export const getReminder = (): Promise<Reminder | null> => rpcData<Reminder | null>('reminder_get');

/** The times a reminder can come at (Setup), and the one picked first. */
export const REMINDER_HOURS = [8, 12, 18, 21];
export const DEFAULT_HOUR = 18;

/** The reminder time nearest the hour now (the result's one-tap offer: they play about then). */
export const nearestHour = (now = new Date()): number =>
  REMINDER_HOURS.reduce((best, h) => (Math.abs(h - now.getHours()) < Math.abs(best - now.getHours()) ? h : best));

/** Saves the reminder; both off clears it. Null when it worked, else the reason to show. */
export const setReminder = (hour: number, push: boolean, email: boolean): Promise<string | null> =>
  rpcCall('reminder_set', { p_hour: hour, p_tz: timeZone(), p_push: push, p_email: email }, { no_email: copy.reminders.noEmail }, copy.reminders.offline);

/**
 * Why push can't be offered on this device, or null when it can: no key in this build, a browser
 * without push, or an iPhone where it only works from the Home Screen app.
 */
export function pushBlocked(): string | null {
  if (!PUSH_KEY) return copy.reminders.pushUnavailable;
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (ios && !standalone) return copy.reminders.pushIos;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return copy.reminders.pushUnavailable;
  if (Notification.permission === 'denied') return copy.reminders.pushDenied;
  return null;
}

const keyBytes = (base64url: string): Uint8Array<ArrayBuffer> => {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => !!a && a.byteLength === b.length && new Uint8Array(a).every((x, i) => x === b[i]);

/** This device's push subscription, if it has one. */
async function subscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration('./sw.js');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Whether this device is subscribed to push (it was turned on here, not on another device). */
export const pushHere = async (): Promise<boolean> => !!(await subscription());

/** Asks for notifications and keeps this device's push subscription. Null when it worked, else why not. */
export async function enablePush(): Promise<string | null> {
  const blocked = pushBlocked();
  if (blocked) return blocked;
  if ((await Notification.requestPermission()) !== 'granted') return copy.reminders.pushDenied;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    const key = keyBytes(PUSH_KEY);
    let sub = await reg.pushManager.getSubscription();
    // one made with an older key can't be sent to any more: start again
    if (sub && !sameKey(sub.options.applicationServerKey, key)) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const json = sub.toJSON();
    return await rpcCall('push_subscribe', { p_endpoint: sub.endpoint, p_p256dh: json.keys?.p256dh ?? '', p_auth: json.keys?.auth ?? '' }, {}, copy.reminders.offline);
  } catch {
    return copy.reminders.pushFailed;
  }
}

/** Forgets this device's push subscription, here and on the server. */
export async function disablePush(): Promise<void> {
  const sub = await subscription();
  if (!sub) return;
  await supabase.rpc('push_unsubscribe', { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

/** The email's turn-off link: email reminders off for that token. The line to show. */
export async function emailOff(token: string): Promise<string> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-reminders?off=${encodeURIComponent(token)}`, { method: 'POST' });
    if (res.ok) return copy.reminders.offDone;
    return res.status === 400 || res.status === 404 ? copy.reminders.offUnknown : copy.reminders.offError;
  } catch {
    return copy.reminders.offError;
  }
}

/**
 * One tap (the Daily's result offer): a reminder at `hour` the best way this device and account
 * allow, push here first, else email. The line to show.
 */
export async function remindAt(hour: number): Promise<string> {
  const got = await getReminder();
  if (!got) return copy.reminders.offline;
  const done = (err: string | null) => err ?? copy.reminders.offerDone(hourLabel(hour));
  if (!pushBlocked()) {
    const err = await enablePush();
    if (!err) return done(await setReminder(hour, true, got.email));
    if (!got.emailOk) return err;
  }
  if (got.emailOk) return done(await setReminder(hour, got.push, true));
  return copy.reminders.noEmail;
}

/** An hour as this device shows times ("8:00 AM", "20:00"). */
export const hourLabel = (hour: number): string => new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
