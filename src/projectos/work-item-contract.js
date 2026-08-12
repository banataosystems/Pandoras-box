"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROJECTOS_WORK_ITEM_FIELDS = void 0;
exports.validateProjectOSWorkItem = validateProjectOSWorkItem;
exports.PROJECTOS_WORK_ITEM_FIELDS = [
    "requirement",
    "acceptanceCriteria",
    "exclusions",
    "riskClass",
    "budgetClass",
    "baseSha",
    "requiredEvidence",
    "rollback",
];
const FULL_SHA = /^[0-9a-f]{40}$/;
const RISK_CLASSES = new Set(["R0", "R1", "R2", "R3", "R4"]);
const BUDGET_CLASSES = new Set(["no-new-cost", "approved-metered"]);
const MANUAL_HANDOFF_PATTERNS = [
    /\bdesktop\b/i,
    /\bterminal\b/i,
    /\bcommand\s+line\b/i,
    /\bcli\b/i,
    /copy\s+(?:this\s+)?prompt/i,
    /download\s+(?:the\s+)?file/i,
    /upload\s+(?:it|the\s+file)\s+(?:to|in)\s+another/i,
    /open\s+(?:this|another)\s+app/i,
];
function cleanText(value) {
    return typeof value === "string" ? value.trim() : "";
}
function cleanList(value) {
    if (!Array.isArray(value))
        return [];
    return value.map(cleanText).filter(Boolean);
}
function containsManualHandoff(value) {
    return MANUAL_HANDOFF_PATTERNS.some((pattern) => pattern.test(value));
}
function validateProjectOSWorkItem(input) {
    const errors = [];
    const source = input && typeof input === "object" ? input : {};
    const requirement = cleanText(source.requirement);
    const acceptanceCriteria = cleanList(source.acceptanceCriteria);
    const exclusions = cleanList(source.exclusions);
    const riskClass = cleanText(source.riskClass);
    const budgetClass = cleanText(source.budgetClass);
    const baseSha = cleanText(source.baseSha);
    const requiredEvidence = cleanList(source.requiredEvidence);
    const rollback = cleanText(source.rollback);
    if (!requirement)
        errors.push("requirement is required");
    if (acceptanceCriteria.length === 0)
        errors.push("acceptanceCriteria must contain at least one item");
    if (exclusions.length === 0)
        errors.push("exclusions must contain at least one item");
    if (!RISK_CLASSES.has(riskClass))
        errors.push("riskClass must be one of R0, R1, R2, R3, or R4");
    if (!BUDGET_CLASSES.has(budgetClass))
        errors.push("budgetClass must be no-new-cost or approved-metered");
    if (!FULL_SHA.test(baseSha))
        errors.push("baseSha must be a lowercase 40-character commit SHA");
    if (requiredEvidence.length === 0)
        errors.push("requiredEvidence must contain at least one item");
    if (!rollback)
        errors.push("rollback is required");
    const ownerVisibleText = [
        requirement,
        ...acceptanceCriteria,
        ...exclusions,
        ...requiredEvidence,
        rollback,
    ].join("\n");
    if (containsManualHandoff(ownerVisibleText)) {
        errors.push("contract must not require a desktop, terminal, CLI, file relay, prompt relay, or another application");
    }
    if (errors.length > 0)
        return { valid: false, errors };
    return {
        valid: true,
        errors: [],
        value: {
            requirement,
            acceptanceCriteria,
            exclusions,
            riskClass,
            budgetClass,
            baseSha,
            requiredEvidence,
            rollback,
        },
    };
}
//# sourceMappingURL=work-item-contract.js.map