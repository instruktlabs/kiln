import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(join(root, 'dist/viewer'), { recursive: true });
// The viewer exports through asset-export, which lazily loads the Node-only KTX2 encoder
// (#201); the viewer never encodes KTX2, so that module stays out of the browser bundle.
const result = spawnSync(
  'bun',
  [
    'build',
    'src/viewer/app.ts',
    '--target=browser',
    '--minify',
    '--external=./ktx2-basis*',
    '--outfile=dist/viewer/app.js',
  ],
  { cwd: root, stdio: 'inherit', windowsHide: true },
);
if (result.status !== 0) process.exit(result.status ?? 1);
for (const file of ['index.html', 'style.css'])
  await copyFile(join(root, 'src/viewer', file), join(root, 'dist/viewer', file));
const chat = spawnSync(
  'bun',
  [
    'build',
    'src/viewer/chat-app.ts',
    '--target=browser',
    '--minify',
    '--outfile=dist/viewer/chat-app.js',
  ],
  { cwd: root, stdio: 'inherit', windowsHide: true },
);
if (chat.status !== 0) process.exit(chat.status ?? 1);
const script = await readFile(join(root, 'dist/viewer/chat-app.js'), 'utf8');
const html = await readFile(join(root, 'src/viewer/chat.html'), 'utf8');
await writeFile(
  join(root, 'dist/viewer/chat.html'),
  html.replace('/* KILN_CHAT_APP */', () => script.replace(/<\/script/gi, '<\\/script')),
);
await unlink(join(root, 'dist/viewer/chat-app.js'));
