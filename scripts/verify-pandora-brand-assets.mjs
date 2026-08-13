#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = join(
  repoRoot,
  'assets/brand/pandoras-box/product-mark',
);
const masterPath = join(assetRoot, '2165-original.jpg');
const derivedRoot = join(assetRoot, 'derived');
const manifestPath = join(assetRoot, 'manifest.json');
const appAssetPath = join(
  repoRoot,
  'apps/pandora-mobile/assets/brand/pandora-product-mark-ui-1024.png',
);
const shouldWrite = process.argv.includes('--write');

const source = Object.freeze({
  sha256: 'd6f055b88b962b4dbae4ac67bc30f5e31b6c3a90997dfd5fddf9a0be23aa5970',
  gitBlobSha1: 'b3b185aaebbb6307d0af6cfc033ffff4b3d580e9',
});

const outputs = Object.freeze([
  {
    name: 'ui-mark-1024.png',
    sha256: '129ce23920d37db06e0cd0dd7b8847ace4796a13f243ac80cef4534cb5e1b940',
    gitBlobSha1: '6dd4a4f5950bbe90c832de92becf9dc863fe9f4b',
    width: 1024,
    height: 1024,
  },
  {
    name: 'ui-mark-512.png',
    sha256: '85c6b6c04013c81faf53d44f20934cd5db87c9edf8abca1cf5f84bddf26a13f6',
    gitBlobSha1: 'b9cc38464621a40e146450f07d75d8d2c98e7e2c',
    width: 512,
    height: 512,
  },
  {
    name: 'ui-mark-192.png',
    sha256: '11c99262080c7f6ed53d6494cea636b8a8bbe84cada33fa798b33bfc7d688914',
    gitBlobSha1: '536adbb36ec74ef8c06f8a6054c4bebb53d9407d',
    width: 192,
    height: 192,
  },
  {
    name: 'ui-mark-48.png',
    sha256: 'dfd976922ad5d72e190ee414d97a24bd6b39fa1b0717567abb8ff1f94a851db9',
    gitBlobSha1: 'a01aa82d2f2c59033998edb1091c80c09861b4aa',
    width: 48,
    height: 48,
  },
  {
    name: 'favicon-32.png',
    sha256: '8d4586d02e5d96840a00262634c4e60b8b5336e0ea7aaa8c354ece2d83d17063',
    gitBlobSha1: '8a058e01bab2ae0d931be728a9708248e1569a6c',
    width: 32,
    height: 32,
  },
  {
    name: 'launcher-safe-1024.png',
    sha256: 'f6b60b0b5dd491099193df903a296a7922b5f73d05e5e022e0f2ef7011f05a9c',
    gitBlobSha1: '48917e41a72352f147c6b19436fd361ec93cd26a',
    width: 1024,
    height: 1024,
  },
  {
    name: 'pwa-512.png',
    sha256: 'd2fad16999521d9d934bcc344d6aa7e824b31bca35a56a9c5382bf232a6a07eb',
    gitBlobSha1: '327f4dbaa831100686fa8646701a7d2e807d2039',
    width: 512,
    height: 512,
  },
  {
    name: 'pwa-192.png',
    sha256: '2fe014564686eacfeb4cab5ded03e581e7c9b5840d5928f0ee4df53f229100c3',
    gitBlobSha1: 'f16c5db68ae6506a8e8ea83e13152ef310994509',
    width: 192,
    height: 192,
  },
]);

const fixedPngTime = Object.freeze({
  iso: '2026-08-10T10:39:16Z',
  bytes: Buffer.from([0x07, 0xea, 0x08, 0x0a, 0x0a, 0x27, 0x10]),
});

function digest(algorithm, bytes) {
  return createHash(algorithm).update(bytes).digest('hex');
}

function gitBlobDigest(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return digest('sha1', Buffer.concat([header, bytes]));
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function normalizePngTime(path) {
  const png = readFileSync(path);
  let offset = 8;
  let found = false;

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const crcOffset = dataOffset + length;
    const type = png.toString('ascii', typeOffset, typeOffset + 4);

    if (type === 'tIME') {
      assertEqual(length, 7, `${path} tIME length`);
      fixedPngTime.bytes.copy(png, dataOffset);
      const crcInput = png.subarray(typeOffset, dataOffset + length);
      png.writeUInt32BE(crc32(crcInput), crcOffset);
      found = true;
    }

    offset = crcOffset + 4;
  }

  if (!found) {
    throw new Error(`${path}: ImageMagick did not emit the required tIME chunk`);
  }

  writeFileSync(path, png);
}

function assertPngMetadata(path, width, height, expectNormalizedTime) {
  const png = readFileSync(path);
  assertEqual(png.toString('hex', 0, 8), '89504e470d0a1a0a', `${path} format`);
  assertEqual(png.toString('ascii', 12, 16), 'IHDR', `${path} first chunk`);
  assertEqual(png.readUInt32BE(16), width, `${path} width`);
  assertEqual(png.readUInt32BE(20), height, `${path} height`);
  assertEqual(png[24], 8, `${path} bit depth`);
  assertEqual(png[25], 0, `${path} color type`);

  let offset = 8;
  let normalizedTime = false;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const dataOffset = offset + 8;
    if (type === 'bKGD') {
      assertEqual(
        png.subarray(dataOffset, dataOffset + length).toString('hex'),
        '00ff',
        `${path} PNG background chunk`,
      );
    }
    if (type === 'tIME') {
      normalizedTime = png
        .subarray(dataOffset, dataOffset + length)
        .equals(fixedPngTime.bytes);
    }
    offset = dataOffset + length + 4;
  }

  assertEqual(
    normalizedTime,
    expectNormalizedTime,
    `${path} normalized ${fixedPngTime.iso} tIME`,
  );
}

function convert(args) {
  run('convert', args);
}

function buildDerivatives(workRoot) {
  const ui1024 = join(workRoot, 'ui-mark-1024.png');
  const launcher1024 = join(workRoot, 'launcher-safe-1024.png');

  convert([
    masterPath,
    '-strip',
    '-crop',
    '1120x1120+192+154',
    '+repage',
    '-filter',
    'Lanczos',
    '-resize',
    '1024x1024',
    ui1024,
  ]);
  convert([
    masterPath,
    '-strip',
    '-filter',
    'Lanczos',
    '-resize',
    '1024x1024',
    launcher1024,
  ]);

  for (const size of [512, 192, 48, 32]) {
    const name = size === 32 ? 'favicon-32.png' : `ui-mark-${size}.png`;
    const path = join(workRoot, name);
    convert([
      ui1024,
      '-filter',
      'Lanczos',
      '-resize',
      `${size}x${size}`,
      path,
    ]);
    normalizePngTime(path);
  }

  for (const size of [512, 192]) {
    const path = join(workRoot, `pwa-${size}.png`);
    convert([
      launcher1024,
      '-filter',
      'Lanczos',
      '-resize',
      `${size}x${size}`,
      path,
    ]);
    normalizePngTime(path);
  }
}

function verifyManifest() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assertEqual(manifest.source.sha256, source.sha256, 'manifest source SHA-256');
  assertEqual(
    manifest.source.git_blob_sha1,
    source.gitBlobSha1,
    'manifest source Git blob',
  );

  const records = new Map(
    manifest.derivatives.map((item) => [item.path.split('/').at(-1), item]),
  );
  for (const output of outputs) {
    const record = records.get(output.name);
    if (!record) throw new Error(`manifest is missing ${output.name}`);
    assertEqual(record.sha256, output.sha256, `${output.name} manifest SHA-256`);
    assertEqual(
      record.git_blob_sha1,
      output.gitBlobSha1,
      `${output.name} manifest Git blob`,
    );
    assertEqual(record.width, output.width, `${output.name} manifest width`);
    assertEqual(record.height, output.height, `${output.name} manifest height`);
  }
}

function verifyFile(path, expected, expectNormalizedTime) {
  const bytes = readFileSync(path);
  assertEqual(digest('sha256', bytes), expected.sha256, `${path} SHA-256`);
  assertEqual(gitBlobDigest(bytes), expected.gitBlobSha1, `${path} Git blob`);
  assertPngMetadata(
    path,
    expected.width,
    expected.height,
    expectNormalizedTime,
  );
}

const version = run('convert', ['-version']).split('\n')[0];
if (!version.includes('ImageMagick 6.9.12-98 Q16 x86_64')) {
  throw new Error(
    `Exact derivative reproduction requires ImageMagick 6.9.12-98 Q16 x86_64; received: ${version}`,
  );
}

verifyManifest();

const master = readFileSync(masterPath);
assertEqual(digest('sha256', master), source.sha256, 'provenance master SHA-256');
assertEqual(gitBlobDigest(master), source.gitBlobSha1, 'provenance master Git blob');

const workRoot = mkdtempSync(join(repoRoot, '.pandora-brand-assets-'));
try {
  buildDerivatives(workRoot);

  for (const output of outputs) {
    const generated = join(workRoot, output.name);
    const checkedIn = join(derivedRoot, output.name);
    const normalizedTime = !output.name.endsWith('-1024.png');
    verifyFile(generated, output, normalizedTime);
    if (!shouldWrite) {
      verifyFile(checkedIn, output, normalizedTime);
      assertEqual(
        readFileSync(generated).equals(readFileSync(checkedIn)),
        true,
        `${output.name} exact byte reproduction`,
      );
    }
  }

  const ui1024 = outputs.find((item) => item.name === 'ui-mark-1024.png');
  if (!shouldWrite) verifyFile(appAssetPath, ui1024, false);

  if (shouldWrite) {
    mkdirSync(derivedRoot, { recursive: true });
    for (const output of outputs) {
      copyFileSync(join(workRoot, output.name), join(derivedRoot, output.name));
    }
    mkdirSync(dirname(appAssetPath), { recursive: true });
    copyFileSync(join(workRoot, 'ui-mark-1024.png'), appAssetPath);

    for (const output of outputs) {
      verifyFile(
        join(derivedRoot, output.name),
        output,
        !output.name.endsWith('-1024.png'),
      );
    }
    verifyFile(appAssetPath, ui1024, false);
  }
} finally {
  rmSync(workRoot, { recursive: true, force: true });
}

console.log(
  `Pandora brand assets verified: source + ${outputs.length} exact derivatives + Flutter UI copy${
    shouldWrite ? ' (written)' : ''
  }.`,
);
