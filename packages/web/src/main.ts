import './styles.css';
import { initBackend } from './backend.ts';
import { installWheelScroll, installZoomGuards } from './gestures.ts';
import { welcomeScreen } from './screens/welcome.ts';
import { installA11y } from './a11y.ts';
import { applyTheme } from './theme.ts';
import { mount } from './ui.ts';
import { installStandaloneFixes } from './viewport.ts';
import { installUiScale } from './scale.ts';
import { applyGrain } from './grain.ts';

applyTheme();
installA11y();
applyGrain();
installUiScale();
installZoomGuards();
installWheelScroll();
installStandaloneFixes();
initBackend();

mount(welcomeScreen());
