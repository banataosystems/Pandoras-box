library;

import 'dart:io';

import 'package:flutterflow_ai/flutterflow_ai.dart';
import 'package:flutterflow_ai/src/internal_sdk.dart'
    show addNavBarPage, setNavBarEnabled;
import 'package:pandora_flutterflow_ai/flutterflow_project.dart' as ff;

import 'selector_bindings.dart';

const String _projectId = 'pandoras-box-gj9hnb';
const String _ownerApiBaseUrl =
    'https://jcyqixttuebxqqfkjonq.supabase.co/functions/v1/pandora-owner-api';

// Direct browser calls keep the user's Supabase JWT out of FlutterFlow's API
// proxy. The owner API must separately allowlist the final preview/production
// origins in PANDORA_ALLOWED_ORIGINS before web calls can succeed.
const EndpointSettings _ownerEndpointSettings = EndpointSettings(
  requireAuthentication: true,
  noProxyForTest: true,
  noProxyForWeb: true,
  decodeUtf8: true,
);

// Local typed references for fields this pass creates. The compiler resolves
// them by name and generates/preserves the real FlutterFlow identifier key.
// Using Project*Handle values (instead of raw strings) also keeps this source
// valid after a context refresh, when the fields become existing resources.
const _organizationId = ProjectAppStateFieldHandle(
  name: 'pandoraOrganizationId',
  key: 'pandora_dsl_organization_id',
  typeName: 'String',
  persisted: true,
);

abstract final class _SignInState {
  static const email = ProjectStateFieldHandle(
    name: 'email',
    key: 'pandora_dsl_sign_in_email',
    typeName: 'String',
  );
  static const password = ProjectStateFieldHandle(
    name: 'password',
    key: 'pandora_dsl_sign_in_password',
    typeName: 'String',
  );
  static const confirmPassword = ProjectStateFieldHandle(
    name: 'confirmPassword',
    key: 'pandora_dsl_sign_in_confirm_password',
    typeName: 'String',
  );
}

abstract final class _CommandCenterState {
  static const data = ProjectStateFieldHandle(
    name: 'homeData',
    key: 'pandora_dsl_home_data',
    typeName: 'PandoraHomePayload',
  );
  static const loading = ProjectStateFieldHandle(
    name: 'homeIsLoading',
    key: 'pandora_dsl_home_loading',
    typeName: 'bool',
  );
  static const error = ProjectStateFieldHandle(
    name: 'homeError',
    key: 'pandora_dsl_home_error',
    typeName: 'String',
  );
  static const projects = ProjectStateFieldHandle(
    name: 'projectItems',
    key: 'pandora_dsl_project_items',
    typeName: 'List<PandoraProjectSummary>',
  );
  static const command = ProjectStateFieldHandle(
    name: 'ownerCommand',
    key: 'pandora_dsl_owner_command',
    typeName: 'String',
  );
  static const commandResponse = ProjectStateFieldHandle(
    name: 'ownerCommandResponse',
    key: 'pandora_dsl_owner_command_response',
    typeName: 'PandoraAskResponse',
  );
  static const commandSubmitting = ProjectStateFieldHandle(
    name: 'ownerCommandIsSubmitting',
    key: 'pandora_dsl_owner_command_submitting',
    typeName: 'bool',
  );
  static const commandError = ProjectStateFieldHandle(
    name: 'ownerCommandError',
    key: 'pandora_dsl_owner_command_error',
    typeName: 'String',
  );
}

abstract final class _ProjectDetailsParams {
  static const projectId = ProjectParamHandle(
    name: 'projectId',
    key: 'pandora_dsl_project_details_id',
    typeName: 'String',
  );
}

abstract final class _ProjectDetailsState {
  static const data = ProjectStateFieldHandle(
    name: 'projectData',
    key: 'pandora_dsl_project_data',
    typeName: 'PandoraProjectDetail',
  );
  static const loading = ProjectStateFieldHandle(
    name: 'projectIsLoading',
    key: 'pandora_dsl_project_loading',
    typeName: 'bool',
  );
  static const error = ProjectStateFieldHandle(
    name: 'projectError',
    key: 'pandora_dsl_project_error',
    typeName: 'String',
  );
}

abstract final class _ActionsCatalogParams {
  static const projectId = ProjectParamHandle(
    name: 'projectId',
    key: 'pandora_dsl_actions_project_id',
    typeName: 'String',
  );
}

abstract final class _ActionsCatalogState {
  static const items = ProjectStateFieldHandle(
    name: 'actionItems',
    key: 'pandora_dsl_action_items',
    typeName: 'List<PandoraActionCatalogItem>',
  );
  static const loading = ProjectStateFieldHandle(
    name: 'actionsAreLoading',
    key: 'pandora_dsl_actions_loading',
    typeName: 'bool',
  );
  static const error = ProjectStateFieldHandle(
    name: 'actionsError',
    key: 'pandora_dsl_actions_error',
    typeName: 'String',
  );
}

abstract final class _ActionBuilderParams {
  static const actionId = ProjectParamHandle(
    name: 'actionId',
    key: 'pandora_dsl_action_builder_action_id',
    typeName: 'String',
  );
  static const actionTitle = ProjectParamHandle(
    name: 'actionTitle',
    key: 'pandora_dsl_action_builder_action_title',
    typeName: 'String',
  );
  static const projectId = ProjectParamHandle(
    name: 'projectId',
    key: 'pandora_dsl_action_builder_project_id',
    typeName: 'String',
  );
}

abstract final class _ActionBuilderState {
  static const request = ProjectStateFieldHandle(
    name: 'requestMessage',
    key: 'pandora_dsl_request_message',
    typeName: 'String',
  );
  static const response = ProjectStateFieldHandle(
    name: 'askResponse',
    key: 'pandora_dsl_ask_response',
    typeName: 'PandoraAskResponse',
  );
  static const submitting = ProjectStateFieldHandle(
    name: 'requestIsSubmitting',
    key: 'pandora_dsl_request_submitting',
    typeName: 'bool',
  );
  static const error = ProjectStateFieldHandle(
    name: 'requestError',
    key: 'pandora_dsl_request_error',
    typeName: 'String',
  );
}

abstract final class _ApprovalCenterState {
  static const items = ProjectStateFieldHandle(
    name: 'approvalItems',
    key: 'pandora_dsl_approval_items',
    typeName: 'List<PandoraApproval>',
  );
  static const loading = ProjectStateFieldHandle(
    name: 'approvalsAreLoading',
    key: 'pandora_dsl_approvals_loading',
    typeName: 'bool',
  );
  static const error = ProjectStateFieldHandle(
    name: 'approvalsError',
    key: 'pandora_dsl_approvals_error',
    typeName: 'String',
  );
}

abstract final class _ActivityState {
  static const items = ProjectStateFieldHandle(
    name: 'activityItems',
    key: 'pandora_dsl_activity_items',
    typeName: 'List<PandoraActivity>',
  );
  static const loading = ProjectStateFieldHandle(
    name: 'activityIsLoading',
    key: 'pandora_dsl_activity_loading',
    typeName: 'bool',
  );
  static const error = ProjectStateFieldHandle(
    name: 'activityError',
    key: 'pandora_dsl_activity_error',
    typeName: 'String',
  );
}

abstract final class _SecurityState {
  static const data = ProjectStateFieldHandle(
    name: 'safetyData',
    key: 'pandora_dsl_safety_data',
    typeName: 'PandoraSafety',
  );
  static const loading = ProjectStateFieldHandle(
    name: 'safetyIsLoading',
    key: 'pandora_dsl_safety_loading',
    typeName: 'bool',
  );
  static const error = ProjectStateFieldHandle(
    name: 'safetyError',
    key: 'pandora_dsl_safety_error',
    typeName: 'String',
  );
  static const connections = ProjectStateFieldHandle(
    name: 'connectionItems',
    key: 'pandora_dsl_connection_items',
    typeName: 'List<PandoraConnection>',
  );
}

abstract final class _PlansParams {
  static const actionId = ProjectParamHandle(
    name: 'actionId',
    key: 'pandora_dsl_plans_action_id',
    typeName: 'String',
  );
  static const projectId = ProjectParamHandle(
    name: 'projectId',
    key: 'pandora_dsl_plans_project_id',
    typeName: 'String',
  );
}

abstract final class _PlansState {
  static const response = ProjectStateFieldHandle(
    name: 'runResponse',
    key: 'pandora_dsl_run_response',
    typeName: 'PandoraAskResponse',
  );
  static const submitting = ProjectStateFieldHandle(
    name: 'runIsSubmitting',
    key: 'pandora_dsl_run_submitting',
    typeName: 'bool',
  );
  static const error = ProjectStateFieldHandle(
    name: 'runError',
    key: 'pandora_dsl_run_error',
    typeName: 'String',
  );
}

Future<void> main(List<String> args) async {
  final options = _CliOptions.parse(args);
  final targetProjectId = options.projectId ?? _projectId;
  if (targetProjectId != _projectId) {
    stderr.writeln(
      'Refusing to edit "$targetProjectId"; this DSL is pinned to "$_projectId".',
    );
    exit(64);
  }

  // Exact body-root replacement removes the four inert hand-built navigation
  // rows found by inspection. Install the canonical five-tab FlutterFlow nav
  // by default; the environment flag exists only as an emergency rollback.
  final installGlobalNavigation =
      Platform.environment['FF_PANDORA_INSTALL_GLOBAL_NAV'] != 'false';

  await flutterFlowAI(
    (app) => buildPandoraOwnerApp(
      app,
      installGlobalNavigation: installGlobalNavigation,
    ),
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    projectId: targetProjectId,
    dryRun: options.dryRun,
    commitMessage: options.commitMessage,
  );
}

/// Pass 2: declare the governed Owner API, response schemas, page-local data
/// state, non-destructive read hydration, reusable write action blocks, and
/// auth-aware splash routing.
///
/// Exact widget bindings live in `selector_bindings.dart` and use only the
/// stable page/component node keys captured in inspection artifact cb3a51db.
/// No selector in this pass is inferred from display text or an unindexed
/// resource path.
void buildPandoraOwnerApp(
  App app, {
  bool installGlobalNavigation = false,
}) {
  _configurePandoraTheme(app);
  final schemas = _declareSchemas(app);
  final api = _declareOwnerApi(app, schemas);

  app.state(
    _organizationId.name,
    string.withDefault(''),
    description:
        'Optional active Pandora organization UUID. Empty lets the owner API '
        'auto-select the only active organization.',
    persisted: true,
  );

  _declarePageStateAndHydration(app, schemas, api);
  _declareWriteActionBlocks(app, schemas, api);
  _wireAuthAwareEntryPages(app);
  applyPandoraExactBindings(
    app,
    spec: PandoraBindingSpec(
      organizationId: _organizationId,
      signInEmail: _SignInState.email,
      signInPassword: _SignInState.password,
      signInConfirmPassword: _SignInState.confirmPassword,
      homeData: _CommandCenterState.data,
      homeProjects: _CommandCenterState.projects,
      homeLoading: _CommandCenterState.loading,
      homeError: _CommandCenterState.error,
      homeCommand: _CommandCenterState.command,
      homeCommandResponse: _CommandCenterState.commandResponse,
      homeCommandSubmitting: _CommandCenterState.commandSubmitting,
      homeCommandError: _CommandCenterState.commandError,
      projectId: _ProjectDetailsParams.projectId,
      projectData: _ProjectDetailsState.data,
      projectLoading: _ProjectDetailsState.loading,
      projectError: _ProjectDetailsState.error,
      catalogProjectId: _ActionsCatalogParams.projectId,
      actionItems: _ActionsCatalogState.items,
      actionsLoading: _ActionsCatalogState.loading,
      actionsError: _ActionsCatalogState.error,
      actionId: _ActionBuilderParams.actionId,
      actionTitle: _ActionBuilderParams.actionTitle,
      actionProjectId: _ActionBuilderParams.projectId,
      requestMessage: _ActionBuilderState.request,
      askResponse: _ActionBuilderState.response,
      requestSubmitting: _ActionBuilderState.submitting,
      requestError: _ActionBuilderState.error,
      approvalItems: _ApprovalCenterState.items,
      approvalsLoading: _ApprovalCenterState.loading,
      approvalsError: _ApprovalCenterState.error,
      activityItems: _ActivityState.items,
      activityLoading: _ActivityState.loading,
      activityError: _ActivityState.error,
      safetyData: _SecurityState.data,
      connectionItems: _SecurityState.connections,
      safetyLoading: _SecurityState.loading,
      safetyError: _SecurityState.error,
      planActionId: _PlansParams.actionId,
      planProjectId: _PlansParams.projectId,
      runResponse: _PlansState.response,
      runSubmitting: _PlansState.submitting,
      runError: _PlansState.error,
      askEndpoint: api.ask,
      safetyEndpoint: api.getSafety,
      connectionsEndpoint: api.listConnections,
      runEndpoint: api.runAction,
      decideEndpoint: api.decideApproval,
    ),
  );

  if (installGlobalNavigation) {
    _installGlobalBottomNavigation(app);
  }
}

void _configurePandoraTheme(App app) {
  app.themeColor('primary', 0xFF111827, dark: 0xFF374151);
  app.themeColor('secondary', 0xFF4B5563, dark: 0xFF6B7280);
  app.themeColor('tertiary', 0xFF6B7280, dark: 0xFF9CA3AF);
  app.themeColor('alternate', 0xFFD1D5DB, dark: 0xFF374151);
  app.themeColor(
    'primaryBackground',
    0xFFF7F8FA,
    dark: 0xFF0B0F14,
  );
  app.themeColor(
    'secondaryBackground',
    0xFFFFFFFF,
    dark: 0xFF151A21,
  );
  app.themeColor('primaryText', 0xFF111827, dark: 0xFFF9FAFB);
  app.themeColor('secondaryText', 0xFF4B5563, dark: 0xFFB7C0CC);
  app.themeColor('accent1', 0x24111827, dark: 0x33374151);
  app.themeColor('accent2', 0x244B5563, dark: 0x336B7280);
  app.themeColor('accent3', 0x246B7280, dark: 0x339CA3AF);
  app.themeColor('accent4', 0xCCFFFFFF, dark: 0xCC151A21);
  app.themeColor('success', 0xFF16794A, dark: 0xFF4FAE7A);
  app.themeColor('warning', 0xFFA15C00, dark: 0xFFD99A3D);
  app.themeColor('error', 0xFFB42318, dark: 0xFFE57373);
  app.themeColor('info', 0xFF375A7F, dark: 0xFF7FA6C9);
  app.darkMode(enabled: true);
  app.breakpoints(small: 479, medium: 991, large: 1200);
}

_PandoraSchemas _declareSchemas(App app) {
  final projectSummary = app.struct('PandoraProjectSummary', {
    'id': string,
    'name': string,
    'plainPurpose': string,
    'phase': string,
    'progressPercent': double_,
    'progressVerified': bool_,
    'plainStatus': string,
    'whatIsStoppingUs': string,
    'whatIWillDoNext': string,
    'repository': string,
    'dataFreshness': string,
    'lastVerifiedAt': dateTime,
  });
  final projectPhase = app.struct('PandoraProjectPhase', {
    'id': string,
    'phase_key': string,
    'name': string,
    'sequence': int_,
    'status': string,
    'exit_criteria': json,
    'started_at': dateTime,
    'completed_at': dateTime,
  });
  final projectTask = app.struct('PandoraProjectTask', {
    'id': string,
    'task_key': string,
    'title': string,
    'description': string,
    'sequence': int_,
    'priority': int_,
    'status': string,
    'risk_class': string,
    'completion_criteria': json,
    'current_head_sha': string,
    'result_summary': json,
    'updated_at': dateTime,
  });
  final projectEvidence = app.struct('PandoraProjectEvidence', {
    'id': string,
    'task_id': string,
    'evidence_type': string,
    'provider': string,
    'status': string,
    'verdict': string,
    'source_url': string,
    'head_sha': string,
    'observed_at': dateTime,
  });
  final projectDetail = app.struct('PandoraProjectDetail', {
    'id': string,
    'name': string,
    'plainPurpose': string,
    'phase': string,
    'progressPercent': double_,
    'progressVerified': bool_,
    'plainStatus': string,
    'whatIsStoppingUs': string,
    'whatIWillDoNext': string,
    'repository': string,
    'dataFreshness': string,
    'lastVerifiedAt': dateTime,
    'objective': string,
    'roadmapVersion': string,
    'phases': listOf(projectPhase),
    'tasks': listOf(projectTask),
    'evidence': listOf(projectEvidence),
    'currentState': json,
  });
  final systemHealth = app.struct('PandoraSystemHealth', {
    'state': string,
    'label': string,
    'lastCheckedAt': dateTime,
  });
  final counters = app.struct('PandoraHomeCounters', {
    'approvals': int_,
    'activeProjects': int_,
    'needsAttention': int_,
  });
  final approval = app.struct('PandoraApproval', {
    'id': string,
    'projectId': string,
    'whatWillHappen': string,
    'whyINeedYou': string,
    'whatCouldGoWrong': string,
    'howWeCanUndoIt': string,
    'extraIdentityCheckRequired': bool_,
    'decision': string,
    'expiresAt': dateTime,
    'createdAt': dateTime,
  });
  final activity = app.struct('PandoraActivity', {
    'id': string,
    'type': string,
    'actor': string,
    'summary': string,
    'happenedAt': dateTime,
    'advanced': json,
  });
  final home = app.struct('PandoraHomePayload', {
    'systemHealth': systemHealth,
    // The API's no-priority fallback is a partial approval-shaped object;
    // omitted fields deserialize as null.
    'priority': approval,
    'counters': counters,
    'topProjects': listOf(projectSummary),
    'recentActivity': listOf(activity),
  });
  final connection = app.struct('PandoraConnection', {
    'id': string,
    'name': string,
    'plainPurpose': string,
    'state': string,
    'plainStatus': string,
    'canRead': bool_,
    'canChange': bool_,
    'needsOwnerApprovalForChanges': bool_,
    'lastCheckedAt': dateTime,
    'advanced': json,
  });
  final auditIntegrity = app.struct('PandoraAuditIntegrity', {
    'valid': bool_,
    'eventCount': int_,
    'lastHash': string,
  });
  final safety = app.struct('PandoraSafety', {
    'policy': json,
    'integrations': listOf(json),
    'auditIntegrity': auditIntegrity,
    'mfaRequiredForApproval': bool_,
    'currentAssuranceLevel': string,
    'state': string,
    'plainStatus': string,
  });
  final actionItem = app.struct('PandoraActionCatalogItem', {
    'id': string,
    'title': string,
    'description': string,
    'provider': string,
    'risk': string,
    'request': string,
    'extraIdentityCheckRequired': bool_,
    'executionMode': string,
  });
  final askStatus = app.struct('PandoraAskStatus', {
    'whatChanged': string,
    'whereWeAre': string,
    'whatIsDone': string,
    'whatIsHappeningNow': string,
    'whatIsStoppingUs': string,
    'whatIWillDoNext': string,
  });
  final askResponse = app.struct('PandoraAskResponse', {
    'reply': string,
    'needsApproval': bool_,
    'actionId': string,
    'approvalId': string,
    'status': askStatus,
    'advanced': json,
  });
  final decisionResponse = app.struct('PandoraApprovalDecision', {
    'ok': bool_,
    'decision': string,
    'approval': approval,
  });

  return _PandoraSchemas(
    projectSummary: projectSummary,
    projectDetail: projectDetail,
    approval: approval,
    activity: activity,
    home: home,
    connection: connection,
    safety: safety,
    actionItem: actionItem,
    askResponse: askResponse,
    decisionResponse: decisionResponse,
  );
}

_PandoraApi _declareOwnerApi(App app, _PandoraSchemas schemas) {
  Map<String, DslType> variables([Map<String, DslType> extra = const {}]) => {
        'accessToken': string,
        'organizationId': string,
        ...extra,
      };
  const headers = <String, String>{
    'Authorization': 'Bearer <accessToken>',
    'X-Organization-Id': '<organizationId>',
  };

  final getHome = Endpoint.get(
    'PandoraGetHome',
    '/home',
    variables: variables(),
    headers: headers,
    response: schemas.home,
    settings: _ownerEndpointSettings,
  );
  final listProjects = Endpoint.get(
    'PandoraListProjects',
    '/projects',
    variables: variables(),
    headers: headers,
    response: listOf(schemas.projectSummary),
    settings: _ownerEndpointSettings,
  );
  final getProject = Endpoint.get(
    'PandoraGetProject',
    '/projects/[projectId]',
    variables: variables({'projectId': string}),
    headers: headers,
    response: schemas.projectDetail,
    settings: _ownerEndpointSettings,
  );
  final listConnections = Endpoint.get(
    'PandoraListConnections',
    '/connections',
    variables: variables(),
    headers: headers,
    response: listOf(schemas.connection),
    settings: _ownerEndpointSettings,
  );
  final listApprovals = Endpoint.get(
    'PandoraListApprovals',
    '/approvals?limit=50',
    variables: variables(),
    headers: headers,
    response: listOf(schemas.approval),
    settings: _ownerEndpointSettings,
  );
  final listActivity = Endpoint.get(
    'PandoraListActivity',
    '/activity?limit=50',
    variables: variables(),
    headers: headers,
    response: listOf(schemas.activity),
    settings: _ownerEndpointSettings,
  );
  final getSafety = Endpoint.get(
    'PandoraGetSafety',
    '/safety',
    variables: variables(),
    headers: headers,
    response: schemas.safety,
    settings: _ownerEndpointSettings,
  );
  final listActions = Endpoint.get(
    'PandoraListActions',
    '/actions',
    variables: variables(),
    headers: headers,
    response: listOf(schemas.actionItem),
    settings: _ownerEndpointSettings,
  );
  final ask = Endpoint.post(
    'PandoraAsk',
    '/ask',
    variables: variables({
      'message': string,
      'projectId': string,
    }),
    headers: headers,
    body: const {
      'message': '<message>',
      'projectId': '<projectId>',
      'clientMode': 'simple',
    },
    response: schemas.askResponse,
    settings: _ownerEndpointSettings,
  );
  final runAction = Endpoint.post(
    'PandoraRunAction',
    '/actions/[actionId]/run',
    variables: variables({
      'actionId': string,
      'projectId': string,
    }),
    headers: headers,
    body: const {
      'projectId': '<projectId>',
      'clientMode': 'simple',
    },
    response: schemas.askResponse,
    settings: _ownerEndpointSettings,
  );
  final decideApproval = Endpoint.post(
    'PandoraDecideApproval',
    '/approvals/[approvalId]/decide',
    variables: variables({
      'approvalId': string,
      'decision': string,
      'reason': string,
    }),
    headers: headers,
    body: const {
      'decision': '<decision>',
      'reason': '<reason>',
      'clientMode': 'simple',
    },
    response: schemas.decisionResponse,
    settings: _ownerEndpointSettings,
  );

  app.apiGroup(
    'PandoraOwnerApi',
    baseUrl: _ownerApiBaseUrl,
    headers: const {'Accept': 'application/json'},
    endpoints: [
      getHome,
      listProjects,
      getProject,
      listConnections,
      listApprovals,
      listActivity,
      getSafety,
      listActions,
      ask,
      runAction,
      decideApproval,
    ],
  );

  return _PandoraApi(
    getHome: getHome,
    listProjects: listProjects,
    getProject: getProject,
    listConnections: listConnections,
    listApprovals: listApprovals,
    listActivity: listActivity,
    getSafety: getSafety,
    listActions: listActions,
    ask: ask,
    runAction: runAction,
    decideApproval: decideApproval,
  );
}

void _declarePageStateAndHydration(
  App app,
  _PandoraSchemas schemas,
  _PandoraApi api,
) {
  app.editPageState(ff.Pages.signIn, (state) {
    state.ensureField(_SignInState.email, string.withDefault(''));
    state.ensureField(_SignInState.password, string.withDefault(''));
    state.ensureField(
      _SignInState.confirmPassword,
      string.withDefault(''),
    );
  });

  app.editPageState(ff.Pages.commandCenter, (state) {
    state.ensureField(_CommandCenterState.data, schemas.home);
    state.ensureField(
      _CommandCenterState.projects,
      listOf(schemas.projectSummary),
    );
    state.ensureField(_CommandCenterState.loading, bool_.withDefault(false));
    state.ensureField(_CommandCenterState.error, string.withDefault(''));
    state.ensureField(_CommandCenterState.command, string.withDefault(''));
    state.ensureField(_CommandCenterState.commandResponse, schemas.askResponse);
    state.ensureField(
      _CommandCenterState.commandSubmitting,
      bool_.withDefault(false),
    );
    state.ensureField(
      _CommandCenterState.commandError,
      string.withDefault(''),
    );
  });
  app.editPageOnLoad(
    ff.Pages.commandCenter,
    _readHomePage(
      homeEndpoint: api.getHome,
      projectsEndpoint: api.listProjects,
    ),
  );

  app.editPageParams(ff.Pages.projectDetails, (params) {
    params.ensureParam(
      _ProjectDetailsParams.projectId,
      string,
      description: 'Pandora project UUID or project key.',
    );
  });
  app.editPageState(ff.Pages.projectDetails, (state) {
    state.ensureField(_ProjectDetailsState.data, schemas.projectDetail);
    state.ensureField(_ProjectDetailsState.loading, bool_.withDefault(false));
    state.ensureField(_ProjectDetailsState.error, string.withDefault(''));
  });
  app.editPageOnLoad(ff.Pages.projectDetails, [
    If(
      Not(Equals(Param(_ProjectDetailsParams.projectId), '')),
      then: _readPage(
        api.getProject,
        dataField: _ProjectDetailsState.data,
        loadingField: _ProjectDetailsState.loading,
        errorField: _ProjectDetailsState.error,
        outputAs: 'pandoraProjectResult',
        extraParams: {
          'projectId': Param(_ProjectDetailsParams.projectId),
        },
      ),
      orElse: [
        SetState(
          _ProjectDetailsState.error,
          'Choose a project before opening project details.',
        ),
      ],
    ),
  ]);

  app.editPageParams(ff.Pages.actionsCatalog, (params) {
    params.ensureParam(
      _ActionsCatalogParams.projectId,
      string,
      description:
          'Optional project context forwarded into a governed action.',
    );
  });
  app.editPageState(ff.Pages.actionsCatalog, (state) {
    state.ensureField(
      _ActionsCatalogState.items,
      listOf(schemas.actionItem),
    );
    state.ensureField(_ActionsCatalogState.loading, bool_.withDefault(false));
    state.ensureField(_ActionsCatalogState.error, string.withDefault(''));
  });
  app.editPageOnLoad(
    ff.Pages.actionsCatalog,
    _readPage(
      api.listActions,
      dataField: _ActionsCatalogState.items,
      loadingField: _ActionsCatalogState.loading,
      errorField: _ActionsCatalogState.error,
      outputAs: 'pandoraActionsResult',
    ),
  );

  app.editPageParams(ff.Pages.actionBuilder, (params) {
    params.ensureParam(_ActionBuilderParams.actionId, string);
    params.ensureParam(_ActionBuilderParams.actionTitle, string);
    params.ensureParam(_ActionBuilderParams.projectId, string);
  });
  app.editPageState(ff.Pages.actionBuilder, (state) {
    state.ensureField(_ActionBuilderState.request, string.withDefault(''));
    state.ensureField(_ActionBuilderState.response, schemas.askResponse);
    state.ensureField(
      _ActionBuilderState.submitting,
      bool_.withDefault(false),
    );
    state.ensureField(_ActionBuilderState.error, string.withDefault(''));
  });

  app.editPageState(ff.Pages.approvalCenter, (state) {
    state.ensureField(
      _ApprovalCenterState.items,
      listOf(schemas.approval),
    );
    state.ensureField(_ApprovalCenterState.loading, bool_.withDefault(false));
    state.ensureField(_ApprovalCenterState.error, string.withDefault(''));
  });
  app.editPageOnLoad(
    ff.Pages.approvalCenter,
    _readPage(
      api.listApprovals,
      dataField: _ApprovalCenterState.items,
      loadingField: _ApprovalCenterState.loading,
      errorField: _ApprovalCenterState.error,
      outputAs: 'pandoraApprovalsResult',
    ),
  );

  app.editPageState(ff.Pages.activityAuditTrail, (state) {
    state.ensureField(
      _ActivityState.items,
      listOf(schemas.activity),
    );
    state.ensureField(_ActivityState.loading, bool_.withDefault(false));
    state.ensureField(_ActivityState.error, string.withDefault(''));
  });
  app.editPageOnLoad(
    ff.Pages.activityAuditTrail,
    _readPage(
      api.listActivity,
      dataField: _ActivityState.items,
      loadingField: _ActivityState.loading,
      errorField: _ActivityState.error,
      outputAs: 'pandoraActivityResult',
    ),
  );

  app.editPageState(ff.Pages.securityOperations, (state) {
    state.ensureField(_SecurityState.data, schemas.safety);
    state.ensureField(
      _SecurityState.connections,
      listOf(schemas.connection),
    );
    state.ensureField(_SecurityState.loading, bool_.withDefault(false));
    state.ensureField(_SecurityState.error, string.withDefault(''));
  });
  app.editPageOnLoad(
    ff.Pages.securityOperations,
    _readSafetyPage(
      safetyEndpoint: api.getSafety,
      connectionsEndpoint: api.listConnections,
    ),
  );

  app.editPageParams(ff.Pages.plansExecution, (params) {
    params.ensureParam(_PlansParams.actionId, string);
    params.ensureParam(_PlansParams.projectId, string);
  });
  app.editPageState(ff.Pages.plansExecution, (state) {
    state.ensureField(_PlansState.response, schemas.askResponse);
    state.ensureField(_PlansState.submitting, bool_.withDefault(false));
    state.ensureField(_PlansState.error, string.withDefault(''));
  });
}

List<DslAction> _readPage(
  Endpoint endpoint, {
  required ProjectStateFieldHandle dataField,
  required ProjectStateFieldHandle loadingField,
  required ProjectStateFieldHandle errorField,
  required String outputAs,
  Map<String, Object?> extraParams = const {},
}) => [
  SetState(loadingField, true),
  SetState(errorField, ''),
  ApiCall(
    endpoint,
    outputAs: outputAs,
    params: _authenticatedParams(extraParams),
    onSuccess: (result) => [
      SetState(dataField, result),
      SetState(loadingField, false),
      SetState(errorField, ''),
    ],
    onFailure: [
      SetState(loadingField, false),
      SetState(
        errorField,
        'Pandora cannot reach that service right now. Please try again.',
      ),
    ],
  ),
];

List<DslAction> _readHomePage({
  required Endpoint homeEndpoint,
  required Endpoint projectsEndpoint,
}) => [
  SetState(_CommandCenterState.loading, true),
  SetState(_CommandCenterState.error, ''),
  Parallel([
    [
      ApiCall(
        homeEndpoint,
        outputAs: 'pandoraHomeResult',
        params: _authenticatedParams(),
        onSuccess: (result) => [
          SetState(_CommandCenterState.data, result),
        ],
        onFailure: [
          SetState(
            _CommandCenterState.error,
            'Pandora cannot load the home summary right now.',
          ),
        ],
      ),
    ],
    [
      ApiCall(
        projectsEndpoint,
        outputAs: 'pandoraProjectsResult',
        params: _authenticatedParams(),
        onSuccess: (result) => [
          SetState(_CommandCenterState.projects, result),
        ],
        onFailure: [
          SetState(
            _CommandCenterState.error,
            'Pandora cannot load projects right now.',
          ),
        ],
      ),
    ],
  ]),
  SetState(_CommandCenterState.loading, false),
];

List<DslAction> _readSafetyPage({
  required Endpoint safetyEndpoint,
  required Endpoint connectionsEndpoint,
}) => [
  SetState(_SecurityState.loading, true),
  SetState(_SecurityState.error, ''),
  Parallel([
    [
      ApiCall(
        safetyEndpoint,
        outputAs: 'pandoraSafetyResult',
        params: _authenticatedParams(),
        onSuccess: (result) => [
          SetState(_SecurityState.data, result),
        ],
        onFailure: [
          SetState(
            _SecurityState.error,
            'Pandora cannot verify safety right now.',
          ),
        ],
      ),
    ],
    [
      ApiCall(
        connectionsEndpoint,
        outputAs: 'pandoraConnectionsResult',
        params: _authenticatedParams(),
        onSuccess: (result) => [
          SetState(_SecurityState.connections, result),
        ],
        onFailure: [
          SetState(
            _SecurityState.error,
            'Pandora cannot verify connections right now.',
          ),
        ],
      ),
    ],
  ]),
  SetState(_SecurityState.loading, false),
];

Map<String, Object?> _authenticatedParams(
  [Map<String, Object?> extra = const {}]
) => {
  // Supabase uses JWT_TOKEN. AUTH_TOKEN is a Custom Auth field and would send
  // the wrong value here.
  'accessToken': const AuthUser(AuthUserField.jwtToken),
  'organizationId': AppState(_organizationId),
  ...extra,
};

_PandoraBlocks _declareWriteActionBlocks(
  App app,
  _PandoraSchemas schemas,
  _PandoraApi api,
) {
  final askPandora = app.actionBlock(
    'pandoraAsk',
    params: {'message': string, 'projectId': string},
    returns: schemas.askResponse,
    description:
        'Submits a plain-language request to the governed Pandora intake.',
    actions: [
      ApiCall(
        api.ask,
        outputAs: 'pandoraAskBlockResult',
        params: _authenticatedParams({
          'message': const ActionBlockParam('message'),
          'projectId': const ActionBlockParam('projectId'),
        }),
      ),
      Terminate(const ActionOutput('pandoraAskBlockResult')),
    ],
  );
  final runAction = app.actionBlock(
    'pandoraRunCatalogAction',
    params: {'actionId': string, 'projectId': string},
    returns: schemas.askResponse,
    description:
        'Creates a governed plan for a catalog action. The backend enforces '
        'approval and AAL2 requirements.',
    actions: [
      ApiCall(
        api.runAction,
        outputAs: 'pandoraRunBlockResult',
        params: _authenticatedParams({
          'actionId': const ActionBlockParam('actionId'),
          'projectId': const ActionBlockParam('projectId'),
        }),
      ),
      Terminate(const ActionOutput('pandoraRunBlockResult')),
    ],
  );
  final decideApproval = app.actionBlock(
    'pandoraDecideApproval',
    params: {
      'approvalId': string,
      'decision': string,
      'reason': string,
    },
    returns: schemas.decisionResponse,
    description:
        'Submits an approval decision. The owner API and database reject it '
        'unless the current Supabase session is AAL2.',
    actions: [
      ApiCall(
        api.decideApproval,
        outputAs: 'pandoraDecisionBlockResult',
        params: _authenticatedParams({
          'approvalId': const ActionBlockParam('approvalId'),
          'decision': const ActionBlockParam('decision'),
          'reason': const ActionBlockParam('reason'),
        }),
      ),
      Terminate(const ActionOutput('pandoraDecisionBlockResult')),
    ],
  );
  return _PandoraBlocks(
    askPandora: askPandora,
    runAction: runAction,
    decideApproval: decideApproval,
  );
}

void _wireAuthAwareEntryPages(App app) {
  app.editPageOnLoad(ff.Pages.splashConnection, [
    If(
      const Global(GlobalProperty.isUserLoggedIn),
      then: Navigate(
        ff.Pages.commandCenter,
        allowBack: false,
        replaceRoute: true,
      ),
      orElse: Navigate(
        ff.Pages.signIn,
        allowBack: false,
        replaceRoute: true,
      ),
    ),
  ]);
}

void _installGlobalBottomNavigation(App app) {
  app.raw((project) {
    final navBar = project.ensureNavBar();
    navBar.pageKeyRefOrder.clear();
    for (final pageKey in project.pageKeys) {
      final page = project.widgetClasses[pageKey];
      if (page != null) {
        page.node.props.scaffold.ensureNavBarItem().show = false;
      }
    }

    setNavBarEnabled(project, enabled: true);
    _addLabeledNavPage(
      project,
      pageName: 'CommandCenter',
      iconName: 'home',
      label: 'Home',
    );
    _addLabeledNavPage(
      project,
      pageName: 'ActionsCatalog',
      iconName: 'bolt',
      label: 'Work',
    );
    _addLabeledNavPage(
      project,
      pageName: 'ApprovalCenter',
      iconName: 'approval',
      label: 'Approve',
    );
    _addLabeledNavPage(
      project,
      pageName: 'ActivityAuditTrail',
      iconName: 'history',
      label: 'Updates',
    );
    _addLabeledNavPage(
      project,
      pageName: 'SecurityOperations',
      iconName: 'security',
      label: 'Safety',
    );
  });
}

void _addLabeledNavPage(
  FFProject project, {
  required String pageName,
  required String iconName,
  required String label,
}) {
  addNavBarPage(project, pageName: pageName, iconName: iconName);
  final page = findPage(project, name: pageName);
  if (page == null) {
    throw StateError('Navigation page disappeared: $pageName');
  }
  final navItem = page.node.props.scaffold.ensureNavBarItem();
  navItem.legacyLabel = label;
  navItem.label = FFText(
    textValue: FFStringValue(
      inputValue: label,
      mostRecentInputValue: label,
    ),
  );
}

final class _PandoraSchemas {
  const _PandoraSchemas({
    required this.projectSummary,
    required this.projectDetail,
    required this.approval,
    required this.activity,
    required this.home,
    required this.connection,
    required this.safety,
    required this.actionItem,
    required this.askResponse,
    required this.decisionResponse,
  });

  final StructHandle projectSummary;
  final StructHandle projectDetail;
  final StructHandle approval;
  final StructHandle activity;
  final StructHandle home;
  final StructHandle connection;
  final StructHandle safety;
  final StructHandle actionItem;
  final StructHandle askResponse;
  final StructHandle decisionResponse;
}

final class _PandoraApi {
  const _PandoraApi({
    required this.getHome,
    required this.listProjects,
    required this.getProject,
    required this.listConnections,
    required this.listApprovals,
    required this.listActivity,
    required this.getSafety,
    required this.listActions,
    required this.ask,
    required this.runAction,
    required this.decideApproval,
  });

  final Endpoint getHome;
  final Endpoint listProjects;
  final Endpoint getProject;
  final Endpoint listConnections;
  final Endpoint listApprovals;
  final Endpoint listActivity;
  final Endpoint getSafety;
  final Endpoint listActions;
  final Endpoint ask;
  final Endpoint runAction;
  final Endpoint decideApproval;
}

final class _PandoraBlocks {
  const _PandoraBlocks({
    required this.askPandora,
    required this.runAction,
    required this.decideApproval,
  });

  final ActionBlockHandle askPandora;
  final ActionBlockHandle runAction;
  final ActionBlockHandle decideApproval;
}

final class _CliOptions {
  const _CliOptions({
    this.apiKey,
    this.baseUrl,
    this.projectId,
    this.dryRun = false,
    this.commitMessage,
  });

  final String? apiKey;
  final String? baseUrl;
  final String? projectId;
  final bool dryRun;
  final String? commitMessage;

  static _CliOptions parse(List<String> args) {
    String? apiKey;
    String? baseUrl;
    String? projectId;
    String? commitMessage;
    var dryRun = false;

    String takeValue(String flag, int valueIndex) {
      if (valueIndex >= args.length) {
        stderr.writeln('Missing value for $flag.');
        exit(64);
      }
      return args[valueIndex];
    }

    for (var index = 0; index < args.length; index += 1) {
      switch (args[index]) {
        case '--api-key':
          apiKey = takeValue(args[index], ++index);
        case '--base-url':
          baseUrl = takeValue(args[index], ++index);
        case '--project-id':
          projectId = takeValue(args[index], ++index);
        case '--commit-message':
          commitMessage = takeValue(args[index], ++index);
        case '--dry-run':
          dryRun = true;
        default:
          stderr.writeln('Unknown option: ${args[index]}');
          exit(64);
      }
    }

    return _CliOptions(
      apiKey: apiKey,
      baseUrl: baseUrl,
      projectId: projectId,
      dryRun: dryRun,
      commitMessage: commitMessage,
    );
  }
}
