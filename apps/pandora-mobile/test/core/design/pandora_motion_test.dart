import 'package:flutter_test/flutter_test.dart';
import 'package:pandora_mobile/core/design/pandora_tokens.dart';

void main() {
  test('PandoraMotion disables animation', () {
    expect(PandoraMotion.resolve(disableAnimations: true), Duration.zero);
  });

  test('PandoraMotion preserves enabled duration', () {
    expect(
      PandoraMotion.resolve(
        disableAnimations: false,
        duration: PandoraMotion.quick,
      ),
      PandoraMotion.quick,
    );
  });
}
