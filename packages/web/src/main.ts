import './styles.css';
import { loadProfile } from './profile.ts';
import { installRoughMasks } from './rough.ts';
import { homeScreen } from './screens/home.ts';
import { splashScreen } from './screens/splash.ts';
import { mount } from './ui.ts';

installRoughMasks();

// iOS Safari ignores user-scalable=no, so block pinch-zoom explicitly.
// Everything else (scroll, pull-to-refresh, double-tap zoom) is handled in CSS.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
}
document.addEventListener('contextmenu', (event) => event.preventDefault());

mount(loadProfile().guest ? homeScreen() : splashScreen());
