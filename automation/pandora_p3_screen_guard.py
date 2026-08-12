#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

UI = Path("automation/flutterflow/dsl/selector_bindings.dart")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def patch(text: str) -> str:
    text = replace_once(
        text,
        "    _brandHeader('Pandora\\'s Box', 'Owner command center'),",
        "    _brandHeader('Pandora\\'s Box', 'Build, fix, publish, and restore in plain language'),",
        "home product language",
    )
    text = replace_once(
        text,
        '''    Button(
      'Sign in',
      name: 'PandoraSignInButton',
      width: double.infinity,
      visible:''',
        '''    Button(
      'Sign in',
      name: 'PandoraSignInButton',
      width: double.infinity,
      height: 48,
      visible:''',
        "sign-in touch target",
    )
    text = replace_once(
        text,
        '''          Button(
            'Ask Pandora',
            name: 'PandoraOwnerCommandButton',
            visible:''',
        '''          Button(
            'Ask Pandora',
            name: 'PandoraOwnerCommandButton',
            width: double.infinity,
            height: 48,
            visible:''',
        "Ask Pandora touch target",
    )
    text = replace_once(
        text,
        '''    Button(
      'Review all approvals',
      name: 'PandoraProjectApprovalsButton',
      variant:''',
        '''    Button(
      'Review all approvals',
      name: 'PandoraProjectApprovalsButton',
      height: 48,
      variant:''',
        "project approvals touch target",
    )
    text = replace_once(
        text,
        '''    Button(
      'Choose an action for this project',
      name: 'PandoraProjectWorkButton',
      onTap:''',
        '''    Button(
      'Choose an action for this project',
      name: 'PandoraProjectWorkButton',
      height: 48,
      onTap:''',
        "project action touch target",
    )
    text = replace_once(
        text,
        "        spacing: 5,",
        "        spacing: PandoraUi.compactGap,",
        "composer grid spacing",
    )
    text = replace_once(
        text,
        "        Text('Action plan', style: Styles.titleLarge),",
        "        Text('Preview', style: Styles.titleLarge),",
        "preview title",
    )
    text = replace_once(
        text,
        '''          Text('Action', style: Styles.labelMedium),
          Text(Param(spec.planActionId), style: Styles.titleMedium),
          Text('Project', style: Styles.labelMedium),
          Text(Param(spec.planProjectId), style: Styles.bodyMedium),
          Text('Requested outcome', style: Styles.labelMedium),
          Text(Param(spec.planRequestMessage), style: Styles.bodyMedium),''',
        '''          Text('Requested outcome', style: Styles.labelMedium),
          Text(Param(spec.planRequestMessage), style: Styles.bodyMedium),
          Text(
            'Pandora will use the project and action you selected.',
            style: Styles.bodySmall,
          ),''',
        "preview internal identifier removal",
    )
    return text


def check(text: str) -> None:
    required = [
        "_brandHeader('Actions', 'Choose what you want Pandora to do')",
        "_brandHeader('Approvals', 'Only decisions that need you')",
        "_brandHeader('Activity', 'Recent changes and verified records')",
        "Text('Preview', style: Styles.titleLarge)",
        "name: 'PandoraOwnerCommandButton'",
        "name: 'PandoraSignInButton'",
        "height: 48",
        "Pandora will use the project and action you selected.",
    ]
    missing = [item for item in required if item not in text]
    if missing:
        raise SystemExit(f"P3 screen contract missing: {missing}")

    forbidden = [
        "Text(Param(spec.planActionId)",
        "Text(Param(spec.planProjectId)",
        "spacing: 5,",
        "_brandHeader('Work'",
        "_brandHeader('Approve'",
        "_brandHeader('Memory & updates'",
        "item['provider']",
        "State(spec.projectData)['repository']",
    ]
    leaked = [item for item in forbidden if item in text]
    if leaked:
        raise SystemExit(f"P3 owner-surface regression: {leaked}")

    # These four high-frequency primary decisions must retain explicit 48px
    # targets regardless of visual-builder defaults.
    for name in [
        "PandoraSignInButton",
        "PandoraOwnerCommandButton",
        "PandoraReviewPlanButton",
        "PandoraRunActionButton",
        "ApprovePandoraChangeButton",
        "RejectPandoraChangeButton",
        "PandoraMemorySearchButton",
    ]:
        index = text.find(f"name: '{name}'")
        if index < 0:
            raise SystemExit(f"missing primary control {name}")
        window = text[index:index + 260]
        if "height: 48" not in window:
            raise SystemExit(f"{name} is missing an explicit 48px target")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.apply == args.check:
        raise SystemExit("choose exactly one of --apply or --check")

    text = UI.read_text()
    if args.apply:
        text = patch(text)
        check(text)
        UI.write_text(text)
        print("PANDORA_P3_SCREEN_PATCH APPLIED")
    else:
        check(text)
        print("PANDORA_P3_SCREEN_GUARD PASS")


if __name__ == "__main__":
    main()
