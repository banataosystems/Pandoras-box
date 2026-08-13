import 'package:flutter/material.dart';

import '../../app/pandora_dependencies.dart';
import '../../core/data/pandora_repository.dart';
import '../../core/design/pandora_tokens.dart';
import '../../core/state/screen_controller.dart';
import '../../core/widgets/content_state.dart';
import '../../core/widgets/pandora_page.dart';
import '../../core/widgets/pandora_surface.dart';
import '../../core/widgets/status_badge.dart';

class SafetyScreen extends StatefulWidget {
  const SafetyScreen({super.key});

  @override
  State<SafetyScreen> createState() => _SafetyScreenState();
}

class _SafetyScreenState extends State<SafetyScreen> {
  ScreenController<SafetyOverview>? _controller;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_controller != null) return;
    final repository = PandoraDependencies.of(context).repository;
    _controller = ScreenController<SafetyOverview>(repository.safety)..load();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: PandoraPage(
          title: 'Safety',
          subtitle:
              'Authorization, audit integrity, source authority, and runtime health—without a misleading score.',
          actions: [
            IconButton(
              tooltip: 'Refresh Safety',
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
                return const ContentSkeleton(lines: 7);
              }
              if (controller.error != null && controller.data == null) {
                return ErrorContent(
                  title: 'Safety could not be checked',
                  message: controller.error!.message,
                  onRetry: controller.load,
                );
              }
              final safety = controller.data;
              if (safety == null) {
                return const EmptyContent(
                  title: 'Safety not checked',
                  message: 'Pandora returned no verified safety state.',
                );
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (controller.error != null) ...[
                    DegradedContentNotice(
                      message: controller.error!.message,
                      onRetry: controller.refresh,
                    ),
                    const SizedBox(height: PandoraSpacing.md),
                  ],
                  PandoraSurface(
                    title: 'Current safety posture',
                    child: Wrap(
                      spacing: PandoraSpacing.xs,
                      runSpacing: PandoraSpacing.xs,
                      children: [
                        StatusBadge(
                          label: safety.status,
                          tone: statusToneFor(safety.state),
                        ),
                        StatusBadge(
                          label: safety.auditChain.label,
                          tone: safety.auditChain.valid
                              ? PandoraStatusTone.verified
                              : PandoraStatusTone.critical,
                        ),
                      ],
                    ),
                  ),
                  for (final section in safety.sections) ...[
                    const SizedBox(height: PandoraSpacing.md),
                    PandoraSurface(
                      title: section.title,
                      child: section.items.isEmpty
                          ? const Text(
                              'No checks were returned for this section.')
                          : Column(
                              children: [
                                for (var index = 0;
                                    index < section.items.length;
                                    index++) ...[
                                  ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    title: Text(section.items[index].title),
                                    subtitle:
                                        Text(section.items[index].explanation),
                                    trailing: StatusBadge(
                                      label: section.items[index].status,
                                      tone: statusToneFor(
                                          section.items[index].status),
                                      compact: true,
                                    ),
                                  ),
                                  if (index != section.items.length - 1)
                                    const Divider(),
                                ],
                              ],
                            ),
                    ),
                  ],
                ],
              );
            },
          ),
        ),
      );
}
