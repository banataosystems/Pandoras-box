library;

import 'package:flutterflow_ai/flutterflow_ai.dart';
import 'package:pandora_flutterflow_ai/flutterflow_project.dart' as ff;

/// Immutable, reviewed product mark. The asset is commit-pinned so a future
/// branch update cannot silently change production branding.
const String approvedPandoraProductMark =
    'https://raw.githubusercontent.com/banataosystems/Pandoras-box/'
    '3e54c53f7189e3c8bf4f4129d271b3acfe1c5742/assets/brand/'
    'pandoras-box/product-mark/derived/ui-mark-512.png';

/// Typed data/action handles created by pass 2 and consumed by its exact UI
/// replacement pass. The widget selectors below are from inspection artifact
/// cb3a51db; none is inferred from display text or an unindexed resource path.
final class PandoraBindingSpec {
  const PandoraBindingSpec({
    required this.organizationId,
    required this.signInEmail,
    required this.signInPassword,
    required this.signInConfirmPassword,
    required this.homeData,
    required this.homeProjects,
    required this.homeLoading,
    required this.homeError,
    required this.homeCommand,
    required this.homeCommandResponse,
    required this.homeCommandSubmitting,
    required this.homeCommandError,
    required this.projectId,
    required this.projectData,
    required this.projectLoading,
    required this.projectError,
    required this.catalogProjectId,
    required this.actionItems,
    required this.actionsLoading,
    required this.actionsError,
    required this.actionId,
    required this.actionTitle,
    required this.actionProjectId,
    required this.requestMessage,
    required this.askResponse,
    required this.requestSubmitting,
    required this.requestError,
    required this.approvalItems,
    required this.approvalsLoading,
    required this.approvalsError,
    required this.activityItems,
    required this.activityLoading,
    required this.activityError,
    required this.memoryData,
    required this.memoryQuery,
    required this.memoryLoading,
    required this.memoryError,
    required this.safetyData,
    required this.connectionItems,
    required this.safetyLoading,
    required this.safetyError,
    required this.planActionId,
    required this.planProjectId,
    required this.planRequestMessage,
    required this.runResponse,
    required this.runSubmitting,
    required this.runError,
    required this.askEndpoint,
    required this.safetyEndpoint,
    required this.connectionsEndpoint,
    required this.memoryEndpoint,
    required this.connectionActionEndpoint,
    required this.runEndpoint,
    required this.decideEndpoint,
  });

  final ProjectAppStateFieldHandle organizationId;
  final ProjectStateFieldHandle signInEmail;
  final ProjectStateFieldHandle signInPassword;
  final ProjectStateFieldHandle signInConfirmPassword;
  final ProjectStateFieldHandle homeData;
  final ProjectStateFieldHandle homeProjects;
  final ProjectStateFieldHandle homeLoading;
  final ProjectStateFieldHandle homeError;
  final ProjectStateFieldHandle homeCommand;
  final ProjectStateFieldHandle homeCommandResponse;
  final ProjectStateFieldHandle homeCommandSubmitting;
  final ProjectStateFieldHandle homeCommandError;
  final ProjectParamHandle projectId;
  final ProjectStateFieldHandle projectData;
  final ProjectStateFieldHandle projectLoading;
  final ProjectStateFieldHandle projectError;
  final ProjectParamHandle catalogProjectId;
  final ProjectStateFieldHandle actionItems;
  final ProjectStateFieldHandle actionsLoading;
  final ProjectStateFieldHandle actionsError;
  final ProjectParamHandle actionId;
  final ProjectParamHandle actionTitle;
  final ProjectParamHandle actionProjectId;
  final ProjectStateFieldHandle requestMessage;
  final ProjectStateFieldHandle askResponse;
  final ProjectStateFieldHandle requestSubmitting;
  final ProjectStateFieldHandle requestError;
  final ProjectStateFieldHandle approvalItems;
  final ProjectStateFieldHandle approvalsLoading;
  final ProjectStateFieldHandle approvalsError;
  final ProjectStateFieldHandle activityItems;
  final ProjectStateFieldHandle activityLoading;
  final ProjectStateFieldHandle activityError;
  final ProjectStateFieldHandle memoryData;
  final ProjectStateFieldHandle memoryQuery;
  final ProjectStateFieldHandle memoryLoading;
  final ProjectStateFieldHandle memoryError;
  final ProjectStateFieldHandle safetyData;
  final ProjectStateFieldHandle connectionItems;
  final ProjectStateFieldHandle safetyLoading;
  final ProjectStateFieldHandle safetyError;
  final ProjectParamHandle planActionId;
  final ProjectParamHandle planProjectId;
  final ProjectParamHandle planRequestMessage;
  final ProjectStateFieldHandle runResponse;
  final ProjectStateFieldHandle runSubmitting;
  final ProjectStateFieldHandle runError;
  final Endpoint askEndpoint;
  final Endpoint safetyEndpoint;
  final Endpoint connectionsEndpoint;
  final Endpoint memoryEndpoint;
  final Endpoint connectionActionEndpoint;
  final Endpoint runEndpoint;
  final Endpoint decideEndpoint;
}

/// Rebuilds the ten existing page bodies with native, executable FlutterFlow
/// widgets while preserving page identities, route settings, and backend
/// configuration. Full body-root replacement is deliberate: inspection proved
/// the current AuthInput, TextField, ApprovalCard, and PlanCard wrappers expose
/// no usable value/callback contract to their parent pages.
void applyPandoraExactBindings(
  App app, {
  required PandoraBindingSpec spec,
}) {
  _replacePageBody(
    app,
    page: ff.Pages.splashConnection,
    bodyRoot: _existingWidget(
      ff.Pages.splashConnection.widgets,
      replacementName: 'PandoraSplashBody',
      legacyKey: 'Stack_stack4_52',
    ),
    body: _splashBody(),
  );
  _replacePageBody(
    app,
    page: ff.Pages.signIn,
    bodyRoot: _existingWidget(
      ff.Pages.signIn.widgets,
      replacementName: 'PandoraSignInBody',
      legacyKey: 'ScrollColumn_column33_129',
    ),
    body: _signInBody(spec),
  );
  _replacePageBody(
    app,
    page: ff.Pages.commandCenter,
    bodyRoot: _existingWidget(
      ff.Pages.commandCenter.widgets,
      replacementName: 'PandoraCommandCenterBody',
      legacyKey: 'ScrollColumn_column40_229',
    ),
    body: _commandCenterBody(spec),
  );
  _replacePageBody(
    app,
    page: ff.Pages.projectDetails,
    bodyRoot: _existingWidget(
      ff.Pages.projectDetails.widgets,
      replacementName: 'PandoraProjectDetailsBody',
      legacyKey: 'Column_column62_341',
    ),
    body: _projectDetailsBody(spec),
  );
  _replacePageBody(
    app,
    page: ff.Pages.actionsCatalog,
    bodyRoot: _existingWidget(
      ff.Pages.actionsCatalog.widgets,
      replacementName: 'PandoraActionsCatalogBody',
      legacyKey: 'Column_column71_449',
    ),
    body: _actionsCatalogBody(spec),
  );
  _replacePageBody(
    app,
    page: ff.Pages.actionBuilder,
    bodyRoot: _existingWidget(
      ff.Pages.actionBuilder.widgets,
      replacementName: 'PandoraActionBuilderBody',
      legacyKey: 'Column_column80_546',
    ),
    body: _actionBuilderBody(spec),
  );
  _replacePageBody(
    app,
    page: ff.Pages.approvalCenter,
    bodyRoot: _existingWidget(
      ff.Pages.approvalCenter.widgets,
      replacementName: 'PandoraApprovalCenterBody',
      legacyKey: 'Column_column89_663',
    ),
    body: _approvalCenterBody(spec),
  );
  _replacePageBody(
    app,
    page: ff.Pages.plansExecution,
    bodyRoot: _existingWidget(
      ff.Pages.plansExecution.widgets,
      replacementName: 'PandoraPlansExecutionBody',
      legacyKey: 'Column_column99_777',
    ),
    body: _plansExecutionBody(spec),
  );
  _replacePageBody(
    app,
    page: ff.Pages.activityAuditTrail,
    bodyRoot: _existingWidget(
      ff.Pages.activityAuditTrail.widgets,
      replacementName: 'PandoraActivityBody',
      legacyKey: 'Column_column108_917',
    ),
    body: _activityBody(spec),
  );
  _replacePageBody(
    app,
    page: ff.Pages.securityOperations,
    bodyRoot: _existingWidget(
      ff.Pages.securityOperations.widgets,
      replacementName: 'PandoraSecurityBody',
      legacyKey: 'Column_column119_1048',
    ),
    body: _securityBody(spec),
  );

  // Keep the reusable design-system marks correct for any future page that
  // reintroduces them. Replacing their inspected child preserves each
  // component root and instance contract.
  _replaceMark(
    app,
    component: ff.Components.redAppleMark,
    child: _existingWidget(
      ff.Components.redAppleMark.widgets,
      replacementName: 'ApprovedPandoraSplashMark',
      legacyKey: 'Container_container1_7',
    ),
    size: 88,
    replacementName: 'ApprovedPandoraSplashMark',
  );
  _replaceMark(
    app,
    component: ff.Components.redAppleMark2,
    child: _existingWidget(
      ff.Components.redAppleMark2.widgets,
      replacementName: 'ApprovedPandoraSignInMark',
      legacyKey: 'Container_container1_61',
    ),
    size: 64,
    replacementName: 'ApprovedPandoraSignInMark',
  );
  _replaceMark(
    app,
    component: ff.Components.redAppleMark3,
    child: _existingWidget(
      ff.Components.redAppleMark3.widgets,
      replacementName: 'ApprovedPandoraActionsMark',
      legacyKey: 'Container_container5_345',
    ),
    size: 40,
    replacementName: 'ApprovedPandoraActionsMark',
  );
  _replaceMark(
    app,
    component: ff.Components.redAppleMark4,
    child: _existingWidget(
      ff.Components.redAppleMark4.widgets,
      replacementName: 'ApprovedPandoraBuilderMark',
      legacyKey: 'Container_container1_453',
    ),
    size: 40,
    replacementName: 'ApprovedPandoraBuilderMark',
  );
  _replaceMark(
    app,
    component: ff.Components.redAppleMark5,
    child: _existingWidget(
      ff.Components.redAppleMark5.widgets,
      replacementName: 'ApprovedPandoraActivityMark',
      legacyKey: 'Container_container7_781',
    ),
    size: 40,
    replacementName: 'ApprovedPandoraActivityMark',
  );
  _replaceMark(
    app,
    component: ff.Components.redAppleMark6,
    child: _existingWidget(
      ff.Components.redAppleMark6.widgets,
      replacementName: 'ApprovedPandoraSafetyMark',
      legacyKey: 'Container_container4_921',
    ),
    size: 40,
    replacementName: 'ApprovedPandoraSafetyMark',
  );
}

void _replacePageBody(
  App app, {
  required Object page,
  required ProjectWidgetHandle bodyRoot,
  required DslWidget body,
}) {
  app.editPage(page, (editor) {
    editor.ensureReplaced(bodyRoot, body);
  });
}

ProjectWidgetHandle _existingWidget(
  ProjectWidgetTree tree, {
  required String replacementName,
  required String legacyKey,
}) {
  final current = tree.byText(replacementName);
  if (current.matches.length == 1) return current.single;
  if (current.isNotEmpty) {
    throw StateError(
      '$replacementName must identify exactly one current widget; found '
      '${current.matches.length}.',
    );
  }

  final legacy = tree.byKey(legacyKey);
  if (legacy.matches.length == 1) return legacy.single;
  throw StateError(
    'Neither current widget $replacementName nor legacy key $legacyKey '
    'resolved exactly once.',
  );
}

void _replaceMark(
  App app, {
  required Object component,
  required ProjectWidgetHandle child,
  required double size,
  required String replacementName,
}) {
  app.editComponent(component, (editor) {
    editor.ensureReplaced(
      child,
      Tooltip(
        name: replacementName,
        message: 'Pandora\'s Box',
        child: Image(
          approvedPandoraProductMark,
          isNetwork: true,
          fit: ImageFit.contain,
          width: size,
          height: size,
          cached: true,
        ),
      ),
    );
  });
}

DslWidget _splashBody() => Column(
  name: 'PandoraSplashBody',
  mainAxis: MainAxis.center,
  crossAxis: CrossAxis.center,
  spacing: 16,
  padding: const EdgeInsets.all(24),
  children: [
    _mark(200),
    Text('Pandora\'s Box', style: Styles.headlineSmall),
    Text('Banatao Systems', style: Styles.bodyMedium),
    ProgressBar.circular(size: 28),
    Text('Opening your protected workspace', style: Styles.bodySmall),
  ],
);

DslWidget _signInBody(PandoraBindingSpec spec) => Column(
  name: 'PandoraSignInBody',
  mainAxis: MainAxis.center,
  crossAxis: CrossAxis.stretch,
  spacing: 16,
  padding: const EdgeInsets.all(24),
  scrollable: true,
  children: [
    Column(
      crossAxis: CrossAxis.center,
      spacing: 8,
      children: [
        _mark(160),
        Text('Pandora\'s Box', style: Styles.headlineSmall),
        Text(
          'Use your Banatao Systems account.',
          style: Styles.bodyMedium,
        ),
      ],
    ),
    TextField(
      label: 'Email address',
      hint: 'you@banatao.systems',
      keyboard: Keyboard.email,
      name: 'PandoraEmailField',
      onChanged: SetState(spec.signInEmail, const TextValue()),
      onSubmitted: LoginEmailPassword(
        State(spec.signInEmail),
        State(spec.signInPassword),
      ),
      visible: Not(const Global(GlobalProperty.isUserLoggedIn)),
    ),
    Text(
      'Enter and confirm your new password to finish account recovery.',
      style: Styles.bodyMedium,
      visible: const Global(GlobalProperty.isUserLoggedIn),
    ),
    TextField(
      label: 'Password',
      hint: 'Enter your password',
      obscureText: true,
      name: 'PandoraPasswordField',
      onChanged: SetState(spec.signInPassword, const TextValue()),
    ),
    TextField(
      label: 'Confirm new password',
      hint: 'Enter the new password again',
      obscureText: true,
      name: 'PandoraConfirmPasswordField',
      visible: const Global(GlobalProperty.isUserLoggedIn),
      onChanged: SetState(
        spec.signInConfirmPassword,
        const TextValue(),
      ),
    ),
    Button(
      'Sign in',
      name: 'PandoraSignInButton',
      width: double.infinity,
      visible: Not(const Global(GlobalProperty.isUserLoggedIn)),
      onTap: LoginEmailPassword(
        State(spec.signInEmail),
        State(spec.signInPassword),
      ),
    ),
    Button(
      'Forgot password?',
      name: 'PandoraResetPasswordButton',
      variant: ButtonVariant.text,
      visible: Not(const Global(GlobalProperty.isUserLoggedIn)),
      onTap: If(
        Not(Equals(State(spec.signInEmail), '')),
        then: [
          ResetPassword(State(spec.signInEmail)),
          Snackbar('Check your email for the secure reset link.'),
        ],
        orElse: [
          Snackbar('Enter your email address first.'),
        ],
      ),
    ),
    Button(
      'Set new password after opening reset link',
      name: 'PandoraUpdatePasswordButton',
      variant: ButtonVariant.text,
      visible: const Global(GlobalProperty.isUserLoggedIn),
      onTap: If(
        Not(Equals(State(spec.signInPassword), '')),
        then: [
          If(
            Equals(
              State(spec.signInPassword),
              State(spec.signInConfirmPassword),
            ),
            then: [
              UpdatePassword(
                State(spec.signInPassword),
                confirmPassword: State(spec.signInConfirmPassword),
              ),
              Snackbar('Your password has been updated.'),
              Navigate(
                ff.Pages.commandCenter,
                allowBack: false,
                replaceRoute: true,
              ),
            ],
            orElse: [
              Snackbar('The two passwords do not match.'),
            ],
          ),
        ],
        orElse: [
          Snackbar('Enter your new password first.'),
        ],
      ),
    ),
    _panel(
      name: 'PandoraSignInSafetyPanel',
      child: Text(
        'Protected changes may require an extra identity check.',
        style: Styles.bodySmall,
      ),
    ),
  ],
);

DslWidget _commandCenterBody(PandoraBindingSpec spec) => Column(
  name: 'PandoraCommandCenterBody',
  crossAxis: CrossAxis.stretch,
  spacing: 16,
  padding: const EdgeInsets.all(16),
  scrollable: true,
  children: [
    _brandHeader('Pandora\'s Box', 'Owner command center'),
    _panel(
      name: 'PandoraOwnerCommandPanel',
      child: Column(
        crossAxis: CrossAxis.stretch,
        spacing: 10,
        children: [
          Text(
            'What do you want Pandora to do?',
            style: Styles.titleLarge,
          ),
          TextField(
            label: 'Ask Pandora',
            hint: 'Continue a project, check a release, or fix a blocker',
            maxLines: 3,
            name: 'PandoraOwnerCommandField',
            onChanged: SetState(spec.homeCommand, const TextValue()),
            onSubmitted: _submitHomeCommand(
              spec,
              outputAs: 'pandoraHomeCommandSubmitResult',
            ),
          ),
          Button(
            'Ask Pandora',
            name: 'PandoraOwnerCommandButton',
            visible: Not(State(spec.homeCommandSubmitting)),
            onTap: _submitHomeCommand(
              spec,
              outputAs: 'pandoraHomeCommandButtonResult',
            ),
          ),
          ProgressBar.circular(
            name: 'PandoraOwnerCommandProgress',
            visible: State(spec.homeCommandSubmitting),
          ),
          Text(
            State(spec.homeCommandError),
            name: 'PandoraOwnerCommandError',
            style: Styles.bodyMedium,
            visible: Not(Equals(State(spec.homeCommandError), '')),
          ),
          Text(
            State(spec.homeCommandResponse)['reply'],
            name: 'PandoraOwnerCommandResponse',
            style: Styles.bodyMedium,
          ),
        ],
      ),
    ),
    ..._loadingAndError(spec.homeLoading, spec.homeError, 'Home'),
    Button(
      'Try loading home again',
      name: 'PandoraHomeRetryButton',
      variant: ButtonVariant.outlined,
      visible: Not(Equals(State(spec.homeError), '')),
      onTap: Navigate(
        ff.Pages.commandCenter,
        allowBack: false,
        replaceRoute: true,
      ),
    ),
    _panel(
      name: 'PandoraSystemHealthPanel',
      child: Column(
        crossAxis: CrossAxis.start,
        spacing: 4,
        children: [
          Text('SYSTEM HEALTH', style: Styles.labelMedium),
          Text(
            State(spec.homeData)['systemHealth']['label'],
            style: Styles.titleLarge,
          ),
          Text(
            State(spec.homeData)['systemHealth']['lastCheckedAt'],
            style: Styles.bodySmall,
          ),
        ],
      ),
    ),
    Wrap(
      name: 'PandoraHomeMetricsWrap',
      spacing: 8,
      runSpacing: 8,
      children: [
        _metric(
          'Approvals',
          State(spec.homeData)['counters']['approvals'],
          'PandoraApprovalsMetric',
        ),
        _metric(
          'Active',
          State(spec.homeData)['counters']['activeProjects'],
          'PandoraActiveMetric',
        ),
        _metric(
          'Attention',
          State(spec.homeData)['counters']['needsAttention'],
          'PandoraAttentionMetric',
        ),
      ],
    ),
    _panel(
      name: 'PandoraPriorityPanel',
      onTap: If(
        Not(
          Equals(
            State(spec.homeData)['counters']['approvals'],
            0,
          ),
        ),
        then: Navigate(ff.Pages.approvalCenter),
        orElse: If(
          Not(
            Equals(
              State(spec.homeData)['counters']['needsAttention'],
              0,
            ),
          ),
          then: Navigate(ff.Pages.securityOperations),
          orElse: Snackbar('Nothing needs your attention right now.'),
        ),
      ),
      child: Column(
        crossAxis: CrossAxis.start,
        spacing: 6,
        children: [
          Text('NEXT BEST STEP', style: Styles.labelMedium),
          Text(
            State(spec.homeData)['priority']['whatWillHappen'],
            style: Styles.titleMedium,
          ),
          Text(
            State(spec.homeData)['priority']['whyINeedYou'],
            style: Styles.bodyMedium,
          ),
        ],
      ),
    ),
    Text('Projects', style: Styles.titleLarge),
    ListView(
      name: 'PandoraProjectsList',
      source: State(spec.homeProjects),
      shrinkWrap: true,
      spacing: 10,
      itemBuilder: (item) => _panel(
        name: 'PandoraProjectRow',
        onTap: Navigate(
          ff.Pages.projectDetails,
          params: {'projectId': item['id']},
        ),
        child: Column(
          crossAxis: CrossAxis.start,
          spacing: 4,
          children: [
            Text(item['name'], style: Styles.titleMedium),
            Text(item['plainPurpose'], style: Styles.bodyMedium),
            Text(item['plainStatus'], style: Styles.labelMedium),
            Text(item['whatIWillDoNext'], style: Styles.bodySmall),
          ],
        ),
      ),
    ),
    Text('Recent verified updates', style: Styles.titleLarge),
    ListView(
      name: 'PandoraHomeActivityList',
      source: State(spec.homeData)['recentActivity'],
      shrinkWrap: true,
      spacing: 8,
      itemBuilder: (item) => _panel(
        name: 'PandoraHomeActivityRow',
        child: Column(
          crossAxis: CrossAxis.start,
          spacing: 3,
          children: [
            Text(item['summary'], style: Styles.bodyMedium),
          ],
        ),
      ),
    ),
  ],
);

List<DslAction> _submitHomeCommand(
  PandoraBindingSpec spec, {
  required String outputAs,
}) => [
  If(
    Not(Equals(State(spec.homeCommand), '')),
    then: [
      SetState(spec.homeCommandSubmitting, true),
      SetState(spec.homeCommandError, ''),
      ApiCall(
        spec.askEndpoint,
        outputAs: outputAs,
        params: _apiParams(spec, {
          'message': State(spec.homeCommand),
          'projectId': '',
        }),
        onSuccess: (result) => [
          SetState(spec.homeCommandResponse, result),
          SetState(spec.homeCommandSubmitting, false),
        ],
        onFailure: [
          SetState(spec.homeCommandSubmitting, false),
          SetState(
            spec.homeCommandError,
            'Pandora could not save that request. Check your connection and try again.',
          ),
        ],
      ),
    ],
    orElse: [
      Snackbar('Describe what you want Pandora to do first.'),
    ],
  ),
];

DslWidget _projectDetailsBody(PandoraBindingSpec spec) => Column(
  name: 'PandoraProjectDetailsBody',
  crossAxis: CrossAxis.stretch,
  spacing: 14,
  padding: const EdgeInsets.all(16),
  scrollable: true,
  children: [
    Row(
      mainAxis: MainAxis.spaceBetween,
      children: [
        Button(
          'Back',
          name: 'PandoraProjectBackButton',
          variant: ButtonVariant.text,
          onTap: const NavigateBack(),
        ),
        _mark(40),
      ],
    ),
    ..._loadingAndError(spec.projectLoading, spec.projectError, 'Project'),
    Button(
      'Try loading this project again',
      name: 'PandoraProjectRetryButton',
      variant: ButtonVariant.outlined,
      visible: Not(Equals(State(spec.projectError), '')),
      onTap: Navigate(
        ff.Pages.projectDetails,
        params: {'projectId': Param(spec.projectId)},
        replaceRoute: true,
      ),
    ),
    Text(State(spec.projectData)['name'], style: Styles.headlineSmall),
    Text(State(spec.projectData)['plainPurpose'], style: Styles.bodyLarge),
    _panel(
      name: 'PandoraProjectStatusPanel',
      child: Column(
        crossAxis: CrossAxis.start,
        spacing: 6,
        children: [
          Text('Where we are', style: Styles.labelMedium),
          Text(State(spec.projectData)['plainStatus'], style: Styles.titleMedium),
          Text(State(spec.projectData)['phase'], style: Styles.bodyMedium),
          Text(State(spec.projectData)['repository'], style: Styles.bodySmall),
        ],
      ),
    ),
    _panel(
      name: 'PandoraProjectProgressPanel',
      child: Column(
        crossAxis: CrossAxis.start,
        spacing: 6,
        children: [
          Text(
            'Verified roadmap progress',
            style: Styles.labelMedium,
            visible: State(spec.projectData)['progressVerified'],
          ),
          Text(
            'Progress needs verification',
            style: Styles.titleMedium,
            visible: Not(
              State(spec.projectData)['progressVerified'],
            ),
          ),
          Row(
            spacing: 3,
            visible: State(spec.projectData)['progressVerified'],
            children: [
              Text(
                State(spec.projectData)['progressPercent'],
                style: Styles.headlineSmall,
              ),
              Text('%', style: Styles.headlineSmall),
            ],
          ),
          Text(
            'Pandora will verify the roadmap before showing a completion percentage.',
            style: Styles.bodyMedium,
            visible: Not(
              State(spec.projectData)['progressVerified'],
            ),
          ),
          Text(
            State(spec.projectData)['lastVerifiedAt'],
            style: Styles.bodySmall,
            visible: State(spec.projectData)['progressVerified'],
          ),
        ],
      ),
    ),
    _panel(
      name: 'PandoraProjectNextPanel',
      child: Column(
        crossAxis: CrossAxis.start,
        spacing: 6,
        children: [
          Text('What is stopping us', style: Styles.labelMedium),
          Text(
            State(spec.projectData)['whatIsStoppingUs'],
            style: Styles.bodyMedium,
          ),
          Divider(),
          Text('What I will do next', style: Styles.labelMedium),
          Text(
            State(spec.projectData)['whatIWillDoNext'],
            style: Styles.bodyMedium,
          ),
        ],
      ),
    ),
    Text('Roadmap work', style: Styles.titleLarge),
    ListView(
      name: 'PandoraProjectTasksList',
      source: State(spec.projectData)['tasks'],
      shrinkWrap: true,
      spacing: 8,
      itemBuilder: (item) => _panel(
        name: 'PandoraProjectTaskRow',
        child: Column(
          crossAxis: CrossAxis.start,
          spacing: 4,
          children: [
            Text(item['title'], style: Styles.titleSmall),
            Text(item['status'], style: Styles.labelMedium),
            Text(item['description'], style: Styles.bodySmall),
          ],
        ),
      ),
    ),
    Text('Recent live versions', style: Styles.titleLarge),
    ListView(
      name: 'PandoraProjectReleasesList',
      source: State(spec.projectData)['recentReleases'],
      shrinkWrap: true,
      spacing: 8,
      itemBuilder: (item) => _panel(
        name: 'PandoraProjectReleaseRow',
        child: Column(
          crossAxis: CrossAxis.start,
          spacing: 4,
          children: [
            Text(item['title'], style: Styles.titleSmall),
            Text(item['plainStatus'], style: Styles.labelMedium),
            Text(item['environment'], style: Styles.bodySmall),
            Text(item['observedAt'], style: Styles.bodySmall),
            Text(
              'A recovery version is recorded.',
              style: Styles.bodySmall,
              visible: item['rollbackAvailable'],
            ),
          ],
        ),
      ),
    ),
    Text('Recent proof', style: Styles.titleLarge),
    ListView(
      name: 'PandoraProjectEvidenceList',
      source: State(spec.projectData)['evidence'],
      shrinkWrap: true,
      spacing: 8,
      itemBuilder: (item) => _panel(
        name: 'PandoraProjectEvidenceRow',
        child: Column(
          crossAxis: CrossAxis.start,
          spacing: 4,
          children: [
            Text(item['evidence_type'], style: Styles.titleSmall),
            Text(item['provider'], style: Styles.bodySmall),
            Text(item['verdict'], style: Styles.labelMedium),
            Text(item['observed_at'], style: Styles.bodySmall),
          ],
        ),
      ),
    ),
    Button(
      'Review all approvals',
      name: 'PandoraProjectApprovalsButton',
      variant: ButtonVariant.outlined,
      onTap: Navigate(ff.Pages.approvalCenter),
    ),
    Button(
      'Set up work for this project',
      name: 'PandoraProjectWorkButton',
      onTap: Navigate(
        ff.Pages.actionsCatalog,
        params: {'projectId': Param(spec.projectId)},
      ),
    ),
  ],
);

DslWidget _actionsCatalogBody(PandoraBindingSpec spec) => Column(
  name: 'PandoraActionsCatalogBody',
  crossAxis: CrossAxis.stretch,
  spacing: 14,
  padding: const EdgeInsets.all(16),
  scrollable: true,
  children: [
    _brandHeader('Work', 'Choose a governed action'),
    ..._loadingAndError(spec.actionsLoading, spec.actionsError, 'Actions'),
    Button(
      'Try loading work again',
      name: 'PandoraActionsRetryButton',
      variant: ButtonVariant.outlined,
      visible: Not(Equals(State(spec.actionsError), '')),
      onTap: Navigate(
        ff.Pages.actionsCatalog,
        params: {'projectId': Param(spec.catalogProjectId)},
        replaceRoute: true,
      ),
    ),
    ListView(
      name: 'PandoraActionsList',
      source: State(spec.actionItems),
      shrinkWrap: true,
      spacing: 10,
      itemBuilder: (item) => _panel(
        name: 'PandoraActionRow',
        onTap: Navigate(
          ff.Pages.actionBuilder,
          params: {
            'actionId': item['id'],
            'actionTitle': item['title'],
            'projectId': Param(spec.catalogProjectId),
          },
        ),
        child: Column(
          crossAxis: CrossAxis.start,
          spacing: 6,
          children: [
            Text(item['title'], style: Styles.titleMedium),
            Text(item['description'], style: Styles.bodyMedium),
            Text(item['provider'], style: Styles.labelSmall),
            Text(
              'Extra identity check required',
              style: Styles.labelMedium,
              visible: item['extraIdentityCheckRequired'],
            ),
          ],
        ),
      ),
    ),
  ],
);

DslWidget _actionBuilderBody(PandoraBindingSpec spec) => Column(
  name: 'PandoraActionBuilderBody',
  crossAxis: CrossAxis.stretch,
  spacing: 14,
  padding: const EdgeInsets.all(16),
  scrollable: true,
  children: [
    Row(
      mainAxis: MainAxis.spaceBetween,
      children: [
        Button(
          'Back',
          name: 'PandoraBuilderBackButton',
          variant: ButtonVariant.text,
          onTap: const NavigateBack(),
        ),
        _mark(40),
      ],
    ),
    Text(Param(spec.actionTitle), style: Styles.headlineSmall),
    Text('Tell Pandora what outcome you need.', style: Styles.bodyMedium),
    TextField(
      label: 'Request',
      hint: 'Describe the result in plain language',
      maxLines: 5,
      name: 'PandoraRequestField',
      onChanged: SetState(spec.requestMessage, const TextValue()),
    ),
    _panel(
      name: 'PandoraActionPlanFirstPanel',
      child: Column(
        crossAxis: CrossAxis.start,
        spacing: 5,
        children: [
          Text('How it will run', style: Styles.titleSmall),
          Text(
            'Review the request first. Pandora records it only once when you '
            'choose Prepare this action on the next screen.',
            style: Styles.bodyMedium,
          ),
        ],
      ),
    ),
    Button(
      'Review this request',
      name: 'PandoraReviewPlanButton',
      width: double.infinity,
      height: 48,
      onTap: If(
        Not(Equals(State(spec.requestMessage), '')),
        then: Navigate(
          ff.Pages.plansExecution,
          params: {
            'actionId': Param(spec.actionId),
            'projectId': Param(spec.actionProjectId),
            'requestMessage': State(spec.requestMessage),
          },
        ),
        orElse: Snackbar('Describe the result you want first.'),
      ),
    ),
  ],
);

DslWidget _approvalCenterBody(PandoraBindingSpec spec) => Column(
  name: 'PandoraApprovalCenterBody',
  crossAxis: CrossAxis.stretch,
  spacing: 14,
  padding: const EdgeInsets.all(16),
  scrollable: true,
  children: [
    _brandHeader('Approve', 'Only items that need you'),
    ..._loadingAndError(
      spec.approvalsLoading,
      spec.approvalsError,
      'Approvals',
    ),
    Button(
      'Try loading approvals again',
      name: 'PandoraApprovalsRetryButton',
      variant: ButtonVariant.outlined,
      visible: Not(Equals(State(spec.approvalsError), '')),
      onTap: Navigate(
        ff.Pages.approvalCenter,
        replaceRoute: true,
      ),
    ),
    Text(
      'Protected decisions require the extra identity check.',
      style: Styles.bodySmall,
    ),
    ListView(
      name: 'PandoraApprovalList',
      source: State(spec.approvalItems),
      shrinkWrap: true,
      spacing: 12,
      itemBuilder: (item) => _panel(
        name: 'PandoraApprovalRow',
        child: Column(
          crossAxis: CrossAxis.stretch,
          spacing: 8,
          children: [
            Text(item['whatWillHappen'], style: Styles.titleMedium),
            Text('Why Pandora needs you', style: Styles.labelMedium),
            Text(item['whyINeedYou'], style: Styles.bodyMedium),
            Text('What will change', style: Styles.labelMedium),
            Text(item['whatWillChange'], style: Styles.bodyMedium),
            Text('Risk level', style: Styles.labelMedium),
            Text(item['riskLevel'], style: Styles.titleSmall),
            Text('What could go wrong', style: Styles.labelMedium),
            Text(item['whatCouldGoWrong'], style: Styles.bodySmall),
            Text('How it can be undone', style: Styles.labelMedium),
            Text(item['howWeCanUndoIt'], style: Styles.bodySmall),
            Text(
              'Pandora has a recorded recovery path.',
              style: Styles.bodySmall,
              visible: item['reversible'],
            ),
            Column(
              crossAxis: CrossAxis.stretch,
              spacing: 8,
              children: [
                Button(
                  'Approve this change',
                  name: 'ApprovePandoraChangeButton',
                  width: double.infinity,
                  height: 48,
                  onTap: ApiCall(
                    spec.decideEndpoint,
                    outputAs: 'pandoraApproveResult',
                    params: _apiParams(spec, {
                      'approvalId': item['id'],
                      'decision': 'approve',
                      'reason': '',
                    }),
                    onSuccess: (_) => [
                      Snackbar('Approval recorded.'),
                      Navigate(
                        ff.Pages.approvalCenter,
                        replaceRoute: true,
                      ),
                    ],
                    onFailure: [
                      Snackbar(
                        'Complete the extra identity check, then try again.',
                      ),
                    ],
                  ),
                ),
                Button(
                  'Reject this change',
                  name: 'RejectPandoraChangeButton',
                  width: double.infinity,
                  height: 48,
                  variant: ButtonVariant.outlined,
                  onTap: ApiCall(
                    spec.decideEndpoint,
                    outputAs: 'pandoraRejectResult',
                    params: _apiParams(spec, {
                      'approvalId': item['id'],
                      'decision': 'reject',
                      'reason': '',
                    }),
                    onSuccess: (_) => [
                      Snackbar('Rejection recorded.'),
                      Navigate(
                        ff.Pages.approvalCenter,
                        replaceRoute: true,
                      ),
                    ],
                    onFailure: [
                      Snackbar(
                        'Complete the extra identity check, then try again.',
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  ],
);

DslWidget _plansExecutionBody(PandoraBindingSpec spec) => Column(
  name: 'PandoraPlansExecutionBody',
  crossAxis: CrossAxis.stretch,
  spacing: 14,
  padding: const EdgeInsets.all(16),
  scrollable: true,
  children: [
    Row(
      mainAxis: MainAxis.spaceBetween,
      children: [
        Button(
          'Back',
          name: 'PandoraPlansBackButton',
          variant: ButtonVariant.text,
          onTap: const NavigateBack(),
        ),
        Text('Action plan', style: Styles.titleLarge),
      ],
    ),
    _panel(
      name: 'PandoraPlanSummary',
      child: Column(
        crossAxis: CrossAxis.start,
        spacing: 6,
        children: [
          Text('Action', style: Styles.labelMedium),
          Text(Param(spec.planActionId), style: Styles.titleMedium),
          Text('Project', style: Styles.labelMedium),
          Text(Param(spec.planProjectId), style: Styles.bodyMedium),
          Text('Requested outcome', style: Styles.labelMedium),
          Text(Param(spec.planRequestMessage), style: Styles.bodyMedium),
        ],
      ),
    ),
    Text(
      'Pandora plans first. The backend still enforces approval and the extra '
      'identity check before protected changes.',
      style: Styles.bodyMedium,
    ),
    Button(
      'Prepare this action',
      name: 'PandoraRunActionButton',
      width: double.infinity,
      height: 48,
      visible: Not(State(spec.runSubmitting)),
      onTap: [
        SetState(spec.runSubmitting, true),
        SetState(spec.runError, ''),
        ApiCall(
          spec.runEndpoint,
          outputAs: 'pandoraRunPageResult',
          params: _apiParams(spec, {
            'actionId': Param(spec.planActionId),
            'projectId': Param(spec.planProjectId),
            'message': Param(spec.planRequestMessage),
          }),
          onSuccess: (result) => [
            SetState(spec.runResponse, result),
            SetState(spec.runSubmitting, false),
          ],
          onFailure: [
            SetState(spec.runSubmitting, false),
            SetState(
              spec.runError,
              'This action needs another check before it can continue.',
            ),
          ],
        ),
      ],
    ),
    ProgressBar.circular(
      name: 'PandoraRunProgress',
      visible: State(spec.runSubmitting),
    ),
    Text(
      State(spec.runError),
      style: Styles.bodyMedium,
      visible: Not(Equals(State(spec.runError), '')),
    ),
    _panel(
      name: 'PandoraRunResponsePanel',
      child: Text(
        State(spec.runResponse)['reply'],
        style: Styles.bodyMedium,
      ),
    ),
  ],
);

DslWidget _activityBody(PandoraBindingSpec spec) => Column(
  name: 'PandoraActivityBody',
  crossAxis: CrossAxis.stretch,
  spacing: 14,
  padding: const EdgeInsets.all(16),
  scrollable: true,
  children: [
    _brandHeader('Memory & updates', 'Continue from verified records'),
    Text('What Pandora remembers', style: Styles.titleLarge),
    TextField(
      label: 'Search Memory',
      hint: 'Why did we make this decision?',
      maxLines: 2,
      name: 'PandoraMemorySearchField',
      onChanged: SetState(spec.memoryQuery, const TextValue()),
      onSubmitted: _searchMemory(
        spec,
        outputAs: 'pandoraMemoryKeyboardResult',
      ),
    ),
    Button(
      'Search verified records',
      name: 'PandoraMemorySearchButton',
      width: double.infinity,
      height: 48,
      visible: Not(State(spec.memoryLoading)),
      onTap: _searchMemory(
        spec,
        outputAs: 'pandoraMemoryButtonResult',
      ),
    ),
    ProgressBar.circular(
      name: 'PandoraMemoryLoading',
      visible: State(spec.memoryLoading),
    ),
    Text(
      State(spec.memoryError),
      name: 'PandoraMemoryError',
      style: Styles.bodyMedium,
      visible: Not(Equals(State(spec.memoryError), '')),
    ),
    _panel(
      name: 'PandoraMemorySourcePanel',
      child: Column(
        crossAxis: CrossAxis.start,
        spacing: 4,
        children: [
          Text('Showing', style: Styles.labelMedium),
          Text(
            State(spec.memoryData)['plainSource'],
            style: Styles.bodyMedium,
          ),
          Text('Direct Memory connection', style: Styles.labelMedium),
          Text(
            State(spec.memoryData)['directMemoryStatus'],
            style: Styles.bodySmall,
          ),
        ],
      ),
    ),
    ListView(
      name: 'PandoraMemoryResultsList',
      source: State(spec.memoryData)['items'],
      shrinkWrap: true,
      spacing: 8,
      itemBuilder: (item) => _panel(
        name: 'PandoraMemoryResultRow',
        child: Column(
          crossAxis: CrossAxis.start,
          spacing: 4,
          children: [
            Text(item['kind'], style: Styles.labelMedium),
            Text(item['title'], style: Styles.titleSmall),
            Text(item['summary'], style: Styles.bodyMedium),
            Text(item['plainStatus'], style: Styles.bodySmall),
            Text(item['happenedAt'], style: Styles.bodySmall),
          ],
        ),
      ),
    ),
    Divider(),
    Text('Recent verified updates', style: Styles.titleLarge),
    ..._loadingAndError(
      spec.activityLoading,
      spec.activityError,
      'Activity',
    ),
    Button(
      'Try loading updates again',
      name: 'PandoraActivityRetryButton',
      variant: ButtonVariant.outlined,
      visible: Not(Equals(State(spec.activityError), '')),
      onTap: Navigate(
        ff.Pages.activityAuditTrail,
        replaceRoute: true,
      ),
    ),
    ListView(
      name: 'PandoraActivityList',
      source: State(spec.activityItems),
      shrinkWrap: true,
      spacing: 10,
      itemBuilder: (item) => _panel(
        name: 'PandoraActivityRow',
        child: Column(
          crossAxis: CrossAxis.start,
          spacing: 4,
          children: [
            Text(item['summary'], style: Styles.titleSmall),
            Text(item['happenedAt'], style: Styles.bodySmall),
          ],
        ),
      ),
    ),
  ],
);

List<DslAction> _searchMemory(
  PandoraBindingSpec spec, {
  required String outputAs,
}) => [
  SetState(spec.memoryLoading, true),
  SetState(spec.memoryError, ''),
  ApiCall(
    spec.memoryEndpoint,
    outputAs: outputAs,
    params: _apiParams(spec, {
      'query': State(spec.memoryQuery),
      'projectId': '',
    }),
    onSuccess: (result) => [
      SetState(spec.memoryData, result),
      SetState(spec.memoryLoading, false),
    ],
    onFailure: [
      SetState(spec.memoryLoading, false),
      SetState(
        spec.memoryError,
        'Pandora could not search verified records right now.',
      ),
    ],
  ),
];

DslWidget _securityBody(PandoraBindingSpec spec) => Column(
  name: 'PandoraSecurityBody',
  crossAxis: CrossAxis.stretch,
  spacing: 14,
  padding: const EdgeInsets.all(16),
  scrollable: true,
  children: [
    _brandHeader('Safety', 'Protection and connections'),
    ..._loadingAndError(spec.safetyLoading, spec.safetyError, 'Safety'),
    _panel(
      name: 'PandoraSafetyStatusPanel',
      child: Column(
        crossAxis: CrossAxis.start,
        spacing: 6,
        children: [
          Text('CURRENT SAFETY', style: Styles.labelMedium),
          Text(
            State(spec.safetyData)['plainStatus'],
            style: Styles.titleLarge,
          ),
          Text(
            'Extra identity check required for protected approvals',
            style: Styles.bodySmall,
            visible: State(spec.safetyData)['mfaRequiredForApproval'],
          ),
        ],
      ),
    ),
    Text('Connections', style: Styles.titleLarge),
    Button(
      'Refresh safety and connection status',
      name: 'PandoraRefreshConnectionsButton',
      variant: ButtonVariant.outlined,
      onTap: [
        SetState(spec.safetyLoading, true),
        SetState(spec.safetyError, ''),
        ApiCall(
          spec.safetyEndpoint,
          outputAs: 'pandoraSafetyRefreshResult',
          params: _apiParams(spec, const {}),
          onSuccess: (safetyResult) => [
            SetState(spec.safetyData, safetyResult),
            ApiCall(
              spec.connectionsEndpoint,
              outputAs: 'pandoraConnectionsRefreshResult',
              params: _apiParams(spec, const {}),
              onSuccess: (connectionsResult) => [
                SetState(spec.connectionItems, connectionsResult),
                SetState(spec.safetyLoading, false),
              ],
              onFailure: [
                SetState(spec.safetyLoading, false),
                SetState(
                  spec.safetyError,
                  'Pandora could not refresh connection status. Try again in a moment.',
                ),
              ],
            ),
          ],
          onFailure: [
            SetState(spec.safetyLoading, false),
            SetState(
              spec.safetyError,
              'Pandora could not refresh safety status. Try again in a moment.',
            ),
          ],
        ),
      ],
    ),
    ListView(
      name: 'PandoraConnectionsList',
      source: State(spec.connectionItems),
      shrinkWrap: true,
      spacing: 10,
      itemBuilder: (item) => _panel(
        name: 'PandoraConnectionRow',
        child: Column(
          crossAxis: CrossAxis.start,
          spacing: 4,
          children: [
            Text(item['name'], style: Styles.titleMedium),
            Text(item['plainPurpose'], style: Styles.bodyMedium),
            Text(item['plainStatus'], style: Styles.labelMedium),
            Text(item['lastCheckedAt'], style: Styles.bodySmall),
            Expandable(
              name: 'PandoraConnectionDetails',
              header: Text('View details', style: Styles.labelMedium),
              collapsed: Text(''),
              expanded: Column(
                crossAxis: CrossAxis.start,
                spacing: 4,
                children: [
                  Text(
                    'Read access is ready.',
                    style: Styles.bodySmall,
                    visible: item['canRead'],
                  ),
                  Text(
                    'Change access is available, but owner approval still applies.',
                    style: Styles.bodySmall,
                    visible: item['canChange'],
                  ),
                  Text(
                    'Connection changes are planned first and never happen from a single tap.',
                    style: Styles.bodySmall,
                  ),
                ],
              ),
            ),
            Button(
              'Continue setup',
              name: 'PandoraConnectButton',
              width: double.infinity,
              height: 48,
              visible: item['canConnect'],
              onTap: _requestConnectionAction(
                spec,
                connectionId: item['id'],
                action: 'connect',
                outputAs: 'pandoraConnectRequestResult',
                successMessage: 'Pandora saved the connection setup request.',
              ),
            ),
            Button(
              'Reconnect',
              name: 'PandoraReconnectButton',
              width: double.infinity,
              height: 48,
              visible: item['canReconnect'],
              onTap: _requestConnectionAction(
                spec,
                connectionId: item['id'],
                action: 'reconnect',
                outputAs: 'pandoraReconnectRequestResult',
                successMessage: 'Pandora saved the reconnect request.',
              ),
            ),
            Button(
              'Check connection',
              name: 'PandoraTestConnectionButton',
              width: double.infinity,
              height: 48,
              variant: ButtonVariant.outlined,
              visible: item['canTest'],
              onTap: _requestConnectionAction(
                spec,
                connectionId: item['id'],
                action: 'test',
                outputAs: 'pandoraTestConnectionResult',
                successMessage: 'Pandora saved the connection check.',
              ),
            ),
            Button(
              'Request disconnect',
              name: 'PandoraDisconnectButton',
              width: double.infinity,
              height: 48,
              variant: ButtonVariant.outlined,
              visible: item['canDisconnect'],
              onTap: _requestConnectionAction(
                spec,
                connectionId: item['id'],
                action: 'disconnect',
                outputAs: 'pandoraDisconnectRequestResult',
                successMessage: 'Pandora saved the disconnect request.',
              ),
            ),
          ],
        ),
      ),
    ),
    _panel(
      name: 'PandoraAuditIntegrityPanel',
      child: Column(
        crossAxis: CrossAxis.start,
        spacing: 4,
        children: [
          Text('Audit integrity', style: Styles.titleMedium),
          Text(
            'Pandora checks the audit chain on the governed backend.',
            style: Styles.bodyMedium,
          ),
          Text(
            'Technical hashes stay hidden in simple mode.',
            style: Styles.bodySmall,
          ),
        ],
      ),
    ),
    Text('Appearance', style: Styles.titleLarge),
    Column(
      crossAxis: CrossAxis.stretch,
      spacing: 8,
      children: [
        Button(
          'Use device setting',
          name: 'PandoraThemeSystemButton',
          width: double.infinity,
          height: 48,
          variant: ButtonVariant.outlined,
          onTap: const SetDarkMode(DarkModePreference.system),
        ),
        Button(
          'Light',
          name: 'PandoraThemeLightButton',
          width: double.infinity,
          height: 48,
          variant: ButtonVariant.outlined,
          onTap: const SetDarkMode(DarkModePreference.light),
        ),
        Button(
          'Dark',
          name: 'PandoraThemeDarkButton',
          width: double.infinity,
          height: 48,
          variant: ButtonVariant.outlined,
          onTap: const SetDarkMode(DarkModePreference.dark),
        ),
      ],
    ),
    _panel(
      name: 'PandoraAboutPanel',
      child: Row(
        spacing: 12,
        children: [
          _mark(48),
          Expanded(
            Column(
              crossAxis: CrossAxis.start,
              spacing: 3,
              children: [
                Text('Pandora\'s Box', style: Styles.titleMedium),
                Text('Banatao Systems', style: Styles.bodySmall),
                Text(
                  'Protected owner control center',
                  style: Styles.bodySmall,
                ),
              ],
            ),
          ),
        ],
      ),
    ),
    Button(
      'Sign out',
      name: 'PandoraSignOutButton',
      variant: ButtonVariant.outlined,
      onTap: const [Logout()],
    ),
  ],
);

List<DslAction> _requestConnectionAction(
  PandoraBindingSpec spec, {
  required Object connectionId,
  required String action,
  required String outputAs,
  required String successMessage,
}) => [
  ApiCall(
    spec.connectionActionEndpoint,
    outputAs: outputAs,
    params: _apiParams(spec, {
      'connectionId': connectionId,
      'connectionAction': action,
    }),
    onSuccess: (_) => [Snackbar(successMessage)],
    onFailure: [
      Snackbar(
        action == 'test'
            ? 'Pandora could not request that check. Try again in a moment.'
            : 'Complete the extra identity check, then try again.',
      ),
    ],
  ),
];

List<DslWidget> _loadingAndError(
  ProjectStateFieldHandle loading,
  ProjectStateFieldHandle error,
  String prefix,
) => [
  ProgressBar.circular(
    name: 'Pandora${prefix}Loading',
    visible: State(loading),
  ),
  Text(
    State(error),
    name: 'Pandora${prefix}Error',
    style: Styles.bodyMedium,
    visible: Not(Equals(State(error), '')),
  ),
];

DslWidget _brandHeader(String title, String subtitle) => Column(
  crossAxis: CrossAxis.start,
  spacing: 6,
  children: [
    Row(
      spacing: 10,
      children: [
        _mark(42),
        Flexible(
          Text(
            title,
            style: Styles.titleLarge,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    ),
    Text(subtitle, style: Styles.bodySmall, maxLines: 2),
  ],
);

DslWidget _mark(double size) => Tooltip(
  message: 'Pandora\'s Box',
  child: Image(
    approvedPandoraProductMark,
    isNetwork: true,
    fit: ImageFit.contain,
    width: size,
    height: size,
    cached: true,
  ),
);

DslWidget _metric(Object label, Object value, String name) => _panel(
  name: name,
  width: 136,
  child: Column(
    crossAxis: CrossAxis.start,
    spacing: 4,
    children: [
      Text(label, style: Styles.labelSmall),
      Text(value, style: Styles.titleLarge),
    ],
  ),
);

DslWidget _panel({
  required String name,
  required DslWidget child,
  Object? onTap,
  double? width,
}) => Container(
  name: name,
  padding: const EdgeInsets.all(14),
  borderRadius: 12,
  color: Colors.secondaryBackground,
  width: width,
  onTap: onTap,
  child: child,
);

Map<String, Object?> _apiParams(
  PandoraBindingSpec spec,
  Map<String, Object?> extra,
) => {
  'accessToken': const AuthUser(AuthUserField.jwtToken),
  'organizationId': AppState(spec.organizationId),
  ...extra,
};
