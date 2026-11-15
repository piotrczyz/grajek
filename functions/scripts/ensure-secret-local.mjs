// Creates functions/.secret.local from the example when it is missing, so the
// Functions emulator never tries to read a secret (VAPID_PRIVATE_KEY,
// SPIKE_NUTY_ADMIN_KEY) from Google Cloud Secret Manager. An existing
// .secret.local keeps every key it already has (your own values); keys of the
// example it lacks are appended with their dummy values.
import { appendFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../.secret.local', import.meta.url));
const example = fileURLToPath(new URL('../.secret.local.example', import.meta.url));

/** `KEY=value` lines of a dotenv-style file, comments and blank lines skipped. */
function entries(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#') && line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line]);
}

if (!existsSync(target)) {
  copyFileSync(example, target);
  console.log('Created functions/.secret.local from .secret.local.example (dummy keys).');
} else {
  const current = readFileSync(target, 'utf8');
  const present = new Set(entries(current).map(([key]) => key));
  const missing = entries(readFileSync(example, 'utf8')).filter(([key]) => !present.has(key));
  if (missing.length > 0) {
    const prefix = current === '' || current.endsWith('\n') ? '' : '\n';
    appendFileSync(target, `${prefix}${missing.map(([, line]) => line).join('\n')}\n`);
    console.log(`Added ${missing.map(([key]) => key).join(', ')} to functions/.secret.local (dummy values).`);
  }
}
