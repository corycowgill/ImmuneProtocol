// Adds the HUD and arsenal elements that index.html does not contain (the wave outro, the third
// node's markers, the weapon strip, scope overlay and touch swap button). Importing this module
// runs it once; modules that look those elements up when they load import it first, so the
// elements always exist by then.
import { installArsenalUi } from './arsenal-ui.mjs';
import { installLevelHud } from './level-hud.mjs';

installLevelHud(document);
installArsenalUi(document);
