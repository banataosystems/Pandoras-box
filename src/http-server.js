"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startHttpServer = exports.executionPayloadHash = exports.createHttpApp = void 0;
var http_app_js_1 = require("./http-app.js");
Object.defineProperty(exports, "createHttpApp", { enumerable: true, get: function () { return http_app_js_1.createHttpApp; } });
Object.defineProperty(exports, "executionPayloadHash", { enumerable: true, get: function () { return http_app_js_1.executionPayloadHash; } });
Object.defineProperty(exports, "startHttpServer", { enumerable: true, get: function () { return http_app_js_1.startHttpServer; } });
const http_app_js_2 = require("./http-app.js");
if (require.main === module) {
    (0, http_app_js_2.startHttpServer)();
}
//# sourceMappingURL=http-server.js.map