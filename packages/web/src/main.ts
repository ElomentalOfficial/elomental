import './styles.css';
import './frames.css';
import { initBackend, refreshAccount } from './backend.ts';
import { flushPending, pendingResults } from './backend/pending.ts';
import { installWheelScroll, installZoomGuards } from './gestures.ts';
import { welcomeScreen } from './screens/welcome.ts';
import { installA11y } from './a11y.ts';
import { applyTheme } from './theme.ts';
import { mount, toast } from './ui.ts';
import * as copy from './copy/en.ts';
import { installStandaloneFixes } from './viewport.ts';
import { installUiScale } from './scale.ts';
import { applyGrain } from './grain.ts';
import { installAddToHome } from './install.ts';

applyTheme();
installA11y();
applyGrain();
installUiScale();
installZoomGuards();
installWheelScroll();
installStandaloneFixes();
installAddToHome();
initBackend();

// Results that finished without a connection (backend/pending.ts): sent on launch and
// whenever the connection comes back.
const sendPending = () => {
  if (!pendingResults().length) return;
  void flushPending().then(({ sent, refused }) => {
    // counted, or the server's reason it wasn't (e.g. already counted when its first answer was lost)
    if (sent) toast(copy.game.pendingSent(sent));
    else if (refused.length) toast(refused[0]);
    if (sent || refused.length) void refreshAccount();
  });
};
window.addEventListener('online', sendPending);
sendPending();

mount(welcomeScreen());
