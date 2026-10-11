import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Placeholder mark; replacing the artwork only swaps public/icon.svg and re-runs
// `pnpm generate-pwa-assets`. Generated PNGs are committed.
const background = '#1e3a8a';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background } },
  },
  images: ['public/icon.svg'],
});
