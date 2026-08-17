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
    return projects
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
        .toList(growable: false);
  }

  @override
  Widget build(BuildContext context) => PandoraPage(
    title: 'Projects',
    subtitle:
        'Verified project truth, blockers, proof, and the next safe action.',
    actions: [
      IconButton(
        tooltip: 'Refresh Projects',
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
        const SizedBox(height: PandoraSpacing.lg),
        AnimatedBuilder(
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
            final projects = _visible(
              controller.data ?? const <ProjectSummary>[],
            );
            if (projects.isEmpty) {
              return EmptyContent(
                title: 'No matching projects',
                message: _search.text.isEmpty && _filter == ProjectFilter.all
                    ? 'No verified projects were returned.'
                    : 'Try another search or filter.',
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
                for (var index = 0; index < projects.length; index++) ...[
                  _ProjectCard(project: projects[index]),
                  if (index != projects.length - 1)
                    const SizedBox(height: PandoraSpacing.sm),
                ],
              ],
            );
          },
        ),
      ],
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
            Text(project.phase, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: PandoraSpacing.sm),
            ProofLadder(stages: project.evidenceStages, compact: true),
            const SizedBox(height: PandoraSpacing.sm),
            Row(
              children: [
                Expanded(child: Text(project.progressLabel)),
                FreshnessLabel(freshness: project.freshness),
              ],
            ),
            if (project.blocker != null) ...[
              const SizedBox(height: PandoraSpacing.sm),
              Text('Blocked: ${project.blocker!}'),
            ],
            if (project.nextAction != null) ...[
              const SizedBox(height: PandoraSpacing.xs),
              Text('Next: ${project.nextAction!}'),
            ],
          ],
        ),
      ),
    ),
  );
}

String _safeError(Object? error) {
  if (error is PandoraRepositoryException) return error.message;
  return 'Pandora could not verify the project list. Try again.';
}
