/**
 * Supabase: passwordless accounts and the server side of every signed-in
 * game, one module per area in ./backend/. Screens import from here.
 *
 * Guests get an anonymous account on first launch (when the project allows
 * anonymous sign-ins), so their games are server-settled from the start and
 * signing up with an email keeps every reward. Without one (offline, or
 * anonymous sign-ins off) they play on the local guest profile (profile.ts).
 */
export * from './backend/account.ts';
export * from './backend/signIn.ts';
export * from './backend/games.ts';
export * from './backend/squares.ts';
export * from './backend/review.ts';
export * from './backend/clashes.ts';
