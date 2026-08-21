import 'package:flutter_test/flutter_test.dart';
import 'package:pandora_mobile/pandora_config.dart';

void main() {
  test('canonical operator configuration is explicit', () {
    expect(PandoraConfig.supabaseUrl, 'https://jcyqixttuebxqqfkjonq.supabase.co');
    expect(
      PandoraConfig.ownerApiBaseUrl,
      'https://jcyqixttuebxqqfkjonq.supabase.co/functions/v1/pandora-owner-api',
    );
    expect(
      PandoraConfig.ownerApiFallbackBaseUrl,
      'https://mcpmaster.vercel.app/api/operator',
    );
    expect(
      PandoraConfig.organizationId,
      '2270b266-59da-4c39-bfd9-9f8d08352af0',
    );
    expect(PandoraConfig.supabasePublishableKey, startsWith('sb_publishable_'));
  });

  test('release and version identity are deterministic and bind to RC2', () {
    expect(PandoraConfig.appVersion, '0.3.0-rc.2');
    expect(PandoraConfig.buildNumber, '2');
    expect(PandoraConfig.packageId, 'com.banataosystems.pandora_mobile');
    expect(PandoraConfig.visibleReleaseIdentity, contains('0.3.0-rc.2'));
    expect(PandoraConfig.visibleReleaseIdentity, contains('Build 2'));
  });

  test('verified owner routes are ordered and deduplicated', () {
    expect(PandoraConfig.ownerApiBaseUrls, hasLength(2));
    expect(PandoraConfig.ownerApiBaseUrls.first, contains('pandora-owner-api'));
    expect(PandoraConfig.ownerApiBaseUrls.last, endsWith('/api/operator'));
  });

  test('client defaults contain no deprecated operational owner', () {
    final combined = <String>[
      PandoraConfig.supabaseUrl,
      ...PandoraConfig.ownerApiBaseUrls,
      PandoraConfig.organizationId,
      PandoraConfig.packageId,
    ].join(' ');
    expect(combined.toLowerCase(), isNot(contains('mbanatao')));
  });
}
