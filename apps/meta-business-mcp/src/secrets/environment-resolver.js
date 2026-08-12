"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvironmentSecretResolver = void 0;
const resolver_1 = require("./resolver");
const SAFE_NAME = /^[A-Z][A-Z0-9_]{2,127}$/;
class EnvironmentSecretResolver {
    constructor(options = {}) {
        this.environment = options.environment ?? process.env;
        this.allowedVariableNames = options.allowedVariableNames
            ? new Set(options.allowedVariableNames)
            : undefined;
    }
    async resolve(secretRef) {
        const match = /^env:\/\/([A-Z][A-Z0-9_]{2,127})$/.exec(secretRef.trim());
        if (!match || !SAFE_NAME.test(match[1])) {
            throw new resolver_1.SecretResolutionError('Environment secret references must use env://VARIABLE_NAME');
        }
        const variableName = match[1];
        if (/^(NEXT_PUBLIC_|VITE_|PUBLIC_)/.test(variableName)) {
            throw new resolver_1.SecretResolutionError('Publicly exposed environment variables cannot hold server secrets');
        }
        if (this.allowedVariableNames && !this.allowedVariableNames.has(variableName)) {
            throw new resolver_1.SecretResolutionError(`Environment secret reference is not allowlisted: ${variableName}`);
        }
        const value = this.environment[variableName]?.trim();
        if (!value) {
            throw new resolver_1.SecretResolutionError(`Environment secret reference is unavailable: ${variableName}`);
        }
        return { value };
    }
}
exports.EnvironmentSecretResolver = EnvironmentSecretResolver;
