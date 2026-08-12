#!/usr/bin/env python3
from pathlib import Path

path = Path('automation/flutterflow/dsl/10_owner_api_state_navigation.dart')
text = path.read_text()

# Remove the temporary read-only field-diff probe.
start_token = '  // PANDORA_OWNER_API_DIFF_PROBE_BEGIN\n'
end_token = '  // PANDORA_OWNER_API_DIFF_PROBE_END\n'
start = text.find(start_token)
if start < 0:
    raise SystemExit('owner API diff probe start marker not found')
end = text.find(end_token, start)
if end < 0:
    raise SystemExit('owner API diff probe end marker not found')
end += len(end_token)
if text.find(start_token, end) >= 0:
    raise SystemExit('multiple owner API diff probe blocks found')
text = text[:start] + text[end:]

# The signed 0.0.40 / b5c8a09d SDK exposed this validated runtime entrypoint.
client_import = "import 'package:flutterflow_ai/src/client/flutterflow_ai_client.dart' show FlutterFlowAI;\n"
runtime_import = "import 'package:flutterflow_ai/src/dsl/runtime.dart' show runFlutterFlowAIDsl;\n"
if text.count(client_import) != 1:
    raise SystemExit('verified FlutterFlowAI client import is missing or ambiguous')
if runtime_import not in text:
    text = text.replace(client_import, client_import + runtime_import, 1)

main_marker = 'Future<void> main(List<String> args) async {\n'
if text.count(main_marker) != 1:
    raise SystemExit('main insertion marker is ambiguous')

adapter = r'''bool _sameProtoBytes(dynamic left, dynamic right) {
  final leftBytes = left.writeToBuffer() as List<int>;
  final rightBytes = right.writeToBuffer() as List<int>;
  if (leftBytes.length != rightBytes.length) return false;
  for (var i = 0; i < leftBytes.length; i++) {
    if (leftBytes[i] != rightBytes[i]) return false;
  }
  return true;
}

void _repairExistingPandoraOwnerApi(dynamic project) {
  final desiredApp = App();
  final desiredSchemas = _declareSchemas(desiredApp);
  _declareOwnerApi(desiredApp, desiredSchemas);
  final desiredProject = compileAppDeclarations(desiredApp).project;

  final currentGroup = findApiGroup(project, name: 'PandoraOwnerApi');
  final desiredGroup = findApiGroup(desiredProject, name: 'PandoraOwnerApi');
  if (desiredGroup == null) {
    throw StateError('Pandora owner API declaration did not compile.');
  }
  if (currentGroup == null) {
    // A genuinely missing group is left to the normal declaration compiler.
    return;
  }

  if (currentGroup.baseUrl != desiredGroup.baseUrl ||
      currentGroup.sharedHeaders.join('\n') !=
          desiredGroup.sharedHeaders.join('\n')) {
    throw StateError(
      'Pandora owner API group drift is outside the approved rerun repair.',
    );
  }

  for (final desiredEndpoint in desiredGroup.endpoints) {
    final name = desiredEndpoint.identifier.name;
    final currentEndpoint = findApiEndpoint(
      project,
      name: name,
      groupName: 'PandoraOwnerApi',
    );
    if (currentEndpoint == null) {
      // Missing endpoints are safe for ensure* create-if-missing semantics.
      continue;
    }

    // The signed read-only drift probe proved these fields already matched on
    // 2026-08-12. Any new structural drift is therefore a new condition and
    // must fail closed rather than being silently normalized.
    if (currentEndpoint.url != desiredEndpoint.url ||
        currentEndpoint.callType != desiredEndpoint.callType ||
        currentEndpoint.bodyType != desiredEndpoint.bodyType ||
        currentEndpoint.headers.join('\n') !=
            desiredEndpoint.headers.join('\n')) {
      throw StateError(
        'Pandora owner API endpoint $name has unsupported structural drift.',
      );
    }

    if (currentEndpoint.body != desiredEndpoint.body) {
      if (name != 'PandoraRunAction') {
        throw StateError(
          'Pandora owner API endpoint $name has unexpected body drift.',
        );
      }
      currentEndpoint.body = desiredEndpoint.body;
    }

    if (!_sameProtoBytes(currentEndpoint.variables, desiredEndpoint.variables)) {
      currentEndpoint.variables
        ..clear()
        ..addAll(desiredEndpoint.variables.map((value) => value.deepCopy()));
    }

    if (!_sameProtoBytes(
      currentEndpoint.responseDataStructParam,
      desiredEndpoint.responseDataStructParam,
    )) {
      currentEndpoint.responseDataStructParam =
          desiredEndpoint.responseDataStructParam.deepCopy();
    }

    // This catches settings, unknown fields, or any other unsupported drift.
    if (!_sameProtoBytes(currentEndpoint, desiredEndpoint)) {
      throw StateError(
        'Pandora owner API endpoint $name still differs after the approved '
        'rerun repair; refusing to continue.',
      );
    }
  }
}

final class _PandoraRerunSafeSdk extends FlutterFlowAI {
  _PandoraRerunSafeSdk({required String apiKey}) : super(apiKey: apiKey);

  @override
  getProject(String projectId) async {
    final fetched = await super.getProject(projectId);
    _repairExistingPandoraOwnerApi(fetched.proto);
    return fetched;
  }
}

'''
if '_PandoraRerunSafeSdk' in text:
    raise SystemExit('rerun-safe SDK adapter is already installed')
text = text.replace(main_marker, adapter + main_marker, 1)

old_call = '''  await flutterFlowAI(
    (app) => buildPandoraOwnerApp(
      app,
      installGlobalNavigation: installGlobalNavigation,
    ),
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    projectId: targetProjectId,
    dryRun: options.dryRun,
    commitMessage: options.commitMessage,
  );
'''
new_call = '''  final adapterApiKey =
      options.apiKey ?? Platform.environment['FF_API_KEY'];
  if (adapterApiKey == null || adapterApiKey.isEmpty) {
    throw StateError('Pandora project access could not be verified.');
  }

  await runFlutterFlowAIDsl(
    (app) => buildPandoraOwnerApp(
      app,
      installGlobalNavigation: installGlobalNavigation,
    ),
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    projectId: targetProjectId,
    dryRun: options.dryRun,
    commitMessage: options.commitMessage,
    sdk: _PandoraRerunSafeSdk(apiKey: adapterApiKey),
  );
'''
if text.count(old_call) != 1:
    raise SystemExit(f'expected one flutterFlowAI call, found {text.count(old_call)}')
text = text.replace(old_call, new_call, 1)

# Temporary probe markers must not survive into the permanent candidate.
for marker in (
    'PANDORA_OWNER_API_DIFF_PROBE_BEGIN',
    'PANDORA_OWNER_API_DIFF_PROBE_END',
    'PANDORA_SIGNED_SDK_CONTRACT_PROBE_BEGIN',
    'PANDORA_SIGNED_SDK_CONTRACT_PROBE_END',
):
    if marker in text:
        raise SystemExit(f'temporary probe marker remains: {marker}')

path.write_text(text)
