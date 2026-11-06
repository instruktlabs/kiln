/**
 * Fails on merge-conflict lines in tracked files. Merge-conflict lines reached
 * CHANGELOG.md on main twice, once in a published release, because no other gate reads
 * Markdown. `=======` alone is left out: it is also a Markdown heading underline.
 */
import { spawnSync } from 'node:child_process';

const result = spawnSync(
  'git',
  ['grep', '-nIE', '^(<<<<<<< |\\|\\|\\|\\|\\|\\|\\| |>>>>>>> )', '--', '.'],
  { encoding: 'utf8' },
);

// `git grep` exits 1 when nothing matches, which is the passing case here.
if (result.status === 1) {
  console.log('Merge markers: none in tracked files');
  process.exit(0);
}
if (result.status !== 0) {
  console.error(result.stderr || result.error?.message || 'git grep failed');
  process.exit(2);
}
console.error(`Merge markers left in tracked files:\n${result.stdout}`);
process.exit(1);
