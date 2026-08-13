import 'package:flutter/material.dart';

import '../../app/pandora_dependencies.dart';
import '../../core/design/pandora_tokens.dart';
import '../../core/security/pandora_auth.dart';
import '../../core/widgets/pandora_page.dart';
import '../connections/connections_screen.dart';
import '../diagnostics/developer_diagnostics_screen.dart';
import '../safety/safety_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _signingOut = false;

  Future<void> _signOut() async {
    if (_signingOut) return;
    setState(() => _signingOut = true);
    final dependencies = PandoraDependencies.of(context);
    try {
      dependencies.repository.clearReadOnlyCache();
      dependencies.diagnostics.clear();
      await dependencies.auth.signOut();
    } on PandoraAuthFailure catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    } finally {
      if (mounted) setState(() => _signingOut = false);
    }
  }

  void _open(Widget screen) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => screen),
    );
  }

  @override
  Widget build(BuildContext context) => PandoraPage(
        title: 'Settings',
        subtitle: 'Account controls and secondary operational details.',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              header: true,
              child: Text(
                'Operations',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            const SizedBox(height: PandoraSpacing.xs),
            Card(
              clipBehavior: Clip.antiAlias,
              child: Column(
                children: [
                  ListTile(
                    minVerticalPadding: PandoraSpacing.sm,
                    leading: const Icon(Icons.cable_rounded),
                    title: const Text('Connections'),
                    subtitle: const Text('Readiness and permissions'),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => _open(const ConnectionsScreen()),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    minVerticalPadding: PandoraSpacing.sm,
                    leading: const Icon(Icons.shield_outlined),
                    title: const Text('Safety'),
                    subtitle: const Text('Policy and evidence posture'),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => _open(const SafetyScreen()),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    minVerticalPadding: PandoraSpacing.sm,
                    leading: const Icon(Icons.monitor_heart_outlined),
                    title: const Text('Developer diagnostics'),
                    subtitle:
                        const Text('Sanitized, temporary request metadata'),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => _open(const DeveloperDiagnosticsScreen()),
                  ),
                ],
              ),
            ),
            const SizedBox(height: PandoraSpacing.xl),
            Semantics(
              header: true,
              child: Text(
                'Account',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            const SizedBox(height: PandoraSpacing.xs),
            OutlinedButton.icon(
              onPressed: _signingOut ? null : _signOut,
              icon: _signingOut
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.logout_rounded),
              label: const Text('Sign out'),
            ),
          ],
        ),
      );
}
