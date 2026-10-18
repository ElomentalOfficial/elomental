import { createClient } from '@supabase/supabase-js';

/**
 * The Supabase project. Public by design: the publishable key only reaches
 * what RLS and the function grants allow.
 */
export const SUPABASE_URL = 'https://xekeiwaxxsmvalezgtyj.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_n7EsqEfzlcUCn6GI7YFdxw_Y74WqUwT';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // A magic link opened on this device signs it in from the URL.
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
});
