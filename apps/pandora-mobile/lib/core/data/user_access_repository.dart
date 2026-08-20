import '../network/pandora_api_client.dart';
import '../network/pandora_api_error.dart';

enum PandoraMemberRole {
  owner('owner', 'Owner'),
  admin('admin', 'Admin'),
  operator('operator', 'Operator'),
  member('member', 'Member'),
  viewer('viewer', 'Viewer');

  const PandoraMemberRole(this.wireValue, this.label);
  final String wireValue;
  final String label;

  static PandoraMemberRole fromWire(Object? value) => values.firstWhere(
        (item) => item.wireValue == value,
        orElse: () => throw const FormatException('Unknown member role.'),
      );
}

enum MembershipAccessStatus {
  invited('invited', 'Invited'),
  active('active', 'Active'),
  suspended('suspended', 'Suspended'),
  revoked('revoked', 'Revoked');

  const MembershipAccessStatus(this.wireValue, this.label);
  final String wireValue;
  final String label;

  static MembershipAccessStatus fromWire(Object? value) => values.firstWhere(
        (item) => item.wireValue == value,
        orElse: () => throw const FormatException('Unknown membership status.'),
      );
}

enum MembershipAccessMode {
  role('role', 'Role template'),
  custom('custom', 'Custom access');

  const MembershipAccessMode(this.wireValue, this.label);
  final String wireValue;
  final String label;

  static MembershipAccessMode fromWire(Object? value) => values.firstWhere(
        (item) => item.wireValue == value,
        orElse: () => throw const FormatException('Unknown access mode.'),
      );
}

enum MembershipProjectScope {
  all('all', 'All projects'),
  selected('selected', 'Selected projects only'),
  none('none', 'No project access');

  const MembershipProjectScope(this.wireValue, this.label);
  final String wireValue;
  final String label;

  static MembershipProjectScope fromWire(Object? value) => values.firstWhere(
        (item) => item.wireValue == value,
        orElse: () => throw const FormatException('Unknown project scope.'),
      );
}

enum UserAccessPermission {
  projectsView('projects.view', 'View projects', 'Projects'),
  projectsEdit('projects.edit', 'Edit projects', 'Projects'),
  approvalsView('approvals.view', 'View approvals', 'Approvals'),
  approvalsDecide(
    'approvals.decide',
    'Decide approvals',
    'Approvals',
    highRisk: true,
  ),
  activityView('activity.view', 'View activity', 'Activity'),
  intelligenceView(
    'intelligence.view',
    'Portfolio intelligence',
    'Intelligence',
  ),
  autopilotView('autopilot.view', 'View Autopilot', 'Autopilot'),
  autopilotRun('autopilot.run', 'Run governed work', 'Autopilot'),
  releaseCenterView(
    'release_center.view',
    'View Release Center',
    'Release Center',
  ),
  releaseProduction(
    'release.production',
    'Release to production',
    'Release Center',
    highRisk: true,
  ),
  connectionsView('connections.view', 'View connections', 'Connections'),
  connectionsManage(
    'connections.manage',
    'Change connections',
    'Connections',
    highRisk: true,
  ),
  safetyView('safety.view', 'View safety', 'Safety'),
  memoryView('memory.view', 'Memory & learning', 'Memory & Learning'),
  diagnosticsView(
    'diagnostics.view',
    'Developer diagnostics',
    'Developer Diagnostics',
  ),
  usersManage(
    'users.manage',
    'Manage users',
    'User Management',
    highRisk: true,
  );

  const UserAccessPermission(
    this.wireValue,
    this.label,
    this.group, {
    this.highRisk = false,
  });
  final String wireValue;
  final String label;
  final String group;
  final bool highRisk;

  static UserAccessPermission fromWire(Object? value) => values.firstWhere(
        (item) => item.wireValue == value,
        orElse: () => throw const FormatException('Unknown permission.'),
      );
}

Set<UserAccessPermission> roleTemplatePermissions(PandoraMemberRole role) {
  final all = UserAccessPermission.values.toSet();
  return switch (role) {
    PandoraMemberRole.owner => all,
    PandoraMemberRole.admin => all
      ..remove(UserAccessPermission.releaseProduction),
    PandoraMemberRole.operator => <UserAccessPermission>{
        UserAccessPermission.projectsView,
        UserAccessPermission.projectsEdit,
        UserAccessPermission.approvalsView,
        UserAccessPermission.activityView,
        UserAccessPermission.intelligenceView,
        UserAccessPermission.autopilotView,
        UserAccessPermission.autopilotRun,
        UserAccessPermission.releaseCenterView,
        UserAccessPermission.connectionsView,
        UserAccessPermission.safetyView,
        UserAccessPermission.memoryView,
      },
    PandoraMemberRole.member => <UserAccessPermission>{
        UserAccessPermission.projectsView,
        UserAccessPermission.projectsEdit,
        UserAccessPermission.activityView,
        UserAccessPermission.intelligenceView,
        UserAccessPermission.memoryView,
      },
    PandoraMemberRole.viewer => <UserAccessPermission>{
        UserAccessPermission.projectsView,
        UserAccessPermission.activityView,
        UserAccessPermission.intelligenceView,
      },
  };
}

class UserAccessMember {
  const UserAccessMember({
    required this.userId,
    required this.email,
    required this.role,
    required this.status,
    required this.accessMode,
    required this.projectScope,
    required this.permissions,
    required this.projectIds,
    required this.accessVersion,
    this.joinedAt,
    this.createdAt,
    this.updatedAt,
  });

  final String userId;
  final String email;
  final PandoraMemberRole role;
  final MembershipAccessStatus status;
  final MembershipAccessMode accessMode;
  final MembershipProjectScope projectScope;
  final Set<UserAccessPermission> permissions;
  final List<String> projectIds;
  final int accessVersion;
  final DateTime? joinedAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  Set<UserAccessPermission> get effectivePermissions =>
      accessMode == MembershipAccessMode.custom
          ? permissions
          : roleTemplatePermissions(role);

  factory UserAccessMember.fromJson(Object? value) {
    final json = _requiredMap(value, 'member');
    return UserAccessMember(
      userId: _requiredText(json['userId'], 'userId'),
      email: _text(json['email']),
      role: PandoraMemberRole.fromWire(json['role']),
      status: MembershipAccessStatus.fromWire(json['status']),
      accessMode: MembershipAccessMode.fromWire(json['accessMode']),
      projectScope: MembershipProjectScope.fromWire(json['projectScope']),
      permissions: Set<UserAccessPermission>.unmodifiable(
        _requiredList(
          json['permissions'],
          'permissions',
        ).map(UserAccessPermission.fromWire),
      ),
      projectIds: List<String>.unmodifiable(
        _requiredList(
          json['projectIds'],
          'projectIds',
        ).map((item) => _requiredText(item, 'projectId')),
      ),
      accessVersion: _positiveInt(json['accessVersion'], fallback: 1),
      joinedAt: _date(json['joinedAt']),
      createdAt: _date(json['createdAt']),
      updatedAt: _date(json['updatedAt']),
    );
  }
}

class UserAccessDraft {
  const UserAccessDraft({
    required this.role,
    required this.status,
    required this.accessMode,
    required this.projectScope,
    required this.permissions,
    required this.projectIds,
  });
  final PandoraMemberRole role;
  final MembershipAccessStatus status;
  final MembershipAccessMode accessMode;
  final MembershipProjectScope projectScope;
  final Set<UserAccessPermission> permissions;
  final List<String> projectIds;

  Map<String, Object?> toJson() => <String, Object?>{
        'role': role.wireValue,
        'status': status.wireValue,
        'accessMode': accessMode.wireValue,
        'projectScope': projectScope.wireValue,
        'permissions': permissions.map((item) => item.wireValue).toList()
          ..sort(),
        'projectIds': List<String>.from(projectIds)..sort(),
      };
}

abstract interface class UserAccessRepository {
  Future<UserAccessMember> current();
  Future<List<UserAccessMember>> members();
  Future<UserAccessMember> invite({
    required String email,
    required UserAccessDraft access,
  });
  Future<UserAccessMember> update({
    required String userId,
    required UserAccessDraft access,
  });
  Future<UserAccessMember> revoke(String userId);
  void dispose();
}

class RemoteUserAccessRepository implements UserAccessRepository {
  const RemoteUserAccessRepository({required PandoraApiClient client})
      : _client = client;
  final PandoraApiClient _client;

  @override
  Future<UserAccessMember> current() async {
    final response = await _client.getJson(
      pathSegments: const <String>['me'],
      operation: 'users.current',
      routeTemplate: '/me',
    );
    return _memberResponse(response, '/me');
  }

  @override
  Future<List<UserAccessMember>> members() async {
    final response = await _client.getJson(
      pathSegments: const <String>['users'],
      operation: 'users.load',
      routeTemplate: '/users',
    );
    final json = _responseMap(response, '/users');
    return List<UserAccessMember>.unmodifiable(
      _requiredList(json['members'], 'members').map(UserAccessMember.fromJson),
    );
  }

  @override
  Future<UserAccessMember> invite({
    required String email,
    required UserAccessDraft access,
  }) async {
    final response = await _client.postJson(
      pathSegments: const <String>['users', 'invite'],
      operation: 'users.invite',
      routeTemplate: '/users/invite',
      body: <String, Object?>{'email': email.trim(), ...access.toJson()},
    );
    return _memberResponse(response, '/users/invite', mutation: true);
  }

  @override
  Future<UserAccessMember> update({
    required String userId,
    required UserAccessDraft access,
  }) async {
    final id = _requiredIdentifier(userId);
    final response = await _client.postJson(
      pathSegments: <String>['users', id, 'update'],
      operation: 'users.update',
      routeTemplate: '/users/:id/update',
      body: access.toJson(),
    );
    return _memberResponse(response, '/users/:id/update', mutation: true);
  }

  @override
  Future<UserAccessMember> revoke(String userId) async {
    final id = _requiredIdentifier(userId);
    final response = await _client.postJson(
      pathSegments: <String>['users', id, 'revoke'],
      operation: 'users.revoke',
      routeTemplate: '/users/:id/revoke',
      body: const <String, Object?>{},
    );
    return _memberResponse(response, '/users/:id/revoke', mutation: true);
  }

  @override
  void dispose() => _client.close();

  UserAccessMember _memberResponse(
    PandoraApiResponse response,
    String endpoint, {
    bool mutation = false,
  }) {
    try {
      final json = _responseMap(response, endpoint);
      return UserAccessMember.fromJson(json['member']);
    } on PandoraApiError {
      rethrow;
    } catch (_) {
      throw PandoraApiError(
        kind: mutation
            ? PandoraApiErrorKind.ambiguousMutation
            : PandoraApiErrorKind.contract,
        message: mutation
            ? 'Pandora received the access change, but this app could not confirm the resulting state. Refresh before retrying.'
            : 'Pandora returned an unexpected access response.',
        code: mutation
            ? 'ACCESS_RESPONSE_UNCONFIRMED'
            : 'ACCESS_RESPONSE_INVALID',
        statusCode: response.statusCode,
        requestId: response.requestId,
      );
    }
  }

  Map<String, Object?> _responseMap(
    PandoraApiResponse response,
    String endpoint,
  ) {
    try {
      return _requiredMap(response.data, endpoint);
    } catch (_) {
      throw PandoraApiError(
        kind: PandoraApiErrorKind.contract,
        message: 'Pandora returned an unexpected response for $endpoint.',
        code: 'ACCESS_RESPONSE_INVALID',
        statusCode: response.statusCode,
        requestId: response.requestId,
      );
    }
  }

  static String _requiredIdentifier(String value) {
    final id = value.trim();
    if (id.isEmpty || id.length > 100) {
      throw const PandoraApiError(
        kind: PandoraApiErrorKind.invalidRequest,
        message: 'Pandora needs a valid user.',
        code: 'INVALID_USER_ID',
      );
    }
    return id;
  }
}

Map<String, Object?> _requiredMap(Object? value, String name) {
  if (value is! Map) throw FormatException('$name must be an object.');
  return value.map((key, item) => MapEntry(key.toString(), item));
}

List<Object?> _requiredList(Object? value, String name) {
  if (value is! List) throw FormatException('$name must be a list.');
  return List<Object?>.from(value);
}

String _requiredText(Object? value, String name) {
  final result = _text(value);
  if (result.isEmpty) throw FormatException('$name is required.');
  return result;
}

String _text(Object? value) => value is String ? value.trim() : '';
int _positiveInt(Object? value, {required int fallback}) {
  if (value is int && value > 0) return value;
  if (value is num && value > 0) return value.toInt();
  return fallback;
}

DateTime? _date(Object? value) {
  final raw = _text(value);
  if (raw.isEmpty) return null;
  return DateTime.tryParse(raw)?.toUtc();
}
