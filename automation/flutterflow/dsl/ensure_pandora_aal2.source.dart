import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Performs a fail-closed Supabase TOTP step-up for protected Pandora work.
///
/// This action intentionally supports already-enrolled, verified TOTP factors
/// only. It never enrolls, unenrolls, prints, persists, or returns a one-time
/// code or factor identifier. A successful result means the current Supabase
/// session was refreshed and then observed at AAL2.
Future<bool> ensurePandoraAal2(BuildContext context) async {
  final client = Supabase.instance.client;
  if (client.auth.currentSession == null) {
    await _showPandoraMfaNotice(
      context,
      title: 'Sign in required',
      message: 'Sign in again before starting protected work.',
    );
    return false;
  }

  try {
    // Refresh first so both the current AAL and the enrolled-factor snapshot
    // come from the active server session rather than a stale local JWT.
    await client.auth.refreshSession();
    if (client.auth.currentSession == null) {
      throw StateError('Supabase returned no active session after refresh.');
    }
    if (!context.mounted) {
      return false;
    }

    if (_pandoraSessionIsAal2(client)) {
      return true;
    }

    final assurance = client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.nextLevel != AuthenticatorAssuranceLevel.aal2) {
      await _showPandoraMfaNotice(
        context,
        title: 'Authenticator required',
        message:
            'No verified authenticator is available for this account. '
            'Ask an administrator to complete MFA enrollment first.',
      );
      return false;
    }

    final factorOptions = <_PandoraTotpFactor>[];
    final factors = await client.auth.mfa.listFactors();
    if (!context.mounted) {
      return false;
    }
    for (var index = 0; index < factors.totp.length; index += 1) {
      final factor = factors.totp[index];
      final friendlyName = factor.friendlyName?.trim();
      factorOptions.add(
        _PandoraTotpFactor(
          id: factor.id,
          label: friendlyName == null || friendlyName.isEmpty
              ? 'Authenticator ${index + 1}'
              : friendlyName,
        ),
      );
    }

    if (factorOptions.isEmpty) {
      await _showPandoraMfaNotice(
        context,
        title: 'Authenticator required',
        message:
            'This account has no verified authenticator app. '
            'Ask an administrator to complete MFA enrollment first.',
      );
      return false;
    }

    return await _showPandoraTotpChallenge(
          context,
          client: client,
          factors: factorOptions,
        ) ??
        false;
  } on AuthException {
    if (!context.mounted) {
      return false;
    }
    await _showPandoraMfaNotice(
      context,
      title: 'Identity check unavailable',
      message:
          'Pandora could not refresh the protected session. '
          'Check the connection and try again.',
    );
    return false;
  } catch (_) {
    if (!context.mounted) {
      return false;
    }
    await _showPandoraMfaNotice(
      context,
      title: 'Identity check unavailable',
      message:
          'Pandora could not verify this session safely. '
          'No protected action was started.',
    );
    return false;
  }
}

bool _pandoraSessionIsAal2(SupabaseClient client) {
  final assurance = client.auth.mfa.getAuthenticatorAssuranceLevel();
  return assurance.currentLevel == AuthenticatorAssuranceLevel.aal2;
}

Future<bool?> _showPandoraTotpChallenge(
  BuildContext context, {
  required SupabaseClient client,
  required List<_PandoraTotpFactor> factors,
}) async {
  final codeController = TextEditingController();
  var selectedFactorId = factors.first.id;
  var verifying = false;
  String? errorMessage;

  try {
    return await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setModalState) => AlertDialog(
          scrollable: true,
          title: const Text('Verify your identity'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Open your authenticator app and enter its current code. '
                'Pandora will continue only after Supabase confirms AAL2.',
              ),
              if (factors.length > 1) ...[
                const SizedBox(height: 16),
                InputDecorator(
                  decoration: const InputDecoration(
                    labelText: 'Authenticator',
                    border: OutlineInputBorder(),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: selectedFactorId,
                      isExpanded: true,
                      items: [
                        for (final factor in factors)
                          DropdownMenuItem<String>(
                            value: factor.id,
                            child: Text(factor.label),
                          ),
                      ],
                      onChanged: verifying
                          ? null
                          : (value) {
                              if (value != null) {
                                setModalState(
                                  () => selectedFactorId = value,
                                );
                              }
                            },
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              TextField(
                controller: codeController,
                enabled: !verifying,
                autofocus: true,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.oneTimeCode],
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(6),
                ],
                maxLength: 6,
                obscureText: true,
                obscuringCharacter: '•',
                decoration: InputDecoration(
                  labelText: 'Authenticator code',
                  hintText: '6-digit code',
                  counterText: '',
                  errorText: errorMessage,
                  border: const OutlineInputBorder(),
                ),
                onSubmitted: verifying
                    ? null
                    : (_) async {
                        await _submitPandoraTotp(
                          dialogContext,
                          client: client,
                          factorId: selectedFactorId,
                          codeController: codeController,
                          setModalState: setModalState,
                          setVerifying: (value) => verifying = value,
                          setError: (value) => errorMessage = value,
                        );
                      },
              ),
              if (verifying) ...[
                const SizedBox(height: 16),
                const LinearProgressIndicator(),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: verifying
                  ? null
                  : () => Navigator.of(dialogContext).pop(false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: verifying
                  ? null
                  : () async {
                      await _submitPandoraTotp(
                        dialogContext,
                        client: client,
                        factorId: selectedFactorId,
                        codeController: codeController,
                        setModalState: setModalState,
                        setVerifying: (value) => verifying = value,
                        setError: (value) => errorMessage = value,
                      );
                    },
              child: const Text('Verify and continue'),
            ),
          ],
        ),
      ),
    );
  } finally {
    codeController.dispose();
  }
}

Future<void> _submitPandoraTotp(
  BuildContext dialogContext, {
  required SupabaseClient client,
  required String factorId,
  required TextEditingController codeController,
  required StateSetter setModalState,
  required ValueChanged<bool> setVerifying,
  required ValueChanged<String?> setError,
}) async {
  final code = codeController.text.trim();
  if (!RegExp(r'^\d{6}$').hasMatch(code)) {
    setModalState(() {
      setError('Enter the current numeric code from your authenticator app.');
    });
    return;
  }

  setModalState(() {
    setVerifying(true);
    setError(null);
  });

  try {
    await client.auth.mfa.challengeAndVerify(
      factorId: factorId,
      code: code,
    );

    // challengeAndVerify updates the local session. An explicit refresh makes
    // the JWT used by the immediately-following protected API call current and
    // lets us fail closed if the server does not retain AAL2.
    await client.auth.refreshSession();
    if (!_pandoraSessionIsAal2(client)) {
      throw StateError('Supabase session was not upgraded to AAL2.');
    }
    if (!dialogContext.mounted) {
      return;
    }

    if (Navigator.of(dialogContext).canPop()) {
      Navigator.of(dialogContext).pop(true);
    }
  } on AuthException {
    if (!dialogContext.mounted) {
      return;
    }
    codeController.clear();
    setModalState(() {
      setVerifying(false);
      setError(
        'That code was not accepted. Use the newest code and try again.',
      );
    });
  } catch (_) {
    if (!dialogContext.mounted) {
      return;
    }
    codeController.clear();
    setModalState(() {
      setVerifying(false);
      setError(
        'Pandora could not confirm AAL2. No protected action was started.',
      );
    });
  }
}

Future<void> _showPandoraMfaNotice(
  BuildContext context, {
  required String title,
  required String message,
}) => showDialog<void>(
  context: context,
  builder: (dialogContext) => AlertDialog(
    title: Text(title),
    content: Text(message),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(dialogContext).pop(),
        child: const Text('OK'),
      ),
    ],
  ),
);

class _PandoraTotpFactor {
  const _PandoraTotpFactor({required this.id, required this.label});

  final String id;
  final String label;
}
