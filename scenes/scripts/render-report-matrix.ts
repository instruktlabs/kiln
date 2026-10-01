// Regenerates REPORT.md's acceptance-matrix section from evidence/acceptance-matrix.json (SPEC 25 item 2), so the
// report and the machine-readable matrix cannot disagree. Only the text between the section heading and the next
// "## " heading changes.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..'), reportPath = resolve(root, 'REPORT.md');
const matrix = JSON.parse(await readFile(resolve(root, 'evidence/acceptance-matrix.json'), 'utf8')) as { notes?: string; summary: Record<string, Record<string, number>>; checks: any[] };
const report = await readFile(reportPath, 'utf8'), heading = '## Acceptance matrix\n', start = report.indexOf(heading);
if (start < 0) throw new Error('REPORT.md has no acceptance matrix section');
const end = report.indexOf('\n## ', start + heading.length);
const cell = (text: string) => text.replaceAll('|', '/').replaceAll('\n', ' ');
const label = (path: string) => path.split('/').slice(-2).join('/');
const links = (evidence: unknown) => [evidence].flat().filter((path): path is string => typeof path === 'string').map(path => `[${label(path)}](${path})`).join(', ');
const rows = matrix.checks.map(check => {
  const notes = [check.acceptedUnder ? `Accepted under ${check.acceptedUnder}.` : '', check.deferredPortion ? `Not covered: ${check.deferredPortion}.` : ''].filter(Boolean).join(' ');
  return `| ${check.id} | ${cell(check.subject ?? '')} | ${check.status} | ${cell(`${check.reason ?? ''}${notes ? ' ' + notes : ''}`)} ${links(check.evidence)} |`;
});
const counts = Object.entries(matrix.summary).map(([family, c]) => `| ${family} | ${c.pass} | ${c.fail} | ${c.deferred} |`);
const section = `${heading}
Generated from [the machine-readable matrix](evidence/acceptance-matrix.json) by \`scripts/render-report-matrix.ts\`. ${matrix.notes ?? 'B-00 counts as eight subchecks and suffixed U ids count separately. The one B failure is the M0 B-00e defect with its required Z4 fallback. P-28 is page-owned. P-31 to P-35 belong to M3, which has not started. Rows accepted under D-20 pass on the evidence gathered when the owner closed M2 as the record, and name the portion that evidence does not cover.'}

| Family | Passing | Failing | Deferred |
|---|---:|---:|---:|
${counts.join('\n')}

| Id | Subject | State | Reason and evidence |
|---|---|---|---|
${rows.join('\n')}
`;
await writeFile(reportPath, report.slice(0, start) + section + (end < 0 ? '' : report.slice(end)));
console.log(JSON.stringify({ rows: rows.length, summary: matrix.summary }));
