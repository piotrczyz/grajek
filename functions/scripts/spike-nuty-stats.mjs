#!/usr/bin/env node
// Fetches the owner statistics or the export of the "Zagraj i sprawdź" spike
// telemetry and writes the answer to stdout. The admin key is read from the
// environment variable SPIKE_NUTY_ADMIN_KEY and is never printed.
//
//   SPIKE_NUTY_ADMIN_KEY=... node functions/scripts/spike-nuty-stats.mjs stats
//   SPIKE_NUTY_ADMIN_KEY=... node functions/scripts/spike-nuty-stats.mjs export --format csv > attempts.csv
import process from 'node:process';

const DEFAULT_BASE = 'https://grajek.web.app/api';

const USAGE = `Usage: node functions/scripts/spike-nuty-stats.mjs <stats|export> [options]

Options:
  --from YYYY-MM-DD    first day (default: 30 days before --to)
  --to YYYY-MM-DD      last day, inclusive (default: today, UTC)
  --format json|csv    export format (export only, default json)
  --base URL           API base (default ${DEFAULT_BASE})
  -h, --help           show this help

The admin key is read from the environment variable SPIKE_NUTY_ADMIN_KEY.
Output goes to stdout.
`;

function fail(message) {
  process.stderr.write(`${message}\n\n${USAGE}`);
  process.exit(2);
}

function parseArgs(argv) {
  const options = { command: undefined, from: undefined, to: undefined, format: undefined, base: DEFAULT_BASE };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      return { help: true };
    }
    const [flag, inline] = arg.startsWith('--') && arg.includes('=') ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    if (['--from', '--to', '--format', '--base'].includes(flag)) {
      const value = inline ?? argv[++i];
      if (value === undefined || value === '') {
        fail(`Missing value for ${flag}.`);
      }
      options[flag.slice(2)] = value;
    } else if (!flag.startsWith('-') && options.command === undefined) {
      options.command = flag;
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(USAGE);
  process.exit(0);
}
if (options.command !== 'stats' && options.command !== 'export') {
  fail('Give the command: stats or export.');
}
if (options.format !== undefined && !['json', 'csv'].includes(options.format)) {
  fail('--format must be json or csv.');
}
if (options.format !== undefined && options.command !== 'export') {
  fail('--format applies to export only.');
}

const key = process.env.SPIKE_NUTY_ADMIN_KEY ?? '';
if (key === '') {
  fail('Set the environment variable SPIKE_NUTY_ADMIN_KEY.');
}

const url = new URL(`${options.base.replace(/\/+$/, '')}/spike-nuty/${options.command}`);
for (const name of ['from', 'to', 'format']) {
  if (options[name] !== undefined) {
    url.searchParams.set(name, options[name]);
  }
}

let response;
try {
  response = await fetch(url, { headers: { 'X-Admin-Key': key } });
} catch (error) {
  process.stderr.write(`Request to ${url} failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

const text = await response.text();
if (!response.ok) {
  process.stderr.write(`HTTP ${response.status} from ${url}: ${text}\n`);
  process.exit(1);
}
const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
process.stdout.write(isJson ? `${JSON.stringify(JSON.parse(text), null, 2)}\n` : text);
