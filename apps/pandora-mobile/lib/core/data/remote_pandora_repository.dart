import '../models/pandora_models.dart';
import '../network/idempotency_key.dart';
import '../network/pandora_api_client.dart';
import '../network/pandora_api_error.dart';
import 'pandora_repository.dart';
import 'read_only_memory_cache.dart';

class RemotePandoraRepository implements PandoraRepository {
  RemotePandoraRepository({
    required PandoraApiClient client,
    ReadOnlyMemoryCache? cache,
    IdempotencyKeyFactory? idempotencyKeys,
    DateTime Function()? clock,
  })  : _client = client,
        _cache = cache ?? ReadOnlyMemoryCache(),
        _idempotencyKeys = idempotencyKeys ?? IdempotencyKeyFactory(),
        _clock = clock ?? DateTime.now;

  final PandoraApiClient _client;
  final ReadOnlyMemoryCache _cache;
  final IdempotencyKeyFactory _idempotencyKeys;
  final DateTime Function() _clock;

  @override
  Future<RepositorySnapshot<HomeSummary>> home() async {
    final response = await _client.getJson(
      pathSegments: const <String>['home'],
      operation: 'home.load',
      routeTemplate: '/home',
    );
    final model = _parse(
      response,
      '/home',
      () => HomeSummary.fromJson(_requiredMap(response, '/home')),
    );
    return _snapshot(
      model,
      response,
      verifiedAt: model.freshness.lastVerifiedAt,
      staleAfter: model.freshness.staleAfter,
    );
  }

  @override
  Future<RepositorySnapshot<List<ProjectSummary>>> projects({
    bool allowCached = false,
  }) async {
    try {
      final response = await _client.getJson(
        pathSegments: const <String>['projects'],
        operation: 'projects.load',
        routeTemplate: '/projects',
      );
      final models = _parse(
        response,
        '/projects',
        () => List<ProjectSummary>.unmodifiable(
          _requiredList(response, '/projects').map(ProjectSummary.fromJson),
        ),
      );
      final snapshot = _snapshot(models, response);
      _cache.putProjects(snapshot);
      return snapshot;
    } on PandoraApiError catch (error) {
      final cached = _cache.projects;
      if (allowCached && cached != null && _canUseCache(error)) {
        return cached.asDegradedCache(error.message);
      }
      rethrow;
    }
  }

  @override
  Future<RepositorySnapshot<ProjectDetail>> project(
    String id, {
    bool allowCached = false,
  }) async {
    final projectId = _requiredIdentifier(id, 'projectId');
    try {
      final response = await _client.getJson(
        pathSegments: <String>['projects', projectId],
        operation: 'project.load',
        routeTemplate: '/projects/:id',
      );
      final model = _parse(
        response,
        '/projects/:id',
        () => ProjectDetail.fromJson(
          _requiredMap(response, '/projects/:id'),
        ),
      );
      final snapshot = _snapshot(
        model,
        response,
        verifiedAt: model.summary.freshness.lastVerifiedAt,
        staleAfter: model.summary.freshness.staleAfter,
      );
      _cache.putProject(projectId, snapshot);
      return snapshot;
    } on PandoraApiError catch (error) {
      final cached = _cache.project(projectId);
      if (allowCached && cached != null && _canUseCache(error)) {
        return cached.asDegradedCache(error.message);
      }
      rethrow;
    }
  }

  @override
  Future<RepositorySnapshot<List<ConnectionSummary>>> connections({
    bool allowCached = false,
  }) async {
    try {
      final response = await _client.getJson(
        pathSegments: const <String>['connections'],
        operation: 'connections.load',
        routeTemplate: '/connections',
      );
      final models = _parse(
        response,
        '/connections',
        () => List<ConnectionSummary>.unmodifiable(
          _requiredList(response, '/connections')
              .map(ConnectionSummary.fromJson),
        ),
      );
      final snapshot = _snapshot(models, response);
      _cache.putConnections(snapshot);
      return snapshot;
    } on PandoraApiError catch (error) {
      final cached = _cache.connections;
      if (allowCached && cached != null && _canUseCache(error)) {
        return cached.asDegradedCache(error.message);
      }
      rethrow;
    }
  }

  @override
  Future<RepositorySnapshot<List<ApprovalSummary>>> approvals() async {
    final response = await _client.getJson(
      pathSegments: const <String>['approvals'],
      operation: 'approvals.load',
      routeTemplate: '/approvals',
      queryParameters: const <String, String>{'limit': '50'},
    );
    final models = _parse(
      response,
      '/approvals',
      () => List<ApprovalSummary>.unmodifiable(
        _requiredList(response, '/approvals').map(ApprovalSummary.fromJson),
      ),
    );
    return _snapshot(models, response);
  }

  @override
  Future<RepositorySnapshot<List<AuditEvent>>> activity({
    bool allowCached = false,
  }) async {
    try {
      final response = await _client.getJson(
        pathSegments: const <String>['activity'],
        operation: 'activity.load',
        routeTemplate: '/activity',
        queryParameters: const <String, String>{'limit': '50'},
      );
      final models = _parse(
        response,
        '/activity',
        () => List<AuditEvent>.unmodifiable(
          _requiredList(response, '/activity').map(AuditEvent.fromJson),
        ),
      );
      final snapshot = _snapshot(models, response);
      _cache.putActivity(snapshot);
      return snapshot;
    } on PandoraApiError catch (error) {
      final cached = _cache.activity;
      if (allowCached && cached != null && _canUseCache(error)) {
        return cached.asDegradedCache(error.message);
      }
      rethrow;
    }
  }

  @override
  Future<RepositorySnapshot<SafetyOverview>> safety() async {
    final response = await _client.getJson(
      pathSegments: const <String>['safety'],
      operation: 'safety.load',
      routeTemplate: '/safety',
    );
    final model = _parse(
      response,
      '/safety',
      () => SafetyOverview.fromJson(_requiredMap(response, '/safety')),
    );
    return _snapshot(model, response);
  }

  @override
  Future<RepositorySnapshot<List<ActionDefinition>>> actions() async {
    final response = await _client.getJson(
      pathSegments: const <String>['actions'],
      operation: 'actions.load',
      routeTemplate: '/actions',
    );
    final models = _parse(
      response,
      '/actions',
      () => List<ActionDefinition>.unmodifiable(
        _requiredList(response, '/actions').map(ActionDefinition.fromJson),
      ),
    );
    return _snapshot(models, response);
  }

  @override
  Future<IntakeReceipt> ask({
    required String message,
    String? projectId,
    String? idempotencyKey,
  }) async {
    final request = _requiredMessage(message);
    final project = _optionalIdentifier(projectId, 'projectId');
    final response = await _client.postJson(
      pathSegments: const <String>['ask'],
      operation: 'command.submit',
      routeTemplate: '/ask',
      idempotencyKey: idempotencyKey ?? _idempotencyKeys.create('ask'),
      body: <String, Object?>{
        'message': request,
        'projectId': project,
        'clientMode': 'simple',
      },
    );
    return _parse(
      response,
      '/ask',
      () {
        final json = _requiredMap(response, '/ask');
        return IntakeReceipt.fromJson(
          json,
          requestId: response.requestId,
        );
      },
      mutationOutcomeMayBeUnknown: true,
    );
  }

  @override
  Future<IntakeReceipt> runAction({
    required String actionId,
    String? projectId,
    String? message,
    String? idempotencyKey,
  }) async {
    final id = _requiredIdentifier(actionId, 'actionId');
    final project = _optionalIdentifier(projectId, 'projectId');
    final response = await _client.postJson(
      pathSegments: <String>['actions', id, 'run'],
      operation: 'action.submit',
      routeTemplate: '/actions/:id/run',
      idempotencyKey: idempotencyKey ?? _idempotencyKeys.create('action-run'),
      body: <String, Object?>{
        'projectId': project,
        if (message != null && message.trim().isNotEmpty)
          'message': _requiredMessage(message),
        'clientMode': 'simple',
      },
    );
    return _parse(
      response,
      '/actions/:id/run',
      () {
        final json = _requiredMap(response, '/actions/:id/run');
        return IntakeReceipt.fromJson(
          json,
          requestId: response.requestId,
        );
      },
      mutationOutcomeMayBeUnknown: true,
    );
  }

  @override
  Future<ApprovalDecisionResult> decideApproval({
    required String approvalId,
    required ApprovalDecision decision,
    String reason = '',
  }) async {
    final id = _requiredIdentifier(approvalId, 'approvalId');
    final decisionReason = _boundedText(
      reason,
      name: 'approval reason',
      maximum: 2000,
      allowEmpty: true,
    );
    final response = await _client.postJson(
      pathSegments: <String>['approvals', id, 'decide'],
      operation: 'approval.decide',
      routeTemplate: '/approvals/:id/decide',
      body: <String, Object?>{
        'decision': decision.wireValue,
        'reason': decisionReason,
        'clientMode': 'simple',
      },
    );
    return _parse(
      response,
      '/approvals/:id/decide',
      () {
        final json = _requiredMap(response, '/approvals/:id/decide');
        if (!jsonBool(json['ok'])) {
          throw _contractError(
            response,
            'APPROVAL_RESPONSE_INVALID',
            'Pandora could not confirm that decision.',
          );
        }
        final approval = json['approval'];
        if (approval is! Map) {
          throw _contractError(
            response,
            'APPROVAL_RESPONSE_INVALID',
            'Pandora did not return the updated approval.',
          );
        }
        return ApprovalDecisionResult(
          decision: jsonText(json['decision'], fallback: decision.wireValue),
          approval: ApprovalSummary.fromJson(approval),
          requestId: response.requestId,
        );
      },
      mutationOutcomeMayBeUnknown: true,
    );
  }

  T _parse<T>(
    PandoraApiResponse response,
    String routeTemplate,
    T Function() parser, {
    bool mutationOutcomeMayBeUnknown = false,
  }) {
    final stopwatch = Stopwatch()..start();
    try {
      return parser();
    } on PandoraApiError catch (error) {
      final safeError = mutationOutcomeMayBeUnknown
          ? _ambiguousParseError(response, error.code)
          : error;
      _recordParseFailure(
        response,
        routeTemplate,
        safeError,
        stopwatch.elapsed,
      );
      throw safeError;
    } catch (_) {
      final error = mutationOutcomeMayBeUnknown
          ? _ambiguousParseError(response, 'MODEL_DECODING_FAILED')
          : _contractError(
              response,
              'MODEL_DECODING_FAILED',
              'Pandora returned information this app could not safely read.',
            );
      _recordParseFailure(response, routeTemplate, error, stopwatch.elapsed);
      throw error;
    } finally {
      stopwatch.stop();
    }
  }

  PandoraApiError _ambiguousParseError(
    PandoraApiResponse response,
    String code,
  ) =>
      PandoraApiError(
        kind: PandoraApiErrorKind.ambiguousMutation,
        message:
            'Pandora received the request, but this app could not confirm its resulting state.',
        code: code,
        statusCode: response.statusCode,
        requestId: response.requestId,
      );

  void _recordParseFailure(
    PandoraApiResponse response,
    String routeTemplate,
    PandoraApiError error,
    Duration duration,
  ) {
    _client.recordContractFailure(
      operation: 'response.parse',
      routeTemplate: routeTemplate,
      statusCode: response.statusCode,
      errorCode: error.code,
      duration: duration,
      requestId: response.requestId,
    );
  }

  RepositorySnapshot<T> _snapshot<T>(
    T data,
    PandoraApiResponse response, {
    DateTime? verifiedAt,
    DateTime? staleAfter,
  }) =>
      RepositorySnapshot<T>(
        data: data,
        source: RepositorySource.network,
        fetchedAt: _clock(),
        verifiedAt: verifiedAt,
        staleAfter: staleAfter,
        requestId: response.requestId,
      );

  Map<String, Object?> _requiredMap(
    PandoraApiResponse response,
    String endpoint,
  ) {
    if (response.data is Map) return asJsonMap(response.data);
    throw _contractError(
      response,
      'EXPECTED_OBJECT_RESPONSE',
      'Pandora returned an unexpected response for $endpoint.',
    );
  }

  List<Object?> _requiredList(
    PandoraApiResponse response,
    String endpoint,
  ) {
    if (response.data is List) return asJsonList(response.data);
    throw _contractError(
      response,
      'EXPECTED_LIST_RESPONSE',
      'Pandora returned an unexpected response for $endpoint.',
    );
  }

  PandoraApiError _contractError(
    PandoraApiResponse response,
    String code,
    String message,
  ) =>
      PandoraApiError(
        kind: PandoraApiErrorKind.contract,
        message: message,
        code: code,
        statusCode: response.statusCode,
        requestId: response.requestId,
      );

  static bool _canUseCache(PandoraApiError error) =>
      error.kind == PandoraApiErrorKind.unavailable ||
      error.kind == PandoraApiErrorKind.rateLimited;

  static String _requiredIdentifier(String value, String name) {
    final id = value.trim();
    if (id.isEmpty || id.length > 300) {
      throw PandoraApiError(
        kind: PandoraApiErrorKind.invalidRequest,
        message: 'Pandora needs a valid $name.',
        code: 'INVALID_IDENTIFIER',
      );
    }
    return id;
  }

  static String _optionalIdentifier(String? value, String name) {
    if (value == null || value.trim().isEmpty) return '';
    return _requiredIdentifier(value, name);
  }

  static String _requiredMessage(String value) {
    return _boundedText(
      value,
      name: 'request',
      maximum: 4000,
      allowEmpty: false,
    );
  }

  static String _boundedText(
    String value, {
    required String name,
    required int maximum,
    required bool allowEmpty,
  }) {
    final text = value.trim();
    if ((!allowEmpty && text.isEmpty) || text.length > maximum) {
      throw PandoraApiError(
        kind: PandoraApiErrorKind.invalidRequest,
        message: allowEmpty
            ? 'Keep the $name under $maximum characters.'
            : 'Enter a $name between 1 and $maximum characters.',
        code: 'INVALID_TEXT_FIELD',
      );
    }
    return text;
  }

  static String? _nullableText(Object? value) {
    final text = jsonText(value);
    return text.isEmpty ? null : text;
  }

  @override
  void clearReadOnlyCache() => _cache.clear();

  @override
  void dispose() {
    _cache.clear();
    _client.close();
  }
}
