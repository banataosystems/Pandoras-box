import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

File _configureScript() {
  for (final candidate in <String>[
    'tool/configure_owner_test_android.py',
    '../apps/pandora-mobile/tool/configure_owner_test_android.py',
  ]) {
    final file = File(candidate);
    if (file.existsSync()) return file;
  }
  throw StateError('configure_owner_test_android.py was not found.');
}

const _baseManifest = '''
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="pandora_mobile" android:name="\${applicationName}" android:icon="@mipmap/ic_launcher">
    </application>
</manifest>
''';

Future<({ProcessResult result, String manifest})> _configure(
  String source,
) async {
  final directory = await Directory.systemTemp.createTemp('pandora-manifest-');
  try {
    final manifest = File('${directory.path}/AndroidManifest.xml');
    await manifest.writeAsString(source);
    final result = await Process.run(
      'python3',
      <String>[_configureScript().path, manifest.path],
    );
    return (result: result, manifest: await manifest.readAsString());
  } finally {
    await directory.delete(recursive: true);
  }
}

void main() {
  group('Owner Test Android release manifest', () {
    test('adds exactly one INTERNET permission and the owner label', () async {
      final configured = await _configure(_baseManifest);

      expect(configured.result.exitCode, 0, reason: '${configured.result.stderr}');
      expect(
        RegExp('android\\.permission\\.INTERNET')
            .allMatches(configured.manifest)
            .length,
        1,
      );
      expect(
        configured.manifest,
        contains('<uses-permission android:name="android.permission.INTERNET"/>'),
      );
      expect(configured.manifest, contains('android:label="Pandora"'));
      expect(configured.manifest, isNot(contains('android:label="pandora_mobile"')));
    });

    test('preserves one approved existing INTERNET permission', () async {
      final source = _baseManifest.replaceFirst(
        '\n    <application',
        '\n    <uses-permission android:name="android.permission.INTERNET"/>\n'
            '    <application',
      );
      final configured = await _configure(source);

      expect(configured.result.exitCode, 0, reason: '${configured.result.stderr}');
      expect(
        RegExp('android\\.permission\\.INTERNET')
            .allMatches(configured.manifest)
            .length,
        1,
      );
    });

    test('fails closed on duplicate INTERNET permissions', () async {
      const permission =
          '<uses-permission android:name="android.permission.INTERNET"/>';
      final source = _baseManifest.replaceFirst(
        '\n    <application',
        '\n    $permission\n    $permission\n    <application',
      );
      final configured = await _configure(source);

      expect(configured.result.exitCode, 1);
      expect('${configured.result.stderr}', contains('at most one Android INTERNET permission'));
    });

    test('fails closed if cleartext traffic is enabled', () async {
      final source = _baseManifest.replaceFirst(
        'android:icon="@mipmap/ic_launcher"',
        'android:icon="@mipmap/ic_launcher" android:usesCleartextTraffic="true"',
      );
      final configured = await _configure(source);

      expect(configured.result.exitCode, 1);
      expect(
        '${configured.result.stderr}',
        contains('must not explicitly enable cleartext traffic'),
      );
    });
  });
}
