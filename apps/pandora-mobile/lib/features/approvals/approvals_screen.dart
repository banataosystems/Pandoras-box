import 'package:flutter/material.dart';

import '../../app/pandora_dependencies.dart';
import '../../core/data/pandora_repository.dart';
import '../../core/design/pandora_tokens.dart';
import '../../core/models/pandora_models.dart';
import '../../core/state/screen_controller.dart';
import '../../core/widgets/confirmation_sheet.dart';
import '../../core/widgets/content_state.dart';
import '../../core/widgets/pandora_page.dart';
import '../../core/widgets/pandora_surface.dart';
import '../../core/widgets/status_badge.dart';

class ApprovalsScreen extends StatefulWidget {
  const ApprovalsScreen({super.key});

  @override
  State<ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends State<ApprovalsScreen> {
  ScreenController<List<ApprovalSummary>>? _controller;
  String? _decidingId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_controller != null) return;
    final repository = PandoraDependencies.of(context).repository;
    _controller = ScreenController<List<ApprovalSummary>>(repository.approvals)
      ..load();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _decide(
    ApprovalSummary approval,
    ApprovalDecision decision,
  ) async {
    final isApprove = decision == ApprovalDecision.approve;
    final confirmed = await showPandoraConfirmation(
      context: context,
      title: isApprove ? 'Approve this plan?' : 'Reject this plan?',
      consequence: isApprove
          ? 'This records your approval. It does not execute the protected change.'
          : 'This records rejection and prevents this pending approval from continuing.',
      confirmLabel: isApprove ? 'Approve this plan' : 'Reject this plan',
      destructive: !isApprove,
    );
    if (confirmed != true || !mounted) return;
    setState(() => _decidingId = approval.id);
    try {
      final result =
          await PandoraDependencies.of(context).repository.decideApproval(
                approvalId: approval.id,
                decision: decision,
              );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result.decision.toLowerCase().contains('approved')
                ? 'Approval recorded. Nothing was executed.'
                : 'Rejection recorded.',
          ),
        ),
      );
      await _controller?.refresh();
    } on PandoraRepositoryException catch (error) {
      if (!mounted) return;
      if (error.outcomeMayBeUnknown) {
        await _controller?.refresh();
        if (!mounted) return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            error.outcomeMayBeUnknown
                ? 'Pandora could not confirm the decision. The queue was refreshed; review its current state before deciding again.'
                : error.message,
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _decidingId = null);
    }
  }

  @override
  Widget build(BuildContext context) => PandoraPage(
        title: 'Approvals',
        subtitle:
            'Understand the target, risk, and recovery before you decide. Approval never means execution.',
        actions: [
          IconButton(
            tooltip: 'Refresh Approvals',
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
                title: 'Approvals could not load',
                message: _safeError(controller.error),
                onRetry: controller.load,
              );
            }
            final approvals = controller.data ?? const <ApprovalSummary>[];
            if (approvals.isEmpty) {
              return const EmptyContent(
                title: 'Nothing needs approval',
                message: 'Pandora has no current owner decisions waiting.',
                icon: Icons.verified_user_outlined,
              );
            }
            return Column(
              children: [
                if (controller.error != null) ...[
                  ErrorContent(
                    title: 'Live approval state could not be revalidated',
                    message: controller.error!.message,
                    onRetry: controller.refresh,
                  ),
                  const SizedBox(height: PandoraSpacing.md),
                ],
                for (var index = 0; index < approvals.length; index++) ...[
                  _ApprovalCard(
                    approval: approvals[index],
                    busy: _decidingId == approvals[index].id,
                    enabled: controller.error == null && !controller.isLoading,
                    onApprove: () => _decide(
                      approvals[index],
                      ApprovalDecision.approve,
                    ),
                    onReject: () => _decide(
                      approvals[index],
                      ApprovalDecision.reject,
                    ),
                  ),
                  if (index != approvals.length - 1)
                    const SizedBox(height: PandoraSpacing.md),
                ],
              ],
            );
          },
        ),
      );
}

class _ApprovalCard extends StatelessWidget {
  const _ApprovalCard({
    required this.approval,
    required this.busy,
    required this.enabled,
    required this.onApprove,
    required this.onReject,
  });

  final ApprovalSummary approval;
  final bool busy;
  final bool enabled;
  final VoidCallback onApprove;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) => PandoraSurface(
        title: approval.action,
        subtitle: approval.reason,
        trailing: StatusBadge(
          label: approval.risk.label,
          tone: statusToneFor(approval.risk.label),
          compact: true,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('What changes', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: PandoraSpacing.xxs),
            Text(approval.change),
            const SizedBox(height: PandoraSpacing.md),
            Text('Recovery', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: PandoraSpacing.xxs),
            Text(
              approval.reversible
                  ? approval.rollback ?? 'A recovery path is recorded.'
                  : 'No verified recovery path is recorded.',
            ),
            if (approval.isExpired) ...[
              const SizedBox(height: PandoraSpacing.md),
              const StatusBadge(
                label: 'Expired — decision disabled',
                tone: PandoraStatusTone.critical,
              ),
            ],
            const SizedBox(height: PandoraSpacing.lg),
            LayoutBuilder(
              builder: (context, constraints) {
                final approve = FilledButton.icon(
                  onPressed:
                      busy || !enabled || approval.isExpired ? null : onApprove,
                  icon: busy
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.check_rounded),
                  label: const Text('Approve'),
                );
                final reject = OutlinedButton.icon(
                  onPressed:
                      busy || !enabled || approval.isExpired ? null : onReject,
                  icon: const Icon(Icons.close_rounded),
                  label: const Text('Reject'),
                );
                if (constraints.maxWidth < 380) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      approve,
                      const SizedBox(height: PandoraSpacing.xs),
                      reject,
                    ],
                  );
                }
                return Row(
                  children: [
                    Expanded(child: approve),
                    const SizedBox(width: PandoraSpacing.xs),
                    Expanded(child: reject),
                  ],
                );
              },
            ),
          ],
        ),
      );
}

String _safeError(Object? error) {
  if (error is PandoraRepositoryException) return error.message;
  return 'Pandora could not verify the approval queue. Try again.';
}
