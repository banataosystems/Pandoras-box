#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

TARGET = Path("automation/flutterflow/dsl/10_owner_api_state_navigation.dart")
MARKER = "  final options = _CliOptions.parse(args);\n"
BLOCK = r'''  // PANDORA_SIGNED_SDK_CONTRACT_PROBE_BEGIN
  // Inspection-only recovery aid. It reads only the already verified vendored
  // SDK source and exits before flutterFlowAI() or any project operation.
  final sdkRoot = Directory('.flutterflow/sdk/flutterflow_ai/lib');
  if (!sdkRoot.existsSync()) {
    stderr.writeln('PANDORA_SDK_CONTRACT_PROBE: signed SDK source is missing');
    exit(86);
  }
  var hits = 0;
  for (final entity in sdkRoot.listSync(recursive: true, followLinks: false)) {
    if (entity is! File || !entity.path.endsWith('.dart')) continue;
    final source = entity.readAsStringSync();
    final lines = source.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].contains('updateApiEndpoint') &&
          !lines[i].contains('updateApiGroup')) {
        continue;
      }
      hits += 1;
      final start = i - 8 < 0 ? 0 : i - 8;
      final end = i + 12 >= lines.length ? lines.length - 1 : i + 12;
      stdout.writeln('PANDORA_SDK_CONTRACT_BEGIN ${entity.path} ${i + 1}');
      for (var j = start; j <= end; j++) {
        stdout.writeln('${j + 1}: ${lines[j]}');
      }
      stdout.writeln('PANDORA_SDK_CONTRACT_END');
    }
  }
  stdout.writeln('PANDORA_SDK_CONTRACT_HITS=$hits');
  if (hits == 0) {
    stderr.writeln('PANDORA_SDK_CONTRACT_PROBE: update declarations not found');
  }
  exit(hits == 0 ? 87 : 86);
  // PANDORA_SIGNED_SDK_CONTRACT_PROBE_END
'''


def install(text: str) -> str:
    if "PANDORA_SIGNED_SDK_CONTRACT_PROBE_BEGIN" in text:
        raise SystemExit("probe is already installed")
    if text.count(MARKER) != 1:
        raise SystemExit("main insertion marker is ambiguous")
    return text.replace(MARKER, BLOCK + MARKER, 1)


def remove(text: str) -> str:
    start_token = "  // PANDORA_SIGNED_SDK_CONTRACT_PROBE_BEGIN\n"
    end_token = "  // PANDORA_SIGNED_SDK_CONTRACT_PROBE_END\n"
    start = text.find(start_token)
    if start < 0:
        raise SystemExit("probe start marker not found")
    end = text.find(end_token, start)
    if end < 0:
        raise SystemExit("probe end marker not found")
    end += len(end_token)
    if text.find(start_token, end) >= 0:
        raise SystemExit("multiple probe blocks found")
    return text[:start] + text[end:]


def main() -> None:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--install", action="store_true")
    group.add_argument("--remove", action="store_true")
    args = parser.parse_args()

    text = TARGET.read_text()
    updated = install(text) if args.install else remove(text)
    TARGET.write_text(updated)
    print("PANDORA_SDK_CONTRACT_PROBE_INSTALLED" if args.install else "PANDORA_SDK_CONTRACT_PROBE_REMOVED")


if __name__ == "__main__":
    main()
