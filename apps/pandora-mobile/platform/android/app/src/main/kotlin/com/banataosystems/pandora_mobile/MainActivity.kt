package com.banataosystems.pandora_mobile

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            VALUE_WIDGET_CHANNEL,
        ).setMethodCallHandler { call, result ->
            if (call.method != "publishValueMeter") {
                result.notImplemented()
                return@setMethodCallHandler
            }
            val arguments = call.arguments as? Map<*, *>
            if (arguments == null) {
                result.error(
                    "INVALID_VALUE_WIDGET_PAYLOAD",
                    "Value widget payload is missing.",
                    null,
                )
                return@setMethodCallHandler
            }
            PandoraValueWidgetStore.write(this@MainActivity, arguments)
            PandoraValueWidget.updateAll(this@MainActivity)
            result.success(null)
        }
    }

    companion object {
        private const val VALUE_WIDGET_CHANNEL =
            "com.banataosystems.pandora_mobile/value_widget"
    }
}
