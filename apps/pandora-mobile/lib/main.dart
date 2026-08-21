import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'pandora_api.dart';
import 'pandora_config.dart';
import 'bok_preview.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(
    url: PandoraConfig.supabaseUrl,
    publishableKey: PandoraConfig.supabasePublishableKey,
  );
  runApp(const PandoraApp());
}

class PandoraApp extends StatelessWidget {
  const PandoraApp({super.key});

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFF9DA8FF);
    return MaterialApp(
      title: 'Pandora',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.dark,
      darkTheme: ThemeData(
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: seed,
          brightness: Brightness.dark,
          surface: const Color(0xFF111216),
        ),
        scaffoldBackgroundColor: const Color(0xFF090A0D),
        useMaterial3: true,
        cardTheme: const CardThemeData(
          margin: EdgeInsets.zero,
          elevation: 0,
          clipBehavior: Clip.antiAlias,
        ),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
        ),
      ),
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  late final StreamSubscription<AuthState> _subscription;

  @override
  void initState() {
    super.initState();
    _subscription = Supabase.instance.client.auth.onAuthStateChange.listen(
      (_) {
        if (mounted) setState(() {});
      },
      onError: (Object _) {
        if (mounted) setState(() {});
      },
    );
  }

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = Supabase.instance.client.auth.currentSession;
    return session == null ? const SignInScreen() : const PandoraShell();
  }
}

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    final email = _email.text.trim();
    final password = _password.text;
    if (email.isEmpty || password.isEmpty) {
      _show('Enter your email and password.');
      return;
    }
    setState(() => _busy = true);
    try {
      await Supabase.instance.client.auth.signInWithPassword(
        email: email,
        password: password,
      );
    } on AuthException catch (error) {
      _show(error.message);
    } catch (_) {
      _show('Could not sign in to Pandora.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resetPassword() async {
    final email = _email.text.trim();
    if (email.isEmpty) {
      _show('Enter your email first.');
      return;
    }
    setState(() => _busy = true);
    try {
      await Supabase.instance.client.auth.resetPasswordForEmail(email);
      _show('Password reset instructions were requested for $email.');
    } on AuthException catch (error) {
      _show(error.message);
    } catch (_) {
      _show('Could not request a password reset.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _show(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 430),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(Icons.hub_outlined, size: 52),
                  const SizedBox(height: 22),
                  Text('Pandora', style: Theme.of(context).textTheme.displaySmall),
                  const SizedBox(height: 8),
                  Text(
                    'The owner control surface for Banatao Systems.',
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 32),
                  TextField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    decoration: const InputDecoration(
                      labelText: 'Email',
                      prefixIcon: Icon(Icons.alternate_email),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _password,
                    obscureText: true,
                    enableSuggestions: false,
                    onSubmitted: (_) {
                      if (!_busy) _signIn();
                    },
                    decoration: const InputDecoration(
                      labelText: 'Password',
                      prefixIcon: Icon(Icons.lock_outline),
                    ),
                  ),
                  const SizedBox(height: 18),
                  FilledButton(
                    onPressed: _busy ? null : _signIn,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      child: _busy
                          ? const SizedBox.square(
                              dimension: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Sign in'),
                    ),
                  ),
                  TextButton(
                    onPressed: _busy ? null : _resetPassword,
                    child: const Text('Reset password'),
                  ),
                  const SizedBox(height: 6),
                  OutlinedButton.icon(
                    onPressed: _busy
                        ? null
                        : () => Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => const BokPreviewScreen(),
                              ),
                            ),
                    icon: const Icon(Icons.visibility_outlined),
                    label: const Text('Open BOK pilot preview'),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Authentication is provided by the canonical MCPMaster Supabase project. '
                    'No service credentials are stored in this app.',
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class PandoraShell extends StatefulWidget {
  const PandoraShell({super.key});

  @override
  State<PandoraShell> createState() => _PandoraShellState();
}

class _PandoraShellState extends State<PandoraShell> {
  int _index = 0;
  late final PandoraApi _api = PandoraApi();

  @override
  void dispose() {
    _api.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[
      CommandCenter(api: _api),
      DataScreen(
        key: const ValueKey('projects'),
        api: _api,
        title: 'Projects',
        loader: _api.projects,
      ),
      ActionsScreen(api: _api),
      ApprovalsScreen(api: _api),
      MoreScreen(api: _api),
    ];
    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.workspaces_outline), label: 'Projects'),
          NavigationDestination(icon: Icon(Icons.bolt_outlined), label: 'Actions'),
          NavigationDestination(icon: Icon(Icons.approval_outlined), label: 'Approvals'),
          NavigationDestination(icon: Icon(Icons.more_horiz), label: 'More'),
        ],
      ),
    );
  }
}

class PandoraPage extends StatelessWidget {
  const PandoraPage({
    super.key,
    required this.title,
    required this.child,
    this.actions = const [],
  });
  final String title;
  final Widget child;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: CustomScrollView(
        slivers: [
          SliverAppBar.large(
            title: Text(title),
            actions: actions,
            pinned: true,
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
            sliver: SliverToBoxAdapter(child: child),
          ),
        ],
      ),
    );
  }
}

class CommandCenter extends StatefulWidget {
  const CommandCenter({super.key, required this.api});
  final PandoraApi api;

  @override
  State<CommandCenter> createState() => _CommandCenterState();
}

class _CommandCenterState extends State<CommandCenter> {
  late Future<dynamic> _home;
  final _message = TextEditingController();
  final _projectId = TextEditingController();
  bool _asking = false;
  dynamic _answer;

  @override
  void initState() {
    super.initState();
    _home = widget.api.home();
  }

  @override
  void dispose() {
    _message.dispose();
    _projectId.dispose();
    super.dispose();
  }

  Future<void> _ask() async {
    final message = _message.text.trim();
    if (message.isEmpty) return;
    setState(() => _asking = true);
    try {
      final answer = await widget.api.ask(
        message: message,
        projectId: _projectId.text.trim().isEmpty ? null : _projectId.text.trim(),
      );
      if (mounted) setState(() => _answer = answer);
    } catch (error) {
      if (mounted) _snack(context, error.toString());
    } finally {
      if (mounted) setState(() => _asking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PandoraPage(
      title: 'Command Center',
      actions: [
        IconButton(
          tooltip: 'Refresh',
          onPressed: () => setState(() => _home = widget.api.home()),
          icon: const Icon(Icons.refresh),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FuturePanel(future: _home),
          const SizedBox(height: 18),
          _Section(
            title: 'Ask Pandora',
            subtitle: 'Use the governed owner API; execution still obeys server-side approval gates.',
            child: Column(
              children: [
                TextField(
                  controller: _message,
                  minLines: 2,
                  maxLines: 5,
                  decoration: const InputDecoration(
                    labelText: 'What do you want Pandora to do?',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _projectId,
                  decoration: const InputDecoration(
                    labelText: 'Project ID (optional)',
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: _asking ? null : _ask,
                    icon: const Icon(Icons.send_outlined),
                    label: Text(_asking ? 'Sending…' : 'Ask Pandora'),
                  ),
                ),
              ],
            ),
          ),
          if (_answer != null) ...[
            const SizedBox(height: 18),
            _Section(title: 'Response', child: JsonView(data: _answer)),
          ],
        ],
      ),
    );
  }
}

class DataScreen extends StatefulWidget {
  const DataScreen({
    super.key,
    required this.api,
    required this.title,
    required this.loader,
  });
  final PandoraApi api;
  final String title;
  final Future<dynamic> Function() loader;

  @override
  State<DataScreen> createState() => _DataScreenState();
}

class _DataScreenState extends State<DataScreen> {
  late Future<dynamic> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.loader();
  }

  @override
  Widget build(BuildContext context) => PandoraPage(
        title: widget.title,
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () => setState(() => _future = widget.loader()),
            icon: const Icon(Icons.refresh),
          ),
        ],
        child: FuturePanel(future: _future),
      );
}

class ActionsScreen extends StatefulWidget {
  const ActionsScreen({super.key, required this.api});
  final PandoraApi api;

  @override
  State<ActionsScreen> createState() => _ActionsScreenState();
}

class _ActionsScreenState extends State<ActionsScreen> {
  late Future<dynamic> _future;
  final _actionId = TextEditingController();
  final _projectId = TextEditingController();
  dynamic _result;
  bool _running = false;

  @override
  void initState() {
    super.initState();
    _future = widget.api.actions();
  }

  @override
  void dispose() {
    _actionId.dispose();
    _projectId.dispose();
    super.dispose();
  }

  Future<void> _run() async {
    final actionId = _actionId.text.trim();
    if (actionId.isEmpty) {
      _snack(context, 'Enter an action ID.');
      return;
    }
    setState(() => _running = true);
    try {
      final value = await widget.api.runAction(
        actionId: actionId,
        projectId: _projectId.text.trim().isEmpty ? null : _projectId.text.trim(),
      );
      if (mounted) setState(() => _result = value);
    } catch (error) {
      if (mounted) _snack(context, error.toString());
    } finally {
      if (mounted) setState(() => _running = false);
    }
  }

  @override
  Widget build(BuildContext context) => PandoraPage(
        title: 'Actions',
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () => setState(() => _future = widget.api.actions()),
            icon: const Icon(Icons.refresh),
          ),
        ],
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FuturePanel(future: _future),
            const SizedBox(height: 18),
            _Section(
              title: 'Run action',
              subtitle: 'A write may return a pending approval instead of executing immediately.',
              child: Column(
                children: [
                  TextField(
                    controller: _actionId,
                    decoration: const InputDecoration(labelText: 'Action ID'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _projectId,
                    decoration: const InputDecoration(labelText: 'Project ID (optional)'),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _running ? null : _run,
                      icon: const Icon(Icons.play_arrow),
                      label: Text(_running ? 'Submitting…' : 'Run through ProjectOS'),
                    ),
                  ),
                ],
              ),
            ),
            if (_result != null) ...[
              const SizedBox(height: 18),
              _Section(title: 'Result', child: JsonView(data: _result)),
            ],
          ],
        ),
      );
}

class ApprovalsScreen extends StatefulWidget {
  const ApprovalsScreen({super.key, required this.api});
  final PandoraApi api;

  @override
  State<ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends State<ApprovalsScreen> {
  late Future<dynamic> _future;
  final _approvalId = TextEditingController();
  final _reason = TextEditingController();
  dynamic _result;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _future = widget.api.approvals();
  }

  @override
  void dispose() {
    _approvalId.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _decide(String decision) async {
    final approvalId = _approvalId.text.trim();
    if (approvalId.isEmpty) {
      _snack(context, 'Enter an approval ID.');
      return;
    }
    setState(() => _busy = true);
    try {
      final value = await widget.api.decideApproval(
        approvalId: approvalId,
        decision: decision,
        reason: _reason.text.trim(),
      );
      if (mounted) {
        setState(() {
          _result = value;
          _future = widget.api.approvals();
        });
      }
    } catch (error) {
      if (mounted) _snack(context, error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PandoraPage(
        title: 'Approvals',
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () => setState(() => _future = widget.api.approvals()),
            icon: const Icon(Icons.refresh),
          ),
        ],
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FuturePanel(future: _future),
            const SizedBox(height: 18),
            _Section(
              title: 'Decision',
              subtitle: 'The backend is authoritative. If stronger authentication is required, the app fails closed and shows that response.',
              child: Column(
                children: [
                  TextField(
                    controller: _approvalId,
                    decoration: const InputDecoration(labelText: 'Approval ID'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _reason,
                    minLines: 2,
                    maxLines: 4,
                    decoration: const InputDecoration(labelText: 'Reason (optional)'),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: _busy ? null : () => _decide('approved'),
                          icon: const Icon(Icons.check),
                          label: const Text('Approve'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _busy ? null : () => _decide('rejected'),
                          icon: const Icon(Icons.close),
                          label: const Text('Reject'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (_result != null) ...[
              const SizedBox(height: 18),
              _Section(title: 'Decision result', child: JsonView(data: _result)),
            ],
          ],
        ),
      );
}

class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key, required this.api});
  final PandoraApi api;

  @override
  Widget build(BuildContext context) => PandoraPage(
        title: 'More',
        actions: [
          IconButton(
            tooltip: 'Sign out',
            onPressed: () => Supabase.instance.client.auth.signOut(),
            icon: const Icon(Icons.logout),
          ),
        ],
        child: Column(
          children: [
            _MoreTile(
              icon: Icons.link,
              title: 'Connections',
              onTap: () => _open(context, 'Connections', api.connections),
            ),
            const SizedBox(height: 10),
            _MoreTile(
              icon: Icons.history,
              title: 'Activity & audit',
              onTap: () => _open(context, 'Activity & audit', api.activity),
            ),
            const SizedBox(height: 10),
            _MoreTile(
              icon: Icons.shield_outlined,
              title: 'Safety & security',
              onTap: () => _open(context, 'Safety & security', api.safety),
            ),
            const SizedBox(height: 18),
            const _Section(
              title: 'Runtime',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Canonical source: banataosystems/Pandoras-box'),
                  SizedBox(height: 6),
                  Text('Owner API: https://mcpmaster.vercel.app/api/operator'),
                  SizedBox(height: 6),
                  Text('Memory: https://pandorasbox-memory.vercel.app'),
                ],
              ),
            ),
          ],
        ),
      );

  void _open(
    BuildContext context,
    String title,
    Future<dynamic> Function() loader,
  ) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          body: DataScreen(api: api, title: title, loader: loader),
        ),
      ),
    );
  }
}

class FuturePanel extends StatelessWidget {
  const FuturePanel({super.key, required this.future});
  final Future<dynamic> future;

  @override
  Widget build(BuildContext context) => FutureBuilder<dynamic>(
        future: future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const _Section(
              title: 'Loading',
              child: LinearProgressIndicator(),
            );
          }
          if (snapshot.hasError) {
            return _Section(
              title: 'Could not load',
              child: SelectableText(snapshot.error.toString()),
            );
          }
          return _Section(
            title: 'Live data',
            child: JsonView(data: snapshot.data),
          );
        },
      );
}

class JsonView extends StatelessWidget {
  const JsonView({super.key, required this.data});
  final dynamic data;

  @override
  Widget build(BuildContext context) {
    String text;
    try {
      text = const JsonEncoder.withIndent('  ').convert(data);
    } catch (_) {
      text = data?.toString() ?? 'No data';
    }
    return SelectableText(
      text,
      style: const TextStyle(fontFamily: 'monospace', height: 1.4),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child, this.subtitle});
  final String title;
  final String? subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              if (subtitle != null) ...[
                const SizedBox(height: 5),
                Text(subtitle!, style: Theme.of(context).textTheme.bodySmall),
              ],
              const SizedBox(height: 14),
              child,
            ],
          ),
        ),
      );
}

class _MoreTile extends StatelessWidget {
  const _MoreTile({required this.icon, required this.title, required this.onTap});
  final IconData icon;
  final String title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
        child: ListTile(
          leading: Icon(icon),
          title: Text(title),
          trailing: const Icon(Icons.chevron_right),
          onTap: onTap,
        ),
      );
}

void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}
