"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersistentMetaDraftExecutor = void 0;
const policy_1 = require("../security/policy");
const executor_1 = require("./executor");
const catalog_1 = require("./catalog");
function requiredString(argumentsValue, key) {
    const value = argumentsValue[key];
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${key} is required`);
    }
    return value.trim();
}
function optionalStringArray(argumentsValue, key) {
    const value = argumentsValue[key];
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        throw new Error(`${key} must be an array of strings`);
    }
    return value.map((item) => item.trim()).filter(Boolean);
}
function weeklyPlanContent(argumentsValue) {
    const topics = optionalStringArray(argumentsValue, 'topics');
    if (topics.length === 0) {
        throw new Error('topics must contain at least one topic');
    }
    if (topics.length > 14) {
        throw new Error('topics cannot contain more than 14 entries');
    }
    const weekOf = typeof argumentsValue.weekOf === 'string' && argumentsValue.weekOf.trim()
        ? argumentsValue.weekOf.trim()
        : 'unspecified week';
    return [
        `Weekly content plan — ${weekOf}`,
        ...topics.map((topic, index) => `${index + 1}. ${topic}`),
    ].join('\n');
}
class PersistentMetaDraftExecutor {
    constructor(drafts) {
        this.drafts = drafts;
    }
    async execute(toolName, argumentsValue, context) {
        const definition = (0, catalog_1.getMetaToolDefinition)(toolName);
        if (definition?.mode === 'write') {
            throw new executor_1.MetaWriteExecutionDisabledError(toolName);
        }
        if (!definition || definition.mode !== 'draft') {
            throw new executor_1.MetaPolicyDeniedError(toolName, ['draft_tool_required']);
        }
        const pageId = requiredString(argumentsValue, 'pageId');
        const policy = (0, policy_1.evaluateMetaInvocation)(toolName, {
            staffId: context.staffId,
            requesterId: context.requesterId,
            pageId,
            allowedPageIds: context.allowedPageIds,
            arguments: argumentsValue,
            killSwitchActive: context.killSwitchActive,
            networkEnabled: context.networkEnabled,
        });
        if (!policy.allowed) {
            throw new executor_1.MetaPolicyDeniedError(toolName, policy.reasons);
        }
        let data;
        switch (toolName) {
            case 'meta_post_create_draft':
                data = await this.createDraft('post', pageId, argumentsValue, context, policy.requiresLegalReview);
                break;
            case 'meta_comment_create_reply_draft':
                data = await this.createDraft('comment_reply', pageId, argumentsValue, context, policy.requiresLegalReview, `${requiredString(argumentsValue, 'postId')}:${requiredString(argumentsValue, 'commentId')}`);
                break;
            case 'meta_message_create_reply_draft':
                data = await this.createDraft('message_reply', pageId, argumentsValue, context, policy.requiresLegalReview, requiredString(argumentsValue, 'threadId'));
                break;
            case 'meta_content_create_weekly_plan':
                data = await this.drafts.create({
                    organizationId: context.organizationId,
                    pageId,
                    kind: 'weekly_plan',
                    content: weeklyPlanContent(argumentsValue),
                    createdBy: context.staffId,
                    legalReviewRequired: policy.requiresLegalReview,
                });
                break;
            default:
                throw new executor_1.MetaPolicyDeniedError(toolName, ['unsupported_draft_tool']);
        }
        return {
            toolName,
            data,
            requiresLegalReview: policy.requiresLegalReview,
        };
    }
    async createDraft(kind, pageId, argumentsValue, context, legalReviewRequired, targetId) {
        return this.drafts.create({
            organizationId: context.organizationId,
            pageId,
            kind,
            targetId,
            content: requiredString(argumentsValue, 'message'),
            createdBy: context.staffId,
            legalReviewRequired,
        });
    }
}
exports.PersistentMetaDraftExecutor = PersistentMetaDraftExecutor;
