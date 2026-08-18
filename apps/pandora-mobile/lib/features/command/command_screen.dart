import 'package:flutter/material.dart';

import '../../app/pandora_dependencies.dart';
import '../../core/data/pandora_repository.dart';
import '../../core/design/pandora_tokens.dart';
import '../../core/models/pandora_models.dart';
import '../../core/network/idempotency_key.dart';
import '../../core/widgets/owner_experience.dart';
import '../../core/widgets/pandora_page.dart';
import '../../core/widgets/pandora_surface.dart';
import '../../core/widgets/status_badge.dart';

class CommandScreen extends StatefulWidget {
  const CommandScreen({super.key});

  @override
  State<CommandScreen> createState() => _CommandScreenState();
}

class _CommandScreenState extends State<CommandScreen> {
  static const _suggestions = <String>[
    'Continue the highest-value safe work across my projects.',
    'Review all blockers and prepare the safest next actions.',
    'Check connected services and tell me what needs attention.',
    'Prepare the next verified release gate without deploying.',
  ];

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

  void _useSuggestion(String value) {
    if (_outcomeUnknown || _submitting) return;
    _objective
      ..text = value
      ..selection = TextSelection.collapsed(offset: value.length);
    setState(() {
      _error = null;
      _receipt = null;
      _submissionKey = null;
    });
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
      final receipt = await PandoraDependencies.of(context).repository
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
    subtitle: 'State the outcome. Pandora governs the steps.',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const OwnerBriefingHero(
          eyebrow: 'Natural-language control',
          title: 'Describe the outcome, not the implementation',
          message: 'Pandora interprets the objective, checks project truth, prepares a plan, and routes protected work for approval.',
          icon: Icons.auto_awesome_rounded,
          tone: PandoraStatusTone.informative,
          statusLabel: 'No protected change runs from this screen',
        ),
        const SizedBox(height: PandoraSpacing.md),
        PandoraSurface(
          title: 'Start from a common objective',
          subtitle: 'Tap one to edit it before submission.',
          child: Wrap(
            spacing: PandoraSpacing.xs,
            runSpacing: PandoraSpacing.xs,
            children: [
              for (final suggestion in _suggestions)
                ActionChip(
                  avatar: const Icon(Icons.north_east_rounded, size: 17),
                  label: Text(suggestion),
                  onPressed: _outcomeUnknown || _submitting
                      ? null
                      : () => _useSuggestion(suggestion),
                ),
            ],
          ),
        ),
        const SizedBox(height: PandoraSpacing.md),
        PandoraSurface(
          title: 'What do you want Pandora to do?',
          subtitle: 'Use ordinary language. You will see the plan and required proof or approval separately.',
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
                  hintText: 'For example: Continue the highest-value safe work on Pandora Mobile.',
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
                  _submitting ? 'Recording request…' : 'Prepare the request',
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: PandoraSpacing.md),
        const _GovernedFlow(),
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

class _GovernedFlow extends StatelessWidget {
  const _GovernedFlow();

  @override
  Widget build(BuildContext context) => PandoraSurface(
    title: 'What happens next',
    child: Column(
      children: const [
        _FlowStep(
          number: '1',
          title: 'Interpret',
          message: 'Resolve the project, objective, constraints, and risk.',
        ),
        Divider(),
        _FlowStep(
          number: '2',
          title: 'Prepare proof',
          message: 'Show what exists, what is missing, and how to recover.',
        ),
        Divider(),
        _FlowStep(
          number: '3',
          title: 'Govern execution',
          message:
              'Create a plan. Approval and execution remain separate actions.',
        ),
      ],
    ),
  );
}

class _FlowStep extends StatelessWidget {
  const _FlowStep({
    required this.number,
    required this.title,
    required this.message,
  });

  final String number;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: EdgeInsets.zero,
    leading: CircleAvatar(radius: 16, child: Text(number)),
    title: Text(title),
    subtitle: Text(message),
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
