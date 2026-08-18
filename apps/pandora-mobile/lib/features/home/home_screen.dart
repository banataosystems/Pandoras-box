import 'package:flutter/material.dart';

import '../../app/pandora_dependencies.dart';
import '../../core/data/pandora_repository.dart';
import '../../core/design/pandora_tokens.dart';
import '../../core/models/pandora_models.dart';
import '../../core/state/screen_controller.dart';
import '../../core/widgets/content_state.dart';
import '../../core/widgets/freshness_label.dart';
import '../../core/widgets/owner_experience.dart';
import '../../core/widgets/pandora_page.dart';
import '../../core/widgets/pandora_surface.dart';
import '../../core/widgets/proof_ladder.dart';
import '../../core/widgets/status_badge.dart';
import '../approvals/approvals_screen.dart';
import '../projects/project_detail_screen.dart';
import '../projects/projects_screen.dart';
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

  void _open(Widget screen) {
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
  }

  @override
  Widget build(BuildContext context) => PandoraPage(
    title: 'Pandora',
    subtitle:
        'What needs attention, what is moving, and what Pandora recommends.',
    showProductMark: true,
    actions: [
      IconButton(
        tooltip: 'Open Settings',
        onPressed: () => _open(const SettingsScreen()),
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
              summary: summary,
              refreshing: controller.isLoading,
              onOpenApprovals: () => _open(const ApprovalsScreen()),
              onOpenProjects: () => _open(const ProjectsScreen()),
              onOpenProject: (project) =>
                  _open(ProjectDetailScreen(project: project)),
            ),
          ],
        );
      },
    ),
  );
}

class _HomeContent extends StatelessWidget {
  const _HomeContent({
    required this.summary,
    required this.refreshing,
    required this.onOpenApprovals,
    required this.onOpenProjects,
    required this.onOpenProject,
  });

  final HomeSummary summary;
  final bool refreshing;
  final VoidCallback onOpenApprovals;
  final VoidCallback onOpenProjects;
  final ValueChanged<ProjectSummary> onOpenProject;

  @override
  Widget build(BuildContext context) {
    final needsDecision =
        summary.priority != null ||
        (summary.countersVerified && summary.approvalCount > 0);
    final projects = List<ProjectSummary>.of(summary.topProjects)
      ..sort(_compareProjectAttention);
    final heroTone = needsDecision
        ? PandoraStatusTone.attention
        : statusToneFor(summary.healthState);
    final heroTitle =
        summary.priority?.action ??
        (summary.countersVerified
            ? 'Nothing requires your decision'
            : 'Owner decision state is not verified');
    final heroMessage =
        summary.priority?.reason ??
        (summary.countersVerified
            ? 'Pandora is continuing safe work and watching for blockers.'
            : 'Refresh before relying on approval and portfolio counters.');
    final activeProject = _firstVerifiedActiveProject(projects);
    final recommendation = _recommendedNextAction(summary, projects);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        OwnerBriefingHero(
          eyebrow: needsDecision ? 'Needs you' : 'Owner briefing',
          title: heroTitle,
          message: heroMessage,
          icon: needsDecision
              ? Icons.priority_high_rounded
              : Icons.radar_rounded,
          tone: heroTone,
          statusLabel: summary.healthLabel,
          actionLabel: needsDecision ? 'Review approvals' : 'Open projects',
          onAction: needsDecision ? onOpenApprovals : onOpenProjects,
          footer: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (refreshing) ...[
                const SizedBox.square(
                  dimension: 14,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                const SizedBox(width: PandoraSpacing.xs),
              ],
              FreshnessLabel(freshness: summary.freshness),
            ],
          ),
        ),
        const SizedBox(height: PandoraSpacing.md),
        // An unverified counter is shown as an em dash so it can never be read
        // as a real value. The dash carries no meaning to a screen reader, so
        // each cell states "not verified" explicitly, and an unverified counter
        // never drives an attention tone.
        OwnerMetricGrid(
          metrics: [
            OwnerMetric(
              label: 'Approvals',
              value: summary.countersVerified
                  ? '${summary.approvalCount}'
                  : '—',
              icon: Icons.approval_outlined,
              tone: summary.countersVerified && summary.approvalCount > 0
                  ? PandoraStatusTone.attention
                  : PandoraStatusTone.neutral,
              semanticLabel: summary.countersVerified
                  ? null
                  : 'Approvals: not verified',
            ),
            OwnerMetric(
              label: 'Active projects',
              value: summary.countersVerified
                  ? '${summary.activeProjectCount}'
                  : '—',
              icon: Icons.workspaces_outline,
              tone: PandoraStatusTone.informative,
              semanticLabel: summary.countersVerified
                  ? null
                  : 'Active projects: not verified',
            ),
            OwnerMetric(
              label: 'Needs attention',
              value: summary.countersVerified
                  ? '${summary.needsAttentionCount}'
                  : '—',
              icon: Icons.warning_amber_rounded,
              tone: summary.countersVerified && summary.needsAttentionCount > 0
                  ? PandoraStatusTone.attention
                  : PandoraStatusTone.neutral,
              semanticLabel: summary.countersVerified
                  ? null
                  : 'Needs attention: not verified',
            ),
          ],
        ),
        const SizedBox(height: PandoraSpacing.xl),
        const OwnerSectionHeading(
          title: 'Right now',
          subtitle: 'The simplest verified view of motion and direction.',
        ),
        const SizedBox(height: PandoraSpacing.sm),
        OwnerSignal(
          label: 'Pandora is doing',
          value: activeProject == null
              ? 'No verified active work was returned.'
              : '${activeProject.name} · ${activeProject.phase}',
          icon: activeProject == null
              ? Icons.pause_circle_outline_rounded
              : Icons.play_circle_outline_rounded,
          tone: activeProject == null
              ? PandoraStatusTone.neutral
              : PandoraStatusTone.informative,
        ),
        const SizedBox(height: PandoraSpacing.xs),
        OwnerSignal(
          label: 'Pandora recommends next',
          value: recommendation,
          icon: Icons.arrow_forward_rounded,
          tone: needsDecision
              ? PandoraStatusTone.attention
              : PandoraStatusTone.informative,
        ),
        const SizedBox(height: PandoraSpacing.xl),
        OwnerSectionHeading(
          title: 'Portfolio focus',
          subtitle: projects.isEmpty
              ? 'No verified project summaries were returned.'
              : 'Blockers and stale proof are shown first.',
          trailing: TextButton(
            onPressed: onOpenProjects,
            child: const Text('View all'),
          ),
        ),
        const SizedBox(height: PandoraSpacing.sm),
        if (projects.isEmpty)
          const EmptyContent(
            title: 'No projects in the briefing',
            message: 'Open Projects to refresh the verified portfolio list.',
          )
        else
          for (var index = 0; index < projects.length; index++) ...[
            _ProjectBrief(
              project: projects[index],
              onTap: () => onOpenProject(projects[index]),
            ),
            if (index != projects.length - 1)
              const SizedBox(height: PandoraSpacing.sm),
          ],
        const SizedBox(height: PandoraSpacing.xl),
        const OwnerSectionHeading(
          title: 'Meaningful recent changes',
          subtitle: 'Owner-readable outcomes, not internal machinery.',
        ),
        const SizedBox(height: PandoraSpacing.sm),
        PandoraSurface(
          child: summary.recentActivity.isEmpty
              ? const Text('No recent verified activity was returned.')
              : Column(
                  children: [
                    for (
                      var index = 0;
                      index < summary.recentActivity.length;
                      index++
                    ) ...[
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
}

class _ProjectBrief extends StatelessWidget {
  const _ProjectBrief({required this.project, required this.onTap});

  final ProjectSummary project;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: 'Open ${project.name}',
    child: InkWell(
      borderRadius: PandoraRadius.cardBorder,
      onTap: onTap,
      child: PandoraSurface(
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
            Text(project.phase, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: PandoraSpacing.sm),
            ProofLadder(stages: project.evidenceStages, compact: true),
            if (project.blocker != null) ...[
              const SizedBox(height: PandoraSpacing.sm),
              OwnerSignal(
                label: 'Blocked by',
                value: project.blocker!,
                icon: Icons.block_rounded,
                tone: PandoraStatusTone.critical,
              ),
            ],
            if (project.nextAction != null) ...[
              const SizedBox(height: PandoraSpacing.xs),
              OwnerSignal(
                label: 'Pandora will do next',
                value: project.nextAction!,
                icon: Icons.arrow_forward_rounded,
                tone: PandoraStatusTone.informative,
              ),
            ],
          ],
        ),
      ),
    ),
  );
}

class _ActivityBrief extends StatelessWidget {
  const _ActivityBrief({required this.event});

  final AuditEvent event;

  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: EdgeInsets.zero,
    leading: Icon(providerIconFor(event.provider ?? event.type)),
    title: Text(event.summary),
    subtitle: Text(
      [
        event.project,
        event.provider,
        ownerRelativeTime(event.happenedAt),
      ].whereType<String>().where((item) => item.isNotEmpty).join(' · '),
    ),
    trailing: event.result == null
        ? null
        : StatusBadge(
            label: event.result!,
            tone: statusToneFor(event.result!),
            compact: true,
          ),
  );
}

ProjectSummary? _firstVerifiedActiveProject(List<ProjectSummary> projects) {
  for (final project in projects) {
    if (!project.freshness.isFresh || project.blocker != null) continue;
    final state = project.status.toLowerCase();
    if (state.contains('active') ||
        state.contains('working') ||
        state.contains('building') ||
        state.contains('testing') ||
        state.contains('review') ||
        state.contains('waiting')) {
      return project;
    }
  }
  return null;
}

String _recommendedNextAction(
  HomeSummary summary,
  List<ProjectSummary> projects,
) {
  final priorityAction = summary.priority?.action.trim();
  if (priorityAction != null && priorityAction.isNotEmpty) {
    return priorityAction;
  }
  for (final project in projects) {
    final nextAction = project.nextAction?.trim();
    if (nextAction != null && nextAction.isNotEmpty) {
      return '${project.name}: $nextAction';
    }
  }
  return 'Open Projects to review the latest verified next actions.';
}

int _compareProjectAttention(ProjectSummary left, ProjectSummary right) {
  int score(ProjectSummary project) {
    if (project.blocker != null ||
        project.status.toLowerCase().contains('blocked')) {
      return 0;
    }
    if (project.freshness.state != FreshnessState.fresh) return 1;
    if (project.status.toLowerCase().contains('active')) return 2;
    return 3;
  }

  final scoreDifference = score(left).compareTo(score(right));
  if (scoreDifference != 0) return scoreDifference;
  return left.name.toLowerCase().compareTo(right.name.toLowerCase());
}

String _safeError(Object? error) {
  if (error is PandoraRepositoryException) return error.message;
  return 'Pandora could not verify this information. Try again.';
}
