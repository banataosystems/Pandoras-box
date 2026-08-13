class PandoraConfig {
  PandoraConfig._();

  static const supabaseUrl = String.fromEnvironment(
    'PANDORA_SUPABASE_URL',
    defaultValue: 'https://jcyqixttuebxqqfkjonq.supabase.co',
  );

  // Public/publishable client key from the canonical operator config. Never put
  // service-role, PAT, Vercel, or other server credentials in this app.
  static const supabasePublishableKey = String.fromEnvironment(
    'PANDORA_SUPABASE_PUBLISHABLE_KEY',
    defaultValue: 'sb_publishable_LGu6ncwUVEYI5THBjSV-3g_71AInQZt',
  );

  // The installed APK proved the currently deployed Vercel compatibility route
  // returns HTTP 404 for owner screens. The original Pandora client contract
  // targets this Supabase Edge Function, using the signed-in user's JWT.
  static const ownerApiBaseUrl = String.fromEnvironment(
    'PANDORA_OWNER_API_BASE_URL',
    defaultValue:
        'https://jcyqixttuebxqqfkjonq.supabase.co/functions/v1/pandora-owner-api',
  );

  // Retain the canonical Vercel route as failover for the future runtime that
  // includes api/operator. Authorization still fails closed on 401/403.
  static const ownerApiFallbackBaseUrl = String.fromEnvironment(
    'PANDORA_OWNER_API_FALLBACK_BASE_URL',
    defaultValue: 'https://mcpmaster.vercel.app/api/operator',
  );

  static const organizationId = String.fromEnvironment(
    'PANDORA_ORGANIZATION_ID',
    defaultValue: '2270b266-59da-4c39-bfd9-9f8d08352af0',
  );

  static List<String> get ownerApiBaseUrls {
    final values = <String>[
      ownerApiBaseUrl,
      ownerApiFallbackBaseUrl,
    ];
    final seen = <String>{};
    return values
        .map((value) => value.trim().replaceFirst(RegExp(r'/+$'), ''))
        .where((value) => value.isNotEmpty && seen.add(value))
        .toList(growable: false);
  }
}
