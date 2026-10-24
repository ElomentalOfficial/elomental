/**
 * Supabase: passwordless accounts and the server side of every signed-in
 * game, one module per area in ./backend/. Screens import from here.
 *
 * Guests get an anonymous account on first need: their first game, the
 * Leaderboard or the Forge (account.ts ensureAccount), not when the app opens,
 * so a visitor who leaves at once costs nothing. From then their games are
 * server-settled and signing up with an email keeps every reward. Without one
 * (offline, or anonymous sign-ins off) they play on the local guest profile
 * (profile.ts).
 *
 * Errors: a call the player waits on either returns the reason to show
 * (`string | null`, null meaning it worked) or throws an Error whose message
 * is the reason to show; each function's comment says which. Calls that run
 * in the background (settings sync, square codes, clash results) quietly
 * return null when the server can't be reached.
 */
export * from './backend/account.ts';
export * from './backend/signIn.ts';
export * from './backend/games.ts';
export * from './backend/squares.ts';
export * from './backend/review.ts';
export * from './backend/clashes.ts';
