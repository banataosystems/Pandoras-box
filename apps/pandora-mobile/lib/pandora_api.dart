import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import 'pandora_config.dart';

class PandoraApiException implements Exception {
  PandoraApiException(this.message, {this.statusCode, this.body});
  final String message;
  final int? statusCode;
  final Object? body;

  @override
  String toString() => message;
}

class PandoraApi {
  PandoraApi({http.Client? client}) : _client = client ?? http.Client();
  final http.Client _client;

  String get _base =>
      PandoraConfig.ownerApiBaseUrl.replaceFirst(RegExp(r'/+$'), '');

  Future<Map<String, String>> _headers({
    bool jsonBody = false,
    String? idempotencyKey,
  }) async {
    final session = Supabase.instance.client.auth.currentSession;
    final token = session?.accessToken;
    if (token == null || token.isEmpty) {
      throw PandoraApiException('Your Pandora session has expired. Sign in again.');
    }
    return <String, String>{
      'Accept': 'application/json',
      'Authorization': 'Bearer $token',
      if (PandoraConfig.organizationId.trim().isNotEmpty)
        'X-Organization-Id': PandoraConfig.organizationId.trim(),
      if (idempotencyKey != null && idempotencyKey.trim().isNotEmpty)
        'Idempotency-Key': idempotencyKey.trim(),
      if (jsonBody) 'Content-Type': 'application/json',
    };
  }

  Future<dynamic> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    String? idempotencyKey,
  }) async {
    final uri = Uri.parse('$_base$path');
    final headers = await _headers(
      jsonBody: body != null,
      idempotencyKey: idempotencyKey,
    );
    late final http.Response response;
    if (method == 'GET') {
      response = await _client.get(uri, headers: headers);
    } else if (method == 'POST') {
      response = await _client.post(
        uri,
        headers: headers,
        body: jsonEncode(body ?? const <String, dynamic>{}),
      );
    } else {
      throw ArgumentError.value(method, 'method', 'Unsupported method');
    }

    dynamic decoded;
    if (response.body.trim().isNotEmpty) {
      try {
        decoded = jsonDecode(response.body);
      } catch (_) {
        decoded = response.body;
      }
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = _extractMessage(decoded) ??
          'Pandora returned HTTP ${response.statusCode}.';
      throw PandoraApiException(
        message,
        statusCode: response.statusCode,
        body: decoded,
      );
    }
    return decoded;
  }

  String? _extractMessage(dynamic body) {
    if (body is Map) {
      for (final key in const ['message', 'error', 'detail']) {
        final value = body[key];
        if (value is String && value.trim().isNotEmpty) return value.trim();
      }
    }
    return null;
  }

  Future<dynamic> home() => _request('GET', '/home');
  Future<dynamic> projects() => _request('GET', '/projects');
  Future<dynamic> project(String id) =>
      _request('GET', '/projects/${Uri.encodeComponent(id)}');
  Future<dynamic> connections() => _request('GET', '/connections');
  Future<dynamic> approvals() => _request('GET', '/approvals?limit=50');
  Future<dynamic> activity() => _request('GET', '/activity?limit=50');
  Future<dynamic> safety() => _request('GET', '/safety');
  Future<dynamic> actions() => _request('GET', '/actions');

  Future<dynamic> ask({
    required String message,
    String? projectId,
    String? idempotencyKey,
  }) =>
      _request(
        'POST',
        '/ask',
        body: <String, dynamic>{
          'message': message,
          'projectId': projectId ?? '',
          'clientMode': 'simple',
        },
        idempotencyKey: idempotencyKey,
      );

  Future<dynamic> runAction({
    required String actionId,
    String? projectId,
    String? idempotencyKey,
  }) =>
      _request(
        'POST',
        '/actions/${Uri.encodeComponent(actionId)}/run',
        body: <String, dynamic>{
          'projectId': projectId ?? '',
          'clientMode': 'simple',
        },
        idempotencyKey: idempotencyKey,
      );

  Future<dynamic> decideApproval({
    required String approvalId,
    required String decision,
    String reason = '',
  }) =>
      _request(
        'POST',
        '/approvals/${Uri.encodeComponent(approvalId)}/decide',
        body: <String, dynamic>{
          'decision': decision,
          'reason': reason,
          'clientMode': 'simple',
        },
      );

  void dispose() => _client.close();
}
