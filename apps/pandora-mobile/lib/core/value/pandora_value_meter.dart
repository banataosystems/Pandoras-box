import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../models/pandora_models.dart';
import '../network/pandora_api_client.dart';

/// A deliberately narrow snapshot for the Android home-screen widget.
///
/// No session token, project name, customer data, provider detail, evidence
/// body, or arbitrary server text crosses the platform channel. A numeric
/// value is visible only when the owner API explicitly marks it verified and
/// its freshness is current.
class PandoraValueMeterSnapshot {
  const PandoraValueMeterSnapshot({
    required this.verified,
    required this.freshness,
    this.score,
    this.lastVerifiedAt,
    this.staleAfter,
  });

  final bool verified;
  final int? score;
  final FreshnessState freshness;
  final DateTime? lastVerifiedAt;
  final DateTime? staleAfter;

  factory PandoraValueMeterSnapshot.fromOwnerHome(
    Object? raw, {
    DateTime? now,
  }) {
    final root = asJsonMap(raw);
    final meter = asJsonMap(root['valueMeter']);
    if (meter.isEmpty) {
      return const PandoraValueMeterSnapshot(
        verified: false,
        freshness: FreshnessState.notChecked,
      );
    }

    final observedNow = now ?? DateTime.now();
    final rawScore = jsonDouble(
      firstJsonValue(meter, const <String>['index', 'score', 'valueIndex']),
    );
    double? validScore;
    if (rawScore != null &&
        rawScore.isFinite &&
        rawScore >= 0 &&
        rawScore <= 100) {
      validScore = rawScore;
    }

    final freshness = FreshnessInfo.fromJson(meter, now: observedNow);
    final lastVerifiedAt = freshness.lastVerifiedAt;
    final staleAfter = freshness.staleAfter;
    final boundedClock = lastVerifiedAt != null &&
        !lastVerifiedAt.isAfter(observedNow.add(const Duration(minutes: 5)));
    final boundedExpiry = staleAfter != null &&
        staleAfter.isAfter(observedNow) &&
        !staleAfter.isAfter(observedNow.add(const Duration(days: 30)));
    final verified = meter['verified'] == true &&
        validScore != null &&
        freshness.isFresh &&
        boundedClock &&
        boundedExpiry;

    return PandoraValueMeterSnapshot(
      verified: verified,
      score: verified ? validScore.round() : null,
      freshness: freshness.state,
      lastVerifiedAt: lastVerifiedAt,
      staleAfter: staleAfter,
    );
  }

  Map<String, Object?> toPlatformMessage() {
    final message = <String, Object?>{
      'verified': verified,
      'freshnessState': freshness.name,
    };
    if (score != null) {
      message['score'] = score;
    }
    if (lastVerifiedAt != null) {
      message['lastVerifiedAtEpochMs'] =
          lastVerifiedAt!.toUtc().millisecondsSinceEpoch;
    }
    if (staleAfter != null) {
      message['staleAfterEpochMs'] = staleAfter!.toUtc().millisecondsSinceEpoch;
    }
    return message;
  }
}

class PandoraValueMeterSync {
  PandoraValueMeterSync({required PandoraApiClient client}) : _client = client;

  static const channelName = 'com.banataosystems.pandora_mobile/value_widget';
  static const MethodChannel _channel = MethodChannel(channelName);

  final PandoraApiClient _client;

  /// Re-reads the authenticated owner projection and publishes only the
  /// bounded value-meter projection. Failure never breaks the owner screen and
  /// never replaces the last known widget state with an invented zero.
  Future<void> refresh() async {
    try {
      final response = await _client.getJson(
        pathSegments: const <String>['home'],
        operation: 'valueWidget.refresh',
        routeTemplate: '/home',
      );
      final snapshot = PandoraValueMeterSnapshot.fromOwnerHome(response.data);
      await publish(snapshot);
    } on Object {
      // The widget is supplemental. The native side retains the last snapshot
      // and independently marks it stale using staleAfter when provided.
    }
  }

  @visibleForTesting
  Future<void> publish(PandoraValueMeterSnapshot snapshot) async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    try {
      await _channel.invokeMethod<void>(
        'publishValueMeter',
        snapshot.toPlatformMessage(),
      );
    } on Object {
      // Missing/old platform overlays must never prevent Pandora Mobile from
      // opening or refreshing its primary owner experience.
    }
  }
}
