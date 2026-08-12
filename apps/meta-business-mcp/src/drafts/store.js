"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryMetaDraftStore = void 0;
const crypto_1 = require("crypto");
class InMemoryMetaDraftStore {
    constructor(options = {}) {
        this.drafts = new Map();
        this.createId = options.createId ?? crypto_1.randomUUID;
        this.now = options.now ?? (() => new Date());
    }
    async create(input) {
        const organizationId = input.organizationId.trim();
        const pageId = input.pageId.trim();
        const createdBy = input.createdBy.trim();
        const content = input.content.trim();
        if (!organizationId || !pageId || !createdBy || !content) {
            throw new Error('Draft organization, Page, creator, and content are required');
        }
        const draft = {
            id: this.createId(),
            organizationId,
            pageId,
            kind: input.kind,
            targetId: input.targetId?.trim() || undefined,
            content,
            createdBy,
            createdAt: this.now().toISOString(),
            legalReviewRequired: input.legalReviewRequired,
            status: 'draft',
        };
        this.drafts.set(draft.id, draft);
        return { ...draft };
    }
    async get(organizationId, draftId) {
        const draft = this.drafts.get(draftId);
        if (!draft || draft.organizationId !== organizationId) {
            return null;
        }
        return { ...draft };
    }
    async list(organizationId, pageId) {
        return [...this.drafts.values()]
            .filter((draft) => draft.organizationId === organizationId && draft.pageId === pageId)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
            .map((draft) => ({ ...draft }));
    }
}
exports.InMemoryMetaDraftStore = InMemoryMetaDraftStore;
