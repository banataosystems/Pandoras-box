library;

import 'dart:convert';
import 'dart:io';

import 'package:flutterflow_ai/src/internal_sdk.dart';

const String _pinnedProjectId = 'pandoras-box-gj9hnb';

/// Fetches the FlutterFlow project exactly once, then derives the generated
/// typed SDK plus every page/component JSON snapshot and selector outline from
/// that single in-memory proto. This avoids the CLI's one-fetch-per-page loop.
///
/// The helper is read-only with respect to FlutterFlow. It writes only to the
/// requested local output directory and never stores the API key.
Future<void> main(List<String> args) async {
  final options = _Options.parse(args);
  final apiKey = _nonBlank(options.apiKey) ??
      _nonBlank(Platform.environment['FF_API_KEY']);
  if (apiKey == null) {
    stderr.writeln('API key is required: pass --api-key or set FF_API_KEY.');
    exit(64);
  }
  if (options.projectId != _pinnedProjectId) {
    stderr.writeln(
      'Refusing to inspect "${options.projectId}"; this helper is pinned to '
      '"$_pinnedProjectId".',
    );
    exit(64);
  }

  final output = Directory(options.outputDirectory)..createSync(recursive: true);
  final client = FlutterFlowAI(apiKey: apiKey, baseUrl: options.baseUrl);

  // The only remote project read in this program.
  final (:proto, :updatedAtMs) = await client.getProject(options.projectId);

  writeTypedProjectSdk(
    proto,
    options.projectId,
    directory: output.path,
    projectUpdatedAtMs: updatedAtMs,
  );

  final inspectDirectory = Directory('${output.path}/inspection')
    ..createSync(recursive: true);
  final pageDirectory = Directory('${inspectDirectory.path}/pages')
    ..createSync(recursive: true);
  final componentDirectory = Directory('${inspectDirectory.path}/components')
    ..createSync(recursive: true);
  const encoder = JsonEncoder.withIndent('  ');

  final pages = listPages(proto)..sort((a, b) => a.name.compareTo(b.name));
  for (final page in pages) {
    final widgetClass = findPage(proto, name: page.name);
    if (widgetClass == null) {
      throw StateError('Page disappeared from the in-memory proto: ${page.name}');
    }
    final stem = _safeFileStem(page.name);
    File('${pageDirectory.path}/$stem.json').writeAsStringSync(
      '${encoder.convert(buildEditInspectJson(proto, pageName: page.name))}\n',
    );
    File('${pageDirectory.path}/$stem.outline.txt').writeAsStringSync(
      '${printTree(widgetClass.node, showSelectors: true)}\n',
    );
  }

  final components = listComponents(proto)
    ..sort((a, b) => a.name.compareTo(b.name));
  for (final component in components) {
    final widgetClass = findComponent(proto, name: component.name);
    if (widgetClass == null) {
      throw StateError(
        'Component disappeared from the in-memory proto: ${component.name}',
      );
    }
    final stem = _safeFileStem(component.name);
    File('${componentDirectory.path}/$stem.json').writeAsStringSync(
      '${encoder.convert(buildEditInspectJson(
        proto,
        componentName: component.name,
      ))}\n',
    );
    File('${componentDirectory.path}/$stem.outline.txt').writeAsStringSync(
      '${printTree(widgetClass.node, showSelectors: true)}\n',
    );
  }

  File('${inspectDirectory.path}/manifest.json').writeAsStringSync(
    '${encoder.convert({
      'projectId': options.projectId,
      'updatedAtMs': updatedAtMs,
      'pageCount': pages.length,
      'componentCount': components.length,
      'remoteProjectFetches': 1,
    })}\n',
  );

  stdout.writeln(
    'Captured ${pages.length} pages and ${components.length} components from '
    'one project fetch in ${output.path}.',
  );
}

String? _nonBlank(String? value) {
  final trimmed = value?.trim();
  return trimmed == null || trimmed.isEmpty ? null : trimmed;
}

String _safeFileStem(String value) => value.replaceAll(
      RegExp(r'[^A-Za-z0-9._-]+'),
      '_',
    );

final class _Options {
  const _Options({
    required this.projectId,
    required this.outputDirectory,
    this.apiKey,
    this.baseUrl,
  });

  final String projectId;
  final String outputDirectory;
  final String? apiKey;
  final String? baseUrl;

  static _Options parse(List<String> args) {
    var projectId = _pinnedProjectId;
    var outputDirectory = 'build/flutterflow-inspection';
    String? apiKey;
    String? baseUrl;

    String takeValue(String flag, int index) {
      if (index >= args.length) {
        stderr.writeln('Missing value for $flag.');
        exit(64);
      }
      return args[index];
    }

    for (var index = 0; index < args.length; index += 1) {
      switch (args[index]) {
        case '--project-id':
          projectId = takeValue(args[index], ++index);
        case '--output-dir':
          outputDirectory = takeValue(args[index], ++index);
        case '--api-key':
          apiKey = takeValue(args[index], ++index);
        case '--base-url':
          baseUrl = takeValue(args[index], ++index);
        default:
          stderr.writeln('Unknown option: ${args[index]}');
          exit(64);
      }
    }

    return _Options(
      projectId: projectId,
      outputDirectory: outputDirectory,
      apiKey: apiKey,
      baseUrl: baseUrl,
    );
  }
}
