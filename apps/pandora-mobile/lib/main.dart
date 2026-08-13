import 'package:flutter/widgets.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app/pandora_app.dart';
import 'core/data/remote_pandora_repository.dart';
import 'core/diagnostics/diagnostics_store.dart';
import 'core/network/pandora_api_client.dart';
import 'core/network/session_token_provider.dart';
import 'core/security/pandora_auth.dart';
import 'pandora_config.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(
    url: PandoraConfig.supabaseUrl,
    publishableKey: PandoraConfig.supabasePublishableKey,
  );

  final supabase = Supabase.instance.client;
  final diagnostics = DiagnosticsStore();
  final apiClient = PandoraApiClient(
    baseUri: Uri.parse(PandoraConfig.ownerApiBaseUrl),
    organizationId: PandoraConfig.organizationId,
    sessionTokenProvider: SupabaseSessionTokenProvider(supabase),
    diagnostics: diagnostics,
  );
  final repository = RemotePandoraRepository(client: apiClient);

  runApp(
    PandoraApp(
      auth: SupabasePandoraAuth(supabase),
      repository: repository,
      diagnostics: diagnostics,
    ),
  );
}
