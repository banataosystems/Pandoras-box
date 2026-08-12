"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OfficialMetaReadProvider = exports.MetaGraphApiError = exports.FetchMetaHttpTransport = void 0;
const resolver_1 = require("../secrets/resolver");
const GRAPH_API_ORIGIN = 'https://graph.facebook.com';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
class FetchMetaHttpTransport {
    async send(request) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
        try {
            const response = await fetch(request.url, {
                method: request.method,
                headers: request.headers,
                redirect: 'error',
                signal: controller.signal,
            });
            const contentLength = Number(response.headers.get('content-length') ?? '0');
            if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
                throw new MetaGraphApiError('Meta response exceeded the maximum allowed size', {
                    httpStatus: response.status,
                });
            }
            const bodyText = await response.text();
            if (Buffer.byteLength(bodyText, 'utf8') > MAX_RESPONSE_BYTES) {
                throw new MetaGraphApiError('Meta response exceeded the maximum allowed size', {
                    httpStatus: response.status,
                });
            }
            return {
                status: response.status,
                bodyText,
                contentType: response.headers.get('content-type') ?? undefined,
            };
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.FetchMetaHttpTransport = FetchMetaHttpTransport;
class MetaGraphApiError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'MetaGraphApiError';
        this.details = details;
    }
}
exports.MetaGraphApiError = MetaGraphApiError;
function record(value) {
    return typeof value === 'object' && value !== null ? value : {};
}
function stringValue(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function numberValue(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function dateFromSeconds(value) {
    const seconds = numberValue(value);
    return seconds === undefined ? undefined : new Date(seconds * 1000).toISOString();
}
function requireApiVersion(value) {
    const normalized = value.trim();
    if (!/^v\d+\.\d+$/.test(normalized)) {
        throw new Error('Meta Graph API version must match v<major>.<minor>');
    }
    return normalized;
}
function requireTimeout(value) {
    const timeout = value ?? 10000;
    if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 30000) {
        throw new Error('Meta request timeout must be an integer between 1000 and 30000 milliseconds');
    }
    return timeout;
}
function pathSegment(value, fieldName) {
    const normalized = value.trim();
    if (!normalized || normalized.includes('/') || normalized.includes('..')) {
        throw new Error(`${fieldName} is invalid`);
    }
    return encodeURIComponent(normalized);
}
function pageAddress(locationValue) {
    const location = record(locationValue);
    const pieces = [
        stringValue(location.street),
        stringValue(location.city),
        stringValue(location.state),
        stringValue(location.zip),
        stringValue(location.country),
    ].filter((value) => Boolean(value));
    return pieces.length > 0 ? pieces.join(', ') : undefined;
}
function graphArray(value) {
    if (Array.isArray(value)) {
        return value.map(record);
    }
    const nested = record(value).data;
    return Array.isArray(nested) ? nested.map(record) : [];
}
function participantName(value, pageId) {
    const participants = graphArray(value);
    const external = participants.find((participant) => stringValue(participant.id) !== pageId);
    return stringValue(external?.name) ?? 'Facebook user';
}
function insightPeriod(value) {
    return value === 'week' || value === 'month' || value === 'lifetime' ? value : 'day';
}
class OfficialMetaReadProvider {
    constructor(options) {
        this.providerKind = 'official-meta';
        this.networkCapable = true;
        this.apiVersion = requireApiVersion(options.apiVersion);
        this.pageAccessTokenSecretRef = options.pageAccessTokenSecretRef.trim();
        if (!this.pageAccessTokenSecretRef) {
            throw new Error('A Page access token secret reference is required');
        }
        this.secretResolver = options.secretResolver;
        this.transport = options.transport ?? new FetchMetaHttpTransport();
        this.requestTimeoutMs = requireTimeout(options.requestTimeoutMs);
        this.webhookHealthReader = options.webhookHealthReader;
    }
    async getPage(pageId) {
        const value = record(await this.graphGet(pathSegment(pageId, 'pageId'), {
            fields: 'id,name,category,website,phone,location',
        }));
        return {
            id: stringValue(value.id) ?? pageId,
            name: stringValue(value.name) ?? 'Facebook Page',
            category: stringValue(value.category),
            website: stringValue(value.website),
            phone: stringValue(value.phone),
            address: pageAddress(value.location),
        };
    }
    async listPosts(pageId, limit) {
        const value = await this.graphGet(`${pathSegment(pageId, 'pageId')}/posts`, {
            fields: 'id,message,created_time,is_published,scheduled_publish_time',
            limit: String(limit),
        });
        return graphArray(value).map((post) => this.mapPost(pageId, post));
    }
    async getPost(pageId, postId) {
        try {
            const value = record(await this.graphGet(pathSegment(postId, 'postId'), {
                fields: 'id,message,created_time,is_published,scheduled_publish_time',
            }));
            return this.mapPost(pageId, value);
        }
        catch (error) {
            if (error instanceof MetaGraphApiError && error.details.code === 100) {
                return null;
            }
            throw error;
        }
    }
    async listComments(pageId, postId, limit) {
        const value = await this.graphGet(`${pathSegment(postId, 'postId')}/comments`, {
            fields: 'id,message,created_time,from{id,name}',
            limit: String(limit),
        });
        return graphArray(value).map((comment) => {
            const author = record(comment.from);
            return {
                id: stringValue(comment.id) ?? 'unknown-comment',
                postId,
                authorDisplayName: stringValue(author.name) ?? 'Facebook user',
                message: stringValue(comment.message) ?? '',
                createdAt: stringValue(comment.created_time) ?? new Date(0).toISOString(),
                needsStaffAttention: true,
            };
        });
    }
    async listInboxThreads(pageId, limit) {
        const value = await this.graphGet(`${pathSegment(pageId, 'pageId')}/conversations`, {
            fields: 'id,updated_time,unread_count,participants.limit(10){id,name}',
            limit: String(limit),
        });
        return graphArray(value).map((thread) => ({
            id: stringValue(thread.id) ?? 'unknown-thread',
            pageId,
            participantDisplayName: participantName(thread.participants, pageId),
            updatedAt: stringValue(thread.updated_time) ?? new Date(0).toISOString(),
            unreadCount: numberValue(thread.unread_count) ?? 0,
        }));
    }
    async getInboxThread(pageId, threadId) {
        try {
            const value = record(await this.graphGet(pathSegment(threadId, 'threadId'), {
                fields: 'id,updated_time,unread_count,participants.limit(10){id,name},messages.limit(100){id,message,created_time,from,to}',
            }));
            const messages = graphArray(value.messages).map((message) => {
                const from = record(message.from);
                return {
                    id: stringValue(message.id) ?? 'unknown-message',
                    threadId,
                    direction: stringValue(from.id) === pageId ? 'outbound' : 'inbound',
                    message: stringValue(message.message) ?? '',
                    createdAt: stringValue(message.created_time) ?? new Date(0).toISOString(),
                };
            });
            return {
                id: stringValue(value.id) ?? threadId,
                pageId,
                participantDisplayName: participantName(value.participants, pageId),
                updatedAt: stringValue(value.updated_time) ?? new Date(0).toISOString(),
                unreadCount: numberValue(value.unread_count) ?? 0,
                messages,
            };
        }
        catch (error) {
            if (error instanceof MetaGraphApiError && error.details.code === 100) {
                return null;
            }
            throw error;
        }
    }
    async getPageInsights(pageId, metricNames) {
        if (metricNames.length === 0) {
            return [];
        }
        const value = await this.graphGet(`${pathSegment(pageId, 'pageId')}/insights`, {
            metric: metricNames.join(','),
            period: 'day',
        });
        return graphArray(value).map((insight) => {
            const values = graphArray(insight.values);
            const latest = values.length > 0 ? values[values.length - 1] : {};
            return {
                name: stringValue(insight.name) ?? 'unknown_metric',
                period: insightPeriod(insight.period),
                value: numberValue(latest.value) ?? 0,
                asOf: stringValue(latest.end_time) ?? new Date(0).toISOString(),
            };
        });
    }
    async getWebhookHealth(pageId) {
        if (this.webhookHealthReader) {
            return this.webhookHealthReader.getWebhookHealth(pageId);
        }
        return {
            pageId,
            status: 'unconfigured',
            signatureVerificationEnabled: false,
            pendingDeliveries: 0,
            failedDeliveries: 0,
        };
    }
    mapPost(pageId, value) {
        const scheduledFor = dateFromSeconds(value.scheduled_publish_time);
        return {
            id: stringValue(value.id) ?? 'unknown-post',
            pageId,
            message: stringValue(value.message) ?? '',
            createdAt: stringValue(value.created_time) ?? new Date(0).toISOString(),
            status: scheduledFor || value.is_published === false ? 'scheduled' : 'published',
            scheduledFor,
        };
    }
    async graphGet(path, query) {
        const token = await (0, resolver_1.resolveRequiredSecret)(this.secretResolver, this.pageAccessTokenSecretRef);
        const url = new URL(`${GRAPH_API_ORIGIN}/${this.apiVersion}/${path}`);
        for (const [name, value] of Object.entries(query)) {
            url.searchParams.set(name, value);
        }
        const response = await this.transport.send({
            method: 'GET',
            url: url.toString(),
            headers: {
                accept: 'application/json',
                authorization: `Bearer ${token.value}`,
                'user-agent': 'MCPMaster-Meta-Business-MCP/1.0',
            },
            timeoutMs: this.requestTimeoutMs,
        });
        let parsed;
        try {
            parsed = JSON.parse(response.bodyText);
        }
        catch {
            throw new MetaGraphApiError('Meta returned a non-JSON response', {
                httpStatus: response.status,
            });
        }
        if (response.status < 200 || response.status >= 300 || parsed.error) {
            const graphError = parsed.error ?? {};
            throw new MetaGraphApiError(stringValue(graphError.message) ?? `Meta Graph API request failed with HTTP ${response.status}`, {
                httpStatus: response.status,
                type: stringValue(graphError.type),
                code: numberValue(graphError.code),
                subcode: numberValue(graphError.error_subcode),
                traceId: stringValue(graphError.fbtrace_id),
            });
        }
        return parsed.data ?? parsed;
    }
}
exports.OfficialMetaReadProvider = OfficialMetaReadProvider;
