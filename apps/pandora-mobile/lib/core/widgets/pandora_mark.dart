import 'package:flutter/material.dart';

import '../design/pandora_tokens.dart';

class PandoraMark extends StatelessWidget {
  const PandoraMark({
    super.key,
    this.size = PandoraSize.compactMark,
    this.semanticLabel = "Pandora's Box",
  });

  static const assetPath = 'assets/brand/pandora-product-mark-ui-1024.png';

  final double size;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) => Semantics(
        image: true,
        label: semanticLabel,
        child: SizedBox.square(
          dimension: size,
          child: Image.asset(
            assetPath,
            fit: BoxFit.contain,
            filterQuality: FilterQuality.high,
            cacheWidth: (size * MediaQuery.devicePixelRatioOf(context)).round(),
            cacheHeight:
                (size * MediaQuery.devicePixelRatioOf(context)).round(),
            excludeFromSemantics: true,
            errorBuilder: (context, error, stackTrace) => DecoratedBox(
              decoration: BoxDecoration(
                color: Colors.black,
                border: Border.all(color: Theme.of(context).colorScheme.error),
              ),
              child: Icon(
                Icons.broken_image_outlined,
                color: Theme.of(context).colorScheme.error,
              ),
            ),
          ),
        ),
      );
}
