import '../models/pandora_models.dart';

List<ConnectionSummary> deduplicateConnections(
  Iterable<ConnectionSummary> connections,
) {
  final unique = <String, ConnectionSummary>{};
  for (final connection in connections) {
    final key = normalizeProviderKey(connection.name);
    final existing = unique[key];
    if (existing == null ||
        connectionAttentionRank(connection) >
            connectionAttentionRank(existing)) {
      unique[key] = connection;
    }
  }
  final result = unique.values.toList(growable: true)
    ..sort(
      (left, right) =>
          connectionAttentionRank(right)
              .compareTo(connectionAttentionRank(left)),
    );
  return List<ConnectionSummary>.unmodifiable(result);
}

String normalizeProviderKey(String value) =>
    value.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '');

int connectionAttentionRank(ConnectionSummary connection) {
  final words = '${connection.state} ${connection.status}'.toLowerCase();
  if (words.contains('down') ||
      words.contains('failed') ||
      words.contains('critical') ||
      words.contains('unhealthy') ||
      words.contains('blocked')) {
    return 4;
  }
  if (words.contains('degraded') ||
      words.contains('warning') ||
      words.contains('stale') ||
      words.contains('attention')) {
    return 3;
  }
  if (words.contains('unknown') ||
      words.contains('not checked') ||
      words.contains('not_checked')) {
    return 2;
  }
  if (words.contains('healthy') ||
      words.contains('connected') ||
      words.contains('ready') ||
      words.contains('active')) {
    return 1;
  }
  return 2;
}
