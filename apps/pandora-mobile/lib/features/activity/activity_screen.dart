import 'package:flutter/material.dart';

import '../../app/pandora_dependencies.dart';
import '../../core/data/pandora_repository.dart';
import '../../core/design/pandora_tokens.dart';
import '../../core/models/pandora_models.dart';
import '../../core/state/screen_controller.dart';
import '../../core/widgets/content_state.dart';
import '../../core/widgets/pandora_page.dart';
import '../../core/widgets/pandora_surface.dart';
import '../../core/widgets/status_badge.dart';

class ActivityScreen extends StatefulWidget {
  const ActivityScreen({super.key});

  @override
  State<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends State<ActivityScreen> {
  ScreenController<List<AuditEvent>>? _controller;
  final _search = TextEditingController();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_controller != null) return;
    final repository = PandoraDependencies.of(context).repository;
    _controller = ScreenController<List<AuditEvent>>(
      () => repository.activity(allowCached: true),
    )..load();
  }

  @override
  void dispose() {
    _search.dispose();
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PandoraPage(
    title: 'Activity',
    subtitle: 'A human-readable record of what changed, who acted, and what the result was.',
    actions: [
      IconButton(
        tooltip: 'Refresh Activity',
        onPressed: () => _controller?.refresh(),
        icon: const Icon(Icons.refresh_rounded),
      ),
    ],
    onRefresh: () => _controller!.refresh(),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _search,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            labelText: 'Filter activity',
            prefixIcon: Icon(Icons.search_rounded),
          ),
        ),
        const SizedBox(height: PandoraSpacing.lg),
        AnimatedBuilder(
          animation: _controller!,
          builder: (context, _) {
            final controller = _controller!;
            if (controller.isLoading && controller.data == null) {
              return const ContentSkeleton(lines: 7);
            }
            if (controller.error != null && controller.data == null) {
              return ErrorContent(
                title: 'Activity could not load',
                message: _safeError(controller.error),
                onRetry: controller.load,
              );
            }
            final query = _search.text.trim().toLowerCase();
            final events = (controller.data ?? const <AuditEvent>[])
                .where(
                  (event) =>
                      query.isEmpty ||
                      '${event.summary} ${event.type} ${event.actor} ${event.provider ?? ''}'
                          .toLowerCase()
                          .contains(query),
                )
                .toList(growable: false);
            if (events.isEmpty) {
              return EmptyContent(
                title: 'No matching activity',
                message: query.isEmpty
                    ? 'Pandora returned no verified activity.'
                    : 'Try a different filter.',
              );
            }
            return Column(
              children: [
                if (controller.degradedReason != null ||
                    controller.error != null) ...[
                  DegradedContentNotice(
                    message: _degradedMessage(controller),
                    onRetry: controller.refresh,
                  ),
                  const SizedBox(height: PandoraSpacing.md),
                ],
                PandoraSurface(
                  title: 'Recent activity',
                  child: Column(
                    children: [
                      for (var index = 0; index < events.length; index++) ...[
                        _ActivityRow(event: events[index]),
                        if (index != events.length - 1) const Divider(),
                      ],
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ],
    ),
  );
}

class _ActivityRow extends StatelessWidget {
  const _ActivityRow({required this.event});

  final AuditEvent event;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: PandoraSpacing.xs),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.history_rounded, size: 20),
        ),
        const SizedBox(width: PandoraSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                event.summary,
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: PandoraSpacing.xxs),
              Text(
                '${event.actor} · ${event.type}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              if (event.result != null || event.risk != null) ...[
                const SizedBox(height: PandoraSpacing.xs),
                Wrap(
                  spacing: PandoraSpacing.xs,
                  runSpacing: PandoraSpacing.xs,
                  children: [
                    if (event.result != null)
                      StatusBadge(
                        label: event.result!,
                        tone: statusToneFor(event.result!),
                        compact: true,
                      ),
                    if (event.risk != null)
                      StatusBadge(
                        label: event.risk!.label,
                        tone: statusToneFor(event.risk!.label),
                        compact: true,
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ],
    ),
  );
}

String _safeError(Object? error) {
  if (error is PandoraRepositoryException) return error.message;
  return 'Pandora could not verify activity. Try again.';
}

String _degradedMessage(ScreenController<List<AuditEvent>> controller) {
  final reason = controller.degradedReason ?? controller.error!.message;
  if (!controller.isCached || controller.snapshot == null) return reason;
  final capturedAt = controller.snapshot!.fetchedAt.toLocal().toIso8601String();
  return '$reason Cached snapshot from $capturedAt.';
}
