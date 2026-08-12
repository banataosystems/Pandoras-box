import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(target));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(target);
  }
  return files;
}

const files = [
  ...await filesUnder('apps/control-tower'),
  'public/oauth/consent.browser.js.txt',
];

for (const file of files.sort()) {
  const source = await readFile(file, 'utf8');
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
    input: source,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stderr.write(`${file}\n${result.stderr}`);
    process.exit(result.status || 1);
  }
}

console.log(`Browser syntax checks passed: ${files.length}/${files.length}`);
