"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.PROJECTOS_APPROVER_ROLES = void 0;
exports.canApproveProjectOsPlan = canApproveProjectOsPlan;
exports.projectOsApproverAttribution = projectOsApproverAttribution;

exports.PROJECTOS_APPROVER_ROLES = Object.freeze(new Set(["owner", "admin"]));

function canApproveProjectOsPlan(actor) {
    return Boolean(actor && exports.PROJECTOS_APPROVER_ROLES.has(actor.membership?.role));
}

function projectOsApproverAttribution(actor) {
    if (!canApproveProjectOsPlan(actor) || !actor.identity?.userId) {
        throw new Error("Plan approval requires a ProjectOS owner or admin session");
    }
    return `supabase:${actor.identity.userId}`;
}
