"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateMetaInvocation = evaluateMetaInvocation;
const index_1 = require("../../../../packages/shared-security/dist/index");
const catalog_1 = require("../tools/catalog");
function outboundText(argumentsValue) {
    const candidates = [
        argumentsValue.message,
        argumentsValue.text,
        argumentsValue.body,
        argumentsValue.content,
        argumentsValue.reply,
    ];
    return candidates.find((value) => typeof value === 'string') ?? '';
}
function actionEnvelope(toolName, context) {
    return {
        toolName,
        provider: 'meta',
        accountId: context.pageId,
        resourceId: typeof context.arguments.resourceId === 'string'
            ? context.arguments.resourceId
            : undefined,
        requesterId: context.requesterId,
        arguments: context.arguments,
    };
}
function evaluateMetaInvocation(toolName, context) {
    const tool = (0, catalog_1.getMetaToolDefinition)(toolName);
    if (!tool) {
        return {
            allowed: false,
            reasons: ['unknown_tool'],
            requiresHumanApproval: true,
            requiresIndependentApproval: false,
            requiresLegalReview: false,
            networkMutationAllowed: false,
        };
    }
    const reasons = [];
    const staffId = context.staffId.trim();
    const requesterId = context.requesterId.trim();
    const approverId = context.approverId?.trim() ?? '';
    const textEvaluation = (0, index_1.evaluateLawOfficeText)(outboundText(context.arguments));
    const requiresLegalReview = textEvaluation.disposition === 'legal_review_required';
    const requiresHumanApproval = tool.mode === 'write';
    const requiresIndependentApproval = tool.approval === 'dual';
    const envelope = actionEnvelope(toolName, context);
    const actionHash = (0, index_1.computeActionHash)(envelope);
    if (!staffId || !requesterId) {
        reasons.push('authenticated_staff_required');
    }
    if (!(0, index_1.isPageAllowed)(context.pageId, context.allowedPageIds)) {
        reasons.push('page_not_allowlisted');
    }
    if (context.killSwitchActive && tool.mode === 'write') {
        reasons.push('emergency_kill_switch_active');
    }
    if (tool.mode === 'read' || tool.mode === 'draft') {
        return {
            allowed: reasons.length === 0,
            tool,
            actionHash,
            reasons,
            requiresHumanApproval: false,
            requiresIndependentApproval: false,
            requiresLegalReview,
            networkMutationAllowed: false,
        };
    }
    if (!context.networkEnabled) {
        reasons.push('meta_network_disabled');
    }
    if (requiresIndependentApproval && (!approverId || approverId === requesterId)) {
        reasons.push('independent_approver_required');
    }
    const writeResult = (0, index_1.authorizeExternalWrite)({
        staffId,
        pageId: context.pageId,
        allowedPageIds: context.allowedPageIds,
        idempotencyKey: context.idempotencyKey ?? '',
        approvalDecision: context.approvalDecision ?? 'pending',
        expectedActionHash: actionHash,
        approvedActionHash: context.approvedActionHash ?? '',
        killSwitchActive: context.killSwitchActive,
        outboundText: outboundText(context.arguments),
        legalReviewConfirmed: context.legalReviewConfirmed,
    });
    reasons.push(...writeResult.reasons);
    const uniqueReasons = [...new Set(reasons)];
    return {
        allowed: uniqueReasons.length === 0,
        tool,
        actionHash,
        reasons: uniqueReasons,
        requiresHumanApproval,
        requiresIndependentApproval,
        requiresLegalReview: writeResult.requiresLegalReview,
        networkMutationAllowed: uniqueReasons.length === 0,
    };
}
