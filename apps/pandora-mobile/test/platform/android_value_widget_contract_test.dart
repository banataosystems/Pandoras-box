import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  String read(String path) {
    final file = File(path);
    expect(file.existsSync(), isTrue, reason: 'Missing $path');
    return file.readAsStringSync();
  }

  test('widget receiver is registered as non-exported', () {
    final configurator = read('tool/configure_owner_test_android.py');
    expect(
      configurator,
      contains('android:name=\\".PandoraValueWidget\\"'),
    );
    expect(
      configurator,
      contains('android:exported=\\"false\\"'),
    );
    expect(
      configurator,
      contains('android.appwidget.action.APPWIDGET_UPDATE'),
    );
  });

  test('widget fallback cadence respects Android 30 minute floor', () {
    final info = read(
      'platform/android/app/src/main/res/xml/pandora_value_widget_info.xml',
    );
    expect(info, contains('android:updatePeriodMillis="1800000"'));
    expect(info, contains('android:widgetCategory="home_screen"'));
  });

  test('native bridge and storage contain no auth material', () {
    final mainActivity = read(
      'platform/android/app/src/main/kotlin/com/banataosystems/'
      'pandora_mobile/MainActivity.kt',
    );
    final store = read(
      'platform/android/app/src/main/kotlin/com/banataosystems/'
      'pandora_mobile/PandoraValueWidgetStore.kt',
    );
    final combined = '$mainActivity\n$store'.toLowerCase();

    expect(
      mainActivity,
      contains('com.banataosystems.pandora_mobile/value_widget'),
    );
    expect(store, contains('Context.MODE_PRIVATE'));
    for (final forbidden in <String>[
      'authorization',
      'bearer ',
      'access_token',
      'refresh_token',
      'service_role',
      'supabase_key',
    ]) {
      expect(combined, isNot(contains(forbidden)));
    }
  });

  test('widget itself performs no network request', () {
    final widget = read(
      'platform/android/app/src/main/kotlin/com/banataosystems/'
      'pandora_mobile/PandoraValueWidget.kt',
    );
    expect(widget, isNot(contains('java.net')));
    expect(widget, isNot(contains('okhttp')));
    expect(widget, contains('PandoraValueWidgetStore.read(context)'));
  });

  test('widget has explicit unmeasured and stale states', () {
    final widget = read(
      'platform/android/app/src/main/kotlin/com/banataosystems/'
      'pandora_mobile/PandoraValueWidget.kt',
    );
    expect(widget, contains('Not measured yet'));
    expect(widget, contains('Value evidence is stale'));
    expect(
      widget,
      contains('Waiting for fresh verified customer-value evidence'),
    );
  });
}
