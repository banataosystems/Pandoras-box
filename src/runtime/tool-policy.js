"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyToolRisk = classifyToolRisk;
exports.requiresApproval = requiresApproval;
exports.secureTokenMatches = secureTokenMatches;
exports.secureTokenHashMatches = secureTokenHashMatches;
const crypto_1 = require("crypto");
const tool_manifest_js_1 = require("./tool-manifest.js");
function classifyToolRisk(toolName) {
    // Unknown tools fail at the highest risk tier. No name can silently become
    // read-only through a prefix convention or spelling choice.
    return (0, tool_manifest_js_1.getToolManifest)(toolName)?.risk || 'destructive';
}
function requiresApproval(toolName) {
    return classifyToolRisk(toolName) !== 'read';
}
function secureTokenMatches(provided, expected) {
    if (!provided || !expected)
        return false;
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    if (providedBuffer.length !== expectedBuffer.length)
        return false;
    return (0, crypto_1.timingSafeEqual)(providedBuffer, expectedBuffer);
}
function secureTokenHashMatches(provided, expectedSha256) {
    if (!provided || !expectedSha256 || !/^[0-9a-f]{64}$/.test(expectedSha256))
        return false;
    const providedHash = (0, crypto_1.createHash)('sha256').update(provided, 'utf8').digest();
    const expectedHash = Buffer.from(expectedSha256, 'hex');
    return providedHash.length === expectedHash.length && (0, crypto_1.timingSafeEqual)(providedHash, expectedHash);
}
//# sourceMappingURL=tool-policy.js.map