library;

import 'dart:io';

import 'package:flutterflow_ai/src/internal_sdk.dart';

const String _projectId = 'pandoras-box-gj9hnb';
const String _actionName = 'ensurePandoraAal2';
const String _actionSourceFilename = 'ensure_pandora_aal2.source.dart';
const String _actionDescription =
    'Prompts for an already-enrolled Supabase TOTP factor, refreshes the '
    'session, and returns true only when the current session is AAL2.';

Future<void> main(List<String> args) async {
  final options = _CliOptions.parse(args);
  final targetProjectId = options.projectId ?? _projectId;
  if (targetProjectId != _projectId) {
    stderr.writeln(
      'Refusing to edit "$targetProjectId"; this DSL is pinned to "$_projectId".',
    );
    exit(64);
  }

  final sourceFile = File.fromUri(
    Platform.script.resolve(_actionSourceFilename),
  );
  if (!sourceFile.isFileSync()) {
    stderr.writeln(
      'Missing custom-action source beside this script: ${sourceFile.path}',
    );
    exit(66);
  }
  final actionSource = sourceFile.readAsStringSync();

  await flutterFlowAI(
    (app) => buildPandoraMfaCustomAction(app, actionSource: actionSource),
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    projectId: targetProjectId,
    dryRun: options.dryRun,
    commitMessage: options.commitMessage,
  );
}

/// Pass 3a: stage the custom action in the existing project without mixing a
/// greenfield declaration with brownfield page edits.
///
/// Run `.ffai_staging` analysis on [ensure_pandora_aal2.source.dart] before
/// this pass. After pushing, refresh FlutterFlow context before compiling
/// `21_mfa_aal2_ui_gates.dart` so its existing-action binding is authoritative.
void buildPandoraMfaCustomAction(
  App app, {
  required String actionSource,
}) {
  app.raw((project) {
    if (!project.currentSupabaseConfig.projectConfig.enabled) {
      throw StateError(
        'Supabase is not enabled. Refusing to install an MFA action against '
        'an unknown backend.',
      );
    }
    if (!project.hasAuthentication() ||
        !project.authentication.active ||
        !project.authentication.hasSupabase()) {
      throw StateError(
        'Supabase Auth is not active. Apply the auth pass before MFA.',
      );
    }

    ensureCustomAction(
      project,
      name: _actionName,
      code: actionSource,
      returnParameter: FFParameter(
        identifier: FFIdentifier(
          name: '${_actionName}Result',
          key: 'pandora_dsl_ensure_aal2_result',
        ),
        dataType: boolType,
      ),
      includeContext: true,
      description: _actionDescription,
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
