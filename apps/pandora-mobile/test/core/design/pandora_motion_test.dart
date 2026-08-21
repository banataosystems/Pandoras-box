import 'package:flutter_test/flutter_test.dart';
import 'package:pandora_mobile/core/design/pandora_tokens.dart';

void main() {
  test('PandoraMotion removes duration when reduced motion is requested', () {
    expect(
      PandoraMotion.resolve(disableAnimations: true),
      Duration.zero,
    );
  });

  test('PandoraMotion preserves the requested duration when motion is enabled', () {
    expect(
      PandoraMotion.resolve(
        disableAnimations: false,
        duration: PandoraMotion.quick,
      ),
      PandoraMotion.quick,
    );
  });
}
