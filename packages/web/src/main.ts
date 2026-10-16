import './styles.css';
import { installZoomGuards } from './gestures.ts';
import { welcomeScreen } from './screens/welcome.ts';
import { applyTheme } from './theme.ts';
import { mount } from './ui.ts';

applyTheme();
installZoomGuards();

mount(welcomeScreen());
