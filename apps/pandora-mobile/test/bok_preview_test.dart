
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pandora_mobile/bok_preview.dart';

void main() {
  testWidgets('BOK preview is visibly synthetic and sealed', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: BokPreviewScreen()));

    expect(find.text('TEST / PREVIEW'), findsOneWidget);
    expect(find.text('BOK Pilot Owner'), findsOneWidget);
    expect(find.text('Synthetic data only'), findsOneWidget);
    expect(find.text('Porknyeta • preview anchor'), findsOneWidget);
    expect(find.textContaining('makes no network calls'), findsOneWidget);
  });

  testWidgets('BOK preview simulates an owner intent without executing', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: BokPreviewScreen()));

    final field = find.byKey(const ValueKey('bok-preview-intent'));
    await tester.enterText(field, 'Which customers have not ordered in 30 days?');
    final button = find.text('Simulate with Pandora');
    await tester.ensureVisible(button);
    await tester.tap(button);
    await tester.pump();

    expect(find.textContaining('38 synthetic customers'), findsOneWidget);
    expect(find.textContaining('No live action was executed.'), findsOneWidget);
  });
}
