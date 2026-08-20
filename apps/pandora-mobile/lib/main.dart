import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app/pandora_app.dart';
import 'core/data/remote_pandora_repository.dart';
import 'core/data/user_access_repository.dart';
import 'core/diagnostics/diagnostic_event.dart';
import 'core/diagnostics/diagnostics_store.dart';
import 'core/network/pandora_api_client.dart';
import 'core/network/session_token_provider.dart';
import 'core/security/pandora_auth.dart';
import 'core/widgets/pandora_error_boundary.dart';
import 'pandora_config.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Draw behind the system bars so the Pandora canvas, not the platform
  // window, is what the owner sees at the screen edges.
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

  await Supabase.initialize(
    url: PandoraConfig.supabaseUrl,
    publishableKey: PandoraConfig.supabasePublishableKey,
  );

  final supabase = Supabase.instance.client;
  final diagnostics = DiagnosticsStore();

  // No uncaught framework or asynchronous error may reach the owner as a raw
  // red screen or stack trace. The reference recorded here is already
  // sanitized and carries no credentials, bodies, or full URLs.
  installPandoraErrorHandling(
    record: (summary) => diagnostics.record(
      DiagnosticEvent(
        occurredAt: DateTime.now().toUtc(),
        operation: 'app.uncaughtError',
        method: 'APP',
        routeTemplate: 'app',
        outcome: DiagnosticOutcome.failed,
        duration: Duration.zero,
        errorCode: summary,
      ),
    ),
  );

  final tokenProvider = SupabaseSessionTokenProvider(supabase);
  final apiClient = PandoraApiClient(
    baseUri: Uri.parse(PandoraConfig.ownerApiBaseUrl),
    organizationId: PandoraConfig.organizationId,
    sessionTokenProvider: tokenProvider,
    diagnostics: diagnostics,
  );
  final userAccessApiClient = PandoraApiClient(
    baseUri: Uri.parse(PandoraConfig.userAccessApiBaseUrl),
    organizationId: PandoraConfig.organizationId,
    sessionTokenProvider: tokenProvider,
    diagnostics: diagnostics,
  );
  final repository = RemotePandoraRepository(client: apiClient);
  final userAccessRepository =
      RemoteUserAccessRepository(client: userAccessApiClient);

  runApp(
    PandoraApp(
      auth: SupabasePandoraAuth(supabase),
      repository: repository,
      diagnostics: diagnostics,
      userAccessRepository: userAccessRepository,
    ),
  );
}
