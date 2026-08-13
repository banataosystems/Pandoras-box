typedef JsonMap = Map<String, Object?>;

class PandoraModelContractException implements Exception {
  const PandoraModelContractException({
    required this.code,
    required this.field,
  });

  final String code;
  final String field;

  @override
  String toString() => 'Pandora response is missing required field: $field';
}

JsonMap asJsonMap(Object? value) {
  if (value is Map<String, Object?>) return value;
  if (value is Map) {
    return value.map((key, item) => MapEntry(key.toString(), item));
  }
  return const <String, Object?>{};
}

List<Object?> asJsonList(Object? value) {
  if (value is! List) return const <Object?>[];
  return value.map<Object?>((item) => item).toList(growable: false);
}

Object? firstJsonValue(JsonMap json, Iterable<String> keys) {
  for (final key in keys) {
    final value = json[key];
    if (value != null) return value;
  }
  return null;
}

String jsonText(Object? value, {String fallback = ''}) {
  if (value == null) return fallback;
  final text = value.toString().trim();
  return text.isEmpty || text.toLowerCase() == 'null' ? fallback : text;
}

int? jsonInt(Object? value) {
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse(jsonText(value));
}

double? jsonDouble(Object? value) {
  if (value is num) return value.toDouble();
  return double.tryParse(jsonText(value));
}

bool jsonBool(Object? value, {bool fallback = false}) {
  if (value is bool) return value;
  final normalized = jsonText(value).toLowerCase();
  if (normalized == 'true' || normalized == '1') return true;
  if (normalized == 'false' || normalized == '0') return false;
  return fallback;
}

DateTime? jsonDateTime(Object? value) {
  final text = jsonText(value);
  return text.isEmpty ? null : DateTime.tryParse(text)?.toLocal();
}

String humanizeToken(Object? value, {String fallback = 'Unknown'}) {
  final text = jsonText(value);
  if (text.isEmpty) return fallback;
  final words = text
      .replaceAll(RegExp(r'([a-z0-9])([A-Z])'), r'$1 $2')
      .replaceAll(RegExp(r'[._-]+'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim()
      .toLowerCase();
  if (words.isEmpty) return fallback;
  return '${words[0].toUpperCase()}${words.substring(1)}';
}

List<Object?> responseItems(
  Object? raw, {
  Iterable<String> keys = const <String>['items', 'data', 'results'],
}) {
  if (raw is List) return asJsonList(raw);
  final json = asJsonMap(raw);
  for (final key in keys) {
    final value = json[key];
    if (value is List) return asJsonList(value);
  }
  return const <Object?>[];
}

enum EvidenceStage {
  documented,
  implemented,
  tested,
  deployed,
  productionVerified;

  String get label => switch (this) {
        documented => 'Documented',
        implemented => 'Implemented',
        tested => 'Tested',
        deployed => 'Deployed',
        productionVerified => 'Production verified',
      };

  static EvidenceStage? parse(Object? value) {
    final normalized = jsonText(
      value,
    ).toLowerCase().replaceAll(RegExp(r'[^a-z]'), '');
    return switch (normalized) {
      'documented' || 'planned' => documented,
      'implemented' || 'built' => implemented,
      'tested' || 'verified' => tested,
      'deployed' || 'released' => deployed,
      'productionverified' || 'liveverified' => productionVerified,
      _ => null,
    };
  }
}

enum EvidenceClaimState {
  verified,
  failed,
  notChecked;

  String get label => switch (this) {
        verified => 'Verified',
        failed => 'Failed',
        notChecked => 'Not checked',
      };

  static EvidenceClaimState parse(Object? value) {
    final normalized = jsonText(value).toLowerCase();
    if (const <String>{'verified', 'passed', 'complete'}.contains(normalized)) {
      return verified;
    }
    if (const <String>{'failed', 'blocked', 'invalid'}.contains(normalized)) {
      return failed;
    }
    return notChecked;
  }
}

class EvidenceStageStatus {
  const EvidenceStageStatus({
    required this.stage,
    required this.state,
    required this.rawStage,
    required this.rawState,
  });

  final EvidenceStage? stage;
  final EvidenceClaimState state;
  final String rawStage;
  final String rawState;
}

enum FreshnessState {
  fresh,
  stale,
  notChecked;

  String get label => switch (this) {
        fresh => 'Fresh',
        stale => 'Stale',
        notChecked => 'Not checked',
      };

  static FreshnessState parse(Object? value) {
    final normalized = jsonText(value).toLowerCase();
    if (normalized == 'fresh' || normalized == 'current') return fresh;
    if (normalized == 'stale' || normalized == 'expired') return stale;
    return notChecked;
  }
}

class FreshnessInfo {
  const FreshnessInfo({
    required this.state,
    this.lastVerifiedAt,
    this.staleAfter,
  });

  final FreshnessState state;
  final DateTime? lastVerifiedAt;
  final DateTime? staleAfter;

  bool get isFresh => state == FreshnessState.fresh;

  factory FreshnessInfo.fromJson(JsonMap json, {DateTime? now}) {
    final staleAfter = jsonDateTime(
      firstJsonValue(json, const ['staleAfter', 'stale_after']),
    );
    var state = FreshnessState.parse(
      firstJsonValue(json, const ['dataFreshness', 'freshness', 'state']),
    );
    if (state == FreshnessState.notChecked && staleAfter != null) {
      state = staleAfter.isAfter(now ?? DateTime.now())
          ? FreshnessState.fresh
          : FreshnessState.stale;
    }
    return FreshnessInfo(
      state: state,
      lastVerifiedAt: jsonDateTime(
        firstJsonValue(json, const [
          'lastVerifiedAt',
          'last_verified_at',
          'lastCheckedAt',
        ]),
      ),
      staleAfter: staleAfter,
    );
  }
}

class ProjectSummary {
  const ProjectSummary({
    required this.id,
    required this.name,
    required this.purpose,
    required this.phase,
    required this.status,
    required this.progressVerified,
    required this.freshness,
    required this.evidenceStages,
    this.progressPercent,
    this.blocker,
    this.nextAction,
    this.repository,
  });

  final String id;
  final String name;
  final String purpose;
  final String phase;
  final String status;
  final int? progressPercent;
  final bool progressVerified;
  final String? blocker;
  final String? nextAction;
  final String? repository;
  final List<EvidenceStageStatus> evidenceStages;
  final FreshnessInfo freshness;

  String get progressLabel => progressVerified && progressPercent != null
      ? '$progressPercent% verified'
      : 'Progress not verified';

  EvidenceClaimState evidenceState(EvidenceStage stage) {
    for (final status in evidenceStages) {
      if (status.stage == stage) return status.state;
    }
    return EvidenceClaimState.notChecked;
  }

  factory ProjectSummary.fromJson(Object? value) {
    final json = asJsonMap(value);
    final freshness = FreshnessInfo.fromJson(json);
    final progress = jsonInt(
      firstJsonValue(json, const ['progressPercent', 'progress_percent']),
    );
    return ProjectSummary(
      id: requiredJsonText(
          json,
          const [
            'id',
            'projectKey',
            'project_key',
          ],
          field: 'project.id'),
      name: requiredJsonText(json, const ['name'], field: 'project.name'),
      purpose: jsonText(
        firstJsonValue(json, const ['plainPurpose', 'purpose', 'objective']),
        fallback: 'Purpose not recorded yet.',
      ),
      phase: jsonText(
        firstJsonValue(json, const ['phase', 'currentPhase', 'current_phase']),
        fallback: 'Phase not verified',
      ),
      status: humanizeToken(
        firstJsonValue(json, const ['plainStatus', 'status']),
        fallback: 'Not verified',
      ),
      progressPercent: progress?.clamp(0, 100).toInt(),
      progressVerified: jsonBool(json['progressVerified']) &&
          progress != null &&
          freshness.isFresh,
      blocker: _nullableText(
        firstJsonValue(json, const [
          'whatIsStoppingUs',
          'blocker',
          'blockedBy',
        ]),
      ),
      nextAction: _nullableText(
        firstJsonValue(json, const [
          'whatIWillDoNext',
          'nextAction',
          'next_action',
        ]),
      ),
      repository: _nullableText(json['repository']),
      evidenceStages: _evidenceStageStatuses(json),
      freshness: freshness,
    );
  }
}

class ProjectPhase {
  const ProjectPhase({
    required this.id,
    required this.name,
    required this.status,
    this.exitCriteria,
  });

  final String id;
  final String name;
  final String status;
  final String? exitCriteria;

  factory ProjectPhase.fromJson(Object? value) {
    final json = asJsonMap(value);
    return ProjectPhase(
      id: jsonText(firstJsonValue(json, const ['phase_key', 'id'])),
      name: jsonText(json['name'], fallback: 'Unnamed phase'),
      status: humanizeToken(json['status'], fallback: 'Not verified'),
      exitCriteria: _nullableText(json['exit_criteria']),
    );
  }
}

class ProjectTask {
  const ProjectTask({
    required this.id,
    required this.title,
    required this.status,
    required this.risk,
    this.completionCriteria,
    this.headSha,
  });

  final String id;
  final String title;
  final String status;
  final ActionRisk risk;
  final String? completionCriteria;
  final String? headSha;

  factory ProjectTask.fromJson(Object? value) {
    final json = asJsonMap(value);
    return ProjectTask(
      id: jsonText(firstJsonValue(json, const ['task_key', 'id'])),
      title: jsonText(json['title'], fallback: 'Untitled work'),
      status: humanizeToken(json['status'], fallback: 'Not verified'),
      risk: ActionRisk.parse(json['risk_class']),
      completionCriteria: _nullableText(json['completion_criteria']),
      headSha: _nullableText(json['current_head_sha']),
    );
  }
}

class EvidenceItem {
  const EvidenceItem({
    required this.id,
    required this.type,
    required this.provider,
    required this.status,
    this.verdict,
    this.sourceUrl,
    this.headSha,
    this.observedAt,
  });

  final String id;
  final String type;
  final String provider;
  final String status;
  final String? verdict;
  final String? sourceUrl;
  final String? headSha;
  final DateTime? observedAt;

  factory EvidenceItem.fromJson(Object? value) {
    final json = asJsonMap(value);
    return EvidenceItem(
      id: jsonText(json['id']),
      type: humanizeToken(json['evidence_type'], fallback: 'Evidence'),
      provider: jsonText(json['provider'], fallback: 'Recorded source'),
      status: humanizeToken(json['status'], fallback: 'Not verified'),
      verdict: _nullableText(json['verdict']),
      sourceUrl: _nullableText(json['source_url']),
      headSha: _nullableText(json['head_sha']),
      observedAt: jsonDateTime(json['observed_at']),
    );
  }
}

class ProjectDetail {
  const ProjectDetail({
    required this.summary,
    required this.phases,
    required this.tasks,
    required this.evidence,
    this.objective,
    this.roadmapVersion,
  });

  final ProjectSummary summary;
  final String? objective;
  final String? roadmapVersion;
  final List<ProjectPhase> phases;
  final List<ProjectTask> tasks;
  final List<EvidenceItem> evidence;

  factory ProjectDetail.fromJson(Object? value) {
    final json = asJsonMap(value);
    return ProjectDetail(
      summary: ProjectSummary.fromJson(json),
      objective: _nullableText(json['objective']),
      roadmapVersion: _nullableText(json['roadmapVersion']),
      phases: asJsonList(
        json['phases'],
      ).map(ProjectPhase.fromJson).toList(growable: false),
      tasks: asJsonList(
        json['tasks'],
      ).map(ProjectTask.fromJson).toList(growable: false),
      evidence: asJsonList(
        json['evidence'],
      ).map(EvidenceItem.fromJson).toList(growable: false),
    );
  }
}

enum ActionRisk {
  low,
  medium,
  high,
  critical,
  notChecked;

  String get label => switch (this) {
        low => 'Low risk',
        medium => 'Medium risk',
        high => 'High risk',
        critical => 'Critical risk',
        notChecked => 'Risk not checked',
      };

  static ActionRisk parse(Object? value) {
    final normalized = jsonText(value).toLowerCase();
    if (normalized == 'r0' || normalized == 'r1' || normalized == 'low') {
      return low;
    }
    if (normalized == 'r2' || normalized == 'medium' || normalized == 'write') {
      return medium;
    }
    if (normalized == 'r3' || normalized == 'high') return high;
    if (normalized == 'r4' || normalized == 'critical') return critical;
    return notChecked;
  }
}

class ActionDefinition {
  const ActionDefinition({
    required this.id,
    required this.title,
    required this.description,
    required this.risk,
    required this.executionMode,
    required this.extraIdentityCheckRequired,
  });

  final String id;
  final String title;
  final String description;
  final ActionRisk risk;
  final String executionMode;
  final bool extraIdentityCheckRequired;

  factory ActionDefinition.fromJson(Object? value) {
    final json = asJsonMap(value);
    return ActionDefinition(
      id: jsonText(json['id'], fallback: 'unknown-action'),
      title: jsonText(
        firstJsonValue(json, const ['title', 'name', 'label']),
        fallback: 'Protected action',
      ),
      description: jsonText(
        firstJsonValue(json, const ['plainPurpose', 'description', 'request']),
        fallback: 'No plain-language description was recorded.',
      ),
      risk: ActionRisk.parse(json['risk']),
      executionMode: humanizeToken(
        json['executionMode'],
        fallback: 'Plan first',
      ),
      extraIdentityCheckRequired: jsonBool(json['extraIdentityCheckRequired']),
    );
  }
}

class IntakeStatus {
  const IntakeStatus({
    required this.whatChanged,
    required this.whereWeAre,
    required this.whatIsDone,
    required this.whatIsHappeningNow,
    required this.whatIWillDoNext,
    this.whatIsStoppingUs,
  });

  final String whatChanged;
  final String whereWeAre;
  final String whatIsDone;
  final String whatIsHappeningNow;
  final String? whatIsStoppingUs;
  final String whatIWillDoNext;

  factory IntakeStatus.fromJson(Object? value) {
    final json = asJsonMap(value);
    return IntakeStatus(
      whatChanged: requiredJsonText(
          json,
          const <String>[
            'whatChanged',
          ],
          field: 'intake.status.whatChanged'),
      whereWeAre: requiredJsonText(
          json,
          const <String>[
            'whereWeAre',
          ],
          field: 'intake.status.whereWeAre'),
      whatIsDone: requiredJsonText(
          json,
          const <String>[
            'whatIsDone',
          ],
          field: 'intake.status.whatIsDone'),
      whatIsHappeningNow: requiredJsonText(
          json,
          const <String>[
            'whatIsHappeningNow',
          ],
          field: 'intake.status.whatIsHappeningNow'),
      whatIsStoppingUs: _nullableText(json['whatIsStoppingUs']),
      whatIWillDoNext: requiredJsonText(
          json,
          const <String>[
            'whatIWillDoNext',
          ],
          field: 'intake.status.whatIWillDoNext'),
    );
  }
}

class IntakeReceipt {
  const IntakeReceipt({
    required this.reply,
    required this.needsApproval,
    required this.actionId,
    required this.status,
    this.approvalId,
    this.requestId,
  });

  final String reply;
  final bool needsApproval;
  final String actionId;
  final String? approvalId;
  final String? requestId;
  final IntakeStatus status;

  factory IntakeReceipt.fromJson(Object? value, {String? requestId}) {
    final json = asJsonMap(value);
    final needsApproval = requiredJsonBool(
      json,
      'needsApproval',
      field: 'intake.needsApproval',
    );
    final approvalId = _nullableText(json['approvalId']);
    if (needsApproval && approvalId == null) {
      throw const PandoraModelContractException(
        code: 'MISSING_REQUIRED_FIELD',
        field: 'intake.approvalId',
      );
    }
    return IntakeReceipt(
      reply: requiredJsonText(
          json,
          const <String>[
            'reply',
          ],
          field: 'intake.reply'),
      needsApproval: needsApproval,
      actionId: requiredJsonText(
          json,
          const <String>[
            'actionId',
          ],
          field: 'intake.actionId'),
      approvalId: approvalId,
      requestId: requestId,
      status: IntakeStatus.fromJson(json['status']),
    );
  }
}

class ApprovalSummary {
  const ApprovalSummary({
    required this.id,
    required this.action,
    required this.reason,
    required this.change,
    required this.risk,
    required this.reversible,
    required this.decision,
    this.projectId,
    this.rollback,
    this.expiresAt,
    this.createdAt,
  });

  final String id;
  final String? projectId;
  final String action;
  final String reason;
  final String change;
  final ActionRisk risk;
  final bool reversible;
  final String? rollback;
  final String decision;
  final DateTime? expiresAt;
  final DateTime? createdAt;

  bool get isExpired => isExpiredAt(DateTime.now());

  bool isExpiredAt(DateTime now) => expiresAt?.isBefore(now) ?? false;

  factory ApprovalSummary.fromJson(Object? value) {
    final json = asJsonMap(value);
    final rollback = _nullableText(json['howWeCanUndoIt']);
    return ApprovalSummary(
      id: requiredJsonText(json, const <String>['id'], field: 'approval.id'),
      projectId: _nullableText(json['projectId']),
      action: jsonText(json['whatWillHappen'], fallback: 'Protected change'),
      reason: jsonText(
        json['whyINeedYou'],
        fallback: 'Pandora needs an owner decision.',
      ),
      change: jsonText(
        json['whatWillChange'],
        fallback: 'Change details were not recorded.',
      ),
      risk: ActionRisk.parse(json['riskLevel']),
      reversible: jsonBool(json['reversible']) && rollback != null,
      rollback: rollback,
      decision: humanizeToken(json['decision'], fallback: 'Pending'),
      expiresAt: jsonDateTime(json['expiresAt']),
      createdAt: jsonDateTime(json['createdAt']),
    );
  }
}

class ApprovalDetail {
  const ApprovalDetail({
    required this.summary,
    required this.whatCouldGoWrong,
    required this.evidencePassed,
    required this.evidenceMissing,
    this.target,
    this.requester,
  });

  final ApprovalSummary summary;
  final String whatCouldGoWrong;
  final String? target;
  final String? requester;
  final List<String> evidencePassed;
  final List<String> evidenceMissing;

  factory ApprovalDetail.fromJson(Object? value) {
    final json = asJsonMap(value);
    return ApprovalDetail(
      summary: ApprovalSummary.fromJson(json),
      whatCouldGoWrong: jsonText(
        json['whatCouldGoWrong'],
        fallback: 'Specific risks were not recorded.',
      ),
      target: _nullableText(json['target']),
      requester: _nullableText(json['requester']),
      evidencePassed: _stringList(json['evidencePassed']),
      evidenceMissing: _stringList(json['evidenceMissing']),
    );
  }
}

class ConnectionSummary {
  const ConnectionSummary({
    required this.id,
    required this.name,
    required this.purpose,
    required this.state,
    required this.status,
    required this.canRead,
    required this.canChange,
    required this.freshness,
  });

  final String id;
  final String name;
  final String purpose;
  final String state;
  final String status;
  final bool canRead;
  final bool canChange;
  final FreshnessInfo freshness;

  factory ConnectionSummary.fromJson(Object? value) {
    final json = asJsonMap(value);
    return ConnectionSummary(
      id: jsonText(json['id'], fallback: 'unknown-connection'),
      name: jsonText(json['name'], fallback: 'Connected service'),
      purpose: jsonText(
        json['plainPurpose'],
        fallback: 'Service purpose not recorded.',
      ),
      state: jsonText(json['state'], fallback: 'not_checked'),
      status: jsonText(json['plainStatus'], fallback: 'Not checked'),
      canRead: jsonBool(json['canRead']),
      canChange: jsonBool(json['canChange']),
      freshness: FreshnessInfo.fromJson(<String, Object?>{
        ...json,
        'lastVerifiedAt': json['lastCheckedAt'],
      }),
    );
  }
}

class ConnectionDetail {
  const ConnectionDetail({
    required this.summary,
    required this.scopes,
    required this.allowedTargets,
    required this.needsOwnerApprovalForChanges,
  });

  final ConnectionSummary summary;
  final List<String> scopes;
  final List<String> allowedTargets;
  final bool needsOwnerApprovalForChanges;

  factory ConnectionDetail.fromJson(Object? value) {
    final json = asJsonMap(value);
    final advanced = asJsonMap(json['advanced']);
    return ConnectionDetail(
      summary: ConnectionSummary.fromJson(json),
      scopes: _stringList(advanced['scopes']),
      allowedTargets: _stringList(advanced['allowedTargets']),
      needsOwnerApprovalForChanges: jsonBool(
        json['needsOwnerApprovalForChanges'],
        fallback: true,
      ),
    );
  }
}

class AuditEvent {
  const AuditEvent({
    required this.id,
    required this.type,
    required this.actor,
    required this.summary,
    this.happenedAt,
    this.project,
    this.provider,
    this.result,
    this.risk,
  });

  final String id;
  final String type;
  final String actor;
  final String summary;
  final DateTime? happenedAt;
  final String? project;
  final String? provider;
  final String? result;
  final ActionRisk? risk;

  factory AuditEvent.fromJson(Object? value) {
    final json = asJsonMap(value);
    return AuditEvent(
      id: jsonText(json['id'], fallback: 'unknown-event'),
      type: humanizeToken(json['type'], fallback: 'Activity'),
      actor: humanizeToken(json['actor'], fallback: 'System'),
      summary: jsonText(
        json['summary'],
        fallback: humanizeToken(json['type'], fallback: 'Activity recorded'),
      ),
      happenedAt: jsonDateTime(json['happenedAt']),
      project: _nullableText(json['project']),
      provider: _nullableText(json['provider']),
      result: _nullableText(json['result']),
      risk: json['risk'] == null ? null : ActionRisk.parse(json['risk']),
    );
  }
}

class AuditChainStatus {
  const AuditChainStatus({
    required this.valid,
    required this.label,
    this.checkedAt,
  });

  final bool valid;
  final String label;
  final DateTime? checkedAt;

  factory AuditChainStatus.fromJson(Object? value) {
    final json = asJsonMap(value);
    final valid = jsonBool(firstJsonValue(json, const ['valid', 'isValid']));
    return AuditChainStatus(
      valid: valid,
      label: valid ? 'Audit chain verified' : 'Audit chain needs attention',
      checkedAt: jsonDateTime(
        firstJsonValue(json, const ['checkedAt', 'verifiedAt']),
      ),
    );
  }
}

class SafetyItem {
  const SafetyItem({
    required this.id,
    required this.title,
    required this.status,
    required this.explanation,
  });

  final String id;
  final String title;
  final String status;
  final String explanation;

  factory SafetyItem.fromJson(Object? value) {
    final json = asJsonMap(value);
    return SafetyItem(
      id: jsonText(json['id'], fallback: 'safety-item'),
      title: jsonText(json['title'], fallback: 'Safety check'),
      status: jsonText(json['plainStatus'], fallback: 'Not checked'),
      explanation: jsonText(
        firstJsonValue(json, const ['explanation', 'summary', 'detail']),
        fallback: 'No plain-language explanation was recorded.',
      ),
    );
  }
}

class SafetySection {
  const SafetySection({
    required this.id,
    required this.title,
    required this.items,
  });

  final String id;
  final String title;
  final List<SafetyItem> items;

  factory SafetySection.fromJson(Object? value) {
    final json = asJsonMap(value);
    return SafetySection(
      id: jsonText(json['id'], fallback: 'safety'),
      title: jsonText(json['title'], fallback: 'Safety'),
      items: asJsonList(
        json['items'],
      ).map(SafetyItem.fromJson).toList(growable: false),
    );
  }
}

class RuntimeIdentity {
  const RuntimeIdentity({
    required this.sourceRepository,
    required this.ownerApi,
    required this.memoryOrigin,
    required this.buildVersion,
    required this.sourceCommit,
  });

  final String sourceRepository;
  final String ownerApi;
  final String memoryOrigin;
  final String buildVersion;
  final String sourceCommit;
}

class HomeSummary {
  const HomeSummary({
    required this.healthState,
    required this.healthLabel,
    required this.freshness,
    required this.approvalCount,
    required this.activeProjectCount,
    required this.needsAttentionCount,
    required this.topProjects,
    required this.recentActivity,
    this.priority,
  });

  final String healthState;
  final String healthLabel;
  final FreshnessInfo freshness;
  final int approvalCount;
  final int activeProjectCount;
  final int needsAttentionCount;
  final ApprovalSummary? priority;
  final List<ProjectSummary> topProjects;
  final List<AuditEvent> recentActivity;

  factory HomeSummary.fromJson(Object? value) {
    final json = asJsonMap(value);
    final health = asJsonMap(json['systemHealth']);
    final counters = asJsonMap(json['counters']);
    final priorityJson = asJsonMap(json['priority']);
    final priority = priorityJson['id'] == null
        ? null
        : ApprovalSummary.fromJson(priorityJson);
    return HomeSummary(
      healthState: jsonText(health['state'], fallback: 'not_checked'),
      healthLabel: jsonText(
        health['label'],
        fallback: 'System state not checked',
      ),
      freshness: FreshnessInfo.fromJson(<String, Object?>{
        ...health,
        'lastVerifiedAt': health['lastCheckedAt'],
        'dataFreshness': health['dataFreshness'],
      }),
      approvalCount: jsonInt(counters['approvals']) ?? 0,
      activeProjectCount: jsonInt(counters['activeProjects']) ?? 0,
      needsAttentionCount: jsonInt(counters['needsAttention']) ?? 0,
      priority: priority,
      topProjects: asJsonList(
        json['topProjects'],
      ).map(ProjectSummary.fromJson).toList(growable: false),
      recentActivity: asJsonList(
        json['recentActivity'],
      ).map(AuditEvent.fromJson).toList(growable: false),
    );
  }
}

String? _nullableText(Object? value) {
  final text = jsonText(value);
  return text.isEmpty ? null : text;
}

String requiredJsonText(
  JsonMap json,
  Iterable<String> keys, {
  required String field,
}) {
  final value = jsonText(firstJsonValue(json, keys));
  if (value.isEmpty) {
    throw PandoraModelContractException(
      code: 'MISSING_REQUIRED_FIELD',
      field: field,
    );
  }
  return value;
}

bool requiredJsonBool(JsonMap json, String key, {required String field}) {
  final value = json[key];
  if (value is! bool) {
    throw PandoraModelContractException(
      code: 'MISSING_REQUIRED_FIELD',
      field: field,
    );
  }
  return value;
}

List<String> _stringList(Object? value) => asJsonList(
      value,
    ).map(jsonText).where((item) => item.isNotEmpty).toList(growable: false);

List<EvidenceStageStatus> _evidenceStageStatuses(JsonMap json) {
  final raw = firstJsonValue(json, const <String>[
    'evidenceStages',
    'proofStages',
  ]);
  final supplied = <EvidenceStageStatus>[];
  if (raw is Map) {
    for (final entry in raw.entries) {
      final rawStage = jsonText(entry.key);
      final rawState = jsonText(entry.value);
      supplied.add(
        EvidenceStageStatus(
          stage: EvidenceStage.parse(rawStage),
          state: EvidenceClaimState.parse(rawState),
          rawStage: rawStage,
          rawState: rawState,
        ),
      );
    }
  } else {
    for (final item in asJsonList(raw)) {
      final record = asJsonMap(item);
      final rawStage = jsonText(
        firstJsonValue(record, const <String>['stage', 'name']),
      );
      final rawState = jsonText(
        firstJsonValue(record, const <String>['state', 'status']),
      );
      supplied.add(
        EvidenceStageStatus(
          stage: EvidenceStage.parse(rawStage),
          state: EvidenceClaimState.parse(rawState),
          rawStage: rawStage,
          rawState: rawState,
        ),
      );
    }
  }

  return List<EvidenceStageStatus>.unmodifiable(<EvidenceStageStatus>[
    for (final stage in EvidenceStage.values)
      _firstEvidenceStatus(supplied, stage) ??
          EvidenceStageStatus(
            stage: stage,
            state: EvidenceClaimState.notChecked,
            rawStage: stage.name,
            rawState: '',
          ),
    ...supplied.where((status) => status.stage == null),
  ]);
}

EvidenceStageStatus? _firstEvidenceStatus(
  List<EvidenceStageStatus> statuses,
  EvidenceStage stage,
) {
  for (final status in statuses) {
    if (status.stage == stage) return status;
  }
  return null;
}
