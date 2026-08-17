import 'package:supabase_flutter/supabase_flutter.dart';

class PandoraAuthFailure implements Exception {
  const PandoraAuthFailure(this.message);

  final String message;

  @override
  String toString() => message;
}

class PandoraSession {
  const PandoraSession({required this.userId});

  final String userId;
}

abstract interface class PandoraAuth {
  PandoraSession? get currentSession;

  Stream<PandoraSession?> get changes;

  Future<void> signIn({required String email, required String password});

  Future<void> requestPasswordReset(String email);

  Future<void> signOut();
}

class SupabasePandoraAuth implements PandoraAuth {
  SupabasePandoraAuth(this._client);

  final SupabaseClient _client;

  @override
  PandoraSession? get currentSession {
    final session = _client.auth.currentSession;
    return session == null ? null : PandoraSession(userId: session.user.id);
  }

  @override
  Stream<PandoraSession?> get changes => _client.auth.onAuthStateChange.map(
        (event) => event.session == null
            ? null
            : PandoraSession(userId: event.session!.user.id),
      );

  @override
  Future<void> signIn({required String email, required String password}) async {
    try {
      await _client.auth.signInWithPassword(email: email, password: password);
    } on AuthException catch (error) {
      throw PandoraAuthFailure(error.message);
    } catch (_) {
      throw const PandoraAuthFailure('Pandora could not sign you in.');
    }
  }

  @override
  Future<void> requestPasswordReset(String email) async {
    try {
      await _client.auth.resetPasswordForEmail(email);
    } on AuthException catch (error) {
      throw PandoraAuthFailure(error.message);
    } catch (_) {
      throw const PandoraAuthFailure(
        'Pandora could not request a password reset.',
      );
    }
  }

  @override
  Future<void> signOut() async {
    try {
      await _client.auth.signOut();
    } catch (_) {
      throw const PandoraAuthFailure('Pandora could not sign out safely.');
    }
  }
}
