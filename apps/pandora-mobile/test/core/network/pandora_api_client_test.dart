import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pandora_mobile/core/data/pandora_repository.dart';
import 'package:pandora_mobile/core/data/remote_pandora_repository.dart';
import 'package:pandora_mobile/core/diagnostics/diagnostics_store.dart';
import 'package:pandora_mobile/core/network/pandora_api_client.dart';
import 'package:pandora_mobile/core/network/pandora_api_error.dart';
import 'package:pandora_mobile/core/network/session_token_provider.dart';

class _TokenProvider implements SessionTokenProvider {
  const _TokenProvider(this.token);

  final String? token;

  @override
  Future<String?> accessToken() async => token;
}

PandoraApiClient clientWith(
  MockClient httpClient, {
  Duration timeout = const Duration(seconds: 1),
  int maxResponseBytes = 1024 * 1024,
  DiagnosticsStore? diagnostics,
  String? token = 'fixture-session-token',
}) =>
    PandoraApiClient(
      baseUri: Uri.parse('https://example.invalid/functions/v1/owner'),
      organizationId: 'organization-fixture-1',
      sessionTokenProvider: _TokenProvider(token),
      httpClient: httpClient,
      timeout: timeout,
      maxResponseBytes: maxResponseBytes,
      diagnostics: diagnostics ?? DiagnosticsStore(),
    );

Map<String, Object?> canonicalIntakeStatus() => <String, Object?>{
      'whatChanged': 'A governed intake record was created.',
      'whereWeAre': 'Planning',
      'whatIsDone': 'The request was accepted.',
      'whatIsHappeningNow': 'Pandora is checking preconditions.',
      'whatIsStoppingUs': null,
      'whatIWillDoNext': 'Show the plan before any protected change.',
    };

Map<String, Object?> approvalDecisionResponse({
  Object? ok = true,
  String decision = 'approved',
  String approvalId = 'approval-fixture-1',
  String approvalDecision = 'approved',
}) =>
    <String, Object?>{
      'ok': ok,
      'decision': decision,
      'approval': <String, Object?>{
        'id': approvalId,
        'whatWillHappen': 'Publish the candidate',
        'whyINeedYou': 'Owner decision required',
        'whatWillChange': 'Release alias',
        'howWeCanUndoIt': 'Restore prior alias',
        'riskLevel': 'HIGH',
        'reversible': true,
        'decision': approvalDecision,
      },
    };

String? header(http.Request request, String name) {
  final normalized = name.toLowerCase();
  for (final entry in request.headers.entries) {
    if (entry.key.toLowerCase() == normalized) return entry.value;
  }
  return null;
}

void main() {
  test(
    'GET builds a safe URI and sends auth plus organization context',
    () async {
      late http.Request captured;
      final api = clientWith(
        MockClient((request) async {
          captured = request;
          return http.Response(
            '{"ok":true}',
            200,
            headers: <String, String>{'x-request-id': 'request-fixture-1'},
          );
        }),
      );

      final response = await api.getJson(
        pathSegments: const <String>['projects', 'project fixture'],
        operation: 'project.load',
        routeTemplate: '/projects/:id',
        queryParameters: const <String, String>{'mode': 'summary'},
      );

      expect(captured.method, 'GET');
      expect(captured.url.pathSegments.last, 'project fixture');
      expect(captured.url.queryParameters, <String, String>{'mode': 'summary'});
      expect(header(captured, 'Authorization'), 'Bearer fixture-session-token');
      expect(header(captured, 'X-Organization-Id'), 'organization-fixture-1');
      expect(response.requestId, 'request-fixture-1');
      api.close();
    },
  );

  test(
    '202 intake sends one idempotent mutation and parses the receipt',
    () async {
      var calls = 0;
      late http.Request captured;
      final api = clientWith(
        MockClient((request) async {
          calls += 1;
          captured = request;
          return http.Response(
            jsonEncode(<String, Object?>{
              'reply': 'Recorded safely.',
              'needsApproval': true,
              'actionId': 'action-fixture-1',
              'approvalId': 'approval-fixture-1',
              'status': canonicalIntakeStatus(),
            }),
            202,
            headers: <String, String>{'x-request-id': 'request-fixture-2'},
          );
        }),
      );
      final repository = RemotePandoraRepository(client: api);

      final receipt = await repository.ask(message: 'Prepare a safe plan.');

      expect(calls, 1);
      expect(header(captured, 'Idempotency-Key'), startsWith('pandora:ask:'));
      expect(jsonDecode(captured.body)['clientMode'], 'simple');
      expect(receipt.actionId, 'action-fixture-1');
      expect(receipt.requestId, 'request-fixture-2');
      repository.dispose();
    },
  );

  test(
    'approval request uses approve wire value and remains a decision',
    () async {
      late Map<String, Object?> body;
      final api = clientWith(
        MockClient((request) async {
          body = (jsonDecode(request.body) as Map).cast<String, Object?>();
          return http.Response(jsonEncode(approvalDecisionResponse()), 200);
        }),
      );
      final repository = RemotePandoraRepository(client: api);

      final result = await repository.decideApproval(
        approvalId: 'approval-fixture-1',
        decision: ApprovalDecision.approve,
      );

      expect(body['decision'], 'approve');
      expect(ApprovalDecision.reject.wireValue, 'reject');
      expect(body, isNot(containsPair('execute', true)));
      expect(result.decision, 'approved');
      repository.dispose();
    },
  );

  final unreadableMutationResponses = <String, http.Response>{
    'invalid JSON': http.Response(
      'sensitive invalid response body',
      202,
      headers: <String, String>{'x-request-id': 'decode-fixture-json'},
    ),
    'invalid UTF-8': http.Response.bytes(
      const <int>[0xff],
      202,
      headers: <String, String>{'x-request-id': 'decode-fixture-utf8'},
    ),
  };
  for (final entry in unreadableMutationResponses.entries) {
    test(
      'successful POST with ${entry.key} is ambiguous and is sent once',
      () async {
        var calls = 0;
        final api = clientWith(
          MockClient((request) async {
            calls += 1;
            return entry.value;
          }),
        );

        try {
          await api.postJson(
            pathSegments: const <String>['ask'],
            operation: 'command.submit',
            routeTemplate: '/ask',
            idempotencyKey: 'decode-fixture-key',
            body: const <String, Object?>{'message': 'Prepare a plan.'},
          );
          fail('Expected an ambiguous mutation failure.');
        } on PandoraApiError catch (error) {
          expect(error.kind, PandoraApiErrorKind.ambiguousMutation);
          expect(error.outcomeMayBeUnknown, isTrue);
          expect(error.retryable, isFalse);
          expect(error.requestId, startsWith('decode-fixture-'));
          expect(
            error.toString(),
            isNot(contains('sensitive invalid response body')),
          );
        }
        expect(calls, 1);
        api.close();
      },
    );
  }

  test(
    'oversize successful POST response is ambiguous and is sent once',
    () async {
      var calls = 0;
      final api = clientWith(
        MockClient((request) async {
          calls += 1;
          return http.Response.bytes(
            List<int>.filled(1025, 0x61),
            202,
            headers: <String, String>{'x-request-id': 'decode-fixture-size'},
          );
        }),
        maxResponseBytes: 1024,
      );

      await expectLater(
        api.postJson(
          pathSegments: const <String>['ask'],
          operation: 'command.submit',
          routeTemplate: '/ask',
          idempotencyKey: 'size-fixture-key',
          body: const <String, Object?>{'message': 'Prepare a plan.'},
        ),
        throwsA(
          isA<PandoraApiError>()
              .having(
                (error) => error.kind,
                'kind',
                PandoraApiErrorKind.ambiguousMutation,
              )
              .having(
                (error) => error.requestId,
                'requestId',
                'decode-fixture-size',
              )
              .having((error) => error.retryable, 'retryable', isFalse),
        ),
      );
      expect(calls, 1);
      api.close();
    },
  );

  test('ask receipt without canonical action identity is ambiguous', () async {
    var calls = 0;
    final api = clientWith(
      MockClient((request) async {
        calls += 1;
        return http.Response(
          jsonEncode(<String, Object?>{
            'reply': 'Recorded safely.',
            'needsApproval': false,
            'status': canonicalIntakeStatus(),
          }),
          202,
          headers: <String, String>{'x-request-id': 'receipt-fixture-ask'},
        );
      }),
    );
    final repository = RemotePandoraRepository(client: api);

    await expectLater(
      repository.ask(message: 'Prepare a safe plan.'),
      throwsA(
        isA<PandoraApiError>().having(
          (error) => error.kind,
          'kind',
          PandoraApiErrorKind.ambiguousMutation,
        ),
      ),
    );
    expect(calls, 1);
    repository.dispose();
  });

  test('action receipt without canonical status is ambiguous', () async {
    var calls = 0;
    final api = clientWith(
      MockClient((request) async {
        calls += 1;
        return http.Response(
          jsonEncode(<String, Object?>{
            'reply': 'Recorded safely.',
            'needsApproval': false,
            'actionId': 'intake-fixture-1',
          }),
          202,
          headers: <String, String>{'x-request-id': 'receipt-fixture-action'},
        );
      }),
    );
    final repository = RemotePandoraRepository(client: api);

    await expectLater(
      repository.runAction(actionId: 'review-status'),
      throwsA(
        isA<PandoraApiError>().having(
          (error) => error.kind,
          'kind',
          PandoraApiErrorKind.ambiguousMutation,
        ),
      ),
    );
    expect(calls, 1);
    repository.dispose();
  });

  final invalidApprovalResponses = <String, Map<String, Object?>>{
    'non-boolean ok': approvalDecisionResponse(ok: 'true'),
    'non-canonical decision': approvalDecisionResponse(decision: 'Approved'),
    'mismatched approval ID': approvalDecisionResponse(
      approvalId: 'approval-fixture-other',
    ),
    'mismatched nested decision': approvalDecisionResponse(
      approvalDecision: 'denied',
    ),
  };
  for (final entry in invalidApprovalResponses.entries) {
    test('approval response rejects ${entry.key} as ambiguous', () async {
      var calls = 0;
      final api = clientWith(
        MockClient((request) async {
          calls += 1;
          return http.Response(
            jsonEncode(entry.value),
            200,
            headers: <String, String>{
              'x-request-id': 'approval-response-fixture',
            },
          );
        }),
      );
      final repository = RemotePandoraRepository(client: api);

      await expectLater(
        repository.decideApproval(
          approvalId: 'approval-fixture-1',
          decision: ApprovalDecision.approve,
        ),
        throwsA(
          isA<PandoraApiError>()
              .having(
                (error) => error.kind,
                'kind',
                PandoraApiErrorKind.ambiguousMutation,
              )
              .having(
                (error) => error.requestId,
                'requestId',
                'approval-response-fixture',
              ),
        ),
      );
      expect(calls, 1);
      repository.dispose();
    });
  }

  test(
    'unreadable successful mutation stays ambiguous and logs metadata only',
    () async {
      final diagnostics = DiagnosticsStore();
      final api = clientWith(
        MockClient(
          (request) async => http.Response(
            '[]',
            202,
            headers: <String, String>{'x-request-id': 'parse-fixture-1'},
          ),
        ),
        diagnostics: diagnostics,
      );
      final repository = RemotePandoraRepository(client: api);

      await expectLater(
        repository.ask(message: 'Prepare a safe plan.'),
        throwsA(
          isA<PandoraApiError>()
              .having(
                (error) => error.kind,
                'kind',
                PandoraApiErrorKind.ambiguousMutation,
              )
              .having(
                (error) => error.requestId,
                'requestId',
                'parse-fixture-1',
              ),
        ),
      );
      expect(diagnostics.events.first.method, 'PARSE');
      expect(diagnostics.events.first.routeTemplate, '/ask');
      expect(
        diagnostics.events.first.toSafeJson().toString(),
        isNot(contains('[]')),
      );
      repository.dispose();
    },
  );

  final statusKinds = <int, PandoraApiErrorKind>{
    401: PandoraApiErrorKind.sessionExpired,
    403: PandoraApiErrorKind.forbidden,
    409: PandoraApiErrorKind.conflict,
    429: PandoraApiErrorKind.rateLimited,
    503: PandoraApiErrorKind.unavailable,
  };
  for (final entry in statusKinds.entries) {
    test(
      '${entry.key} maps to ${entry.value.name} with owner-safe metadata',
      () async {
        final api = clientWith(
          MockClient(
            (request) async => http.Response(
              jsonEncode(<String, Object?>{
                'code': 'FIXTURE_${entry.key}',
                'plainMessage': 'Owner-safe fixture message.',
                'requestId': 'body-request-fixture',
                'internal': 'must-not-be-retained',
              }),
              entry.key,
              headers: <String, String>{
                'x-request-id': 'header-request-fixture',
              },
            ),
          ),
        );

        try {
          await api.getJson(
            pathSegments: const <String>['home'],
            operation: 'home.load',
            routeTemplate: '/home',
          );
          fail('Expected PandoraApiError.');
        } on PandoraApiError catch (caught) {
          expect(caught.kind, entry.value);
          expect(caught.message, 'Owner-safe fixture message.');
          expect(caught.requestId, 'header-request-fixture');
          expect(caught.toString(), isNot(contains('must-not-be-retained')));
        }
        api.close();
      },
    );
  }

  test(
    'timed-out POST is ambiguous, sent once, and never auto-retried',
    () async {
      var calls = 0;
      final api = clientWith(
        MockClient((request) async {
          calls += 1;
          await Future<void>.delayed(const Duration(milliseconds: 80));
          return http.Response('{}', 202);
        }),
        timeout: const Duration(milliseconds: 10),
      );

      try {
        await api.postJson(
          pathSegments: const <String>['ask'],
          operation: 'command.submit',
          routeTemplate: '/ask',
          idempotencyKey: 'fixture-key-1',
          body: const <String, Object?>{'message': 'Prepare a plan.'},
        );
        fail('Expected timeout failure.');
      } on PandoraApiError catch (error) {
        expect(error.kind, PandoraApiErrorKind.ambiguousMutation);
        expect(error.outcomeMayBeUnknown, isTrue);
        expect(error.retryable, isFalse);
      }
      expect(calls, 1);
      api.close();
    },
  );

  test('missing session fails before the network is touched', () async {
    var calls = 0;
    final api = clientWith(
      MockClient((request) async {
        calls += 1;
        return http.Response('{}', 200);
      }),
      token: null,
    );

    await expectLater(
      api.getJson(
        pathSegments: const <String>['home'],
        operation: 'home.load',
        routeTemplate: '/home',
      ),
      throwsA(
        isA<PandoraApiError>().having(
          (error) => error.kind,
          'kind',
          PandoraApiErrorKind.sessionExpired,
        ),
      ),
    );
    expect(calls, 0);
    api.close();
  });

  test(
    'read-only cache degrades only for availability, never permission',
    () async {
      var status = 200;
      final api = clientWith(
        MockClient((request) async {
          if (status == 200) {
            return http.Response(
              jsonEncode(<Object?>[
                <String, Object?>{
                  'id': 'project-fixture-1',
                  'name': 'Pandora Mobile',
                  'dataFreshness': 'fresh',
                },
              ]),
              200,
            );
          }
          return http.Response(
            jsonEncode(<String, Object?>{
              'code': 'FIXTURE_$status',
              'plainMessage': 'Fixture failure.',
            }),
            status,
          );
        }),
      );
      final repository = RemotePandoraRepository(client: api);

      await repository.projects();
      status = 503;
      final cached = await repository.projects(allowCached: true);
      expect(cached.source, RepositorySource.memoryCache);
      expect(cached.degradedReason, 'Fixture failure.');

      status = 403;
      await expectLater(
        repository.projects(allowCached: true),
        throwsA(
          isA<PandoraApiError>().having(
            (error) => error.kind,
            'kind',
            PandoraApiErrorKind.forbidden,
          ),
        ),
      );
      repository.dispose();
    },
  );
}
