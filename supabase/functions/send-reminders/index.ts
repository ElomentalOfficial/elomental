// Daily reminders (migration daily_reminders).
//
//   POST {} + header x-cron-secret   (pg_cron, hourly: private.call_reminders)
//     -> answers 202 at once, then takes the due list in chunks (public.reminders_take, which
//        marks each one sent for today) and sends each player a web push on every device they
//        turned it on for, and/or an email.
//   GET ?off=<token>                 (a mail app opening the List-Unsubscribe link)
//     -> to the site's own turn-off screen, SITE_URL/?reminders-off=<token>.
//   POST ?off=<token>                (that screen, or a mail app's one-click unsubscribe)
//     -> email reminders off for that player; JSON { done }.
//
// Deployed with verify_jwt off: the cron call is checked against CRON_SECRET, and the link's
// token is the player's unguessable off_token. Secrets (Edge Function secrets): CRON_SECRET (the
// same value as vault reminder_cron_secret), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// (https://... or mailto:...), RESEND_API_KEY, REMINDER_FROM ("Elomental <daily@...>"), SITE_URL.
// Without the VAPID keys no push is sent; without RESEND_API_KEY and REMINDER_FROM no email is.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { timingSafeEqual } from 'node:crypto';
import { reminderCopy as t } from '../_shared/reminderCopy.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const env = (name: string) => Deno.env.get(name) ?? '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SITE = (env('SITE_URL') || 'https://elomental.online').replace(/\/$/, '');
const SELF = `${env('SUPABASE_URL')}/functions/v1/send-reminders`;
const pushOn = !!(env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY') && env('VAPID_SUBJECT'));
const emailOn = !!(env('RESEND_API_KEY') && env('REMINDER_FROM'));
if (pushOn) webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The push services the database accepts (migration: private.push_host_ok), checked again here. */
const PUSH_HOST = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;
/** Players sent to at once, and emails per Resend batch call. */
const PARALLEL = 10;
const EMAIL_BATCH = 100;

interface Due {
  player: string;
  streak: number;
  email: string | null;
  offToken: string;
  push: { endpoint: string; p256dh: string; auth: string }[];
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const CORS = { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const sameSecret = async (given: string, secret: string) => timingSafeEqual(await digest(given), await digest(secret));

async function sendPush(due: Due): Promise<number> {
  if (!pushOn) return 0;
  const payload = JSON.stringify({ title: t.title, body: t.body(due.streak), url: `${SITE}/?open=daily` });
  let sent = 0;
  for (const sub of due.push) {
    if (!PUSH_HOST.test(sub.endpoint)) {
      await admin.rpc('push_gone', { p_endpoint: sub.endpoint });
      continue;
    }
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 6 * 3600, timeout: 5000 });
      sent++;
    } catch (e) {
      // the push service says this device is gone, or no longer ours (a new key): forget it
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 403 || code === 404 || code === 410) await admin.rpc('push_gone', { p_endpoint: sub.endpoint });
      else console.error('push failed', code ?? String(e));
    }
  }
  return sent;
}

function email(due: Due) {
  const play = `${SITE}/?open=daily`;
  const offPage = `${SITE}/?reminders-off=${due.offToken}`;
  const oneClick = `${SELF}?off=${due.offToken}`;
  const body = t.body(due.streak);
  return {
    from: env('REMINDER_FROM'),
    to: [due.email!],
    subject: t.title,
    text: `${body}\n\n${t.play}: ${play}\n\n${t.emailWhy}\n${t.emailOff}: ${offPage}`,
    html:
      `<div style="font:17px/1.5 Georgia,serif;color:#262721">` +
      `<p>${escape(body)}</p>` +
      `<p><a href="${escape(play)}" style="color:#794341">${escape(t.play)}</a></p>` +
      `<p style="font-size:13px;color:#6b6c58">${escape(t.emailWhy)} <a href="${escape(offPage)}" style="color:#6b6c58">${escape(t.emailOff)}</a></p></div>`,
    headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

/** Emails in Resend batches; the number sent. */
async function sendEmails(list: Due[]): Promise<number> {
  if (!emailOn) return 0;
  const to = list.filter((d) => d.email);
  let sent = 0;
  for (let i = 0; i < to.length; i += EMAIL_BATCH) {
    const batch = to.slice(i, i + EMAIL_BATCH);
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(batch.map(email)),
    });
    if (res.ok) sent += batch.length;
    else console.error('email failed', res.status, await res.text());
  }
  return sent;
}

/** Takes the due list chunk by chunk until it's empty, sending each chunk. */
async function run() {
  let due = 0;
  let pushes = 0;
  let emails = 0;
  for (;;) {
    const { data, error } = await admin.rpc('reminders_take', { p_limit: 200 });
    if (error) return console.error('reminders_take', error.message);
    const chunk = (data ?? []) as Due[];
    if (!chunk.length) break;
    due += chunk.length;
    for (let i = 0; i < chunk.length; i += PARALLEL) {
      const sent = await Promise.allSettled(chunk.slice(i, i + PARALLEL).map(sendPush));
      for (const s of sent) if (s.status === 'fulfilled') pushes += s.value;
    }
    emails += await sendEmails(chunk);
  }
  console.log(JSON.stringify({ due, pushes, emails }));
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // the turn-off link: a GET goes to the site's screen (mail scanners open links on their own);
  // that screen's button, or a mail app's one-click unsubscribe, POSTs and turns email off
  const off = url.searchParams.get('off');
  if (off !== null) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (!UUID.test(off)) return json({ done: false }, 400);
    if (req.method === 'GET') return Response.redirect(`${SITE}/?reminders-off=${off}`, 303);
    if (req.method !== 'POST') return new Response('Not found', { status: 404 });
    const { data, error } = await admin.rpc('reminder_email_off', { p_token: off });
    if (error) return json({ done: false }, 500);
    return json({ done: !!data }, data ? 200 : 404);
  }

  if (req.method !== 'POST') return new Response('Not found', { status: 404 });
  const secret = env('CRON_SECRET');
  if (!secret || !(await sameSecret(req.headers.get('x-cron-secret') ?? '', secret))) return new Response('Forbidden', { status: 403 });
  EdgeRuntime.waitUntil(run());
  return new Response('Accepted', { status: 202 });
});
