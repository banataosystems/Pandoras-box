library;

import 'dart:io';

// The public App DSL deliberately requires app.supabase(...) before
// app.supabaseAuth(...). Re-declaring app.supabase(...) on this brownfield
// project would overwrite its existing URL and anon-key configuration, so this
// pass uses the SDK's project-preserving brownfield helpers instead.
import 'package:flutterflow_ai/src/internal_sdk.dart';

const String _projectId = 'pandoras-box-gj9hnb';

Future<void> main(List<String> args) async {
  final options = _CliOptions.parse(args);
  final targetProjectId = options.projectId ?? _projectId;
  if (targetProjectId != _projectId) {
    stderr.writeln(
      'Refusing to edit "$targetProjectId"; this DSL is pinned to "$_projectId".',
    );
    exit(64);
  }

  await flutterFlowAI(
    buildPandoraAuthAndRouteGuards,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    projectId: targetProjectId,
    dryRun: options.dryRun,
    commitMessage: options.commitMessage,
  );
}

/// Pass 1: preserve the current Supabase project configuration while enabling
/// email/password auth, canonical routes, the initial splash page, and route
/// guards.
///
/// Run and commit this pass before compiling pass 2. Raw mutations run after
/// typed action compilation, so pass 2 needs the refreshed project context to
/// compile LoginEmailPassword and AuthUser(jwtToken) safely.
void buildPandoraAuthAndRouteGuards(App app) {
  app.raw((project) {
    if (!project.currentSupabaseConfig.projectConfig.enabled) {
      throw StateError(
        'The existing Supabase backend is not enabled. Refusing to invent or '
        'replace its URL/anon key.',
      );
    }

    // Supabase, Firebase, and Custom Auth occupy the same proto oneof. Never
    // silently replace a different live auth backend.
    if (project.hasAuthentication() &&
        project.authentication.active &&
        (project.authentication.hasFirebase() ||
            project.authentication.hasCustom())) {
      throw StateError(
        'A non-Supabase auth backend is active. Refusing to replace it.',
      );
    }

    // Preserve any existing Supabase providers and ensure EMAIL is present.
    final providers = getSupabaseAuthProviders(project).toList(growable: true);
    if (!providers.contains(FFAuthProvider.EMAIL)) {
      providers.add(FFAuthProvider.EMAIL);
    }
    configureSupabaseAuth(
      project,
      providers: providers,
      homePageName: 'CommandCenter',
      signInPageName: 'SignIn',
    );

    // All inspected routes are currently empty. Assign every non-root route
    // first, then assign the root route last; setPageRoute enforces uniqueness
    // against the project's current state on every call.
    const routes = <String, String>{
      'SignIn': '/sign-in',
      'CommandCenter': '/home',
      'ActionsCatalog': '/actions',
      'ActionBuilder': '/action-builder',
      'ApprovalCenter': '/approvals',
      'ActivityAuditTrail': '/activity',
      'SecurityOperations': '/safety',
      'ProjectDetails': '/project-details',
      'PlansExecution': '/plans',
    };
    for (final entry in routes.entries) {
      setPageRoute(
        project,
        pageName: entry.key,
        route: entry.value,
      );
    }
    setPageRoute(project, pageName: 'SplashConnection', route: '/');
    setInitialPage(project, pageName: 'SplashConnection');

    const protectedPages = <String>{
      'CommandCenter',
      'ActionsCatalog',
      'ActionBuilder',
      'ApprovalCenter',
      'ActivityAuditTrail',
      'SecurityOperations',
      'ProjectDetails',
      'PlansExecution',
    };
    for (final pageName in protectedPages) {
      setPageRequiresAuth(
        project,
        pageName: pageName,
        requiresAuth: true,
      );
    }
    setPageRequiresAuth(
      project,
      pageName: 'SignIn',
      requiresAuth: false,
    );
    setPageRequiresAuth(
      project,
      pageName: 'SplashConnection',
      requiresAuth: false,
    );
  });
}

final class _CliOptions {
  const _CliOptions({
    this.apiKey,
    this.baseUrl,
    this.projectId,
    this.dryRun = false,
    this.commitMessage,
  });

  final String? apiKey;
  final String? baseUrl;
  final String? projectId;
  final bool dryRun;
  final String? commitMessage;

  static _CliOptions parse(List<String> args) {
    String? apiKey;
    String? baseUrl;
    String? projectId;
    String? commitMessage;
    var dryRun = false;

    String takeValue(String flag, int valueIndex) {
      if (valueIndex >= args.length) {
        stderr.writeln('Missing value for $flag.');
        exit(64);
      }
      return args[valueIndex];
    }

    for (var index = 0; index < args.length; index += 1) {
      switch (args[index]) {
        case '--api-key':
          apiKey = takeValue(args[index], ++index);
        case '--base-url':
          baseUrl = takeValue(args[index], ++index);
        case '--project-id':
          projectId = takeValue(args[index], ++index);
        case '--commit-message':
          commitMessage = takeValue(args[index], ++index);
        case '--dry-run':
          dryRun = true;
        default:
          stderr.writeln('Unknown option: ${args[index]}');
          exit(64);
      }
    }

    return _CliOptions(
      apiKey: apiKey,
      baseUrl: baseUrl,
      projectId: projectId,
      dryRun: dryRun,
      commitMessage: commitMessage,
    );
  }
}
