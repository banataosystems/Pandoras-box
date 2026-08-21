
import 'package:flutter/material.dart';

class BokPreviewScreen extends StatefulWidget {
  const BokPreviewScreen({super.key});

  @override
  State<BokPreviewScreen> createState() => _BokPreviewScreenState();
}

class _BokPreviewScreenState extends State<BokPreviewScreen> {
  final TextEditingController _intent = TextEditingController();
  int _section = 0;
  String? _result;

  static const _sections = <String>[
    'Today',
    'Customers',
    'Orders',
    'Menu',
    'Promotions',
    'Insights',
  ];

  @override
  void dispose() {
    _intent.dispose();
    super.dispose();
  }

  void _simulate() {
    final prompt = _intent.text.trim().toLowerCase();
    final answer = switch (prompt) {
      String p when p.contains('30') || p.contains('inactive') || p.contains('customer') =>
        'Preview analysis: 38 synthetic customers are marked as lapsed in the fixture. '
        'Pandora would next verify consent, contribution history, and offer economics before proposing a campaign.',
      String p when p.contains('promo') || p.contains('promotion') =>
        'Preview recommendation: test a bounded weekend reactivation offer against a holdout group. '
        'Pandora would show expected margin impact and require approval before any real campaign.',
      String p when p.contains('menu') || p.contains('sold') || p.contains('available') =>
        'Preview action: a menu-availability change would be treated as reversible. '
        'Pandora would show the exact restaurant, branch, item, before/after state, verification, and rollback.',
      String p when p.contains('grab') || p.contains('direct') || p.contains('margin') =>
        'Preview analysis: compare direct and aggregator-originated cohorts using contribution profit, '
        'fees, delivery cost, merchant-funded discounts, refunds, and 30/60/90-day repeat behavior.',
      _ =>
        'Preview only: Pandora would classify this intent, retrieve the BOK project context, '
        'show the proposed outcome and proof plan, and execute only after the applicable gates pass.',
    };
    setState(() {
      _result = '$answer\n\nNo live action was executed.';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('BOK workspace'),
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: 12),
            child: Center(
              child: Chip(
                avatar: Icon(Icons.science_outlined, size: 18),
                label: Text('TEST / PREVIEW'),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            const _PreviewBanner(),
            const SizedBox(height: 14),
            const _OwnerHeader(),
            const SizedBox(height: 16),
            _IntentCard(
              controller: _intent,
              onSimulate: _simulate,
              result: _result,
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: List<Widget>.generate(
                _sections.length,
                (index) => ChoiceChip(
                  label: Text(_sections[index]),
                  selected: _section == index,
                  onSelected: (_) => setState(() => _section = index),
                ),
              ),
            ),
            const SizedBox(height: 16),
            _sectionBody(),
            const SizedBox(height: 16),
            const _ProfessionalDetails(),
          ],
        ),
      ),
    );
  }

  Widget _sectionBody() => switch (_section) {
        0 => const _TodayView(),
        1 => const _CustomersView(),
        2 => const _OrdersView(),
        3 => const _MenuView(),
        4 => const _PromotionsView(),
        _ => const _InsightsView(),
      };
}

class _PreviewBanner extends StatelessWidget {
  const _PreviewBanner();

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.lock_outline),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Synthetic data only', style: Theme.of(context).textTheme.titleSmall),
                    const SizedBox(height: 4),
                    const Text(
                      'This sealed preview makes no network calls and cannot change live BOK or Pandora data.',
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
}

class _OwnerHeader extends StatelessWidget {
  const _OwnerHeader();

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('BOK', style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 5),
              const Text('BOK Pilot Owner'),
              const SizedBox(height: 2),
              const Text('Preview persona • Owner'),
              const SizedBox(height: 14),
              const Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  Chip(label: Text('Porknyeta • preview anchor')),
                  Chip(label: Text('Cardiac Delights • placeholder')),
                  Chip(label: Text('80/20 Burger Bar • placeholder')),
                ],
              ),
            ],
          ),
        ),
      );
}

class _IntentCard extends StatelessWidget {
  const _IntentCard({
    required this.controller,
    required this.onSimulate,
    required this.result,
  });

  final TextEditingController controller;
  final VoidCallback onSimulate;
  final String? result;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Ask Pandora', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 5),
              const Text('Design the owner experience before connecting real restaurant actions.'),
              const SizedBox(height: 12),
              TextField(
                key: const ValueKey('bok-preview-intent'),
                controller: controller,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  hintText: 'e.g. Which customers have not ordered in 30 days?',
                ),
              ),
              const SizedBox(height: 10),
              FilledButton.icon(
                onPressed: onSimulate,
                icon: const Icon(Icons.auto_awesome_outlined),
                label: const Text('Simulate with Pandora'),
              ),
              if (result != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  ),
                  child: Text(result!),
                ),
              ],
            ],
          ),
        ),
      );
}

class _TodayView extends StatelessWidget {
  const _TodayView();

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Today', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 10),
          const Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _Metric(label: 'Synthetic direct orders', value: '18'),
              _Metric(label: 'Synthetic direct sales', value: '₱12,480'),
              _Metric(label: 'Synthetic repeat customers', value: '9'),
              _Metric(label: 'Synthetic lapsed customers', value: '38'),
            ],
          ),
          const SizedBox(height: 14),
          const _Notice(
            icon: Icons.priority_high,
            title: 'What needs attention',
            body: '2 synthetic orders are approaching the preview prep-time threshold. One menu item is marked low availability.',
          ),
          const SizedBox(height: 10),
          const _Notice(
            icon: Icons.lightbulb_outline,
            title: 'Pandora opportunity',
            body: 'Preview a reactivation campaign only after checking consent, offer cost, contribution margin and a holdout group.',
          ),
        ],
      );
}

class _CustomersView extends StatelessWidget {
  const _CustomersView();

  @override
  Widget build(BuildContext context) => const _PreviewList(
        title: 'Customers',
        items: [
          ('Repeat customers', 'Synthetic cohort • 9 ordered again within 30 days'),
          ('Lapsed customers', 'Synthetic cohort • 38 have no order in 30+ days'),
          ('Consent state', 'Preview rule • only opted-in channels may be used'),
          ('Customer value', 'Model contribution over time, not just order count'),
        ],
      );
}

class _OrdersView extends StatelessWidget {
  const _OrdersView();

  @override
  Widget build(BuildContext context) => const _PreviewList(
        title: 'Orders',
        items: [
          ('#BOK-P-1042', 'Synthetic • Preparing • Porknyeta'),
          ('#BOK-P-1041', 'Synthetic • Ready for pickup • Porknyeta'),
          ('#BOK-P-1040', 'Synthetic • Completed • Direct'),
          ('Operational rule', 'Every transition must be idempotent, branch-scoped and auditable'),
        ],
      );
}

class _MenuView extends StatelessWidget {
  const _MenuView();

  @override
  Widget build(BuildContext context) => const _PreviewList(
        title: 'Menu',
        items: [
          ('Porknyeta Sisig', 'Synthetic fixture • Available'),
          ('Crispy Pork Bowl', 'Synthetic fixture • Low availability'),
          ('Family Tray', 'Synthetic fixture • Available'),
          ('Owner control', 'Availability changes are reversible and must show before/after state'),
        ],
      );
}

class _PromotionsView extends StatelessWidget {
  const _PromotionsView();

  @override
  Widget build(BuildContext context) => const _PreviewList(
        title: 'Promotions',
        items: [
          ('Weekend reactivation', 'Draft preview • not scheduled'),
          ('Audience', 'Synthetic lapsed customers with valid consent only'),
          ('Guardrail', 'Show estimated discount cost and contribution impact before approval'),
          ('Measurement', 'Use attribution and a holdout where practical'),
        ],
      );
}

class _InsightsView extends StatelessWidget {
  const _InsightsView();

  @override
  Widget build(BuildContext context) => const _PreviewList(
        title: 'Insights',
        items: [
          ('Direct vs aggregator', 'Compare contribution economics instead of assuming one channel is better'),
          ('Repeat behavior', 'Track 30/60/90-day repeat and contribution per customer'),
          ('Operations', 'Watch prep time, cancellations, stockouts and delivery reliability'),
          ('Pandora', 'Every recommendation carries evidence, confidence and uncertainty'),
        ],
      );
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 160,
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(value, style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 4),
                Text(label, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
        ),
      );
}

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.title, required this.body});
  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => Card(
        child: ListTile(
          leading: Icon(icon),
          title: Text(title),
          subtitle: Text(body),
        ),
      );
}

class _PreviewList extends StatelessWidget {
  const _PreviewList({required this.title, required this.items});
  final String title;
  final List<(String, String)> items;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 10),
          for (final item in items)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Card(
                child: ListTile(
                  title: Text(item.$1),
                  subtitle: Text(item.$2),
                ),
              ),
            ),
        ],
      );
}

class _ProfessionalDetails extends StatelessWidget {
  const _ProfessionalDetails();

  @override
  Widget build(BuildContext context) => Card(
        child: ExpansionTile(
          leading: const Icon(Icons.terminal_outlined),
          title: const Text('Professional details'),
          subtitle: const Text('Hidden from the normal owner experience'),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          children: const [
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Verified data plane: Supabase zztqshkhoxqbnzmdhlts\n'
                'Provider state: ACTIVE_HEALTHY\n'
                'Current baseline: 15 RLS-enabled application tables • 15 migrations • 0 auth users\n'
                'Preview mode: local synthetic fixture; network disabled by design',
              ),
            ),
          ],
        ),
      );
}
