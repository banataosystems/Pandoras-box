import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/pandora_dependencies.dart';
import '../../app/pandora_shell.dart';
import '../../core/security/pandora_auth.dart';
import 'sign_in_screen.dart';

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  StreamSubscription<PandoraSession?>? _subscription;
  PandoraAuth? _auth;
  String? _sessionUserId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final dependencies = PandoraDependencies.of(context);
    final auth = dependencies.auth;
    if (identical(auth, _auth)) return;
    _subscription?.cancel();
    _auth = auth;
    _sessionUserId = auth.currentSession?.userId;
    _subscription = auth.changes.listen(
      (session) {
        if (session?.userId != _sessionUserId) {
          dependencies.repository.clearReadOnlyCache();
          dependencies.diagnostics.clear();
          _sessionUserId = session?.userId;
        }
        if (mounted) setState(() {});
      },
      onError: (_) {
        if (mounted) setState(() {});
      },
    );
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _auth?.currentSession == null
      ? const SignInScreen()
      : const PandoraShell();
}
