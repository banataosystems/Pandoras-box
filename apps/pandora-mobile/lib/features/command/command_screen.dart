import 'package:flutter/material.dart';

import '../../app/pandora_dependencies.dart';
import '../../core/data/pandora_repository.dart';
import '../../core/design/pandora_tokens.dart';
import '../../core/models/pandora_models.dart';
import '../../core/network/idempotency_key.dart';
import '../../core/widgets/pandora_page.dart';
import '../../core/widgets/pandora_surface.dart';
import '../../core/widgets/status_badge.dart';

class CommandScreen extends StatefulWidget {
  const CommandScreen({super.key});

  @override
  State<CommandScreen> createState() => _CommandScreenState();
}

class _CommandScreenState extends State<CommandScreen> {
  final _objective = TextEditingController();
  final _idempotencyKeys = IdempotencyKeyFactory();
  bool _submitting = false;
  bool _outcomeUnknown = false;
  String? _submissionKey;
  IntakeReceipt? _receipt;
  String? _error;

  @override
  void dispose() {
    _objective.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final objective = _objective.text.trim();
    if (objective.isEmpty) {
      setState(() => _error = 'Describe what you want Pandora to accomplish.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
      _receipt = null;
    });
    _submissionKey ??= _idempotencyKeys.create('command');
    try {
      final receipt = await PandoraDependencies.of(context)
          .repository
          .ask(message: objective, idempotencyKey: _submissionKey);
      if (mounted) {
        setState(() {
          _receipt = receipt;
          _outcomeUnknown = false;
          _submissionKey = null;
        });
      }
    } on PandoraRepositoryException catch (error) {
      if (mounted) {
        setState(() {
          _outcomeUnknown = error.outcomeMayBeUnknown;
          _error = error.outcomeMayBeUnknown
              ? '${error.message} Check Activity first. If it is not recorded, '
                  'retry here; Pandora will reuse the same request identity.'
              : error.message;
          if (!error.outcomeMayBeUnknown) _submissionKey = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _outcomeUnknown = true;
          _error =
              'Pandora could not confirm whether that request was received. '
              'Check Activity first. If it is not recorded, retry here with '
              'the same request identity.';
        });
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _retrySameRequest() async {
    setState(() {
      _outcomeUnknown = false;
      _error = null;
    });
    await _submit();
  }

  @override
  Widget build(BuildContext context) => PandoraPage(
        title: 'Command',
        subtitle:
            'Describe the outcome. Pandora will prepare a governed plan before protected work runs.',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            PandoraSurface(
              title: 'What do you want Pandora to do?',
              subtitle:
                  'Use ordinary language. You will see the plan and any required proof or approval separately.',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: _objective,
                    readOnly: _outcomeUnknown,
                    minLines: 4,
                    maxLines: 8,
                    maxLength: 4000,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: const InputDecoration(
                      hintText:
                          'For example: Continue the highest-value safe work on Pandora Mobile.',
                      alignLabelWithHint: true,
                    ),
                  ),
                  const SizedBox(height: PandoraSpacing.sm),
                  FilledButton.icon(
                    onPressed: _submitting || _outcomeUnknown ? null : _submit,
                    icon: _submitting
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.arrow_forward_rounded),
                    label: Text(
                      _submitting
                          ? 'Recording request…'
                          : 'Prepare the request',
                    ),
                  ),
                ],
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: PandoraSpacing.md),
              PandoraSurface(
                title: 'Request needs attention',
                leading: Icon(
                  Icons.warning_amber_rounded,
                  color: context.pandoraPalette.attention,
                ),
                child: Text(_error!),
              ),
              if (_outcomeUnknown) ...[
                const SizedBox(height: PandoraSpacing.sm),
                OutlinedButton.icon(
                  onPressed: _submitting ? null : _retrySameRequest,
                  icon: const Icon(Icons.replay_rounded),
                  label: const Text('Retry same request safely'),
                ),
              ],
            ],
            if (_receipt != null) ...[
              const SizedBox(height: PandoraSpacing.md),
              _CommandReceiptCard(receipt: _receipt!),
            ],
          ],
        ),
      );
}

class _CommandReceiptCard extends StatelessWidget {
  const _CommandReceiptCard({required this.receipt});

  final IntakeReceipt receipt;

  @override
  Widget build(BuildContext context) {
    final status = receipt.status;
    return PandoraSurface(
      title: 'Request recorded',
      leading: Icon(
        Icons.check_circle_outline_rounded,
        color: context.pandoraPalette.verified,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(receipt.reply),
          const SizedBox(height: PandoraSpacing.md),
          StatusBadge(
            label: receipt.needsApproval
                ? 'Approval will be required'
                : 'Planning safely',
            tone: receipt.needsApproval
                ? PandoraStatusTone.attention
                : PandoraStatusTone.informative,
          ),
          const SizedBox(height: PandoraSpacing.md),
          _StatusLine(label: 'What changed', value: status.whatChanged),
          _StatusLine(label: 'Where we are', value: status.whereWeAre),
          _StatusLine(label: 'What is done', value: status.whatIsDone),
          _StatusLine(label: 'Happening now', value: status.whatIsHappeningNow),
          if (status.whatIsStoppingUs != null)
            _StatusLine(label: 'Blocked by', value: status.whatIsStoppingUs!),
          _StatusLine(label: 'Next', value: status.whatIWillDoNext),
        ],
      ),
    );
  }
}

class _StatusLine extends StatelessWidget {
  const _StatusLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: PandoraSpacing.xxs),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: Theme.of(context).textTheme.labelMedium),
            const SizedBox(height: PandoraSpacing.xxs),
            Text(value),
          ],
        ),
      );
}
