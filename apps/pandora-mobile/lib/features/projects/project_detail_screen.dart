import 'package:flutter/material.dart';

import '../../app/pandora_dependencies.dart';
import '../../core/data/pandora_repository.dart';
import '../../core/design/pandora_tokens.dart';
import '../../core/models/pandora_models.dart';
import '../../core/state/screen_controller.dart';
import '../../core/widgets/content_state.dart';
import '../../core/widgets/detail_row.dart';
import '../../core/widgets/freshness_label.dart';
import '../../core/widgets/pandora_page.dart';
import '../../core/widgets/pandora_surface.dart';
import '../../core/widgets/proof_ladder.dart';
import '../../core/widgets/status_badge.dart';

class ProjectDetailScreen extends StatefulWidget {
  const ProjectDetailScreen({super.key, required this.project});

  final ProjectSummary project;

  @override
  State<ProjectDetailScreen> createState() => _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends State<ProjectDetailScreen> {
  ScreenController<ProjectDetail>? _controller;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_controller != null) return;
    final repository = PandoraDependencies.of(context).repository;
    _controller = ScreenController<ProjectDetail>(
      () => repository.project(widget.project.id, allowCached: true),
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
          title: widget.project.name,
          subtitle: widget.project.purpose,
          actions: [
            IconButton(
              tooltip: 'Refresh ${widget.project.name}',
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
                return const ContentSkeleton(lines: 8);
              }
              if (controller.error != null && controller.data == null) {
                return ErrorContent(
                  title: 'Project detail could not load',
                  message: _safeError(controller.error),
                  onRetry: controller.load,
                );
              }
              final detail = controller.data;
              if (detail == null) {
                return const EmptyContent(
                  title: 'No verified detail',
                  message: 'Pandora returned no project detail.',
                );
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (controller.degradedReason != null ||
                      controller.error != null) ...[
                    DegradedContentNotice(
                      message: controller.degradedReason ??
                          controller.error!.message,
                      onRetry: controller.refresh,
                    ),
                    const SizedBox(height: PandoraSpacing.md),
                  ],
                  _DetailContent(detail: detail),
                ],
              );
            },
          ),
        ),
      );
}

class _DetailContent extends StatelessWidget {
  const _DetailContent({required this.detail});

  final ProjectDetail detail;

  @override
  Widget build(BuildContext context) {
    final tasks = detail.tasks;
    final done =
        tasks.where((item) => item.state == ProjectTaskState.complete).toList();
    final blocked =
        tasks.where((item) => item.state == ProjectTaskState.blocked).toList();
    final inProgress = tasks.where((item) => item.state.isActive).toList();
    final notActive = tasks
        .where(
          (item) =>
              item.state == ProjectTaskState.notStarted ||
              item.state == ProjectTaskState.cancelled,
        )
        .toList();
    final unknown =
        tasks.where((item) => item.state == ProjectTaskState.unknown).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PandoraSurface(
          title: 'Current truth',
          trailing: StatusBadge(
            label: detail.summary.status,
            tone: statusToneFor(detail.summary.status),
            compact: true,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DetailRow(label: 'Current phase', value: detail.summary.phase),
              DetailRow(label: 'Progress', value: detail.summary.progressLabel),
              FreshnessLabel(freshness: detail.summary.freshness),
              const SizedBox(height: PandoraSpacing.sm),
              ProofLadder(stages: detail.summary.evidenceStages),
            ],
          ),
        ),
        const SizedBox(height: PandoraSpacing.md),
        _TaskSection(
          title: 'Done',
          tasks: done,
          empty: 'No work is verified complete.',
        ),
        const SizedBox(height: PandoraSpacing.md),
        _TaskSection(
          title: 'In progress',
          tasks: inProgress,
          empty: 'No active work was returned.',
        ),
        const SizedBox(height: PandoraSpacing.md),
        _TaskSection(
          title: 'Blocked',
          tasks: blocked,
          empty: 'No blockers were returned.',
        ),
        if (notActive.isNotEmpty) ...[
          const SizedBox(height: PandoraSpacing.md),
          _TaskSection(
            title: 'Not active',
            tasks: notActive,
            empty: 'No inactive work was returned.',
          ),
        ],
        if (unknown.isNotEmpty) ...[
          const SizedBox(height: PandoraSpacing.md),
          _TaskSection(
            title: 'Status not verified',
            tasks: unknown,
            empty: 'No unrecognized task states were returned.',
          ),
        ],
        const SizedBox(height: PandoraSpacing.md),
        PandoraSurface(
          title: 'Next autonomous action',
          child: Text(
            detail.summary.nextAction ??
                'No verified next action was recorded.',
          ),
        ),
        const SizedBox(height: PandoraSpacing.md),
        PandoraSurface(
          title: 'Evidence',
          child: detail.evidence.isEmpty
              ? const Text('No active evidence was returned.')
              : Column(
                  children: [
                    for (var index = 0;
                        index < detail.evidence.length;
                        index++) ...[
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.fact_check_outlined),
                        title: Text(detail.evidence[index].type),
                        subtitle: Text(
                          '${detail.evidence[index].provider} · ${detail.evidence[index].verdict ?? detail.evidence[index].status}',
                        ),
                      ),
                      if (index != detail.evidence.length - 1) const Divider(),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

class _TaskSection extends StatelessWidget {
  const _TaskSection({
    required this.title,
    required this.tasks,
    required this.empty,
  });

  final String title;
  final List<ProjectTask> tasks;
  final String empty;

  @override
  Widget build(BuildContext context) => PandoraSurface(
        title: title,
        child: tasks.isEmpty
            ? Text(empty)
            : Column(
                children: [
                  for (var index = 0; index < tasks.length; index++) ...[
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(tasks[index].title),
                      subtitle: Text(
                        '${tasks[index].status} · ${tasks[index].risk.label}',
                      ),
                    ),
                    if (index != tasks.length - 1) const Divider(),
                  ],
                ],
              ),
      );
}

String _safeError(Object? error) {
  if (error is PandoraRepositoryException) return error.message;
  return 'Pandora could not verify this project. Try again.';
}
