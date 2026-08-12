"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseMetaDraftStore = void 0;
const rest_client_1 = require("../supabase/rest-client");
const DRAFT_KINDS = new Set([
    'post',
    'comment_reply',
    'message_reply',
    'weekly_plan',
]);
function rowToDraft(value) {
    const row = typeof value === 'object' && value !== null
        ? value
        : {};
    const kind = row.kind;
    if (typeof row.id !== 'string'
        || typeof row.organization_id !== 'string'
        || typeof row.page_id !== 'string'
        || typeof kind !== 'string'
        || !DRAFT_KINDS.has(kind)
        || typeof row.content !== 'string'
        || typeof row.created_by !== 'string'
        || typeof row.created_at !== 'string'
        || typeof row.legal_review_required !== 'boolean'
        || row.status !== 'draft') {
        throw new Error('Supabase returned an invalid Meta draft row');
    }
    return {
        id: row.id,
        organizationId: row.organization_id,
        pageId: row.page_id,
        kind: kind,
        targetId: typeof row.target_id === 'string' ? row.target_id : undefined,
        content: row.content,
        createdBy: row.created_by,
        createdAt: row.created_at,
        legalReviewRequired: row.legal_review_required,
        status: 'draft',
    };
}
class SupabaseMetaDraftStore {
    constructor(options) {
        this.client = new rest_client_1.SupabaseRestClient({
            supabaseUrl: options.supabaseUrl,
            apiKey: options.publishableKey,
            accessToken: options.accessToken,
            fetchFn: options.fetchFn,
            timeoutMs: options.timeoutMs,
        });
    }
    async create(input) {
        const payload = await this.client.requestJson('/rest/v1/meta_drafts', {
            method: 'POST',
            headers: { prefer: 'return=representation' },
            body: JSON.stringify({
                organization_id: input.organizationId,
                page_id: input.pageId,
                kind: input.kind,
                target_id: input.targetId ?? null,
                content: input.content,
                created_by: input.createdBy,
                legal_review_required: input.legalReviewRequired,
            }),
        });
        if (!Array.isArray(payload) || payload.length !== 1) {
            throw new Error('Supabase did not return the created Meta draft');
        }
        return rowToDraft(payload[0]);
    }
    async get(organizationId, draftId) {
        const query = new URLSearchParams({
            select: '*',
            organization_id: `eq.${organizationId}`,
            id: `eq.${draftId}`,
            limit: '1',
        });
        const payload = await this.client.requestJson(`/rest/v1/meta_drafts?${query.toString()}`);
        if (!Array.isArray(payload) || payload.length === 0) {
            return null;
        }
        return rowToDraft(payload[0]);
    }
    async list(organizationId, pageId) {
        const query = new URLSearchParams({
            select: '*',
            organization_id: `eq.${organizationId}`,
            page_id: `eq.${pageId}`,
            order: 'created_at.desc',
            limit: '100',
        });
        const payload = await this.client.requestJson(`/rest/v1/meta_drafts?${query.toString()}`);
        if (!Array.isArray(payload)) {
            throw new Error('Supabase returned an invalid Meta draft list');
        }
        return payload.map(rowToDraft);
    }
}
exports.SupabaseMetaDraftStore = SupabaseMetaDraftStore;
