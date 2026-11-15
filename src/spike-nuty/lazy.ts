// The lazy entry of the spike screen. Kept out of main.tsx because a component
// declared in a file without exports breaks fast refresh (lint rule). Only the
// dynamic import lives here, so the spike code stays in its own chunk.
import { lazy } from 'react';

export const LazySpikeScreen = lazy(() => import('./SpikeScreen.tsx'));
