import 'package:flutter_test/flutter_test.dart';
import 'package:pandora_mobile/core/data/user_access_repository.dart';

void main() {
  group('roleTemplatePermissions', () {
    test('owner keeps anti-lockout root authority', () {
      expect(
        roleTemplatePermissions(PandoraMemberRole.owner),
        containsAll(UserAccessPermission.values),
      );
    });

    test('admin cannot release production by role alone', () {
      final permissions = roleTemplatePermissions(PandoraMemberRole.admin);
      expect(permissions, contains(UserAccessPermission.usersManage));
      expect(
        permissions,
        isNot(contains(UserAccessPermission.releaseProduction)),
      );
    });

    test('viewer remains read-only and narrow', () {
      expect(
        roleTemplatePermissions(PandoraMemberRole.viewer),
        equals(<UserAccessPermission>{
          UserAccessPermission.projectsView,
          UserAccessPermission.activityView,
          UserAccessPermission.intelligenceView,
        }),
      );
    });
  });

  test('custom access uses only explicit permissions', () {
    const member = UserAccessMember(
      userId: '2ea3035c-5f7d-4ed4-b105-3e7ee7501047',
      email: 'developer@example.com',
      role: PandoraMemberRole.admin,
      status: MembershipAccessStatus.active,
      accessMode: MembershipAccessMode.custom,
      projectScope: MembershipProjectScope.selected,
      permissions: <UserAccessPermission>{
        UserAccessPermission.projectsView,
        UserAccessPermission.projectsEdit,
      },
      projectIds: <String>['plp-boracay'],
      accessVersion: 3,
    );

    expect(
      member.effectivePermissions,
      equals(<UserAccessPermission>{
        UserAccessPermission.projectsView,
        UserAccessPermission.projectsEdit,
      }),
    );
    expect(
      member.effectivePermissions,
      isNot(contains(UserAccessPermission.usersManage)),
    );
  });

  test('wire parser rejects unknown permission keys', () {
    expect(
      () => UserAccessMember.fromJson(<String, Object?>{
        'userId': '2ea3035c-5f7d-4ed4-b105-3e7ee7501047',
        'email': 'viewer@example.com',
        'role': 'viewer',
        'status': 'active',
        'accessMode': 'custom',
        'projectScope': 'all',
        'accessVersion': 1,
        'permissions': <String>['projects.view', 'unknown.permission'],
        'projectIds': <String>[],
      }),
      throwsFormatException,
    );
  });

  test('draft serializes deterministic permission and project order', () {
    const draft = UserAccessDraft(
      role: PandoraMemberRole.member,
      status: MembershipAccessStatus.active,
      accessMode: MembershipAccessMode.custom,
      projectScope: MembershipProjectScope.selected,
      permissions: <UserAccessPermission>{
        UserAccessPermission.projectsEdit,
        UserAccessPermission.activityView,
        UserAccessPermission.projectsView,
      },
      projectIds: <String>['z-project', 'a-project'],
    );

    expect(
      draft.toJson(),
      equals(<String, Object?>{
        'role': 'member',
        'status': 'active',
        'accessMode': 'custom',
        'projectScope': 'selected',
        'permissions': <String>[
          'activity.view',
          'projects.edit',
          'projects.view',
        ],
        'projectIds': <String>['a-project', 'z-project'],
      }),
    );
  });
}
