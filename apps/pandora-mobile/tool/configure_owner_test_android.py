#!/usr/bin/env python3
"""Apply the bounded Android identity used by the Pandora Owner Test APK."""

from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        print(
            "usage: configure_owner_test_android.py <AndroidManifest.xml>",
            file=sys.stderr,
        )
        return 2

    manifest = Path(sys.argv[1])
    if not manifest.is_file():
        print(f"Android manifest not found: {manifest}", file=sys.stderr)
        return 2

    text = manifest.read_text(encoding="utf-8")
    generated_label = 'android:label="pandora_mobile"'
    owner_test_label = 'android:label="Pandora"'

    if text.count(generated_label) != 1:
        print(
            "Expected exactly one generated pandora_mobile application label; "
            "refusing an ambiguous manifest mutation.",
            file=sys.stderr,
        )
        return 1

    if 'android:usesCleartextTraffic="true"' in text:
        print(
            "Pandora Owner Test must not explicitly enable cleartext traffic.",
            file=sys.stderr,
        )
        return 1

    updated = text.replace(generated_label, owner_test_label, 1)
    manifest.write_text(updated, encoding="utf-8")

    verified = manifest.read_text(encoding="utf-8")
    if verified.count(owner_test_label) != 1 or generated_label in verified:
        print("Android owner-test identity verification failed.", file=sys.stderr)
        return 1

    print("Configured Android application label: Pandora")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
