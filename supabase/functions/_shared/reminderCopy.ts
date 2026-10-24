// The Daily reminder's words (send-reminders), in docs/BRAND_VOICE.md's voice: notifications are
// inviting, one line, no guilt. Player text lives in packages/web/src/copy/en.ts (the turn-off
// screen's words too); this is the one place outside it, because the Edge Function can't import the
// app's module. Keep the two in the same voice.

export const reminderCopy = {
  title: 'Daily Square',
  /** `streak`: days in a row before today; today's solve makes one more. */
  body: (streak: number) =>
    streak > 0 ? `Today’s square is ready. Solve it for a ${streak + 1}-day streak.` : 'Today’s square is ready, the same for everyone.',
  play: 'Play today’s square',
  emailWhy: 'You asked for a Daily reminder in Elomental’s Setup.',
  emailOff: 'Turn off these emails',
};
