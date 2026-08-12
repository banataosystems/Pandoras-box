"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaReadDraftExecutor = exports.MetaWriteExecutionDisabledError = exports.MetaPolicyDeniedError = void 0;
const index_1 = require("../../../../packages/shared-security/dist/index");
const policy_1 = require("../security/policy");
const catalog_1 = require("./catalog");
class MetaPolicyDeniedError extends Error {
    constructor(toolName, reasons) {
        super(`Meta tool ${toolName} denied: ${reasons.join(', ')}`);
        this.name = 'MetaPolicyDeniedError';
        this.reasons = reasons;
    }
}
exports.MetaPolicyDeniedError = MetaPolicyDeniedError;
class MetaWriteExecutionDisabledError extends Error {
    constructor(toolName) {
        super(`Meta write execution is not implemented in this milestone: ${toolName}`);
        this.name = 'MetaWriteExecutionDisabledError';
    }
}
exports.MetaWriteExecutionDisabledError = MetaWriteExecutionDisabledError;
function requiredString(argumentsValue, key) {
    const value = argumentsValue[key];
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${key} is required`);
    }
    return value.trim();
}
function optionalLimit(argumentsValue) {
    const value = argumentsValue.limit;
    if (value === undefined) {
        return 25;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100) {
        throw new Error('limit must be an integer between 1 and 100');
    }
    return value;
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
function policyFor(toolName, argumentsValue, context) {
    return (0, policy_1.evaluateMetaInvocation)(toolName, {
        staffId: context.staffId,
        requesterId: context.requesterId,
        pageId: requiredString(argumentsValue, 'pageId'),
        allowedPageIds: context.allowedPageIds,
        arguments: argumentsValue,
        killSwitchActive: context.killSwitchActive,
        networkEnabled: context.networkEnabled,
    });
}
function weeklyPlanContent(argumentsValue) {
    const topics = optionalStringArray(argumentsValue, 'topics');
    if (topics.length === 0) {
        throw new Error('topics must contain at least one topic');
    }
    const weekOf = typeof argumentsValue.weekOf === 'string' && argumentsValue.weekOf.trim()
        ? argumentsValue.weekOf.trim()
        : 'unspecified week';
    return [`Weekly content plan — ${weekOf}`, ...topics.map((topic, index) => `${index + 1}. ${topic}`)].join('\n');
}
class MetaReadDraftExecutor {
    constructor(provider, drafts) {
        this.provider = provider;
        this.drafts = drafts;
        if (provider.networkCapable) {
            throw new Error('This milestone accepts only a non-networked Meta provider');
        }
    }
    async execute(toolName, argumentsValue, context) {
        const definition = (0, catalog_1.getMetaToolDefinition)(toolName);
        if (definition?.mode === 'write') {
            throw new MetaWriteExecutionDisabledError(toolName);
        }
        const policy = policyFor(toolName, argumentsValue, context);
        if (!policy.allowed || !policy.tool) {
            throw new MetaPolicyDeniedError(toolName, policy.reasons);
        }
        if (policy.tool.mode === 'write') {
            throw new MetaWriteExecutionDisabledError(toolName);
        }
        const executionMode = policy.tool.mode;
        const pageId = requiredString(argumentsValue, 'pageId');
        let data;
        switch (toolName) {
            case 'meta_page_get':
                data = await this.provider.getPage(pageId);
                break;
            case 'meta_page_list_posts':
                data = await this.provider.listPosts(pageId, optionalLimit(argumentsValue));
                break;
            case 'meta_post_get':
                data = await this.provider.getPost(pageId, requiredString(argumentsValue, 'postId'));
                break;
            case 'meta_post_list_comments':
                data = await this.provider.listComments(pageId, requiredString(argumentsValue, 'postId'), optionalLimit(argumentsValue));
                break;
            case 'meta_inbox_list_threads':
                data = await this.provider.listInboxThreads(pageId, optionalLimit(argumentsValue));
                break;
            case 'meta_inbox_get_thread':
                data = await this.provider.getInboxThread(pageId, requiredString(argumentsValue, 'threadId'));
                break;
            case 'meta_page_get_insights':
                data = await this.provider.getPageInsights(pageId, optionalStringArray(argumentsValue, 'metricNames'));
                break;
            case 'meta_webhook_health':
                data = await this.provider.getWebhookHealth(pageId);
                break;
            case 'meta_post_create_draft':
                data = await this.createDraft('post', pageId, argumentsValue, context, policy);
                break;
            case 'meta_comment_create_reply_draft':
                data = await this.createDraft('comment_reply', pageId, argumentsValue, context, policy, `${requiredString(argumentsValue, 'postId')}:${requiredString(argumentsValue, 'commentId')}`);
                break;
            case 'meta_message_create_reply_draft':
                data = await this.createDraft('message_reply', pageId, argumentsValue, context, policy, requiredString(argumentsValue, 'threadId'));
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
                throw new MetaPolicyDeniedError(toolName, ['unsupported_read_or_draft_tool']);
        }
        return {
            toolName,
            mode: executionMode,
            data,
            policy: {
                actionHash: policy.actionHash,
                requiresLegalReview: policy.requiresLegalReview,
            },
            audit: {
                argumentsRedacted: (0, index_1.redactForAudit)(argumentsValue),
            },
        };
    }
    async createDraft(kind, pageId, argumentsValue, context, policy, targetId) {
        return this.drafts.create({
            organizationId: context.organizationId,
            pageId,
            kind,
            targetId,
            content: requiredString(argumentsValue, 'message'),
            createdBy: context.staffId,
            legalReviewRequired: policy.requiresLegalReview,
        });
    }
}
exports.MetaReadDraftExecutor = MetaReadDraftExecutor;
