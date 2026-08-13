import 'package:flutter/material.dart';

import '../../app/pandora_dependencies.dart';
import '../../core/design/pandora_tokens.dart';
import '../../core/diagnostics/diagnostic_event.dart';
import '../../core/widgets/detail_row.dart';
import '../../core/widgets/pandora_page.dart';
import '../../core/widgets/pandora_surface.dart';
import '../../pandora_config.dart';

class DeveloperDiagnosticsScreen extends StatefulWidget {
  const DeveloperDiagnosticsScreen({super.key});

  @override
  State<DeveloperDiagnosticsScreen> createState() =>
      _DeveloperDiagnosticsScreenState();
}

class _DeveloperDiagnosticsScreenState
    extends State<DeveloperDiagnosticsScreen> {
  @override
  Widget build(BuildContext context) {
    final diagnostics = PandoraDependencies.of(context).diagnostics;
    final events = diagnostics.events;
    return PandoraPage(
      title: 'Developer diagnostics',
      subtitle:
          'Temporary support metadata. Credentials, request bodies, and raw responses are never stored here.',
      actions: [
        IconButton(
          tooltip: 'Refresh diagnostics',
          onPressed: () => setState(() {}),
          icon: const Icon(Icons.refresh_rounded),
        ),
        IconButton(
          tooltip: 'Clear diagnostics',
          onPressed: events.isEmpty ? null : () => setState(diagnostics.clear),
          icon: const Icon(Icons.delete_outline_rounded),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const PandoraSurface(
            title: 'Runtime',
            child: Column(
              children: [
                DetailRow(
                    label: 'App version', value: PandoraConfig.appVersion),
                DetailRow(
                  label: 'Source revision',
                  value: PandoraConfig.sourceRevision,
                ),
                DetailRow(
                  label: 'Endpoint',
                  value: PandoraConfig.ownerApiEndpointLabel,
                ),
                DetailRow(
                  label: 'Organization',
                  value: PandoraConfig.organizationId,
                ),
              ],
            ),
          ),
          const SizedBox(height: PandoraSpacing.md),
          if (events.isEmpty)
            const PandoraSurface(
              title: 'No diagnostic events',
              child: Text('Use Pandora, then refresh this page.'),
            )
          else
            for (var index = 0; index < events.length; index++) ...[
              _DiagnosticEventCard(event: events[index]),
              if (index != events.length - 1)
                const SizedBox(height: PandoraSpacing.sm),
            ],
        ],
      ),
    );
  }
}

class _DiagnosticEventCard extends StatelessWidget {
  const _DiagnosticEventCard({required this.event});

  final DiagnosticEvent event;

  @override
  Widget build(BuildContext context) {
    final status = event.statusCode?.toString() ?? 'No response';
    return PandoraSurface(
      title: event.operation,
      subtitle: '${event.method} ${event.routeTemplate}',
      child: Column(
        children: [
          DetailRow(label: 'Outcome', value: event.outcome.name),
          DetailRow(label: 'Status', value: status),
          DetailRow(
            label: 'Duration',
            value: '${event.duration.inMilliseconds} ms',
          ),
          if (event.requestId != null)
            DetailRow(label: 'Request ID', value: event.requestId!),
          if (event.errorCode != null)
            DetailRow(label: 'Error code', value: event.errorCode!),
          DetailRow(
            label: 'Observed',
            value: event.occurredAt.toLocal().toIso8601String(),
          ),
        ],
      ),
    );
  }
}
