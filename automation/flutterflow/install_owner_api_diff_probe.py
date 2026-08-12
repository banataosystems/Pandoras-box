#!/usr/bin/env python3
from pathlib import Path

path = Path('automation/flutterflow/dsl/10_owner_api_state_navigation.dart')
text = path.read_text()
start_token = '  // PANDORA_SIGNED_SDK_CONTRACT_PROBE_BEGIN\n'
end_token = '  // PANDORA_SIGNED_SDK_CONTRACT_PROBE_END\n'
start = text.find(start_token)
if start < 0:
    raise SystemExit('existing signed SDK probe start marker not found')
end = text.find(end_token, start)
if end < 0:
    raise SystemExit('existing signed SDK probe end marker not found')
end += len(end_token)
if text.find(start_token, end) >= 0:
    raise SystemExit('multiple probe blocks found')

block = r'''  // PANDORA_OWNER_API_DIFF_PROBE_BEGIN
  // Read-only exact-project comparison. This fetches the current project and
  // compiles the desired owner API in memory. It never invokes run/push.
  final probeApiKey = Platform.environment['FF_API_KEY'];
  if (probeApiKey == null || probeApiKey.isEmpty) {
    stderr.writeln('PANDORA_OWNER_API_DIFF: credential unavailable');
    exit(88);
  }
  final probeSdk = FlutterFlowAI(apiKey: probeApiKey);
  final fetched = await probeSdk.getProject(_projectId);
  final desiredApp = App();
  final desiredSchemas = _declareSchemas(desiredApp);
  _declareOwnerApi(desiredApp, desiredSchemas);
  final desiredProject = compileAppDeclarations(desiredApp).project;

  bool bytesEqual(List<int> left, List<int> right) {
    if (left.length != right.length) return false;
    for (var i = 0; i < left.length; i++) {
      if (left[i] != right[i]) return false;
    }
    return true;
  }

  final currentGroup = findApiGroup(fetched.proto, name: 'PandoraOwnerApi');
  final desiredGroup = findApiGroup(desiredProject, name: 'PandoraOwnerApi');
  if (desiredGroup == null) {
    stderr.writeln('PANDORA_OWNER_API_DIFF: desired group compilation failed');
    exit(89);
  }
  if (currentGroup == null) {
    stdout.writeln('PANDORA_OWNER_API_DIFF GROUP missing');
    exit(86);
  }
  final groupDiffs = <String>[];
  if (currentGroup.baseUrl != desiredGroup.baseUrl) groupDiffs.add('baseUrl');
  if (currentGroup.sharedHeaders.join('\n') != desiredGroup.sharedHeaders.join('\n')) {
    groupDiffs.add('sharedHeaders');
  }
  stdout.writeln(
    'PANDORA_OWNER_API_DIFF GROUP ${groupDiffs.isEmpty ? 'MATCH' : groupDiffs.join(',')}',
  );

  for (final desiredEndpoint in desiredGroup.endpoints) {
    final name = desiredEndpoint.identifier.name;
    final currentEndpoint = findApiEndpoint(
      fetched.proto,
      name: name,
      groupName: 'PandoraOwnerApi',
    );
    if (currentEndpoint == null) {
      stdout.writeln('PANDORA_OWNER_API_DIFF ENDPOINT $name missing');
      continue;
    }
    final diffs = <String>[];
    if (currentEndpoint.url != desiredEndpoint.url) diffs.add('url');
    if (currentEndpoint.callType != desiredEndpoint.callType) diffs.add('method');
    if (currentEndpoint.bodyType != desiredEndpoint.bodyType) diffs.add('bodyType');
    if (currentEndpoint.body != desiredEndpoint.body) diffs.add('body');
    if (currentEndpoint.headers.join('\n') != desiredEndpoint.headers.join('\n')) {
      diffs.add('headers');
    }
    final currentVariables = currentEndpoint.variables
        .map((value) => value.writeToBuffer())
        .toList();
    final desiredVariables = desiredEndpoint.variables
        .map((value) => value.writeToBuffer())
        .toList();
    if (currentVariables.length != desiredVariables.length) {
      diffs.add('variables');
    } else {
      for (var i = 0; i < currentVariables.length; i++) {
        if (!bytesEqual(currentVariables[i], desiredVariables[i])) {
          diffs.add('variables');
          break;
        }
      }
    }
    if (!bytesEqual(
      currentEndpoint.responseDataStructParam.writeToBuffer(),
      desiredEndpoint.responseDataStructParam.writeToBuffer(),
    )) {
      diffs.add('response');
    }
    if (!bytesEqual(currentEndpoint.writeToBuffer(), desiredEndpoint.writeToBuffer())) {
      diffs.add('other');
    }
    stdout.writeln(
      'PANDORA_OWNER_API_DIFF ENDPOINT $name ${diffs.isEmpty ? 'MATCH' : diffs.join(',')}',
    );
  }
  stdout.writeln('PANDORA_OWNER_API_DIFF COMPLETE');
  exit(86);
  // PANDORA_OWNER_API_DIFF_PROBE_END
'''

path.write_text(text[:start] + block + text[end:])
