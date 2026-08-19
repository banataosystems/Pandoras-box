import 'package:flutter/material.dart';

import '../../app/pandora_dependencies.dart';
import '../../core/data/pandora_repository.dart';
import '../../core/data/user_access_repository.dart';
import '../../core/design/pandora_tokens.dart';
import '../../core/models/pandora_models.dart';
import '../../core/network/pandora_api_error.dart';
import '../../core/widgets/pandora_page.dart';

class UsersAccessScreen extends StatefulWidget {
  const UsersAccessScreen({super.key});

  @override
  State<UsersAccessScreen> createState() => _UsersAccessScreenState();
}

class _UsersAccessScreenState extends State<UsersAccessScreen> {
  UserAccessRepository? _accessRepository;
  PandoraRepository? _projectRepository;
  List<UserAccessMember> _members = const [];
  bool _bound = false;
  bool _loading = true;
  String? _error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_bound) return;
    _bound = true;
    final dependencies = PandoraDependencies.of(context);
    _accessRepository = dependencies.userAccessRepository;
    _projectRepository = dependencies.repository;
    _load();
  }

  Future<void> _load() async {
    final repository = _accessRepository;
    if (repository == null) {
      setState(() {
        _loading = false;
        _error =
            'Users & access is not connected in this build. No access changes can be made.';
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final members = await repository.members();
      if (!mounted) return;
      setState(() {
        _members = members;
        _loading = false;
      });
    } on PandoraApiError catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Pandora could not load user access safely.';
      });
    }
  }

  Future<void> _edit([UserAccessMember? member]) async {
    final access = _accessRepository;
    final projects = _projectRepository;
    if (access == null || projects == null) return;
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => UserAccessEditorScreen(
          accessRepository: access,
          projectRepository: projects,
          member: member,
        ),
      ),
    );
    if (changed == true && mounted) await _load();
  }

  Future<void> _revoke(UserAccessMember member) async {
    final repository = _accessRepository;
    if (repository == null || member.status == MembershipAccessStatus.revoked) {
      return;
    }
    final identity = member.email.isNotEmpty ? member.email : member.userId;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete this access?'),
        content: Text(
          '$identity will immediately lose Pandora access. Membership and authorization history will be retained for audit and recovery.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete access'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _loading = true);
    try {
      await repository.revoke(member.userId);
      if (!mounted) return;
      await _load();
    } on PandoraApiError catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) => PandoraPage(
        title: 'Users & access',
        subtitle:
            'Invite people and give each person only the access they need.',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(PandoraSpacing.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Least privilege by default',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Permissions are enforced by Pandora authorization and database policies. Hiding a button is never treated as security.',
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: PandoraSpacing.md),
            FilledButton.icon(
              onPressed:
                  _accessRepository == null || _loading ? null : () => _edit(),
              icon: const Icon(Icons.person_add_alt_1_rounded),
              label: const Text('Add user'),
            ),
            if (_error != null) ...[
              const SizedBox(height: PandoraSpacing.md),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(PandoraSpacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_error!),
                      TextButton.icon(
                        onPressed: _loading ? null : _load,
                        icon: const Icon(Icons.refresh_rounded),
                        label: const Text('Try again'),
                      ),
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: PandoraSpacing.lg),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (_members.isEmpty && _error == null)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(PandoraSpacing.lg),
                  child: Text('No organization users were returned.'),
                ),
              )
            else
              ..._members.map(
                (member) => Padding(
                  padding: const EdgeInsets.only(bottom: PandoraSpacing.sm),
                  child: _MemberCard(
                    member: member,
                    onEdit: () => _edit(member),
                    onRevoke: member.status == MembershipAccessStatus.revoked
                        ? null
                        : () => _revoke(member),
                  ),
                ),
              ),
          ],
        ),
      );
}

class _MemberCard extends StatelessWidget {
  const _MemberCard({
    required this.member,
    required this.onEdit,
    required this.onRevoke,
  });

  final UserAccessMember member;
  final VoidCallback onEdit;
  final VoidCallback? onRevoke;

  @override
  Widget build(BuildContext context) {
    final identity = member.email.isNotEmpty ? member.email : member.userId;
    final projectLabel = switch (member.projectScope) {
      MembershipProjectScope.all => 'All projects',
      MembershipProjectScope.none => 'No projects',
      MembershipProjectScope.selected => '${member.projectIds.length} selected',
    };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(PandoraSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(identity, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              '${member.role.label} · ${member.status.label} · ${member.accessMode.label}',
            ),
            const SizedBox(height: PandoraSpacing.sm),
            Wrap(
              spacing: 6,
              children: [
                Chip(label: Text(projectLabel)),
                Chip(
                  label: Text(
                    '${member.effectivePermissions.length} permissions',
                  ),
                ),
                Chip(label: Text('Access v${member.accessVersion}')),
              ],
            ),
            const SizedBox(height: PandoraSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onEdit,
                    icon: const Icon(Icons.edit_outlined),
                    label: const Text('Edit'),
                  ),
                ),
                const SizedBox(width: PandoraSpacing.sm),
                Expanded(
                  child: TextButton.icon(
                    onPressed: onRevoke,
                    icon: const Icon(Icons.person_remove_outlined),
                    label: const Text('Delete access'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class UserAccessEditorScreen extends StatefulWidget {
  const UserAccessEditorScreen({
    super.key,
    required this.accessRepository,
    required this.projectRepository,
    this.member,
  });

  final UserAccessRepository accessRepository;
  final PandoraRepository projectRepository;
  final UserAccessMember? member;

  @override
  State<UserAccessEditorScreen> createState() => _UserAccessEditorScreenState();
}

class _UserAccessEditorScreenState extends State<UserAccessEditorScreen> {
  late final TextEditingController _emailController;
  late PandoraMemberRole _role;
  late MembershipAccessStatus _status;
  late MembershipAccessMode _mode;
  late MembershipProjectScope _scope;
  late Set<UserAccessPermission> _permissions;
  late Set<String> _projectIds;
  List<ProjectSummary> _projects = const [];
  bool _projectLoadStarted = false;
  bool _projectsLoading = false;
  bool _saving = false;
  String? _projectError;
  String? _saveError;

  bool get _isNew => widget.member == null;

  @override
  void initState() {
    super.initState();
    final member = widget.member;
    _emailController = TextEditingController(text: member?.email ?? '');
    _role = member?.role ?? PandoraMemberRole.member;
    _status = member?.status ?? MembershipAccessStatus.active;
    _mode = member?.accessMode ?? MembershipAccessMode.role;
    _scope = member?.projectScope ?? MembershipProjectScope.all;
    _permissions = Set.of(member?.permissions ?? const {});
    _projectIds = Set.of(member?.projectIds ?? const []);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_projectLoadStarted) return;
    _projectLoadStarted = true;
    _loadProjects();
  }

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _loadProjects() async {
    setState(() {
      _projectsLoading = true;
      _projectError = null;
    });
    try {
      final snapshot = await widget.projectRepository.projects(
        allowCached: true,
      );
      if (!mounted) return;
      setState(() {
        _projects = snapshot.data;
        _projectsLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _projectsLoading = false;
        _projectError =
            'Project names could not be loaded. Selected-project access cannot be saved until they are available.';
      });
    }
  }

  void _setRole(PandoraMemberRole? role) {
    if (role == null) return;
    setState(() {
      _role = role;
      if (role == PandoraMemberRole.owner) {
        _mode = MembershipAccessMode.role;
        _scope = MembershipProjectScope.all;
        _projectIds.clear();
      }
    });
  }

  void _toggle(UserAccessPermission permission, bool enabled) {
    setState(() {
      if (enabled) {
        _permissions.add(permission);
        if (permission == UserAccessPermission.projectsEdit) {
          _permissions.add(UserAccessPermission.projectsView);
        }
        if (permission == UserAccessPermission.approvalsDecide) {
          _permissions.add(UserAccessPermission.approvalsView);
        }
        if (permission == UserAccessPermission.autopilotRun) {
          _permissions.add(UserAccessPermission.autopilotView);
        }
        if (permission == UserAccessPermission.releaseProduction) {
          _permissions.add(UserAccessPermission.releaseCenterView);
        }
        if (permission == UserAccessPermission.connectionsManage) {
          _permissions.add(UserAccessPermission.connectionsView);
        }
      } else {
        _permissions.remove(permission);
        if (permission == UserAccessPermission.projectsView) {
          _permissions.remove(UserAccessPermission.projectsEdit);
        }
        if (permission == UserAccessPermission.approvalsView) {
          _permissions.remove(UserAccessPermission.approvalsDecide);
        }
        if (permission == UserAccessPermission.autopilotView) {
          _permissions.remove(UserAccessPermission.autopilotRun);
        }
        if (permission == UserAccessPermission.releaseCenterView) {
          _permissions.remove(UserAccessPermission.releaseProduction);
        }
        if (permission == UserAccessPermission.connectionsView) {
          _permissions.remove(UserAccessPermission.connectionsManage);
        }
      }
    });
  }

  bool get _canSave {
    if (_saving) return false;
    if (_isNew && _emailController.text.trim().isEmpty) return false;
    if (_scope == MembershipProjectScope.selected) {
      return !_projectsLoading &&
          _projectError == null &&
          _projectIds.isNotEmpty;
    }
    return true;
  }

  Future<void> _save() async {
    if (!_canSave) return;
    setState(() {
      _saving = true;
      _saveError = null;
    });
    final draft = UserAccessDraft(
      role: _role,
      status: _status,
      accessMode: _mode,
      projectScope: _scope,
      permissions: Set.unmodifiable(_permissions),
      projectIds: List.unmodifiable(_projectIds),
    );
    try {
      if (_isNew) {
        await widget.accessRepository.invite(
          email: _emailController.text.trim(),
          access: draft,
        );
      } else {
        await widget.accessRepository.update(
          userId: widget.member!.userId,
          access: draft,
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on PandoraApiError catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _saveError = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _saveError = 'Pandora could not confirm that access change.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final effective = _mode == MembershipAccessMode.custom
        ? _permissions
        : roleTemplatePermissions(_role);
    return PandoraPage(
      title: _isNew ? 'Add user' : 'Edit user',
      subtitle: _isNew
          ? 'Invite someone with only the authority they need.'
          : 'Access reductions take effect on the next authorized request.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _emailController,
            enabled: _isNew && !_saving,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Email'),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: PandoraSpacing.md),
          DropdownButtonFormField<PandoraMemberRole>(
            value: _role,
            decoration: const InputDecoration(labelText: 'Role template'),
            items: PandoraMemberRole.values
                .map(
                  (role) =>
                      DropdownMenuItem(value: role, child: Text(role.label)),
                )
                .toList(),
            onChanged: _saving ? null : _setRole,
          ),
          if (!_isNew) ...[
            const SizedBox(height: PandoraSpacing.md),
            DropdownButtonFormField<MembershipAccessStatus>(
              value: _status,
              decoration: const InputDecoration(labelText: 'Access state'),
              items: MembershipAccessStatus.values
                  .where((status) => status != MembershipAccessStatus.invited)
                  .map(
                    (status) => DropdownMenuItem(
                      value: status,
                      child: Text(status.label),
                    ),
                  )
                  .toList(),
              onChanged: _saving
                  ? null
                  : (value) {
                      if (value != null) setState(() => _status = value);
                    },
            ),
          ],
          const SizedBox(height: PandoraSpacing.md),
          SegmentedButton<MembershipAccessMode>(
            segments: const [
              ButtonSegment(
                value: MembershipAccessMode.role,
                label: Text('Role template'),
              ),
              ButtonSegment(
                value: MembershipAccessMode.custom,
                label: Text('Custom access'),
              ),
            ],
            selected: {_mode},
            onSelectionChanged: _role == PandoraMemberRole.owner || _saving
                ? null
                : (values) => setState(() {
                      _mode = values.first;
                      if (_mode == MembershipAccessMode.custom &&
                          _permissions.isEmpty) {
                        _permissions = roleTemplatePermissions(_role);
                      }
                    }),
          ),
          if (_role == PandoraMemberRole.owner) ...[
            const SizedBox(height: PandoraSpacing.sm),
            const Text(
              'Owner is the anti-lockout role. The last active owner cannot be demoted, suspended, or removed.',
            ),
          ],
          const SizedBox(height: PandoraSpacing.lg),
          Text('Project scope', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: PandoraSpacing.sm),
          SegmentedButton<MembershipProjectScope>(
            segments: const [
              ButtonSegment(
                value: MembershipProjectScope.all,
                label: Text('All'),
              ),
              ButtonSegment(
                value: MembershipProjectScope.selected,
                label: Text('Selected'),
              ),
              ButtonSegment(
                value: MembershipProjectScope.none,
                label: Text('None'),
              ),
            ],
            selected: {_scope},
            onSelectionChanged: _role == PandoraMemberRole.owner || _saving
                ? null
                : (values) => setState(() {
                      _scope = values.first;
                      if (_scope != MembershipProjectScope.selected) {
                        _projectIds.clear();
                      }
                    }),
          ),
          if (_scope == MembershipProjectScope.selected) ...[
            const SizedBox(height: PandoraSpacing.sm),
            const Card(
              child: Padding(
                padding: EdgeInsets.all(PandoraSpacing.sm),
                child: Text(
                  'Selected-project mode fails closed. Organization-wide records that cannot be attributed safely to a project are withheld.',
                ),
              ),
            ),
            if (_projectsLoading)
              const LinearProgressIndicator()
            else if (_projectError != null)
              Text(_projectError!)
            else
              Card(
                child: Column(
                  children: _projects
                      .map(
                        (project) => CheckboxListTile(
                          value: _projectIds.contains(project.id),
                          title: Text(project.name),
                          subtitle: project.repository == null
                              ? null
                              : Text(project.repository!),
                          onChanged: _saving
                              ? null
                              : (selected) => setState(() {
                                    if (selected == true) {
                                      _projectIds.add(project.id);
                                    } else {
                                      _projectIds.remove(project.id);
                                    }
                                  }),
                        ),
                      )
                      .toList(),
                ),
              ),
          ],
          const SizedBox(height: PandoraSpacing.lg),
          Text('Permissions', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: PandoraSpacing.sm),
          ...UserAccessPermission.values.map(
            (permission) => SwitchListTile(
              title: Text(permission.label),
              subtitle: Text(
                permission.highRisk
                    ? '${permission.group} · Protected permission'
                    : permission.group,
              ),
              value: effective.contains(permission),
              onChanged: _mode == MembershipAccessMode.custom &&
                      _role != PandoraMemberRole.owner &&
                      !_saving
                  ? (enabled) => _toggle(permission, enabled)
                  : null,
            ),
          ),
          const Card(
            child: Padding(
              padding: EdgeInsets.all(PandoraSpacing.sm),
              child: Text(
                'Production release authority is separate and remains subject to Pandora’s independent release proof and approval gates.',
              ),
            ),
          ),
          if (_saveError != null) ...[
            const SizedBox(height: PandoraSpacing.sm),
            Text(_saveError!),
          ],
          const SizedBox(height: PandoraSpacing.lg),
          FilledButton.icon(
            onPressed: _canSave ? _save : null,
            icon: _saving
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Icon(
                    _isNew
                        ? Icons.person_add_alt_1_rounded
                        : Icons.save_outlined,
                  ),
            label: Text(_isNew ? 'Send invite' : 'Save access'),
          ),
        ],
      ),
    );
  }
}
