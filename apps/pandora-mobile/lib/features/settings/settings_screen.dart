import 'package:flutter/material.dart';

import '../../app/pandora_dependencies.dart';
import '../../core/design/pandora_tokens.dart';
import '../../core/security/pandora_auth.dart';
import '../../core/widgets/pandora_page.dart';
import '../connections/connections_screen.dart';
import '../diagnostics/developer_diagnostics_screen.dart';
import '../intelligence/owner_intelligence_screen.dart';
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
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => _signingOut = false);
    }
  }

  void _open(Widget screen) {
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
  }

  Widget _tile({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return ListTile(
      minVerticalPadding: PandoraSpacing.sm,
      leading: Icon(icon),
      title: Text(title),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    );
  }

  @override
  Widget build(BuildContext context) => PandoraPage(
    title: 'Settings',
    subtitle: 'Owner controls and secondary operating surfaces.',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: Text(
            'Owner intelligence',
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        const SizedBox(height: PandoraSpacing.xs),
        Card(
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              _tile(
                icon: Icons.auto_awesome_rounded,
                title: 'Portfolio intelligence',
                subtitle: 'Priorities, recommendations, and Needs You',
                onTap: () => _open(const OwnerIntelligenceScreen()),
              ),
              const Divider(height: 1),
              _tile(
                icon: Icons.psychology_alt_outlined,
                title: 'Memory & learning',
                subtitle: 'Owner-readable truth and learning signals',
                onTap: () => _open(
                  const OwnerIntelligenceScreen(
                    initialSection: OwnerIntelligenceSection.memory,
                  ),
                ),
              ),
              const Divider(height: 1),
              _tile(
                icon: Icons.search_rounded,
                title: 'Universal search',
                subtitle: 'Projects, approvals, activity, connections',
                onTap: () => _open(
                  const OwnerIntelligenceScreen(
                    initialSection: OwnerIntelligenceSection.search,
                  ),
                ),
              ),
              const Divider(height: 1),
              _tile(
                icon: Icons.notifications_none_rounded,
                title: 'Notifications',
                subtitle: 'Owner-relevant attention inbox',
                onTap: () => _open(
                  const OwnerIntelligenceScreen(
                    initialSection: OwnerIntelligenceSection.notifications,
                  ),
                ),
              ),
              const Divider(height: 1),
              _tile(
                icon: Icons.auto_mode_rounded,
                title: 'Autopilot',
                subtitle: 'Prepare or continue governed safe work',
                onTap: () => _open(
                  const OwnerIntelligenceScreen(
                    initialSection: OwnerIntelligenceSection.autopilot,
                  ),
                ),
              ),
              const Divider(height: 1),
              _tile(
                icon: Icons.rocket_launch_outlined,
                title: 'Release center',
                subtitle: 'Proof ladder, blockers, and next release gates',
                onTap: () => _open(
                  const OwnerIntelligenceScreen(
                    initialSection: OwnerIntelligenceSection.release,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: PandoraSpacing.xl),
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
              _tile(
                icon: Icons.cable_rounded,
                title: 'Connections',
                subtitle: 'Readiness, scope, and provider capability',
                onTap: () => _open(const ConnectionsScreen()),
              ),
              const Divider(height: 1),
              _tile(
                icon: Icons.shield_outlined,
                title: 'Safety',
                subtitle: 'Policy, authorization, and evidence posture',
                onTap: () => _open(const SafetyScreen()),
              ),
              const Divider(height: 1),
              _tile(
                icon: Icons.monitor_heart_outlined,
                title: 'Developer diagnostics',
                subtitle: 'Sanitized, temporary request metadata',
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
