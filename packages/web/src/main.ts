import './styles.css';
import { initBackend } from './backend.ts';
import { installZoomGuards } from './gestures.ts';
import { welcomeScreen } from './screens/welcome.ts';
import { applyTheme } from './theme.ts';
import { mount } from './ui.ts';
import { installStandaloneFixes } from './viewport.ts';
import { installUiScale } from './scale.ts';
import { applyWaves } from './waves.ts';

applyTheme();
applyWaves();
installUiScale();
installZoomGuards();
installStandaloneFixes();
initBackend();

mount(welcomeScreen());
