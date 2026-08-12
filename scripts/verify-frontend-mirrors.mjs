import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function relativeFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await relativeFiles(root, target));
    else if (entry.isFile()) files.push(path.relative(root, target));
  }
  return files;
}

const canonical = 'apps/control-tower';
const mirror = 'public/control-tower';
const canonicalFiles = (await relativeFiles(canonical)).sort();
const mirrorFiles = (await relativeFiles(mirror)).sort();

if (JSON.stringify(canonicalFiles) !== JSON.stringify(mirrorFiles)) {
  throw new Error('Control Tower canonical/public file lists are not synchronized');
}

for (const relative of canonicalFiles) {
  const [left, right] = await Promise.all([
    readFile(path.join(canonical, relative)),
    readFile(path.join(mirror, relative)),
  ]);
  if (!left.equals(right)) throw new Error(`Control Tower mirror mismatch: ${relative}`);
}

console.log(`Control Tower mirrors synchronized: ${canonicalFiles.length}/${canonicalFiles.length}`);
