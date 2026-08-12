"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const environment_resolver_1 = require("./secrets/environment-resolver");
const access_proof_1 = require("./staging/access-proof");
const readiness_1 = require("./staging/readiness");
function environmentSecretName(reference) {
    const match = /^env:\/\/([A-Z][A-Z0-9_]*)$/.exec(reference.trim());
    return match?.[1];
}
function resolverForReferences(environment, references) {
    return new environment_resolver_1.EnvironmentSecretResolver({
        environment,
        allowedVariableNames: references
            .map(environmentSecretName)
            .filter((name) => Boolean(name)),
    });
}
async function main() {
    const command = process.argv[2] ?? 'validate';
    if (command === 'validate') {
        const config = (0, readiness_1.loadMetaStagingReadinessConfig)(process.env);
        process.stdout.write(`${JSON.stringify({
            status: 'ready',
            environment: 'staging',
            baseUrl: config.baseUrl,
            origin: config.origin,
            expectedPageId: config.expectedPageId,
            externalWritesEnabled: false,
            accessTokenReferenceConfigured: true,
        }, null, 2)}\n`);
        return;
    }
    if (command === 'prove-access') {
        const config = (0, access_proof_1.loadMetaStagingAccessProofConfig)(process.env);
        const report = await new access_proof_1.MetaStagingAccessProofRunner({
            config,
            secretResolver: resolverForReferences(process.env, [
                config.userAccessTokenSecretRef,
                config.debuggerAccessTokenSecretRef,
            ]),
        }).run();
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }
    if (command === 'smoke') {
        const config = (0, readiness_1.loadMetaStagingReadinessConfig)(process.env);
        const report = await new readiness_1.MetaStagingReadinessRunner({
            config,
            secretResolver: resolverForReferences(process.env, [config.accessTokenSecretRef]),
        }).run();
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }
    throw new Error('Usage: staging-cli.js [validate|prove-access|smoke]');
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown staging readiness failure';
    process.stderr.write(`Meta staging readiness failed: ${message}\n`);
    process.exitCode = 1;
});
