// Sign-in hand-off for the installed iPhone app (see migration signin_handoffs).
//
//   POST { action: 'start', email }            -> { id, secret }      (the app)
//   POST { action: 'approve', id }  + user JWT -> { ok: true }        (Safari, signed in by the link)
//   POST { action: 'claim', id, secret }       -> { status, token_hash? } (the app, polling)
//
// The secret never leaves the device that started the request, so approving a
// request only ever signs in that device. Approval needs the account the link
// signed in, and the player confirms it on a page that shows a matching code.
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const sha256 = async (text: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const randomSecret = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '');
};

const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'method' }, 405);
  let body: { action?: string; email?: string; id?: string; secret?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'bad_json' }, 400);
  }

  if (body.action === 'start') {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320) return reply({ error: 'bad_email' }, 400);
    // A few open requests per email at a time, so it can't be used to flood an inbox's account.
    const { count } = await admin
      .from('signin_handoffs')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gt('expires_at', new Date().toISOString());
    if ((count ?? 0) >= 5) return reply({ error: 'too_many' }, 429);
    const secret = randomSecret();
    const { data, error } = await admin
      .from('signin_handoffs')
      .insert({ email, secret_hash: await sha256(secret) })
      .select('id')
      .single();
    if (error || !data) return reply({ error: 'server' }, 500);
    return reply({ id: data.id, secret });
  }

  if (body.action === 'approve') {
    const id = String(body.id ?? '');
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!UUID.test(id) || !jwt) return reply({ error: 'bad_request' }, 400);
    const { data: auth } = await admin.auth.getUser(jwt);
    const user = auth?.user;
    if (!user || user.is_anonymous || !user.email) return reply({ error: 'not_signed_in' }, 401);
    const { data: row } = await admin.from('signin_handoffs').select('*').eq('id', id).maybeSingle();
    if (!row || row.used_at || new Date(row.expires_at) < new Date()) return reply({ error: 'expired' }, 410);
    // Only the account the email link signed in can approve its own request.
    if (row.email !== user.email.toLowerCase()) return reply({ error: 'wrong_account' }, 403);
    if (row.approved_at && row.user_id !== user.id) return reply({ error: 'expired' }, 410);
    const { error } = await admin
      .from('signin_handoffs')
      .update({ user_id: user.id, approved_at: new Date().toISOString() })
      .eq('id', id);
    return error ? reply({ error: 'server' }, 500) : reply({ ok: true });
  }

  if (body.action === 'claim') {
    const id = String(body.id ?? '');
    const secret = String(body.secret ?? '');
    if (!UUID.test(id) || !secret) return reply({ error: 'bad_request' }, 400);
    const { data: row } = await admin.from('signin_handoffs').select('*').eq('id', id).maybeSingle();
    if (!row || row.secret_hash !== (await sha256(secret))) return reply({ error: 'not_found' }, 404);
    if (row.used_at || new Date(row.expires_at) < new Date()) return reply({ status: 'expired' });
    if (!row.approved_at || !row.user_id) return reply({ status: 'pending' });
    // Use it exactly once, even if two polls race.
    const { data: claimed } = await admin
      .from('signin_handoffs')
      .update({ used_at: new Date().toISOString() })
      .eq('id', id)
      .is('used_at', null)
      .select('id')
      .maybeSingle();
    if (!claimed) return reply({ status: 'expired' });
    const { data: owner } = await admin.auth.admin.getUserById(row.user_id);
    if (!owner?.user?.email) return reply({ status: 'expired' });
    // A one-time sign-in token for that account (no email is sent).
    const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: owner.user.email });
    if (error || !link?.properties?.hashed_token) return reply({ error: 'server' }, 500);
    return reply({ status: 'approved', token_hash: link.properties.hashed_token });
  }

  return reply({ error: 'bad_action' }, 400);
});
