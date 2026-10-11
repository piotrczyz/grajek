// Creates functions/.secret.local from the example when it is missing, so the
// Functions emulator never tries to read VAPID_PRIVATE_KEY from Google Cloud
// Secret Manager. An existing .secret.local (your own key) is left untouched.
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../.secret.local', import.meta.url));
if (!existsSync(target)) {
  copyFileSync(fileURLToPath(new URL('../.secret.local.example', import.meta.url)), target);
  console.log('Created functions/.secret.local from .secret.local.example (dummy key).');
}
