import { toast } from './ui.ts';
import * as copy from './copy/en.ts';

/**
 * Some screens are split off the main script (a dynamic import, so Vite gives each its own
 * file) and fetched the first time they open: the leaderboard, the Leaderboard and card page,
 * and the founder screens. All of them need a connection anyway.
 */

/**
 * Loads a split-off screen, then runs `go` with it. Offline, it says so and nothing happens.
 * Online, a failed load means the app was updated since it opened (the old file is gone), or an
 * earlier try failed offline (browsers remember a failed load for the page's life): either way a
 * reload fixes it, as opening the app again would.
 */
export function openLazy<M>(load: () => Promise<M>, go: (module: M) => void): void {
  load().then(go, (error: unknown) => {
    console.error(error);
    if (!navigator.onLine) return toast(copy.common.pageOffline);
    toast(copy.common.reloading);
    setTimeout(() => location.reload(), 1200);
  });
}

/** Fetches a split-off screen a moment after the current one settles, so it opens at once later. */
export function prefetch(load: () => Promise<unknown>): void {
  setTimeout(() => void load().catch(() => undefined), 1500);
}
