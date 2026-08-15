// The sweep as a command: `pnpm --filter @transferchecker/core-omr golden`.
//
// Writes the report beside the source so a change to a threshold shows up as a
// diff in a file a reviewer reads, rather than as a number that scrolled past
// in a terminal.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { allCases, quickCases } from './cases';
import { forgetRenders } from './image';
import { formatReport, summarise } from './report';
import { runCase } from './score';

const quick = process.argv.includes('--quick');
const cases = quick ? quickCases() : allCases();
const out =
  process.argv[2] !== undefined && !process.argv[2].startsWith('--') ? process.argv[2] : null;

const records = cases.map((item, index) => {
  const record = runCase(item);
  const state = record.asked ? 'ok  ' : 'FAIL';
  process.stdout.write(
    `${String(index + 1).padStart(3)}/${String(cases.length)} ${state} ${record.id.padEnd(44)} ${record.got.padEnd(16)} ${record.elapsedMs.toFixed(0).padStart(5)}ms\n`,
  );
  return record;
});
forgetRenders();

const report = summarise(records);
process.stdout.write(`\n${formatReport(report)}\n`);

const target =
  out ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '../../golden-report.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(
  target,
  // The per question detail stays out of the committed report: it is thousands
  // of lines that change with every seed, and the case level record is what a
  // reviewer reads a diff of.
  `${JSON.stringify({ ...report, records: records.map((record) => ({ ...record, questions: record.questions.length })) }, null, 2)}\n`,
);
process.stdout.write(`\nwrote ${target}\n`);

if (report.gates.some((gate) => gate.armed && !gate.passed)) process.exitCode = 1;
