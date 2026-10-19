// Builds the auth email templates (Supabase: Authentication → Emails → Templates)
// from one layout, so all three look the same. Run: node supabase/templates/build.mjs
// Then paste each .html into its template in the dashboard, with the subject below.
//
// Built to stay out of spam and scam folders:
// - No images, scripts, forms, hidden text or tracking; one link, one button.
// - Inline styles and a table layout, which every mail app reads the same way.
// - Plain sign-in wording, the code in large text (and in the subject, so it shows
//   in phone notifications), and a footer that says why the email came.
// - Colours from the app palette; Apple Mail and iOS get the dark version.
import { writeFileSync } from 'node:fs';

const C = { bg: '#262721', hi: '#343530', hi2: '#40413C', bright: '#FFFFE5', second: '#E8E8CE', mud: '#DADBB9', rock: '#B3B5A0', crimson: '#794341' };
const serif = "Marcellus, Georgia, 'Times New Roman', serif";
const sans = "Montserrat, 'Segoe UI', Arial, sans-serif";

export const SUBJECT = '{{ .Token }} is your Elomental code';

// The button opens the app on elomental.online with a one-time token (verified by
// signInFromEmailLink in packages/web/src/backend/signIn.ts), not the auth server's
// own link: the link's domain matches the site's, and mail scanners that pre-open
// links can't use it up. `r` carries the redirect the app asked for (its hand-off id).
const link = (type) => `{{ .SiteURL }}?token_hash={{ .TokenHash }}&amp;type=${type}&amp;r={{ .RedirectTo }}`;

const layout = ({ title, lead, codeNote, button, after, type }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Federo&family=Marcellus&family=Montserrat:wght@600;700&display=swap" rel="stylesheet">
<style>
  @media (prefers-color-scheme: dark) {
    body, .page { background: ${C.bg} !important; }
    .card { background: ${C.hi} !important; border-color: ${C.hi2} !important; }
    .ink { color: ${C.bright} !important; }
    .muted { color: ${C.mud} !important; }
    .mark { color: ${C.second} !important; }
    .code { background: ${C.bg} !important; border-color: ${C.hi2} !important; color: ${C.bright} !important; }
    .btn { background: ${C.second} !important; color: ${C.bg} !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.second};">
<table role="presentation" class="page" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.second};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
    <tr><td align="center" class="mark" style="padding:0 0 20px;font-family:Federo, ${serif};font-size:22px;letter-spacing:6px;color:${C.crimson};">ELOMENTAL</td></tr>
    <tr><td class="card" style="background:${C.bright};border:1px solid ${C.mud};border-radius:12px;padding:32px 28px;">
      <h1 class="ink" style="margin:0 0 12px;font-family:${serif};font-size:24px;font-weight:400;line-height:1.3;color:${C.bg};">${title}</h1>
      <p class="muted" style="margin:0 0 24px;font-family:${serif};font-size:16px;line-height:1.5;color:${C.hi2};">${lead}</p>
      <div class="code" style="margin:0 0 8px;padding:16px;border:1px solid ${C.mud};border-radius:8px;background:${C.second};text-align:center;font-family:${sans};font-size:28px;font-weight:700;letter-spacing:6px;color:${C.crimson};">{{ .Token }}</div>
      <p class="muted" style="margin:0 0 28px;font-family:${serif};font-size:14px;line-height:1.5;text-align:center;color:${C.hi2};">${codeNote}</p>
      <p class="muted" style="margin:0 0 12px;font-family:${serif};font-size:16px;line-height:1.5;color:${C.hi2};">Or on this device:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:8px;">
        <a class="btn" href="${link(type)}" style="display:inline-block;padding:13px 28px;border-radius:8px;background:${C.crimson};color:${C.bright};font-family:${serif};font-size:17px;text-decoration:none;">${button}</a>
      </td></tr></table>
      <p class="muted" style="margin:28px 0 0;font-family:${serif};font-size:16px;line-height:1.5;color:${C.hi2};">${after}</p>
    </td></tr>
    <tr><td style="padding:20px 8px 0;font-family:${serif};font-size:13px;line-height:1.5;color:${C.hi2};" class="muted">
      This email was sent to {{ .Email }} because someone asked for it on Elomental. If it wasn’t you, you can ignore it: nothing changes without the code or the button.<br><br>
      Elomental · competitive sudoku · <a href="https://elomental.online" class="muted" style="color:${C.hi2};">elomental.online</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>
`;

const codeNote = 'Works once, for 1 hour.';
const keeps = 'Your Stardust, Elo and Daily progress stay yours, on any device.';
export const TEMPLATES = {
  'magic-link': layout({
    title: 'Sign in to Elomental',
    lead: 'Type this code in Elomental, on any phone, tablet or computer:',
    codeNote,
    button: 'Sign in',
    type: 'email',
    after: 'Good solving,<br>Elomental team',
  }),
  'confirm-signup': layout({
    title: 'Confirm your email',
    lead: 'Type this code in Elomental to finish signing up:',
    codeNote,
    button: 'Confirm email',
    type: 'email',
    after: `${keeps}<br><br>Good solving,<br>Elomental team`,
  }),
  'change-email': layout({
    title: 'Confirm your email',
    lead: 'Type this code in Elomental to add {{ .NewEmail }} to your account:',
    codeNote,
    button: 'Confirm email',
    type: 'email_change',
    after: `${keeps}<br><br>Good solving,<br>Elomental team`,
  }),
};

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  for (const [name, html] of Object.entries(TEMPLATES)) writeFileSync(new URL(`./${name}.html`, import.meta.url), html);
  console.log('subject for all three:', SUBJECT);
}
