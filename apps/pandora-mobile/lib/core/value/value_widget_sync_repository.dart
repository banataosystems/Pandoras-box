import 'dart:async';

import '../data/pandora_repository.dart';
import '../data/remote_pandora_repository.dart';
import '../models/pandora_models.dart';
import 'pandora_value_meter.dart';

/// Preserves the existing repository contract while adding a read-only,
/// best-effort value-widget refresh after the primary Home projection succeeds.
class ValueWidgetSyncRepository
    implements
        PandoraRepository,
        AuthorizationInvalidationSource,
        AuthenticatedIdentityBoundary {
  ValueWidgetSyncRepository({
    required RemotePandoraRepository delegate,
    required PandoraValueMeterSync valueMeterSync,
  })  : _delegate = delegate,
        _valueMeterSync = valueMeterSync;

  final RemotePandoraRepository _delegate;
  final PandoraValueMeterSync _valueMeterSync;

  @override
  Stream<AuthorizationInvalidation> get authorizationInvalidations =>
      _delegate.authorizationInvalidations;

  @override
  void beginAuthenticatedIdentityEpoch() =>
      _delegate.beginAuthenticatedIdentityEpoch();

  @override
  Future<RepositorySnapshot<HomeSummary>> home() async {
    final snapshot = await _delegate.home();
    unawaited(_valueMeterSync.refresh());
    return snapshot;
  }

  @override
  Future<RepositorySnapshot<List<ProjectSummary>>> projects({
    bool allowCached = false,
  }) =>
      _delegate.projects(allowCached: allowCached);

  @override
  Future<RepositorySnapshot<ProjectDetail>> project(
    String id, {
    bool allowCached = false,
  }) =>
      _delegate.project(id, allowCached: allowCached);

  @override
  Future<RepositorySnapshot<List<ConnectionSummary>>> connections({
    bool allowCached = false,
  }) =>
      _delegate.connections(allowCached: allowCached);

  @override
  Future<RepositorySnapshot<List<ApprovalSummary>>> approvals() =>
      _delegate.approvals();

  @override
  Future<RepositorySnapshot<List<AuditEvent>>> activity({
    bool allowCached = false,
  }) =>
      _delegate.activity(allowCached: allowCached);

  @override
  Future<RepositorySnapshot<SafetyOverview>> safety() => _delegate.safety();

  @override
  Future<RepositorySnapshot<List<ActionDefinition>>> actions() =>
      _delegate.actions();

  @override
  Future<IntakeReceipt> ask({
    required String message,
    String? projectId,
    String? idempotencyKey,
  }) =>
      _delegate.ask(
        message: message,
        projectId: projectId,
        idempotencyKey: idempotencyKey,
      );

  @override
  Future<IntakeReceipt> runAction({
    required String actionId,
    String? projectId,
    String? message,
    String? idempotencyKey,
  }) =>
      _delegate.runAction(
        actionId: actionId,
        projectId: projectId,
        message: message,
        idempotencyKey: idempotencyKey,
      );

  @override
  Future<ApprovalDecisionResult> decideApproval({
    required String approvalId,
    required ApprovalDecision decision,
    String reason = '',
  }) =>
      _delegate.decideApproval(
        approvalId: approvalId,
        decision: decision,
        reason: reason,
      );

  @override
  void clearReadOnlyCache() => _delegate.clearReadOnlyCache();

  @override
  void dispose() => _delegate.dispose();
}
