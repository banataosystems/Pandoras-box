import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pandora_mobile/app/pandora_dependencies.dart';
import 'package:pandora_mobile/core/data/pandora_repository.dart';
import 'package:pandora_mobile/core/diagnostics/diagnostics_store.dart';
import 'package:pandora_mobile/core/models/pandora_models.dart';
import 'package:pandora_mobile/core/network/pandora_api_error.dart';
import 'package:pandora_mobile/core/widgets/pandora_mark.dart';
import 'package:pandora_mobile/features/activity/activity_screen.dart';
import 'package:pandora_mobile/features/approvals/approvals_screen.dart';
import 'package:pandora_mobile/features/command/command_screen.dart';
import 'package:pandora_mobile/features/connections/connections_screen.dart';
import 'package:pandora_mobile/features/home/home_screen.dart';
import 'package:pandora_mobile/features/intelligence/owner_intelligence_screen.dart';
import 'package:pandora_mobile/features/projects/project_detail_screen.dart';
import 'package:pandora_mobile/features/projects/projects_screen.dart';
import 'package:pandora_mobile/features/safety/safety_screen.dart';
import 'package:pandora_mobile/features/settings/settings_screen.dart';

import '../helpers/fake_owner_api.dart';
import '../helpers/test_app.dart';

const _surfaceKey = ValueKey<String>('owner-screen-evidence');
const _phoneSize = Size(390, 844);
const _compactPhoneSize = Size(320, 800);

class _VisualCase {
  const _VisualCase({
    required this.name,
    required this.build,
    this.themeMode = ThemeMode.light,
    this.logicalSize = _phoneSize,
    this.textScaler = TextScaler.noScaling,
    this.failing = false,
    this.pending = false,
  });

  final String name;
  final Widget Function() build;
  final ThemeMode themeMode;
  final Size logicalSize;
  final TextScaler textScaler;
  final bool failing;
  final bool pending;
}

class _FixtureRepository implements PandoraRepository {
  _FixtureRepository({this.failing = false, this.pending = false});

  final bool failing;
  final bool pending;
  static final DateTime _verifiedAt = DateTime.utc(2026, 8, 14, 1);
  static final DateTime _staleAfter = DateTime.utc(2030, 8, 14, 1);

  Object? _read(String name) {
    final file = File('test/fixtures/owner_api/$name');
    return jsonDecode(file.readAsStringSync());
  }

  void _guard() {
    if (failing) {
      throw const PandoraRepositoryException(
        kind: PandoraApiErrorKind.unavailable,
        message: 'Pandora cannot currently reach this provider.',
        code: 'provider_unavailable',
      );
    }
  }

  Future<RepositorySnapshot<T>> _pending<T>() {
    return Completer<RepositorySnapshot<T>>().future;
  }

  RepositorySnapshot<T> _snapshot<T>(T data) => RepositorySnapshot<T>(
        data: data,
        source: RepositorySource.network,
        fetchedAt: _verifiedAt,
        verifiedAt: _verifiedAt,
        staleAfter: _staleAfter,
        requestId: 'visual-evidence-fixture',
      );

  List<T> _list<T>(String name, T Function(Object?) parse) =>
      asJsonList(_read(name)).map(parse).toList(growable: false);

  @override
  Future<RepositorySnapshot<HomeSummary>> home() async {
    if (pending) return _pending<HomeSummary>();
    _guard();
    return _snapshot(HomeSummary.fromJson(asJsonMap(_read('home.json'))));
  }

  @override
  Future<RepositorySnapshot<List<ProjectSummary>>> projects({
    bool allowCached = false,
  }) async {
    _guard();
    return _snapshot(
      _list<ProjectSummary>('projects.json', ProjectSummary.fromJson),
    );
  }

  @override
  Future<RepositorySnapshot<ProjectDetail>> project(
    String id, {
    bool allowCached = false,
  }) async {
    _guard();
    return _snapshot(ProjectDetail.fromJson(_read('project.json')));
  }

  @override
  Future<RepositorySnapshot<List<ConnectionSummary>>> connections({
    bool allowCached = false,
  }) async {
    _guard();
    return _snapshot(
      _list<ConnectionSummary>('connections.json', ConnectionSummary.fromJson),
    );
  }

  @override
  Future<RepositorySnapshot<List<ApprovalSummary>>> approvals() async {
    _guard();
    return _snapshot(
      _list<ApprovalSummary>('approvals.json', ApprovalSummary.fromJson),
    );
  }

  @override
  Future<RepositorySnapshot<List<AuditEvent>>> activity({
    bool allowCached = false,
  }) async {
    _guard();
    return _snapshot(_list<AuditEvent>('activity.json', AuditEvent.fromJson));
  }

  @override
  Future<RepositorySnapshot<SafetyOverview>> safety() async {
    _guard();
    return _snapshot(SafetyOverview.fromJson(_read('safety.json')));
  }

  @override
  Future<RepositorySnapshot<List<ActionDefinition>>> actions() async {
    _guard();
    return _snapshot(
      _list<ActionDefinition>('actions.json', ActionDefinition.fromJson),
    );
  }

  @override
  Future<IntakeReceipt> ask({
    required String message,
    String? projectId,
    String? idempotencyKey,
  }) =>
      throw UnimplementedError('Visual evidence never performs mutations.');

  @override
  Future<IntakeReceipt> runAction({
    required String actionId,
    String? projectId,
    String? message,
    String? idempotencyKey,
  }) =>
      throw UnimplementedError('Visual evidence never performs mutations.');

  @override
  Future<ApprovalDecisionResult> decideApproval({
    required String approvalId,
    required ApprovalDecision decision,
    String reason = '',
  }) =>
      throw UnimplementedError('Visual evidence never performs mutations.');

  @override
  void clearReadOnlyCache() {}

  @override
  void dispose() {}
}

Future<void> _captureScreen(WidgetTester tester, _VisualCase visual) async {
  await setTestSurface(tester, logicalSize: visual.logicalSize);
  final repository = _FixtureRepository(
    failing: visual.failing,
    pending: visual.pending,
  );
  await tester.pumpWidget(
    PandoraDependencies(
      auth: const FakeAuth(),
      repository: repository,
      diagnostics: DiagnosticsStore(),
      child: testApp(
        themeMode: visual.themeMode,
        textScaler: visual.textScaler,
        child: RepaintBoundary(key: _surfaceKey, child: visual.build()),
      ),
    ),
  );
  await tester.runAsync(
    () => precacheImage(
      const AssetImage(PandoraMark.assetPath),
      tester.element(find.byKey(_surfaceKey)),
    ),
  );
  if (visual.pending) {
    await tester.pump();
  } else {
    await tester.pumpAndSettle();
  }
  expect(
    tester.takeException(),
    isNull,
    reason: '${visual.name} raised a framework exception.',
  );

  final boundary = tester.renderObject<RenderRepaintBoundary>(
    find.byKey(_surfaceKey),
  );
  final image = await boundary.toImage();
  final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
  expect(bytes, isNotNull);

  final output = File('build/owner-screen-evidence/${visual.name}.png');
  output.parent.createSync(recursive: true);
  output.writeAsBytesSync(
    bytes!.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes),
  );
  image.dispose();
  expect(output.lengthSync(), greaterThan(0));

  final baseline = File('test/goldens/owner_screens/${visual.name}.png');
  if (baseline.existsSync()) {
    await expectLater(
      find.byKey(_surfaceKey),
      matchesGoldenFile(baseline.path),
    );
  }
}

void main() {
  final screens = <_VisualCase>[
    _VisualCase(
      name: 'home_attention_porcelain_390x844',
      build: () => const HomeScreen(),
    ),
    _VisualCase(
      name: 'home_degraded_graphite_390x844',
      build: () => const HomeScreen(),
      themeMode: ThemeMode.dark,
      failing: true,
    ),
    _VisualCase(
      name: 'home_loading_porcelain_390x844',
      build: () => const HomeScreen(),
      pending: true,
    ),
    _VisualCase(
      name: 'home_attention_porcelain_320x800',
      build: () => const HomeScreen(),
      logicalSize: _compactPhoneSize,
    ),
    _VisualCase(
      name: 'projects_list_porcelain_390x844',
      build: () => const ProjectsScreen(),
    ),
    _VisualCase(
      name: 'project_detail_porcelain_390x844',
      build: () => const ProjectDetailScreen(project: fixtureProject),
    ),
    _VisualCase(
      name: 'activity_populated_porcelain_390x844',
      build: () => const ActivityScreen(),
    ),
    _VisualCase(
      name: 'approvals_high_risk_porcelain_390x844',
      build: () => const ApprovalsScreen(),
    ),
    _VisualCase(
      name: 'approvals_high_risk_1_6x_text_390x844',
      build: () => const ApprovalsScreen(),
      textScaler: TextScaler.linear(1.6),
    ),
    _VisualCase(
      name: 'command_initial_porcelain_390x844',
      build: () => const CommandScreen(),
    ),
    _VisualCase(
      name: 'connections_healthy_porcelain_390x844',
      build: () => const ConnectionsScreen(),
    ),
    _VisualCase(
      name: 'connections_degraded_graphite_390x844',
      build: () => const ConnectionsScreen(),
      themeMode: ThemeMode.dark,
      failing: true,
    ),
    _VisualCase(
      name: 'memory_approved_porcelain_390x844',
      build: () => const OwnerIntelligenceScreen(
        initialSection: OwnerIntelligenceSection.memory,
      ),
    ),
    _VisualCase(
      name: 'safety_protected_porcelain_390x844',
      build: () => const SafetyScreen(),
    ),
    _VisualCase(
      name: 'settings_porcelain_390x844',
      build: () => const SettingsScreen(),
    ),
  ];

  for (final visual in screens) {
    testWidgets(
      'captures ${visual.name}',
      (tester) => _captureScreen(tester, visual),
    );
  }
}
