import './styles.css';
import { welcomeScreen } from './screens/welcome.ts';
import { applyTheme } from './theme.ts';
import { mount } from './ui.ts';

applyTheme();

// iOS Safari ignores user-scalable=no, so block pinch-zoom explicitly.
// Everything else (scroll, pull-to-refresh, double-tap zoom) is handled in CSS.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
}
// Long-press opens the notes wheel, so the browser's own long-press menu must stay out of the way.
document.addEventListener('contextmenu', (event) => event.preventDefault());

mount(welcomeScreen());
