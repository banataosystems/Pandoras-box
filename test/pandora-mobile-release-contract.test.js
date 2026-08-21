'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('Pandora mobile package identity and AndroidManifest are consistent with PR #127', () => {
  const pubspecPath = path.join(root, 'apps/pandora-mobile/pubspec.yaml');
  const manifestPath = path.join(root, 'apps/pandora-mobile/android/app/src/main/AndroidManifest.xml');
  const configPath = path.join(root, 'apps/pandora-mobile/lib/pandora_config.dart');

  const pubspec = fs.readFileSync(pubspecPath, 'utf8');
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  const config = fs.readFileSync(configPath, 'utf8');

  assert.match(pubspec, /version:\s*0\.3\.0-rc\.2\+5/);
  assert.match(manifest, /package="com\.banataosystems\.pandora_mobile"/);
  assert.match(manifest, /<uses-permission android:name="android\.permission\.INTERNET"\s*\/>/);
  assert.match(manifest, /<uses-permission android:name="android\.permission\.ACCESS_NETWORK_STATE"\s*\/>/);
  assert.match(config, /appVersion\s*=[\s\S]*0\.3\.0-rc\.2\+5/);
  assert.match(config, /buildNumber\s*=\s*'5'/);
  assert.match(config, /packageId\s*=\s*'com\.banataosystems\.pandora_mobile'/);
});
