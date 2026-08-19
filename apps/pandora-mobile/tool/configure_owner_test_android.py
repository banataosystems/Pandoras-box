#!/usr/bin/env python3
"""Apply the bounded Android identity and value widget used by Pandora Mobile."""

from __future__ import annotations

import sys
from pathlib import Path


VALUE_WIDGET_RECEIVER = """        <receiver
            android:name=\".PandoraValueWidget\"
            android:enabled=\"true\"
            android:exported=\"false\"
            android:label=\"@string/pandora_value_widget_name\">
            <intent-filter>
                <action android:name=\"android.appwidget.action.APPWIDGET_UPDATE\" />
            </intent-filter>
            <meta-data
                android:name=\"android.appwidget.provider\"
                android:resource=\"@xml/pandora_value_widget_info\" />
        </receiver>
"""

INTERNET_PERMISSION = (
    '    <uses-permission android:name="android.permission.INTERNET" />\n'
)


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

    permission_marker = 'android.permission.INTERNET'
    if permission_marker in text:
        print(
            "Generated release manifest unexpectedly already contains INTERNET; "
            "refusing a duplicate permission mutation.",
            file=sys.stderr,
        )
        return 1

    application_open = "    <application"
    if text.count(application_open) != 1:
        print(
            "Expected exactly one generated application open tag; refusing an "
            "ambiguous INTERNET permission mutation.",
            file=sys.stderr,
        )
        return 1

    application_close = "    </application>"
    if text.count(application_close) != 1:
        print(
            "Expected exactly one generated application close tag; refusing an "
            "ambiguous widget registration.",
            file=sys.stderr,
        )
        return 1

    if 'android:name=".PandoraValueWidget"' in text:
        print(
            "Generated manifest unexpectedly already contains PandoraValueWidget.",
            file=sys.stderr,
        )
        return 1

    updated = text.replace(
        application_open,
        f"{INTERNET_PERMISSION}{application_open}",
        1,
    )
    updated = updated.replace(generated_label, owner_test_label, 1)
    updated = updated.replace(
        application_close,
        f"{VALUE_WIDGET_RECEIVER}{application_close}",
        1,
    )
    manifest.write_text(updated, encoding="utf-8")

    verified = manifest.read_text(encoding="utf-8")
    widget_checks = (
        'android:name=".PandoraValueWidget"',
        'android:exported="false"',
        'android.appwidget.action.APPWIDGET_UPDATE',
        'android:resource="@xml/pandora_value_widget_info"',
    )
    if verified.count(owner_test_label) != 1 or generated_label in verified:
        print("Android owner-test identity verification failed.", file=sys.stderr)
        return 1
    if verified.count(permission_marker) != 1:
        print("Android INTERNET permission verification failed.", file=sys.stderr)
        return 1
    if any(verified.count(marker) != 1 for marker in widget_checks):
        print("Android value-widget registration verification failed.", file=sys.stderr)
        return 1

    print("Configured Android application label: Pandora")
    print("Granted Android INTERNET permission for authenticated owner sync")
    print("Registered non-exported Pandora Value home-screen widget")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
