#!/usr/bin/env node
// Recomputes the recognition estimate of stored "Zagraj i sprawdź" attempts
// with the current heuristic (functions/src/spike-nuty/recognition-estimate.ts)
// from their raw notes and events. Dry run by default; --write stores the new
// `estimate` (and nothing else) in batches.
//
// Safety: runs only against the Firestore emulator (FIRESTORE_EMULATOR_HOST
// set, which wins over --project) or a project named with --project <id>.
// Build first: pnpm --dir functions build (the script imports functions/lib).
import { existsSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const USAGE = `Usage: node functions/scripts/recompute-estimates.mjs [options]

Options:
  --from YYYY-MM-DD    first day on receivedAt, UTC (default: no lower bound)
  --to YYYY-MM-DD      last day, inclusive (default: no upper bound)
  --project ID         run against this Firebase project (needed for a real project)
  --write              store the recomputed estimates (default: dry run, writes nothing)
  -h, --help           show this help

Target: the Firestore emulator when FIRESTORE_EMULATOR_HOST is set (it wins
over --project), otherwise the project given with --project; without either
the script refuses to run. Credentials for a real project come from
Application Default Credentials (gcloud auth application-default login).
Only the field "estimate" is written.
`;

if (process.argv.slice(2).some((a) => a === '--help' || a === '-h')) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const lib = new URL('../lib/spike-nuty/', import.meta.url);
if (!existsSync(fileURLToPath(new URL('recompute.js', lib)))) {
  process.stderr.write('functions/lib is missing: run `pnpm --dir functions build` first.\n');
  process.exit(2);
}

const { parseRecomputeArgs, planRecompute, summarize, toBatches } = await import(new URL('recompute.js', lib).href);
const { ATTEMPTS_COLLECTION, toAttemptDoc } = await import(new URL('repository.js', lib).href);

const parsed = parseRecomputeArgs(process.argv.slice(2), process.env);
if (!parsed.ok) {
  process.stderr.write(`${parsed.error}\n\n${USAGE}`);
  process.exit(2);
}
const options = parsed.options;

const { initializeApp } = await import('firebase-admin/app');
const { getFirestore, Timestamp } = await import('firebase-admin/firestore');

const app = initializeApp({ projectId: options.projectId }, 'recompute-estimates');
const db = getFirestore(app);

const target =
  options.target === 'emulator'
    ? `emulator ${process.env.FIRESTORE_EMULATOR_HOST} (project ${options.projectId})`
    : `project ${options.projectId}`;
process.stderr.write(`Target: ${target}; mode: ${options.write ? 'WRITE' : 'dry run'}\n`);

const PAGE = 500;
const docs = [];
let query = db.collection(ATTEMPTS_COLLECTION).orderBy('receivedAt');
if (options.from) query = query.where('receivedAt', '>=', Timestamp.fromDate(options.from));
if (options.to) query = query.where('receivedAt', '<', Timestamp.fromDate(options.to));
let last;
for (;;) {
  const page = await (last ? query.startAfter(last) : query).limit(PAGE).get();
  for (const snap of page.docs) {
    docs.push({ id: snap.id, data: toAttemptDoc(snap.id, snap.data()) });
  }
  if (page.size < PAGE) break;
  last = page.docs[page.docs.length - 1];
}

const plan = planRecompute(docs);
process.stdout.write(`${JSON.stringify(summarize(plan), null, 2)}\n`);

if (options.write && plan.updates.length > 0) {
  let written = 0;
  for (const batch of toBatches(plan.updates)) {
    const writer = db.batch();
    for (const { id, estimate } of batch) {
      writer.update(db.collection(ATTEMPTS_COLLECTION).doc(id), { estimate });
    }
    await writer.commit();
    written += batch.length;
  }
  process.stderr.write(`Wrote ${written} estimates.\n`);
} else if (!options.write) {
  process.stderr.write('Dry run: nothing written (add --write to store).\n');
}
