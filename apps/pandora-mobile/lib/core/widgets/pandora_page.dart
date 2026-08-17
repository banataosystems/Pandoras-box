import 'package:flutter/material.dart';

import '../design/pandora_tokens.dart';
import 'pandora_mark.dart';

class PandoraPage extends StatelessWidget {
  const PandoraPage({
    super.key,
    required this.title,
    required this.child,
    this.subtitle,
    this.actions = const <Widget>[],
    this.onRefresh,
    this.showProductMark = false,
  });

  final String title;
  final String? subtitle;
  final Widget child;
  final List<Widget> actions;
  final Future<void> Function()? onRefresh;
  final bool showProductMark;

  @override
  Widget build(BuildContext context) {
    final content = CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverAppBar.large(
          title: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (showProductMark) ...[
                const PandoraMark(),
                const SizedBox(width: PandoraSpacing.sm),
              ],
              Flexible(child: Text(title)),
            ],
          ),
          actions: actions,
          pinned: true,
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            PandoraSpacing.md,
            PandoraSpacing.xs,
            PandoraSpacing.md,
            PandoraSpacing.xxl,
          ),
          sliver: SliverToBoxAdapter(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  maxWidth: PandoraSize.contentMaxWidth,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (subtitle != null) ...[
                      Text(
                        subtitle!,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                              color: Theme.of(context)
                                  .colorScheme
                                  .onSurfaceVariant,
                            ),
                      ),
                      const SizedBox(height: PandoraSpacing.xl),
                    ],
                    child,
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
    final scrollable = onRefresh == null
        ? content
        : RefreshIndicator(onRefresh: onRefresh!, child: content);
    return SafeArea(top: false, child: scrollable);
  }
}
