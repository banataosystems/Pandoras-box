import 'package:flutter/material.dart';

import '../../app/pandora_dependencies.dart';
import '../../core/design/pandora_tokens.dart';
import '../../core/models/pandora_models.dart';
import '../../core/state/screen_controller.dart';
import '../../core/widgets/content_state.dart';
import '../../core/widgets/freshness_label.dart';
import '../../core/widgets/pandora_page.dart';
import '../../core/widgets/pandora_surface.dart';
import '../../core/widgets/status_badge.dart';

class ConnectionsScreen extends StatefulWidget {
  const ConnectionsScreen({super.key});

  @override
  State<ConnectionsScreen> createState() => _ConnectionsScreenState();
}

class _ConnectionsScreenState extends State<ConnectionsScreen> {
  ScreenController<List<ConnectionSummary>>? _controller;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_controller != null) return;
    final repository = PandoraDependencies.of(context).repository;
    _controller = ScreenController<List<ConnectionSummary>>(
      () => repository.connections(allowCached: true),
    )..load();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: PandoraPage(
      title: 'Connections',
      subtitle:
          'Services Pandora can read or ask to change through governed access.',
      actions: [
        IconButton(
          tooltip: 'Refresh Connections',
          onPressed: () => _controller?.refresh(),
          icon: const Icon(Icons.refresh_rounded),
        ),
      ],
      onRefresh: () => _controller!.refresh(),
      child: AnimatedBuilder(
        animation: _controller!,
        builder: (context, _) {
          final controller = _controller!;
          if (controller.isLoading && controller.data == null) {
            return const ContentSkeleton(lines: 6);
          }
          if (controller.error != null && controller.data == null) {
            return ErrorContent(
              title: 'Connections could not load',
              message: controller.error!.message,
              onRetry: controller.load,
            );
          }
          final items = controller.data ?? const <ConnectionSummary>[];
          if (items.isEmpty) {
            return const EmptyContent(
              title: 'No connections returned',
              message: 'Pandora has not returned a verified connection list.',
            );
          }
          return Column(
            children: [
              if (controller.degradedReason != null ||
                  controller.error != null) ...[
                DegradedContentNotice(
                  message:
                      controller.degradedReason ?? controller.error!.message,
                  onRetry: controller.refresh,
                ),
                const SizedBox(height: PandoraSpacing.md),
              ],
              for (var index = 0; index < items.length; index++) ...[
                PandoraSurface(
                  title: items[index].name,
                  subtitle: items[index].purpose,
                  trailing: StatusBadge(
                    label: items[index].status,
                    tone: statusToneFor(items[index].status),
                    compact: true,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        items[index].canChange
                            ? 'Read and governed change access'
                            : items[index].canRead
                            ? 'Read access'
                            : 'No verified access',
                      ),
                      const SizedBox(height: PandoraSpacing.xs),
                      FreshnessLabel(freshness: items[index].freshness),
                    ],
                  ),
                ),
                if (index != items.length - 1)
                  const SizedBox(height: PandoraSpacing.sm),
              ],
            ],
          );
        },
      ),
    ),
  );
}
