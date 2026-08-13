import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pandora_mobile/app/pandora_app.dart';
import 'package:pandora_mobile/app/pandora_dependencies.dart';
import 'package:pandora_mobile/app/pandora_shell.dart';
import 'package:pandora_mobile/core/data/pandora_repository.dart';
import 'package:pandora_mobile/core/diagnostics/diagnostics_store.dart';
import 'package:pandora_mobile/core/models/pandora_models.dart';
import 'package:pandora_mobile/core/security/pandora_auth.dart';

import '../helpers/test_app.dart';

class _Auth implements PandoraAuth {
  const _Auth({
    this.session = const PandoraSession(userId: 'fixture'),
  });

  final PandoraSession? session;

  @override
  Stream<PandoraSession?> get changes => const Stream<PandoraSession?>.empty();

  @override
  PandoraSession? get currentSession => session;

  @override
  Future<void> requestPasswordReset(String email) async {}

  @override
  Future<void> signIn(
      {required String email, required String password}) async {}

  @override
  Future<void> signOut() async {}
}

class _Repository implements PandoraRepository {
  int homeCalls = 0;
  int projectCalls = 0;
  int approvalCalls = 0;
  int actionCalls = 0;
  int activityCalls = 0;

  RepositorySnapshot<T> _snapshot<T>(T data) => RepositorySnapshot<T>(
        data: data,
        source: RepositorySource.network,
        fetchedAt: DateTime.utc(2026, 8, 14),
      );

  @override
  Future<RepositorySnapshot<HomeSummary>> home() async {
    homeCalls += 1;
    return _snapshot(
      const HomeSummary(
        healthState: 'protected',
        healthLabel: 'Protected',
        freshness: FreshnessInfo(state: FreshnessState.notChecked),
        approvalCount: 0,
        activeProjectCount: 0,
        needsAttentionCount: 0,
        topProjects: <ProjectSummary>[],
        recentActivity: <AuditEvent>[],
      ),
    );
  }

  @override
  Future<RepositorySnapshot<List<ProjectSummary>>> projects({
    bool allowCached = false,
  }) async {
    projectCalls += 1;
    return _snapshot(const <ProjectSummary>[]);
  }

  @override
  Future<RepositorySnapshot<List<ApprovalSummary>>> approvals() async {
    approvalCalls += 1;
    return _snapshot(const <ApprovalSummary>[]);
  }

  @override
  Future<RepositorySnapshot<List<ActionDefinition>>> actions() async {
    actionCalls += 1;
    return _snapshot(const <ActionDefinition>[]);
  }

  @override
  Future<RepositorySnapshot<List<AuditEvent>>> activity({
    bool allowCached = false,
  }) async {
    activityCalls += 1;
    return _snapshot(const <AuditEvent>[]);
  }

  @override
  Future<RepositorySnapshot<List<ConnectionSummary>>> connections({
    bool allowCached = false,
  }) async =>
      _snapshot(const <ConnectionSummary>[]);

  @override
  Future<RepositorySnapshot<ProjectDetail>> project(
    String id, {
    bool allowCached = false,
  }) =>
      throw UnimplementedError();

  @override
  Future<RepositorySnapshot<SafetyOverview>> safety() async => _snapshot(
        const SafetyOverview(
          state: 'not_checked',
          status: 'Not checked',
          auditChain: AuditChainStatus(
            valid: false,
            label: 'Audit chain needs attention',
          ),
          sections: <SafetySection>[],
          extraIdentityCheckAdvertised: false,
        ),
      );

  @override
  Future<IntakeReceipt> ask({
    required String message,
    String? projectId,
    String? idempotencyKey,
  }) =>
      throw UnimplementedError();

  @override
  Future<ApprovalDecisionResult> decideApproval({
    required String approvalId,
    required ApprovalDecision decision,
    String reason = '',
  }) =>
      throw UnimplementedError();

  @override
  Future<IntakeReceipt> runAction({
    required String actionId,
    String? projectId,
    String? message,
    String? idempotencyKey,
  }) =>
      throw UnimplementedError();

  @override
  void clearReadOnlyCache() {}

  @override
  void dispose() {}
}

void main() {
  testWidgets('PandoraApp follows system brightness', (tester) async {
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    addTearDown(
      tester.platformDispatcher.clearPlatformBrightnessTestValue,
    );
    await tester.pumpWidget(
      PandoraApp(
        auth: const _Auth(session: null),
        repository: _Repository(),
        diagnostics: DiagnosticsStore(),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      Theme.of(tester.element(find.byType(Scaffold))).brightness,
      Brightness.dark,
    );
  });

  testWidgets('tabs load lazily and preserve their first mounted state', (
    tester,
  ) async {
    await setTestSurface(tester, logicalSize: const Size(400, 800));
    final repository = _Repository();
    await tester.pumpWidget(
      testApp(
        child: PandoraDependencies(
          auth: _Auth(),
          repository: repository,
          diagnostics: DiagnosticsStore(),
          child: const PandoraShell(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(repository.homeCalls, 1);
    expect(repository.projectCalls, 0);
    expect(repository.approvalCalls, 0);
    expect(repository.actionCalls, 0);
    expect(repository.activityCalls, 0);

    await tester.tap(find.text('Projects').last);
    await tester.pumpAndSettle();
    expect(repository.projectCalls, 1);

    await tester.tap(find.text('Home').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Projects').last);
    await tester.pumpAndSettle();
    expect(repository.projectCalls, 1);
  });
}
