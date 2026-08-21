import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/pandora_dependencies.dart';
import '../../core/data/owner_projection.dart';
import '../../core/data/pandora_repository.dart';
import '../../core/design/pandora_tokens.dart';
import '../../core/models/pandora_models.dart';
import '../../core/state/screen_controller.dart';
import '../../core/widgets/content_state.dart';
import '../../core/widgets/freshness_label.dart';
import '../../core/widgets/owner_experience.dart';
import '../../core/widgets/pandora_page.dart';
import '../../core/widgets/pandora_surface.dart';
import '../../core/widgets/status_badge.dart';

class ConnectionsScreen extends StatefulWidget {
  const ConnectionsScreen({super.key});

  @override
  State<ConnectionsScreen> createState() => _ConnectionsScreenState();
}

class _ConnectionsScreenState extends State<ConnectionsScreen>
    with WidgetsBindingObserver {
  ScreenController<List<ConnectionSummary>>? _controller;
  bool _connectingSupabase = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _controller?.refresh();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_controller != null) return;
    final repository = PandoraDependencies.of(context).repository;
    _controller = ScreenController<List<ConnectionSummary>>(
      () => repository.connections(allowCached: true),
    )..load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _connectSupabase() async {
    final repository = PandoraDependencies.of(context).repository;
    if (repository is! ProviderConnectionRepository) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Supabase OAuth is not available in this build.')),
      );
      return;
    }
    final providerRepository = repository as ProviderConnectionRepository;
    setState(() => _connectingSupabase = true);
    try {
      final launch = await providerRepository.beginSupabaseOAuth();
      final opened = await launchUrl(
        launch.authorizeUri,
        mode: LaunchMode.externalApplication,
      );
      if (!opened && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Pandora could not open Supabase authorization.')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
                'Pandora could not start Supabase authorization. No access was changed.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _connectingSupabase = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: PandoraPage(
          title: 'Connections',
          subtitle: 'Provider health, capability, and verified freshness.',
          actions: [
            IconButton(
              tooltip: 'Refresh Connections',
              onPressed: () => _controller?.refresh(),
              icon: const Icon(Icons.refresh_rounded),
            ),
          ],
          onRefresh: () => _controller!.refresh(),
          child: AnimatedBuilder(
            animation: _controller!,
            builder: (context, _) {
              final controller = _controller!;
              if (controller.isLoading && controller.data == null) {
                return const ContentSkeleton(lines: 6);
              }
              if (controller.error != null && controller.data == null) {
                return ErrorContent(
                  title: 'Connections could not load',
                  message: controller.error!.message,
                  onRetry: controller.load,
                );
              }
              final raw = controller.data ?? const <ConnectionSummary>[];
              final items = deduplicateConnections(raw);
              if (items.isEmpty) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _SupabaseOAuthCard(
                      connected: false,
                      busy: _connectingSupabase,
                      onPressed: _connectSupabase,
                    ),
                    const SizedBox(height: PandoraSpacing.md),
                    const EmptyContent(
                      title: 'No connections returned',
                      message:
                          'Pandora has not returned a verified connection list.',
                    ),
                  ],
                );
              }
              final changeReady =
                  items.where((connection) => connection.canChange).length;
              final needsAttention = items
                  .where(
                      (connection) => connectionAttentionRank(connection) >= 3)
                  .length;
              final healthy = items
                  .where(
                      (connection) => connectionAttentionRank(connection) == 1)
                  .length;

              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (controller.degradedReason != null ||
                      controller.error != null) ...[
                    DegradedContentNotice(
                      message: controller.degradedReason ??
                          controller.error!.message,
                      onRetry: controller.refresh,
                    ),
                    const SizedBox(height: PandoraSpacing.md),
                  ],
                  _SupabaseOAuthCard(
                    connected: items.any((connection) =>
                        connection.provider.toLowerCase() == 'supabase' &&
                        connection.authMode.toLowerCase() == 'oauth'),
                    busy: _connectingSupabase,
                    onPressed: _connectSupabase,
                  ),
                  const SizedBox(height: PandoraSpacing.md),
                  OwnerBriefingHero(
                    eyebrow: 'Provider posture',
                    title: needsAttention == 0
                        ? 'Connected services are ready'
                        : '$needsAttention connection${needsAttention == 1 ? '' : 's'} need attention',
                    message:
                        'Capabilities are shown without exposing credentials or secret values.',
                    icon: needsAttention == 0
                        ? Icons.cable_rounded
                        : Icons.warning_amber_rounded,
                    tone: needsAttention == 0
                        ? PandoraStatusTone.verified
                        : PandoraStatusTone.attention,
                    statusLabel: raw.length == items.length
                        ? '${items.length} providers'
                        : '${items.length} unique providers · ${raw.length - items.length} duplicate record${raw.length - items.length == 1 ? '' : 's'} collapsed',
                  ),
                  const SizedBox(height: PandoraSpacing.md),
                  OwnerMetricGrid(
                    metrics: [
                      OwnerMetric(
                        label: 'Healthy',
                        value: '$healthy',
                        icon: Icons.check_circle_outline_rounded,
                        tone: PandoraStatusTone.verified,
                      ),
                      OwnerMetric(
                        label: 'Change-ready',
                        value: '$changeReady',
                        icon: Icons.edit_note_rounded,
                        tone: PandoraStatusTone.informative,
                      ),
                      OwnerMetric(
                        label: 'Needs attention',
                        value: '$needsAttention',
                        icon: Icons.warning_amber_rounded,
                        tone: needsAttention > 0
                            ? PandoraStatusTone.attention
                            : PandoraStatusTone.neutral,
                      ),
                    ],
                  ),
                  const SizedBox(height: PandoraSpacing.xl),
                  const OwnerSectionHeading(
                    title: 'Connected services',
                    subtitle: 'Attention-first, with capability and freshness.',
                  ),
                  const SizedBox(height: PandoraSpacing.sm),
                  for (var index = 0; index < items.length; index++) ...[
                    _ConnectionCard(connection: items[index]),
                    if (index != items.length - 1)
                      const SizedBox(height: PandoraSpacing.sm),
                  ],
                ],
              );
            },
          ),
        ),
      );
}

class _SupabaseOAuthCard extends StatelessWidget {
  const _SupabaseOAuthCard({
    required this.connected,
    required this.busy,
    required this.onPressed,
  });

  final bool connected;
  final bool busy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => PandoraSurface(
        title: connected ? 'Supabase connected with OAuth' : 'Connect Supabase',
        subtitle: connected
            ? 'Reauthorize when permissions expire or the account changes.'
            : 'Grant Pandora access to the Supabase organizations and projects you choose.',
        leading: const Icon(Icons.storage_rounded),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const OwnerSignal(
              label: 'Credential protection',
              value:
                  'OAuth + PKCE · tokens remain server-side in Supabase Vault',
              icon: Icons.lock_outline_rounded,
              tone: PandoraStatusTone.verified,
            ),
            const SizedBox(height: PandoraSpacing.sm),
            Text(
              'Connecting does not authorize production changes. Pandora keeps protected mutations behind the existing governance gates.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: PandoraSpacing.md),
            FilledButton.icon(
              onPressed: busy ? null : onPressed,
              icon: busy
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.open_in_new_rounded),
              label: Text(
                busy
                    ? 'Opening Supabase…'
                    : connected
                        ? 'Reauthorize Supabase'
                        : 'Connect Supabase',
              ),
            ),
          ],
        ),
      );
}

class _ConnectionCard extends StatelessWidget {
  const _ConnectionCard({required this.connection});

  final ConnectionSummary connection;

  @override
  Widget build(BuildContext context) => PandoraSurface(
        title: connection.name,
        subtitle: connection.purpose,
        leading: Icon(providerIconFor(connection.name)),
        trailing: StatusBadge(
          label: connection.status,
          tone: statusToneFor(connection.status),
          compact: true,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            OwnerSignal(
              label: 'Verified capability',
              value: connection.canChange
                  ? 'Read access and governed changes'
                  : connection.canRead
                      ? 'Read access only'
                      : 'No verified access',
              icon: connection.canChange
                  ? Icons.edit_note_rounded
                  : connection.canRead
                      ? Icons.visibility_outlined
                      : Icons.link_off_rounded,
              tone: connection.canChange || connection.canRead
                  ? PandoraStatusTone.informative
                  : PandoraStatusTone.attention,
            ),
            const SizedBox(height: PandoraSpacing.sm),
            FreshnessLabel(freshness: connection.freshness),
          ],
        ),
      );
}
