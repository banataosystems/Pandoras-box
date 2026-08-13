import 'package:flutter/material.dart';

import '../design/pandora_tokens.dart';

enum PandoraStatusTone {
  neutral,
  informative,
  verified,
  attention,
  critical,
}

class StatusBadge extends StatelessWidget {
  const StatusBadge({
    super.key,
    required this.label,
    required this.tone,
    this.compact = false,
  });

  final String label;
  final PandoraStatusTone tone;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final palette = context.pandoraPalette;
    final scheme = Theme.of(context).colorScheme;
    final (color, onColor, icon) = switch (tone) {
      PandoraStatusTone.informative => (
          palette.informative,
          palette.onInformative,
          Icons.info_outline_rounded,
        ),
      PandoraStatusTone.verified => (
          palette.verified,
          palette.onVerified,
          Icons.verified_outlined,
        ),
      PandoraStatusTone.attention => (
          palette.attention,
          palette.onAttention,
          Icons.priority_high_rounded,
        ),
      PandoraStatusTone.critical => (
          palette.critical,
          palette.onCritical,
          Icons.error_outline_rounded,
        ),
      PandoraStatusTone.neutral => (
          scheme.surfaceContainerHighest,
          scheme.onSurfaceVariant,
          Icons.remove_circle_outline_rounded,
        ),
    };
    return Semantics(
      label: label,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(PandoraRadius.control),
        ),
        child: Padding(
          padding: EdgeInsets.symmetric(
            horizontal: compact ? PandoraSpacing.xs : PandoraSpacing.sm,
            vertical: compact ? PandoraSpacing.xxs : PandoraSpacing.xs,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: compact ? 14 : 17, color: onColor),
              const SizedBox(width: PandoraSpacing.xs),
              Flexible(
                child: Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: onColor,
                        fontWeight: FontWeight.w600,
                      ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

PandoraStatusTone statusToneFor(String status) {
  final normalized = status.toLowerCase();
  if (RegExp(r'blocked|failed|error|critical|denied').hasMatch(normalized)) {
    return PandoraStatusTone.critical;
  }
  if (RegExp(r'attention|pending|waiting|stale|warning|expired')
      .hasMatch(normalized)) {
    return PandoraStatusTone.attention;
  }
  if (RegExp(r'verified|healthy|protected|ready|complete|active')
      .hasMatch(normalized)) {
    return PandoraStatusTone.verified;
  }
  if (RegExp(r'working|running|progress|connected').hasMatch(normalized)) {
    return PandoraStatusTone.informative;
  }
  return PandoraStatusTone.neutral;
}
