import 'package:flutter_test/flutter_test.dart';
import 'package:pandora_mobile/core/models/pandora_models.dart';
import 'package:pandora_mobile/core/value/pandora_value_meter.dart';

void main() {
  final now = DateTime.utc(2026, 8, 19, 13);

  test('missing value evidence never becomes a zero score', () {
    final snapshot = PandoraValueMeterSnapshot.fromOwnerHome(
      const <String, Object?>{},
      now: now,
    );

    expect(snapshot.verified, isFalse);
    expect(snapshot.score, isNull);
    expect(snapshot.freshness, FreshnessState.notChecked);
    expect(snapshot.toPlatformMessage(), isNot(contains('score')));
  });

  test('fresh explicitly verified value evidence can surface a score', () {
    final snapshot = PandoraValueMeterSnapshot.fromOwnerHome(
      <String, Object?>{
        'valueMeter': <String, Object?>{
          'index': 74.6,
          'verified': true,
          'dataFreshness': 'fresh',
          'lastVerifiedAt': '2026-08-19T12:59:00Z',
          'staleAfter': '2026-08-19T13:10:00Z',
          'customerName': 'must never cross the platform boundary',
          'notes': 'must never cross the platform boundary',
        },
      },
      now: now,
    );

    expect(snapshot.verified, isTrue);
    expect(snapshot.score, 75);
    final platform = snapshot.toPlatformMessage();
    expect(platform['verified'], isTrue);
    expect(platform['score'], 75);
    expect(platform, contains('freshnessState'));
    expect(platform, contains('lastVerifiedAtEpochMs'));
    expect(platform, contains('staleAfterEpochMs'));
    expect(platform, isNot(contains('customerName')));
    expect(platform, isNot(contains('notes')));
  });

  test('stale evidence hides the numeric score', () {
    final snapshot = PandoraValueMeterSnapshot.fromOwnerHome(
      <String, Object?>{
        'valueMeter': <String, Object?>{
          'index': 81,
          'verified': true,
          'dataFreshness': 'fresh',
          'lastVerifiedAt': '2026-08-19T12:00:00Z',
          'staleAfter': '2026-08-19T12:30:00Z',
        },
      },
      now: now,
    );

    expect(snapshot.verified, isFalse);
    expect(snapshot.score, isNull);
    expect(snapshot.toPlatformMessage(), isNot(contains('score')));
  });

  test('out-of-range score fails closed', () {
    final snapshot = PandoraValueMeterSnapshot.fromOwnerHome(
      <String, Object?>{
        'valueMeter': <String, Object?>{
          'index': 101,
          'verified': true,
          'dataFreshness': 'fresh',
          'lastVerifiedAt': '2026-08-19T12:59:00Z',
          'staleAfter': '2026-08-19T13:10:00Z',
        },
      },
      now: now,
    );

    expect(snapshot.verified, isFalse);
    expect(snapshot.score, isNull);
  });

  test('freshness without bounded timestamps cannot authorize a score', () {
    final snapshot = PandoraValueMeterSnapshot.fromOwnerHome(
      <String, Object?>{
        'valueMeter': <String, Object?>{
          'index': 55,
          'verified': true,
          'dataFreshness': 'fresh',
        },
      },
      now: now,
    );

    expect(snapshot.verified, isFalse);
    expect(snapshot.score, isNull);
  });
}
