import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:pandora_mobile/core/data/pandora_repository.dart';
import 'package:pandora_mobile/core/network/pandora_api_error.dart';
import 'package:pandora_mobile/core/state/screen_controller.dart';

RepositorySnapshot<String> snapshot(String value) => RepositorySnapshot<String>(
      data: value,
      source: RepositorySource.network,
      fetchedAt: DateTime.utc(2026, 8, 14),
    );

void main() {
  test('refresh failure keeps the last verified snapshot visible', () async {
    var calls = 0;
    final controller = ScreenController<String>(() async {
      calls += 1;
      if (calls == 1) return snapshot('verified');
      throw const PandoraApiError(
        kind: PandoraApiErrorKind.unavailable,
        message: 'Refresh unavailable.',
        code: 'FIXTURE_UNAVAILABLE',
      );
    });

    await controller.load();
    await controller.refresh();

    expect(controller.data, 'verified');
    expect(controller.error?.code, 'FIXTURE_UNAVAILABLE');
    controller.dispose();
  });

  test('a late result cannot overwrite a newer generation', () async {
    final first = Completer<RepositorySnapshot<String>>();
    final second = Completer<RepositorySnapshot<String>>();
    var calls = 0;
    final controller = ScreenController<String>(() {
      calls += 1;
      return calls == 1 ? first.future : second.future;
    });

    final firstLoad = controller.load();
    final secondLoad = controller.refresh();
    second.complete(snapshot('newer'));
    await secondLoad;
    first.complete(snapshot('older'));
    await firstLoad;

    expect(controller.data, 'newer');
    controller.dispose();
  });
}
