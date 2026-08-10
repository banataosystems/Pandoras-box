library;

import 'dart:io';

import 'package:flutterflow_ai/flutterflow_ai.dart';
import 'package:pandora_flutterflow_ai/flutterflow_project.dart' as ff;

const String _projectId = 'pandoras-box-gj9hnb';
const String _mfaActionName = 'ensurePandoraAal2';

Future<void> main(List<String> args) async {
  final options = _CliOptions.parse(args);
  final targetProjectId = options.projectId ?? _projectId;
  if (targetProjectId != _projectId) {
    stderr.writeln(
      'Refusing to edit "$targetProjectId"; this DSL is pinned to "$_projectId".',
    );
    exit(64);
  }

  await flutterFlowAI(
    buildPandoraMfaUiGates,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    projectId: targetProjectId,
    dryRun: options.dryRun,
    commitMessage: options.commitMessage,
  );
}

/// Pass 3b: bind the custom action created by pass 3a and gate every current
/// frontend entry point for approval decisions and protected catalog runs.
///
/// The governed owner API and database remain the security boundary. These UI
/// gates provide the recoverable in-app TOTP step-up and prevent an avoidable
/// failing API call when the current JWT is still AAL1.
void buildPandoraMfaUiGates(App app) {
  final CustomActionTarget ensureAal2 = app.existingCustomAction(
    _generatedMfaActionName(),
    returns: bool_,
  );

  app.editPage(ff.Pages.approvalCenter, (page) {
    page.ensureActions(
      page.find(
        ff.Pages.approvalCenter.widgets
            .byText('ApprovePandoraChangeButton')
            .single,
      ),
      triggerType: FFActionTriggerType.ON_TAP,
      actions: _approvalDecisionActions(
        ensureAal2,
        decision: 'approve',
        mfaOutputName: 'pandoraApproveMfaResult',
        decisionOutputName: 'pandoraProtectedApproveResult',
        successMessage: 'Approval recorded.',
      ),
    );
    page.ensureActions(
      page.find(
        ff.Pages.approvalCenter.widgets
            .byText('RejectPandoraChangeButton')
            .single,
      ),
      triggerType: FFActionTriggerType.ON_TAP,
      actions: _approvalDecisionActions(
        ensureAal2,
        decision: 'reject',
        mfaOutputName: 'pandoraRejectMfaResult',
        decisionOutputName: 'pandoraProtectedRejectResult',
        successMessage: 'Rejection recorded.',
      ),
    );
  });

  app.editPage(ff.Pages.plansExecution, (page) {
    const runResult = ActionOutput('pandoraProtectedRunResult');
    final runReply = runResult['reply'];
    page.ensureActions(
      page.find(
        ff.Pages.plansExecution.widgets
            .byText('PandoraRunActionButton')
            .single,
      ),
      triggerType: FFActionTriggerType.ON_TAP,
      actions: [
        _callEnsureAal2(
          ensureAal2,
          outputAs: 'pandoraRunMfaResult',
        ),
        If(
          const ActionOutput('pandoraRunMfaResult'),
          then: [
            SetState(
              ff.Pages.plansExecution.state.runIsSubmitting,
              true,
            ),
            SetState(ff.Pages.plansExecution.state.runError, ''),
            ExecuteActionBlock(
              _runActionBlockTarget(),
              params: {
                'actionId': Param(
                  ff.Pages.plansExecution.params.actionId,
                ),
                'projectId': Param(
                  ff.Pages.plansExecution.params.projectId,
                ),
              },
              outputAs: 'pandoraProtectedRunResult',
              shouldSetState: true,
            ),
            SetState(
              ff.Pages.plansExecution.state.runIsSubmitting,
              false,
            ),
            If(
              Not(Equals(runReply, null)),
              then: [
                If(
                  Not(Equals(runReply, '')),
                  then: [
                    SetState(
                      ff.Pages.plansExecution.state.runResponse,
                      runResult,
                    ),
                    Snackbar('Protected action prepared.'),
                  ],
                  orElse: _runPreparationFailureActions(),
                ),
              ],
              orElse: _runPreparationFailureActions(),
            ),
          ],
          orElse: [
            SetState(
              ff.Pages.plansExecution.state.runIsSubmitting,
              false,
            ),
            SetState(
              ff.Pages.plansExecution.state.runError,
              'Identity check not completed. No protected action was started.',
            ),
            Snackbar('Identity check not completed.'),
          ],
        ),
      ],
    );
  });

  app.editPage(ff.Pages.securityOperations, (page) {
    page.ensureInsertedAfter(
      page.find(
        ff.Pages.securityOperations.widgets
            .byText('PandoraSafetyStatusPanel')
            .single,
      ),
      Button(
        'Verify identity now',
        name: 'PandoraMfaVerifyButton',
        variant: ButtonVariant.outlined,
        width: double.infinity,
        onTap: [
          _callEnsureAal2(
            ensureAal2,
            outputAs: 'pandoraSecurityMfaResult',
          ),
          If(
            const ActionOutput('pandoraSecurityMfaResult'),
            then: Snackbar('Identity verified for protected work.'),
            orElse: Snackbar('Identity check not completed.'),
          ),
        ],
      ),
    );
  });
}

List<DslAction> _approvalDecisionActions(
  CustomActionTarget ensureAal2, {
  required String decision,
  required String mfaOutputName,
  required String decisionOutputName,
  required String successMessage,
}) {
  final item = const ItemRef();
  return [
    _callEnsureAal2(ensureAal2, outputAs: mfaOutputName),
    If(
      ActionOutput(mfaOutputName),
      then: [
        ExecuteActionBlock(
          _decisionActionBlockTarget(),
          params: {
            'approvalId': item['id'],
            'decision': decision,
            'reason': '',
          },
          outputAs: decisionOutputName,
          shouldSetState: true,
        ),
        If(
          ActionOutput(decisionOutputName)['ok'],
          then: [
            SetState.removeAtIndex(
              ff.Pages.approvalCenter.state.approvalItems,
              item.index,
            ),
            Snackbar(successMessage),
          ],
          orElse: Snackbar('Decision was not recorded. Try again safely.'),
        ),
      ],
      orElse: Snackbar('Identity check not completed. Decision not sent.'),
    ),
  ];
}

CallCustomAction _callEnsureAal2(
  CustomActionTarget ensureAal2, {
  required String outputAs,
}) => CallCustomAction(ensureAal2, outputAs: outputAs);

List<DslAction> _runPreparationFailureActions() => [
  SetState(
    ff.Pages.plansExecution.state.runError,
    'Pandora did not prepare this action. Try again safely.',
  ),
  Snackbar('Protected action was not prepared.'),
];

/// SDK 0.0.40 emits action-block names as generated string constants. Adding
/// the generated return schema to the named lookup keeps subsequent
/// `ActionOutput(...)[field]` expressions typed in the same action chain.
ActionBlockHandle _runActionBlockTarget() => ActionBlockHandle(
  name: ff.ActionBlocks.pandoraRunCatalogAction,
  key: '',
  scope: ActionBlockLookupScope.app,
  params: const <String, DslType>{},
  returnType: ff.Structs.pandoraAskResponse,
  returnName: null,
  isNamedLookup: true,
);

ActionBlockHandle _decisionActionBlockTarget() => ActionBlockHandle(
  name: ff.ActionBlocks.pandoraDecideApproval,
  key: '',
  scope: ActionBlockLookupScope.app,
  params: const <String, DslType>{},
  returnType: ff.Structs.pandoraApprovalDecision,
  returnName: null,
  isNamedLookup: true,
);

String _generatedMfaActionName() {
  final matches = ff.CustomCode.actions
      .where((name) => name == _mfaActionName)
      .toList(growable: false);
  if (matches.length != 1) {
    throw StateError(
      'The refreshed typed SDK must contain exactly one $_mfaActionName '
      'custom action. Run pass 3a, then refresh FlutterFlow context before '
      'validating this UI pass.',
    );
  }
  return matches.single;
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
