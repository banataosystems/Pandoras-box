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
import 'project_detail_screen.dart';

enum ProjectFilter {
  all('All'),
  needsMe('Needs me'),
  active('Active'),
  blocked('Blocked'),
  stale('Stale'),
  productionVerified('Production verified');

  const ProjectFilter(this.label);
  final String label;
}

class ProjectsScreen extends StatefulWidget {
  const ProjectsScreen({super.key});

  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  ScreenController<List<ProjectSummary>>? _controller;
  final _search = TextEditingController();
  ProjectFilter _filter = ProjectFilter.all;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_controller != null) return;
    final repository = PandoraDependencies.of(context).repository;
    _controller = ScreenController<List<ProjectSummary>>(
      () => repository.projects(allowCached: true),
    )..load();
  }

  @override
  void dispose() {
    _search.dispose();
    _controller?.dispose();
    super.dispose();
  }

  List<ProjectSummary> _visible(List<ProjectSummary> projects) {
    final query = _search.text.trim().toLowerCase();
    final visible = projects
        .where((project) {
          final matchesQuery =
              query.isEmpty ||
              '${project.name} ${project.purpose} ${project.phase} ${project.status}'
                  .toLowerCase()
                  .contains(query);
          if (!matchesQuery) return false;
          return switch (_filter) {
            ProjectFilter.all => true,
            ProjectFilter.needsMe => project.blocker != null,
            ProjectFilter.active => project.status.toLowerCase().contains(
              'active',
            ),
            ProjectFilter.blocked =>
              project.status.toLowerCase().contains('blocked') ||
                  project.blocker != null,
            ProjectFilter.stale =>
              project.freshness.state != FreshnessState.fresh,
            ProjectFilter.productionVerified =>
              project.evidenceState(EvidenceStage.productionVerified) ==
                  EvidenceClaimState.verified,
          };
        })
        .toList(growable: true);
    visible.sort(_compareProjectAttention);
    return List<ProjectSummary>.unmodifiable(visible);
  }

  @override
  Widget build(BuildContext context) => PandoraPage(
    title: 'Projects',
    subtitle: 'Truth, blockers, proof, and the next safe action.',
    actions: [
      IconButton(
        tooltip: 'Refresh Projects',
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
            title: 'Projects could not load',
            message: _safeError(controller.error),
            onRetry: controller.load,
          );
        }
        final allProjects = controller.data ?? const <ProjectSummary>[];
        final projects = _visible(allProjects);
        final blocked = allProjects
            .where(
              (project) =>
                  project.blocker != null ||
                  project.status.toLowerCase().contains('blocked'),
            )
            .length;
        final stale = allProjects
            .where((project) => project.freshness.state != FreshnessState.fresh)
            .length;
        final productionVerified = allProjects
            .where(
              (project) =>
                  project.evidenceState(EvidenceStage.productionVerified) ==
                  EvidenceClaimState.verified,
            )
            .length;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (controller.degradedReason != null ||
                controller.error != null) ...[
              DegradedContentNotice(
                message: controller.degradedReason ?? controller.error!.message,
                onRetry: controller.refresh,
              ),
              const SizedBox(height: PandoraSpacing.md),
            ],
            OwnerMetricGrid(
              metrics: [
                OwnerMetric(
                  label: 'Projects',
                  value: '${allProjects.length}',
                  icon: Icons.workspaces_outline,
                  tone: PandoraStatusTone.informative,
                ),
                OwnerMetric(
                  label: 'Blocked',
                  value: '$blocked',
                  icon: Icons.block_rounded,
                  tone: blocked > 0
                      ? PandoraStatusTone.critical
                      : PandoraStatusTone.neutral,
                ),
                OwnerMetric(
                  label: 'Stale proof',
                  value: '$stale',
                  icon: Icons.schedule_rounded,
                  tone: stale > 0
                      ? PandoraStatusTone.attention
                      : PandoraStatusTone.neutral,
                ),
                OwnerMetric(
                  label: 'Production verified',
                  value: '$productionVerified',
                  icon: Icons.verified_outlined,
                  tone: PandoraStatusTone.verified,
                ),
              ],
            ),
            const SizedBox(height: PandoraSpacing.md),
            PandoraSurface(
              title: 'Find a project',
              subtitle: 'Search by name, purpose, phase, or status.',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: _search,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(
                      labelText: 'Search projects',
                      prefixIcon: Icon(Icons.search_rounded),
                    ),
                  ),
                  const SizedBox(height: PandoraSpacing.sm),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        for (final filter in ProjectFilter.values) ...[
                          FilterChip(
                            label: Text(filter.label),
                            selected: _filter == filter,
                            onSelected: (_) => setState(() => _filter = filter),
                          ),
                          if (filter != ProjectFilter.values.last)
                            const SizedBox(width: PandoraSpacing.xs),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: PandoraSpacing.xl),
            OwnerSectionHeading(
              title: 'Portfolio',
              subtitle: projects.isEmpty
                  ? 'No projects match the current view.'
                  : '${projects.length} project${projects.length == 1 ? '' : 's'} · attention first',
            ),
            const SizedBox(height: PandoraSpacing.sm),
            if (projects.isEmpty)
              EmptyContent(
                title: 'No matching projects',
                message: _search.text.isEmpty && _filter == ProjectFilter.all
                    ? 'No verified projects were returned.'
                    : 'Try another search or filter.',
              )
            else
              for (var index = 0; index < projects.length; index++) ...[
                _ProjectCard(project: projects[index]),
                if (index != projects.length - 1)
                  const SizedBox(height: PandoraSpacing.sm),
              ],
          ],
        );
      },
    ),
  );
}

class _ProjectCard extends StatelessWidget {
  const _ProjectCard({required this.project});

  final ProjectSummary project;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: 'Open ${project.name}',
    child: InkWell(
      borderRadius: PandoraRadius.cardBorder,
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => ProjectDetailScreen(project: project),
        ),
      ),
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
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    project.phase,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
                const SizedBox(width: PandoraSpacing.sm),
                FreshnessLabel(freshness: project.freshness),
              ],
            ),
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
                label: 'Next safe action',
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
  return 'Pandora could not verify the project list. Try again.';
}
