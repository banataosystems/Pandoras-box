#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path

THEME = Path("automation/flutterflow/dsl/10_owner_api_state_navigation.dart")
UI = Path("automation/flutterflow/dsl/selector_bindings.dart")


def sub_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return updated


def replace_required(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count < 1:
        raise SystemExit(f"{label}: expected at least one match")
    return text.replace(old, new)


def patch_theme(text: str) -> str:
    replacement = '''void _configurePandoraTheme(App app) {
  // P2 premium institutional foundation. The approved Pandora mark is
  // monochrome and its manifest forbids recoloring, so no brand-red seed is
  // invented here. Semantic error red remains reserved for destructive/error
  // states until an independently approved Pandora accent token exists.
  app.themeColor('primary', 0xFF171717, dark: 0xFF2B2B2B);
  app.themeColor('secondary', 0xFF3F3F46, dark: 0xFF52525B);
  app.themeColor('tertiary', 0xFF71717A, dark: 0xFFA1A1AA);
  app.themeColor('alternate', 0xFFE4E4E7, dark: 0xFF2F2F35);
  app.themeColor(
    'primaryBackground',
    0xFFF7F7F5,
    dark: 0xFF090909,
  );
  app.themeColor(
    'secondaryBackground',
    0xFFFFFFFF,
    dark: 0xFF151515,
  );
  app.themeColor('primaryText', 0xFF111111, dark: 0xFFF7F7F5);
  app.themeColor('secondaryText', 0xFF5F6368, dark: 0xFFB8B8B8);
  app.themeColor('accent1', 0x14111111, dark: 0x1FF7F7F5);
  app.themeColor('accent2', 0x143F3F46, dark: 0x1F52525B);
  app.themeColor('accent3', 0x1471717A, dark: 0x1FA1A1AA);
  app.themeColor('accent4', 0xF2FFFFFF, dark: 0xF2151515);
  app.themeColor('success', 0xFF166C46, dark: 0xFF4FAE7A);
  app.themeColor('warning', 0xFF946200, dark: 0xFFD9A441);
  app.themeColor('error', 0xFFB42318, dark: 0xFFE57373);
  app.themeColor('info', 0xFF52525B, dark: 0xFFA1A1AA);
  app.darkMode(enabled: true);
  app.breakpoints(small: 479, medium: 991, large: 1200);
}'''
    return sub_once(
        text,
        r"void _configurePandoraTheme\(App app\) \{.*?\n\}",
        replacement,
        "premium theme",
    )


def patch_ui(text: str) -> str:
    token_block = '''abstract final class PandoraUi {
  static const double microGap = 4;
  static const double compactGap = 8;
  static const double rowGap = 12;
  static const double contentGap = 16;
  static const double pagePadding = 20;
  static const double sectionGap = 24;
  static const double panelPadding = 16;
  static const double panelRadius = 18;
  static const double appMark = 44;
  static const double touchTarget = 48;
}

'''
    marker = "final class PandoraBindingSpec {"
    if token_block.strip() in text:
        raise SystemExit("design tokens already exist; use --check")
    if text.count(marker) != 1:
        raise SystemExit("design token insertion point is ambiguous")
    text = text.replace(marker, token_block + marker, 1)

    replacements = [
        ("spacing: 3,", "spacing: PandoraUi.microGap,", "micro spacing"),
        ("spacing: 4,", "spacing: PandoraUi.microGap,", "4pt spacing"),
        ("spacing: 6,", "spacing: PandoraUi.compactGap,", "6pt spacing"),
        ("spacing: 8,", "spacing: PandoraUi.compactGap,", "8pt spacing"),
        ("spacing: 10,", "spacing: PandoraUi.rowGap,", "10pt spacing"),
        ("spacing: 12,", "spacing: PandoraUi.rowGap,", "12pt spacing"),
        ("spacing: 14,", "spacing: PandoraUi.contentGap,", "14pt spacing"),
        ("spacing: 16,", "spacing: PandoraUi.contentGap,", "16pt spacing"),
        ("runSpacing: 8,", "runSpacing: PandoraUi.compactGap,", "wrap spacing"),
        (
            "padding: const EdgeInsets.all(16),",
            "padding: const EdgeInsets.all(PandoraUi.pagePadding),",
            "standard page padding",
        ),
        (
            "padding: const EdgeInsets.all(24),",
            "padding: const EdgeInsets.all(PandoraUi.sectionGap),",
            "large page padding",
        ),
        (
            "padding: const EdgeInsets.all(14),",
            "padding: const EdgeInsets.all(PandoraUi.panelPadding),",
            "panel padding",
        ),
        ("borderRadius: 12,", "borderRadius: PandoraUi.panelRadius,", "panel radius"),
        ("_mark(42)", "_mark(PandoraUi.appMark)", "header mark"),
    ]
    for old, new, label in replacements:
        if old in text:
            text = replace_required(text, old, new, label)

    # Remove the remaining blue-oriented label from the Home surface while
    # keeping health truth explicit. This is copy-only; no state is fabricated.
    text = text.replace("Text('SYSTEM HEALTH', style: Styles.labelMedium)",
                        "Text('CURRENT STATUS', style: Styles.labelMedium)")
    return text


def check(theme: str, ui: str) -> None:
    required_theme = [
        "app.themeColor('primary', 0xFF171717, dark: 0xFF2B2B2B);",
        "0xFFF7F7F5",
        "dark: 0xFF090909",
        "0xFFFFFFFF",
        "dark: 0xFF151515",
        "app.themeColor('info', 0xFF52525B, dark: 0xFFA1A1AA);",
        "app.darkMode(enabled: true);",
    ]
    missing_theme = [item for item in required_theme if item not in theme]
    if missing_theme:
        raise SystemExit(f"premium theme missing: {missing_theme}")

    forbidden_theme = [
        "0xFF111827",
        "0xFF375A7F",
        "0xFF7FA6C9",
        "gradient",
    ]
    leaked_theme = [item for item in forbidden_theme if item.lower() in theme.lower()]
    if leaked_theme:
        raise SystemExit(f"legacy/blue theme fragments remain: {leaked_theme}")

    required_ui = [
        "abstract final class PandoraUi",
        "static const double microGap = 4;",
        "static const double compactGap = 8;",
        "static const double rowGap = 12;",
        "static const double contentGap = 16;",
        "static const double pagePadding = 20;",
        "static const double sectionGap = 24;",
        "static const double panelPadding = 16;",
        "static const double panelRadius = 18;",
        "static const double touchTarget = 48;",
        "padding: const EdgeInsets.all(PandoraUi.panelPadding)",
        "borderRadius: PandoraUi.panelRadius",
    ]
    missing_ui = [item for item in required_ui if item not in ui]
    if missing_ui:
        raise SystemExit(f"design-system tokens missing: {missing_ui}")

    legacy_geometry = [
        "spacing: 3,",
        "spacing: 6,",
        "spacing: 10,",
        "spacing: 14,",
        "padding: const EdgeInsets.all(14),",
        "borderRadius: 12,",
    ]
    remaining = [item for item in legacy_geometry if item in ui]
    if remaining:
        raise SystemExit(f"non-grid legacy geometry remains: {remaining}")

    # P1 language firewall remains a prerequisite for P2.
    forbidden_owner = [
        "item['provider']",
        "State(spec.projectData)['repository']",
        "_brandHeader('Work'",
        "_brandHeader('Approve'",
        "_brandHeader('Memory & updates'",
    ]
    owner_leaks = [item for item in forbidden_owner if item in ui]
    if owner_leaks:
        raise SystemExit(f"P1 regression detected: {owner_leaks}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.apply == args.check:
        raise SystemExit("choose exactly one of --apply or --check")

    theme = THEME.read_text()
    ui = UI.read_text()
    if args.apply:
        theme = patch_theme(theme)
        ui = patch_ui(ui)
        check(theme, ui)
        THEME.write_text(theme)
        UI.write_text(ui)
        print("PANDORA_P2_DESIGN_PATCH APPLIED")
    else:
        check(theme, ui)
        print("PANDORA_P2_DESIGN_GUARD PASS")


if __name__ == "__main__":
    main()
