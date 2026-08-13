import 'package:flutter/material.dart';

import '../../app/pandora_dependencies.dart';
import '../../core/data/pandora_repository.dart';
import '../../core/design/pandora_tokens.dart';
import '../../core/models/pandora_models.dart';
import '../../core/state/screen_controller.dart';
import '../../core/widgets/content_state.dart';
import '../../core/widgets/freshness_label.dart';
import '../../core/widgets/pandora_page.dart';
import '../../core/widgets/pandora_surface.dart';
import '../../core/widgets/proof_ladder.dart';
import '../../core/widgets/status_badge.dart';
import '../settings/settings_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  ScreenController<HomeSummary>? _controller;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_controller != null) return;
    final repository = PandoraDependencies.of(context).repository;
    _controller = ScreenController<HomeSummary>(repository.home)..load();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PandoraPage(
        title: 'Home',
        subtitle:
            'What needs you, what Pandora is doing, and what happens next.',
        showProductMark: true,
        actions: [
          IconButton(
            tooltip: 'Open Settings',
            onPressed: () => Navigator.of(
              context,
            ).push(MaterialPageRoute<void>(
                builder: (_) => const SettingsScreen())),
            icon: const Icon(Icons.settings_outlined),
          ),
          IconButton(
            tooltip: 'Refresh Home',
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
              return const ContentSkeleton(lines: 5);
            }
            if (controller.error != null && controller.data == null) {
              return ErrorContent(
                title: 'Home could not refresh',
                message: _safeError(controller.error),
                onRetry: controller.load,
              );
            }
            final summary = controller.data;
            if (summary == null) {
              return EmptyContent(
                title: 'No owner briefing yet',
                message: 'Pandora has not returned a verified Home summary.',
                onAction: controller.load,
                actionLabel: 'Check again',
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
                _HomeContent(
                    summary: summary, refreshing: controller.isLoading),
              ],
            );
          },
        ),
      );
}

class _HomeContent extends StatelessWidget {
  const _HomeContent({required this.summary, required this.refreshing});

  final HomeSummary summary;
  final bool refreshing;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PandoraSurface(
            title: 'System posture',
            trailing: refreshing
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : null,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                StatusBadge(
                  label: summary.healthLabel,
                  tone: statusToneFor(summary.healthState),
                ),
                const SizedBox(height: PandoraSpacing.sm),
                FreshnessLabel(freshness: summary.freshness),
              ],
            ),
          ),
          const SizedBox(height: PandoraSpacing.md),
          PandoraSurface(
            title: 'Needs you',
            subtitle: summary.priority == null
                ? 'Nothing is waiting for an owner decision.'
                : 'The highest-value decision waiting for you.',
            leading: Icon(
              Icons.priority_high_rounded,
              color: context.pandoraPalette.attention,
            ),
            child: summary.priority == null
                ? const Text('Pandora will keep watching your projects.')
                : _PriorityCard(approval: summary.priority!),
          ),
          const SizedBox(height: PandoraSpacing.md),
          _CounterRow(summary: summary),
          const SizedBox(height: PandoraSpacing.xl),
          Semantics(
            header: true,
            child: Text('Portfolio',
                style: Theme.of(context).textTheme.titleLarge),
          ),
          const SizedBox(height: PandoraSpacing.sm),
          if (summary.topProjects.isEmpty)
            const EmptyContent(
              title: 'No projects in the briefing',
              message: 'Open Projects to refresh the verified portfolio list.',
            )
          else
            for (var index = 0;
                index < summary.topProjects.length;
                index++) ...[
              _ProjectBrief(project: summary.topProjects[index]),
              if (index != summary.topProjects.length - 1)
                const SizedBox(height: PandoraSpacing.sm),
            ],
          const SizedBox(height: PandoraSpacing.xl),
          PandoraSurface(
            title: 'Meaningful recent changes',
            child: summary.recentActivity.isEmpty
                ? const Text('No recent verified activity was returned.')
                : Column(
                    children: [
                      for (var index = 0;
                          index < summary.recentActivity.length;
                          index++) ...[
                        _ActivityBrief(event: summary.recentActivity[index]),
                        if (index != summary.recentActivity.length - 1)
                          const Divider(),
                      ],
                    ],
                  ),
          ),
        ],
      );
}

class _PriorityCard extends StatelessWidget {
  const _PriorityCard({required this.approval});

  final ApprovalSummary approval;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(approval.action, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: PandoraSpacing.xs),
          Text(approval.reason),
          const SizedBox(height: PandoraSpacing.sm),
          StatusBadge(
            label: approval.risk.label,
            tone: statusToneFor(approval.risk.label),
          ),
        ],
      );
}

class _CounterRow extends StatelessWidget {
  const _CounterRow({required this.summary});

  final HomeSummary summary;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) {
          final cards = [
            _CounterCard(label: 'Approvals', value: summary.approvalCount),
            _CounterCard(
              label: 'Active projects',
              value: summary.activeProjectCount,
            ),
            _CounterCard(
              label: 'Needs attention',
              value: summary.needsAttentionCount,
            ),
          ];
          if (constraints.maxWidth < 460) {
            return Column(
              children: [
                for (var index = 0; index < cards.length; index++) ...[
                  cards[index],
                  if (index != cards.length - 1)
                    const SizedBox(height: PandoraSpacing.xs),
                ],
              ],
            );
          }
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var index = 0; index < cards.length; index++) ...[
                Expanded(child: cards[index]),
                if (index != cards.length - 1)
                  const SizedBox(width: PandoraSpacing.xs),
              ],
            ],
          );
        },
      );
}

class _CounterCard extends StatelessWidget {
  const _CounterCard({required this.label, required this.value});

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) => PandoraSurface(
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(child: Text(label)),
            Text('$value', style: Theme.of(context).textTheme.headlineSmall),
          ],
        ),
      );
}

class _ProjectBrief extends StatelessWidget {
  const _ProjectBrief({required this.project});

  final ProjectSummary project;

  @override
  Widget build(BuildContext context) => PandoraSurface(
        title: project.name,
        subtitle: project.purpose,
        trailing: StatusBadge(
          label: project.status,
          tone: statusToneFor(project.status),
          compact: true,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(project.phase, style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: PandoraSpacing.sm),
            ProofLadder(stages: project.evidenceStages, compact: true),
            const SizedBox(height: PandoraSpacing.sm),
            Text(project.progressLabel),
            if (project.nextAction != null) ...[
              const SizedBox(height: PandoraSpacing.xs),
              Text('Next: ${project.nextAction!}'),
            ],
          ],
        ),
      );
}

class _ActivityBrief extends StatelessWidget {
  const _ActivityBrief({required this.event});

  final AuditEvent event;

  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        leading: const Icon(Icons.history_rounded),
        title: Text(event.summary),
        subtitle: Text('${event.actor} · ${event.type}'),
      );
}

String _safeError(Object? error) {
  if (error is PandoraRepositoryException) return error.message;
  return 'Pandora could not verify this information. Try again.';
}
