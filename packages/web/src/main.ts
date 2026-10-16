import './styles.css';
import { installZoomGuards } from './gestures.ts';
import { welcomeScreen } from './screens/welcome.ts';
import { applyTheme } from './theme.ts';
import { mount } from './ui.ts';
import { installStandaloneFixes } from './viewport.ts';

applyTheme();
installZoomGuards();
installStandaloneFixes();

mount(welcomeScreen());
