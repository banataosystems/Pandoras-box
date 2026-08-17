import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Pandora mobile background stays transparent', () {
    final theme = File('lib/core/design/pandora_theme.dart').readAsStringSync();
    final app = File('lib/app/pandora_app.dart').readAsStringSync();

    expect(
      'background: Colors.transparent,'.allMatches(theme).length,
      greaterThanOrEqualTo(2),
    );
    expect(theme, isNot(contains('background: const Color(0xFF0D0E12),')));
    expect(theme, contains('scaffoldBackgroundColor: background,'));
    expect(theme, contains('backgroundColor: background,'));
    expect(
      'backgroundColor: Colors.transparent,'.allMatches(theme).length,
      greaterThanOrEqualTo(2),
    );
    expect(app, contains('color: Colors.transparent,'));
  });
}
