import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:pandora_mobile/core/data/pandora_repository.dart';
import 'package:pandora_mobile/core/models/pandora_models.dart';

Object? fixture(String name) => jsonDecode(
      File('test/fixtures/owner_api/$name.json').readAsStringSync(),
    );

void main() {
  test('canonical project fixture parses without claiming unverified progress',
      () {
    final projects = asJsonList(fixture('projects'));
    final project = ProjectSummary.fromJson(projects.single);

    expect(project.name, 'Pandora Mobile');
    expect(project.progressPercent, 42);
    expect(project.progressVerified, isFalse);
    expect(project.progressLabel, 'Progress not verified');
    expect(project.freshness.state, FreshnessState.fresh);
  });

  test('malformed optional values fail soft and clamp display percentages', () {
    final project = ProjectSummary.fromJson(<String, Object?>{
      'id': 'fixture',
      'name': 'Fixture',
      'progressPercent': 900,
      'progressVerified': true,
      'dataFreshness': 'future_state',
      'lastVerifiedAt': 'not-a-date',
    });

    expect(project.progressPercent, 100);
    expect(project.progressVerified, isFalse);
    expect(project.freshness.state, FreshnessState.notChecked);
    expect(project.freshness.lastVerifiedAt, isNull);
  });

  test('missing required project identity raises a typed contract failure', () {
    expect(
      () => ProjectSummary.fromJson(<String, Object?>{'name': 'Fixture'}),
      throwsA(
        isA<PandoraModelContractException>().having(
          (error) => error.field,
          'field',
          'project.id',
        ),
      ),
    );
  });

  test('proof stages remain five distinct evidence claims', () {
    expect(EvidenceStage.values, <EvidenceStage>[
      EvidenceStage.documented,
      EvidenceStage.implemented,
      EvidenceStage.tested,
      EvidenceStage.deployed,
      EvidenceStage.productionVerified,
    ]);
    expect(
      EvidenceStage.parse('production_verified'),
      EvidenceStage.productionVerified,
    );
    expect(EvidenceStage.parse('unknown_future_stage'), isNull);
  });

  test('a deployment claim never implies implementation or test proof', () {
    final project = ProjectSummary.fromJson(<String, Object?>{
      'id': 'fixture',
      'name': 'Fixture',
      'proofStages': <String, Object?>{
        'deployed': 'verified',
        'future_proof': 'future_state',
      },
    });

    expect(
      project.evidenceState(EvidenceStage.deployed),
      EvidenceClaimState.verified,
    );
    expect(
      project.evidenceState(EvidenceStage.implemented),
      EvidenceClaimState.notChecked,
    );
    expect(
      project.evidenceState(EvidenceStage.tested),
      EvidenceClaimState.notChecked,
    );
    expect(
      project.evidenceStages.singleWhere((item) => item.stage == null).rawStage,
      'future_proof',
    );
  });

  test('freshness boundary uses an injected clock', () {
    final freshness = FreshnessInfo.fromJson(
      <String, Object?>{'staleAfter': '2026-08-14T02:00:00Z'},
      now: DateTime.parse('2026-08-14T01:00:00Z'),
    );
    expect(freshness.state, FreshnessState.fresh);
  });

  test('home ignores fallback priority that has no approval identity', () {
    final home = HomeSummary.fromJson(fixture('home'));
    expect(home.priority?.id, 'approval-fixture-1');

    final fallback = HomeSummary.fromJson(<String, Object?>{
      'systemHealth': <String, Object?>{},
      'priority': <String, Object?>{
        'whatWillHappen': 'Nothing needs you right now',
      },
      'counters': <String, Object?>{},
    });
    expect(fallback.priority, isNull);
  });

  test('project detail discards arbitrary currentState from domain model', () {
    final detail = ProjectDetail.fromJson(fixture('project'));
    expect(detail.phases, hasLength(1));
    expect(detail.tasks, hasLength(1));
    expect(detail.evidence, hasLength(1));
    expect(detail.summary.progressVerified, isFalse);
  });

  test('202 intake fixture maps only the documented receipt contract', () {
    final receipt = IntakeReceipt.fromJson(
      fixture('intake_receipt'),
      requestId: 'request-fixture-1',
    );
    expect(receipt.needsApproval, isTrue);
    expect(receipt.actionId, 'action-fixture-1');
    expect(receipt.approvalId, 'approval-fixture-1');
    expect(receipt.status.whatIWillDoNext, contains('plan'));
    expect(receipt.requestId, 'request-fixture-1');
  });

  test('remaining canonical summary fixtures parse to typed owner models', () {
    final approval = ApprovalSummary.fromJson(
      asJsonList(fixture('approvals')).single,
    );
    final action = ActionDefinition.fromJson(
      asJsonList(fixture('actions')).single,
    );
    final activity = AuditEvent.fromJson(
      asJsonList(fixture('activity')).single,
    );
    final connection = ConnectionSummary.fromJson(
      asJsonList(fixture('connections')).single,
    );
    final safety = SafetyOverview.fromJson(fixture('safety'));

    expect(approval.risk, ActionRisk.high);
    expect(approval.reversible, isTrue);
    expect(action.executionMode, 'Plan first');
    expect(activity.summary, contains('exact candidate'));
    expect(connection.canRead, isTrue);
    expect(connection.canChange, isFalse);
    expect(safety.auditChain.valid, isTrue);
  });
}
