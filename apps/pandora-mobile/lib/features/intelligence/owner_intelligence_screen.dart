import 'package:flutter/material.dart';

import '../../app/pandora_dependencies.dart';
import '../../core/data/pandora_repository.dart';
import '../../core/models/pandora_models.dart';
import '../../core/widgets/pandora_page.dart';
import '../../core/widgets/proof_ladder.dart';

enum OwnerIntelligenceSection {
  portfolio,
  memory,
  search,
  notifications,
  autopilot,
  release,
}

class OwnerIntelligenceScreen extends StatefulWidget {
  const OwnerIntelligenceScreen({
    super.key,
    this.initialSection = OwnerIntelligenceSection.portfolio,
  });

  final OwnerIntelligenceSection initialSection;

  @override
  State<OwnerIntelligenceScreen> createState() =>
      _OwnerIntelligenceScreenState();
}

class _OwnerIntelligenceScreenState extends State<OwnerIntelligenceScreen> {
  Future<_OwnerIntelligenceData>? _future;
  late OwnerIntelligenceSection _section;
  final TextEditingController _searchController = TextEditingController();
  String _query = '';
  String? _workingProjectId;
  String? _workingAction;

  @override
  void initState() {
    super.initState();
    _section = widget.initialSection;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<_OwnerIntelligenceData> _load() async {
    final repository = PandoraDependencies.of(context).repository;
    final home = await repository.home();
    final projects = await repository.projects(allowCached: true);
    final approvals = await repository.approvals();
    final activity = await repository.activity(allowCached: true);
    final connections = await repository.connections(allowCached: true);
    return _OwnerIntelligenceData(
      home: home.data,
      projects: projects.data,
      approvals: approvals.data,
      activity: activity.data,
      connections: connections.data,
      projectSource: projects.source,
      activitySource: activity.source,
      connectionSource: connections.source,
    );
  }

  void _refresh() {
    setState(() {
      _future = _load();
    });
  }

  Future<void> _submitAutopilot(
    ProjectSummary project, {
    required bool prepareOnly,
  }) async {
    if (_workingProjectId != null) return;
    setState(() {
      _workingProjectId = project.id;
      _workingAction = prepareOnly ? 'prepare' : 'continue';
    });
    final repository = PandoraDependencies.of(context).repository;
    final message = prepareOnly
        ? 'Prepare the highest-value safe next action for this project. '
            'Do not execute it. Explain risk, dependencies, required proof, '
            'rollback, and any owner approval gate.'
        : 'Continue all safe, reversible, no-cost connected work for this '
            'project. Stop before spending, destructive production or data '
            'changes, legal or public commitments, regulated activation, or '
            'production release. Preserve evidence and update project state.';
    try {
      await repository.ask(message: message, projectId: project.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            prepareOnly
                ? 'Pandora accepted the governed preparation request.'
                : 'Pandora accepted the governed safe-work request.',
          ),
        ),
      );
      _refresh();
    } on PandoraRepositoryException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    } finally {
      if (mounted) {
        setState(() {
          _workingProjectId = null;
          _workingAction = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return PandoraPage(
      title: _titleFor(_section),
      subtitle: _subtitleFor(_section),
      actions: [
        IconButton(
          tooltip: 'Refresh verified owner data',
          onPressed: _refresh,
          icon: const Icon(Icons.refresh_rounded),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SectionPicker(
            value: _section,
            onChanged: (value) => setState(() => _section = value),
          ),
          const SizedBox(height: 16),
          FutureBuilder<_OwnerIntelligenceData>(
            future: _future,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting &&
                  !snapshot.hasData) {
                return const _LoadingState();
              }
              if (snapshot.hasError && !snapshot.hasData) {
                return _ErrorState(onRetry: _refresh);
              }
              final data = snapshot.data;
              if (data == null) {
                return _ErrorState(onRetry: _refresh);
              }
              return switch (_section) {
                OwnerIntelligenceSection.portfolio =>
                  _PortfolioView(data: data),
                OwnerIntelligenceSection.memory => _MemoryView(data: data),
                OwnerIntelligenceSection.search => _SearchView(
                    data: data,
                    controller: _searchController,
                    query: _query,
                    onChanged: (value) => setState(() => _query = value),
                  ),
                OwnerIntelligenceSection.notifications =>
                  _NotificationsView(data: data),
                OwnerIntelligenceSection.autopilot => _AutopilotView(
                    data: data,
                    workingProjectId: _workingProjectId,
                    workingAction: _workingAction,
                    onPrepare: (project) =>
                        _submitAutopilot(project, prepareOnly: true),
                    onContinue: (project) =>
                        _submitAutopilot(project, prepareOnly: false),
                  ),
                OwnerIntelligenceSection.release => _ReleaseView(data: data),
              };
            },
          ),
        ],
      ),
    );
  }
}

class _OwnerIntelligenceData {
  const _OwnerIntelligenceData({
    required this.home,
    required this.projects,
    required this.approvals,
    required this.activity,
    required this.connections,
    required this.projectSource,
    required this.activitySource,
    required this.connectionSource,
  });

  final HomeSummary home;
  final List<ProjectSummary> projects;
  final List<ApprovalSummary> approvals;
  final List<AuditEvent> activity;
  final List<ConnectionSummary> connections;
  final RepositorySource projectSource;
  final RepositorySource activitySource;
  final RepositorySource connectionSource;

  bool get isDegraded =>
      projectSource == RepositorySource.memoryCache ||
      activitySource == RepositorySource.memoryCache ||
      connectionSource == RepositorySource.memoryCache;
}

class _SectionPicker extends StatelessWidget {
  const _SectionPicker({required this.value, required this.onChanged});

  final OwnerIntelligenceSection value;
  final ValueChanged<OwnerIntelligenceSection> onChanged;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Owner intelligence section',
      child: DropdownButtonFormField<OwnerIntelligenceSection>(
        value: value,
        isExpanded: true,
        decoration: const InputDecoration(
          labelText: 'View',
          prefixIcon: Icon(Icons.auto_awesome_rounded),
        ),
        items: OwnerIntelligenceSection.values
            .map(
              (section) => DropdownMenuItem(
                value: section,
                child: Text(_titleFor(section)),
              ),
            )
            .toList(growable: false),
        onChanged: (section) {
          if (section != null) onChanged(section);
        },
      ),
    );
  }
}

class _PortfolioView extends StatelessWidget {
  const _PortfolioView({required this.data});

  final _OwnerIntelligenceData data;

  @override
  Widget build(BuildContext context) {
    final recommendations = _recommendations(data);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (data.isDegraded) const _DegradedBanner(),
        _Panel(
          eyebrow: 'SYSTEM POSTURE',
          title: data.home.healthLabel,
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _Metric(
                label: 'Active projects',
                value: '${data.home.activeProjectCount}',
              ),
              _Metric(
                label: 'Needs attention',
                value: '${data.home.needsAttentionCount}',
              ),
              _Metric(
                label: 'Approvals',
                value: '${data.home.approvalCount}',
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _Panel(
          eyebrow: 'PANDORA RECOMMENDS',
          title: recommendations.isEmpty
              ? 'No owner intervention is currently indicated'
              : recommendations.first,
          child: recommendations.length <= 1
              ? const Text(
                  'Pandora will keep verified state visible and fail closed '
                  'when evidence is missing.',
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: recommendations
                      .skip(1)
                      .take(4)
                      .map(
                        (item) => Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text('• $item'),
                        ),
                      )
                      .toList(growable: false),
                ),
        ),
        const SizedBox(height: 12),
        _Panel(
          eyebrow: 'NEEDS YOU',
          title: data.approvals.isEmpty
              ? 'No pending approvals'
              : '${data.approvals.length} decision'
                  '${data.approvals.length == 1 ? '' : 's'} waiting',
          child: data.approvals.isEmpty
              ? const Text(
                  'Approval and execution remain separate. Pandora will not '
                  'turn an approval into an unreviewed execution.',
                )
              : Column(
                  children: data.approvals
                      .take(3)
                      .map(
                        (approval) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading:
                              const Icon(Icons.approval_outlined, size: 22),
                          title: Text(approval.action),
                          subtitle: Text(approval.reason),
                        ),
                      )
                      .toList(growable: false),
                ),
        ),
        const SizedBox(height: 12),
        _Panel(
          eyebrow: 'PORTFOLIO',
          title: 'Highest-value project signals',
          child: Column(
            children: data.projects
                .take(5)
                .map(
                  (project) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(
                      project.blocker == null
                          ? Icons.check_circle_outline_rounded
                          : Icons.error_outline_rounded,
                    ),
                    title: Text(project.name),
                    subtitle: Text(
                      project.blocker ??
                          project.nextAction ??
                          'No verified next action was recorded.',
                    ),
                    trailing: Text(
                      project.phase,
                      textAlign: TextAlign.end,
                    ),
                  ),
                )
                .toList(growable: false),
          ),
        ),
      ],
    );
  }
}

class _MemoryView extends StatelessWidget {
  const _MemoryView({required this.data});

  final _OwnerIntelligenceData data;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (data.isDegraded) const _DegradedBanner(),
        const _Panel(
          eyebrow: 'MEMORY & LEARNING',
          title: 'Read-only owner memory snapshot',
          child: Text(
            'This view summarizes verified owner-API state. Canonical Memory '
            'promotion stays review-gated; the mobile client never silently '
            'promotes a learning candidate or writes secrets into Memory.',
          ),
        ),
        const SizedBox(height: 12),
        _Panel(
          eyebrow: 'CURRENT PROJECT TRUTH',
          title: '${data.projects.length} projects in the current snapshot',
          child: Column(
            children: data.projects
                .take(8)
                .map(
                  (project) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(project.name),
                    subtitle: Text(
                      '${project.phase}\n'
                      '${project.nextAction ?? project.blocker ?? project.purpose}',
                    ),
                    isThreeLine: true,
                    trailing: Text(project.progressLabel),
                  ),
                )
                .toList(growable: false),
          ),
        ),
        const SizedBox(height: 12),
        _Panel(
          eyebrow: 'RECENT LEARNING SIGNALS',
          title: 'Meaningful recorded changes',
          child: data.activity.isEmpty
              ? const Text('No recent activity was returned.')
              : Column(
                  children: data.activity
                      .take(8)
                      .map(
                        (event) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading:
                              const Icon(Icons.history_rounded, size: 22),
                          title: Text(event.summary),
                          subtitle: Text(
                            [
                              if (event.project != null) event.project!,
                              event.actor,
                              if (event.provider != null) event.provider!,
                            ].join(' · '),
                          ),
                        ),
                      )
                      .toList(growable: false),
                ),
        ),
      ],
    );
  }
}

class _SearchView extends StatelessWidget {
  const _SearchView({
    required this.data,
    required this.controller,
    required this.query,
    required this.onChanged,
  });

  final _OwnerIntelligenceData data;
  final TextEditingController controller;
  final String query;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final hits = _search(data, query);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (data.isDegraded) const _DegradedBanner(),
        TextField(
          controller: controller,
          onChanged: onChanged,
          textInputAction: TextInputAction.search,
          decoration: const InputDecoration(
            labelText: 'Search Pandora',
            hintText: 'Projects, approvals, activity, connections…',
            prefixIcon: Icon(Icons.search_rounded),
          ),
        ),
        const SizedBox(height: 12),
        _Panel(
          eyebrow: 'UNIVERSAL SEARCH',
          title: query.trim().isEmpty
              ? 'Start with a project, provider, action, or outcome'
              : '${hits.length} matching result'
                  '${hits.length == 1 ? '' : 's'}',
          child: query.trim().isEmpty
              ? const Text(
                  'Search stays local to the already-authorized owner snapshot; '
                  'it does not send every keystroke to a provider.',
                )
              : hits.isEmpty
                  ? const Text('No matching authorized owner data.')
                  : Column(
                      children: hits
                          .take(30)
                          .map(
                            (hit) => ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: Icon(hit.icon),
                              title: Text(hit.title),
                              subtitle: Text(hit.subtitle),
                              trailing: Text(hit.kind),
                            ),
                          )
                          .toList(growable: false),
                    ),
        ),
      ],
    );
  }
}

class _NotificationsView extends StatelessWidget {
  const _NotificationsView({required this.data});

  final _OwnerIntelligenceData data;

  @override
  Widget build(BuildContext context) {
    final notices = _notifications(data);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (data.isDegraded) const _DegradedBanner(),
        _Panel(
          eyebrow: 'ATTENTION INBOX',
          title: notices.isEmpty
              ? 'Nothing currently requires attention'
              : '${notices.length} meaningful notification'
                  '${notices.length == 1 ? '' : 's'}',
          child: notices.isEmpty
              ? const Text(
                  'Pandora suppresses routine machine noise here. Developer '
                  'telemetry belongs in Diagnostics.',
                )
              : Column(
                  children: notices
                      .map(
                        (notice) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: Icon(notice.icon),
                          title: Text(notice.title),
                          subtitle: Text(notice.detail),
                        ),
                      )
                      .toList(growable: false),
                ),
        ),
        const SizedBox(height: 12),
        const _Panel(
          eyebrow: 'NOTIFICATION POLICY',
          title: 'Owner-relevant events only',
          child: Text(
            'Prioritize approvals, blockers, failed verification, release '
            'gates, and meaningful project changes. Raw request logs and '
            'provider chatter remain outside the owner inbox.',
          ),
        ),
      ],
    );
  }
}

class _AutopilotView extends StatelessWidget {
  const _AutopilotView({
    required this.data,
    required this.workingProjectId,
    required this.workingAction,
    required this.onPrepare,
    required this.onContinue,
  });

  final _OwnerIntelligenceData data;
  final String? workingProjectId;
  final String? workingAction;
  final ValueChanged<ProjectSummary> onPrepare;
  final ValueChanged<ProjectSummary> onContinue;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _Panel(
          eyebrow: 'AUTOPILOT',
          title: 'Governed autonomy, never blind execution',
          child: Text(
            'Observe is read-only. Prepare asks Pandora to build the next '
            'governed plan without execution. Continue safe work delegates '
            'only reversible, no-cost connected work and explicitly stops at '
            'spending, destructive changes, legal/public commitments, '
            'regulated activation, and production release.',
          ),
        ),
        const SizedBox(height: 12),
        ...data.projects.take(12).map(
          (project) {
            final busy = workingProjectId == project.id;
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _Panel(
                eyebrow: project.phase.toUpperCase(),
                title: project.name,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(project.nextAction ?? project.purpose),
                    if (project.blocker != null) ...[
                      const SizedBox(height: 8),
                      Text('Blocked: ${project.blocker!}'),
                    ],
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        OutlinedButton.icon(
                          onPressed: busy ? null : () => onPrepare(project),
                          icon: busy && workingAction == 'prepare'
                              ? const SizedBox.square(
                                  dimension: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.playlist_add_check_rounded),
                          label: const Text('Prepare next action'),
                        ),
                        FilledButton.icon(
                          onPressed: busy ? null : () => onContinue(project),
                          icon: busy && workingAction == 'continue'
                              ? const SizedBox.square(
                                  dimension: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.auto_mode_rounded),
                          label: const Text('Continue safe work'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}

class _ReleaseView extends StatelessWidget {
  const _ReleaseView({required this.data});

  final _OwnerIntelligenceData data;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _Panel(
          eyebrow: 'RELEASE CENTER',
          title: 'Evidence before promotion',
          child: Text(
            'Release readiness is shown from the project proof ladder. This '
            'screen does not infer readiness from a green build, perform a '
            'production deployment, or bypass the separate owner release '
            'authorization.',
          ),
        ),
        const SizedBox(height: 12),
        ...data.projects.take(12).map(
          (project) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _Panel(
              eyebrow: project.status.toUpperCase(),
              title: project.name,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(project.phase),
                  const SizedBox(height: 10),
                  ProofLadder(stages: project.evidenceStages),
                  const SizedBox(height: 10),
                  Text(project.progressLabel),
                  if (project.blocker != null) ...[
                    const SizedBox(height: 8),
                    Text('Blocker: ${project.blocker!}'),
                  ],
                  if (project.nextAction != null) ...[
                    const SizedBox(height: 8),
                    Text('Next: ${project.nextAction!}'),
                  ],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({
    required this.eyebrow,
    required this.title,
    required this.child,
  });

  final String eyebrow;
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              eyebrow,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: scheme.primary,
                    letterSpacing: 0.9,
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 4),
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 96),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 2),
          Text(label, style: Theme.of(context).textTheme.labelMedium),
        ],
      ),
    );
  }
}

class _LoadingState extends StatelessWidget {
  const _LoadingState();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        LinearProgressIndicator(),
        SizedBox(height: 16),
        _Panel(
          eyebrow: 'PREPARING PANDORA',
          title: 'Loading verified owner state',
          child: Text(
            'Project truth, approvals, activity, and provider readiness are '
            'being reconciled.',
          ),
        ),
      ],
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      eyebrow: 'NEEDS ATTENTION',
      title: 'Owner intelligence could not refresh',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Pandora did not substitute stale machine data for a live owner '
            'decision surface.',
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('Try again'),
          ),
        ],
      ),
    );
  }
}

class _DegradedBanner extends StatelessWidget {
  const _DegradedBanner();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: Theme.of(context).colorScheme.secondaryContainer,
        borderRadius: BorderRadius.circular(14),
        child: const Padding(
          padding: EdgeInsets.all(12),
          child: Text(
            'Some read-only summaries are cached. Approval, execution, and '
            'authorization decisions still require live verification.',
          ),
        ),
      ),
    );
  }
}

class _SearchHit {
  const _SearchHit({
    required this.kind,
    required this.title,
    required this.subtitle,
    required this.icon,
  });

  final String kind;
  final String title;
  final String subtitle;
  final IconData icon;
}

class _Notice {
  const _Notice({
    required this.title,
    required this.detail,
    required this.icon,
  });

  final String title;
  final String detail;
  final IconData icon;
}

List<String> _recommendations(_OwnerIntelligenceData data) {
  final recommendations = <String>[];
  if (data.approvals.isNotEmpty) {
    recommendations.add(
      'Review ${data.approvals.length} pending approval'
      '${data.approvals.length == 1 ? '' : 's'} before execution can advance.',
    );
  }
  for (final project in data.projects) {
    if (project.blocker != null) {
      recommendations.add('${project.name}: resolve ${project.blocker!}');
    } else if (!project.progressVerified) {
      recommendations.add(
        '${project.name}: verify current proof before relying on progress.',
      );
    } else if (project.nextAction != null) {
      recommendations.add('${project.name}: ${project.nextAction!}');
    }
    if (recommendations.length >= 5) break;
  }
  return recommendations;
}

List<_SearchHit> _search(_OwnerIntelligenceData data, String rawQuery) {
  final query = rawQuery.trim().toLowerCase();
  if (query.isEmpty) return const [];
  final hits = <_SearchHit>[];

  bool matches(Iterable<String?> values) => values
      .whereType<String>()
      .any((value) => value.toLowerCase().contains(query));

  for (final project in data.projects) {
    if (matches([
      project.name,
      project.purpose,
      project.phase,
      project.status,
      project.blocker,
      project.nextAction,
      project.repository,
    ])) {
      hits.add(
        _SearchHit(
          kind: 'Project',
          title: project.name,
          subtitle:
              project.nextAction ?? project.blocker ?? project.purpose,
          icon: Icons.folder_open_rounded,
        ),
      );
    }
  }
  for (final approval in data.approvals) {
    if (matches([
      approval.action,
      approval.reason,
      approval.change,
      approval.projectId,
      approval.rollback,
    ])) {
      hits.add(
        _SearchHit(
          kind: 'Approval',
          title: approval.action,
          subtitle: approval.reason,
          icon: Icons.approval_rounded,
        ),
      );
    }
  }
  for (final event in data.activity) {
    if (matches([
      event.type,
      event.actor,
      event.summary,
      event.project,
      event.provider,
      event.result,
    ])) {
      hits.add(
        _SearchHit(
          kind: 'Activity',
          title: event.summary,
          subtitle: [
            if (event.project != null) event.project!,
            event.actor,
            if (event.provider != null) event.provider!,
          ].join(' · '),
          icon: Icons.history_rounded,
        ),
      );
    }
  }
  for (final connection in data.connections) {
    if (matches([
      connection.name,
      connection.purpose,
      connection.state,
      connection.status,
    ])) {
      hits.add(
        _SearchHit(
          kind: 'Connection',
          title: connection.name,
          subtitle: '${connection.state} · ${connection.purpose}',
          icon: Icons.cable_rounded,
        ),
      );
    }
  }
  return hits;
}

List<_Notice> _notifications(_OwnerIntelligenceData data) {
  final notices = <_Notice>[];
  for (final approval in data.approvals) {
    notices.add(
      _Notice(
        title: 'Approval needed: ${approval.action}',
        detail: approval.reason,
        icon: Icons.approval_outlined,
      ),
    );
  }
  for (final project in data.projects) {
    if (project.blocker != null) {
      notices.add(
        _Notice(
          title: '${project.name} is blocked',
          detail: project.blocker!,
          icon: Icons.error_outline_rounded,
        ),
      );
    } else if (!project.progressVerified) {
      notices.add(
        _Notice(
          title: '${project.name} progress is not verified',
          detail: project.nextAction ??
              'Evidence is required before progress can be relied on.',
          icon: Icons.fact_check_outlined,
        ),
      );
    }
  }
  for (final event in data.activity) {
    final result = event.result?.toLowerCase() ?? '';
    if (result.contains('fail') || result.contains('error')) {
      notices.add(
        _Notice(
          title: event.summary,
          detail: [
            if (event.project != null) event.project!,
            if (event.provider != null) event.provider!,
            event.result!,
          ].join(' · '),
          icon: Icons.warning_amber_rounded,
        ),
      );
    }
  }
  return notices.take(30).toList(growable: false);
}

String _titleFor(OwnerIntelligenceSection section) => switch (section) {
      OwnerIntelligenceSection.portfolio => 'Portfolio intelligence',
      OwnerIntelligenceSection.memory => 'Memory & learning',
      OwnerIntelligenceSection.search => 'Universal search',
      OwnerIntelligenceSection.notifications => 'Notifications',
      OwnerIntelligenceSection.autopilot => 'Autopilot',
      OwnerIntelligenceSection.release => 'Release center',
    };

String _subtitleFor(OwnerIntelligenceSection section) => switch (section) {
      OwnerIntelligenceSection.portfolio =>
        'What matters now, why it matters, and the safest next move.',
      OwnerIntelligenceSection.memory =>
        'Owner-readable project truth and recent learning signals.',
      OwnerIntelligenceSection.search =>
        'Search the authorized owner snapshot without internal ID hunting.',
      OwnerIntelligenceSection.notifications =>
        'Only events that merit owner attention.',
      OwnerIntelligenceSection.autopilot =>
        'Prepare or continue governed safe work without bypassing gates.',
      OwnerIntelligenceSection.release =>
        'Evidence, blockers, next gates, and rollback-minded readiness.',
    };
