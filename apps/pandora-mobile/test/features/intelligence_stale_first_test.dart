import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pandora_mobile/app/pandora_dependencies.dart';
import 'package:pandora_mobile/core/data/pandora_repository.dart';
import 'package:pandora_mobile/core/diagnostics/diagnostics_store.dart';
import 'package:pandora_mobile/core/models/pandora_models.dart';
import 'package:pandora_mobile/core/network/pandora_api_error.dart';
import 'package:pandora_mobile/core/security/pandora_auth.dart';
import 'package:pandora_mobile/features/intelligence/owner_intelligence_screen.dart';

import '../helpers/test_app.dart';

/// Regression net for P0.4.
///
/// A refresh must never replace verified owner content with a skeleton, and
/// retained content must always be labelled rather than silently presented as
/// live truth.
void main() {
  testWidgets('a failed refresh keeps labelled verified content', (
    tester,
  ) async {
    final repository = _Repository();

    await tester.pumpWidget(
      testApp(
        child: PandoraDependencies(
          auth: const _Auth(),
          repository: repository,
          diagnostics: DiagnosticsStore(),
          child: const OwnerIntelligenceScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // The first load succeeded, so verified content is on screen.
    expect(find.text('Showing saved information'), findsNothing);
    expect(tester.takeException(), isNull);

    // The provider now fails. Refreshing must not blank the screen.
    repository.failing = true;
    await tester.tap(find.byTooltip('Refresh verified owner data'));
    await tester.pump();
    await tester.pumpAndSettle();

    expect(
      find.text('Showing saved information'),
      findsOneWidget,
      reason: 'Retained content must be labelled, never silently stale.',
    );
    expect(
      find.textContaining('could not be refreshed'),
      findsOneWidget,
      reason: 'The owner must be told the refresh failed.',
    );
    expect(
      find.textContaining('Verified'),
      findsWidgets,
      reason: 'Retained content must carry its verification age.',
    );
    expect(
      find.byType(LinearProgressIndicator),
      findsNothing,
      reason: 'A failed refresh must not fall back to a loading skeleton.',
    );
    expect(tester.takeException(), isNull);
  });
}

class _Auth implements PandoraAuth {
  const _Auth();

  @override
  Stream<PandoraSession?> get changes => const Stream<PandoraSession?>.empty();

  @override
  PandoraSession? get currentSession => const PandoraSession(userId: 'fixture');

  @override
  Future<void> requestPasswordReset(String email) async {}

  @override
  Future<void> signIn({
    required String email,
    required String password,
  }) async {}

  @override
  Future<void> signOut() async {}
}

class _Repository implements PandoraRepository {
  bool failing = false;

  RepositorySnapshot<T> _snapshot<T>(T data) => RepositorySnapshot<T>(
        data: data,
        source: RepositorySource.network,
        fetchedAt: DateTime.utc(2026, 8, 14),
      );

  void _guard() {
    if (failing) {
      throw const PandoraRepositoryException(
        kind: PandoraApiErrorKind.unavailable,
        message: 'Owner API is unavailable.',
        code: 'provider_unavailable',
      );
    }
  }

  @override
  Future<RepositorySnapshot<HomeSummary>> home() async {
    _guard();
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
    _guard();
    return _snapshot(const <ProjectSummary>[]);
  }

  @override
  Future<RepositorySnapshot<List<ApprovalSummary>>> approvals() async {
    _guard();
    return _snapshot(const <ApprovalSummary>[]);
  }

  @override
  Future<RepositorySnapshot<List<ActionDefinition>>> actions() async {
    _guard();
    return _snapshot(const <ActionDefinition>[]);
  }

  @override
  Future<RepositorySnapshot<List<AuditEvent>>> activity({
    bool allowCached = false,
  }) async {
    _guard();
    return _snapshot(const <AuditEvent>[]);
  }

  @override
  Future<RepositorySnapshot<List<ConnectionSummary>>> connections({
    bool allowCached = false,
  }) async {
    _guard();
    return _snapshot(const <ConnectionSummary>[]);
  }

  @override
  Future<RepositorySnapshot<ProjectDetail>> project(
    String id, {
    bool allowCached = false,
  }) =>
      throw UnimplementedError();

  @override
  Future<RepositorySnapshot<SafetyOverview>> safety() async {
    _guard();
    return _snapshot(
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
  }

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
