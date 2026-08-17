import '../models/pandora_models.dart';
import '../network/pandora_api_error.dart';

typedef PandoraRepositoryException = PandoraApiError;

enum RepositorySource { network, memoryCache }

class RepositorySnapshot<T> {
  const RepositorySnapshot({
    required this.data,
    required this.source,
    required this.fetchedAt,
    this.verifiedAt,
    this.staleAfter,
    this.requestId,
    this.degradedReason,
  });

  final T data;
  final RepositorySource source;
  final DateTime fetchedAt;
  final DateTime? verifiedAt;
  final DateTime? staleAfter;
  final String? requestId;
  final String? degradedReason;

  bool get isCached => source == RepositorySource.memoryCache;

  bool isStaleAt(DateTime now) =>
      isCached || (staleAfter != null && !staleAfter!.isAfter(now));

  RepositorySnapshot<T> asDegradedCache(String reason) => RepositorySnapshot<T>(
    data: data,
    source: RepositorySource.memoryCache,
    fetchedAt: fetchedAt,
    verifiedAt: verifiedAt,
    staleAfter: staleAfter,
    requestId: requestId,
    degradedReason: reason,
  );
}

enum ApprovalDecision {
  approve,
  reject;

  String get wireValue => name;
}

class ApprovalDecisionResult {
  const ApprovalDecisionResult({
    required this.decision,
    required this.approval,
    this.requestId,
  });

  final String decision;
  final ApprovalSummary approval;
  final String? requestId;
}

class SafetyOverview {
  const SafetyOverview({
    required this.state,
    required this.status,
    required this.auditChain,
    required this.sections,
    required this.extraIdentityCheckAdvertised,
  });

  final String state;
  final String status;
  final AuditChainStatus auditChain;
  final List<SafetySection> sections;
  final bool extraIdentityCheckAdvertised;

  factory SafetyOverview.fromJson(Object? value) {
    final json = asJsonMap(value);
    final suppliedSections = asJsonList(json['sections']);
    final sections = suppliedSections.isNotEmpty
        ? suppliedSections.map(SafetySection.fromJson).toList(growable: false)
        : _integrationSections(json['integrations']);
    return SafetyOverview(
      state: jsonText(json['state'], fallback: 'not_checked'),
      status: jsonText(json['plainStatus'], fallback: 'Not checked'),
      auditChain: AuditChainStatus.fromJson(json['auditIntegrity']),
      sections: List<SafetySection>.unmodifiable(sections),
      extraIdentityCheckAdvertised: jsonBool(json['mfaRequiredForApproval']),
    );
  }

  static List<SafetySection> _integrationSections(Object? value) {
    final integrations = asJsonList(value);
    if (integrations.isEmpty) return const <SafetySection>[];
    final items = integrations
        .map((entry) {
          final json = asJsonMap(entry);
          final provider = jsonText(json['provider'], fallback: 'Service');
          return SafetyItem.fromJson(<String, Object?>{
            'id': 'integration-${provider.toLowerCase()}',
            'title': provider,
            'plainStatus': humanizeToken(
              json['status'],
              fallback: 'Not checked',
            ),
            'explanation': json['freshness'] == 'fresh'
                ? 'This connection has fresh health evidence.'
                : 'Fresh health evidence is not available.',
          });
        })
        .toList(growable: false);
    return <SafetySection>[
      SafetySection(
        id: 'integrations',
        title: 'Connected services',
        items: List<SafetyItem>.unmodifiable(items),
      ),
    ];
  }
}

abstract interface class PandoraRepository {
  Future<RepositorySnapshot<HomeSummary>> home();

  Future<RepositorySnapshot<List<ProjectSummary>>> projects({
    bool allowCached = false,
  });

  Future<RepositorySnapshot<ProjectDetail>> project(
    String id, {
    bool allowCached = false,
  });

  Future<RepositorySnapshot<List<ConnectionSummary>>> connections({
    bool allowCached = false,
  });

  Future<RepositorySnapshot<List<ApprovalSummary>>> approvals();

  Future<RepositorySnapshot<List<AuditEvent>>> activity({
    bool allowCached = false,
  });

  Future<RepositorySnapshot<SafetyOverview>> safety();

  Future<RepositorySnapshot<List<ActionDefinition>>> actions();

  Future<IntakeReceipt> ask({
    required String message,
    String? projectId,
    String? idempotencyKey,
  });

  Future<IntakeReceipt> runAction({
    required String actionId,
    String? projectId,
    String? message,
    String? idempotencyKey,
  });

  Future<ApprovalDecisionResult> decideApproval({
    required String approvalId,
    required ApprovalDecision decision,
    String reason = '',
  });

  void clearReadOnlyCache();

  void dispose();
}

/// Emits whenever owner authorization becomes invalid so every mounted
/// protected surface can be discarded together, not only the screen that
/// happened to observe the 401/403 response.
abstract interface class AuthorizationInvalidationSource {
  Stream<AuthorizationInvalidation> get authorizationInvalidations;
}

/// Starts a new authenticated identity epoch. Results and diagnostics from
/// requests started before this boundary must not reach the next owner.
abstract interface class AuthenticatedIdentityBoundary {
  void beginAuthenticatedIdentityEpoch();
}

class StaleAuthenticatedIdentityException implements Exception {
  const StaleAuthenticatedIdentityException();
}

class AuthorizationInvalidation {
  const AuthorizationInvalidation({
    required this.generation,
    required this.kind,
    required this.message,
  });

  final int generation;
  final PandoraApiErrorKind kind;
  final String message;
}
