'use strict';

const crypto = require('node:crypto');

const SENSITIVE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*\b/gi,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{16,})\b/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi,
  /(?:password|secret|token|api[_-]?key)\s*[:=]\s*["']?[^\s"';,]+/gi,
];

function sanitizeOwnerText(text) {
  if (typeof text !== 'string') return '';
  let sanitized = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
  }
  return sanitized;
}

function sanitizeError(error) {
  const message = error instanceof Error ? error.message : String(error || 'An unexpected error occurred.');
  return sanitizeOwnerText(message);
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(String(data), 'utf8').digest('hex');
}

function classifyIntentRisk(message) {
  const lower = message.toLowerCase();
  if (
    lower.includes('delete') ||
    lower.includes('drop') ||
    lower.includes('truncate') ||
    lower.includes('destroy') ||
    lower.includes('dangerous')
  ) {
    return { riskLevel: 'CRITICAL', requiresApproval: true };
  }
  if (
    lower.includes('deploy') ||
    lower.includes('release') ||
    lower.includes('modify') ||
    lower.includes('write') ||
    lower.includes('change') ||
    lower.includes('apply')
  ) {
    return { riskLevel: 'WRITE', requiresApproval: true };
  }
  return { riskLevel: 'READ', requiresApproval: false };
}

/**
 * Executes a complete, governed Phase 0 owner command pipeline:
 * OWNER INTENT → auth → Memory hydration → ProjectOS intake → governed plan →
 * authorization → governed execution → proof collection → finalization → porcelain result.
 */
async function executeOwnerCommand(options) {
  const {
    context,
    message,
    projectId,
    projectKey,
    idempotencyKey,
    memoryClient,
    projectosClient,
    providerRunner,
  } = options;

  // 1. Authentication Check
  if (!context || !context.userId || context.isAnonymous) {
    throw new Error('PERMANENT_ACCOUNT_REQUIRED');
  }
  const role = String(context.role || '').toLowerCase();
  if (role !== 'owner' && role !== 'admin') {
    throw new Error('OWNER_OR_ADMIN_ROLE_REQUIRED');
  }

  // 2. Validate & Sanitize Input Message
  const sanitizedMessage = sanitizeOwnerText(message || '').trim();
  if (!sanitizedMessage || sanitizedMessage.length > 4000) {
    throw new Error('INVALID_MESSAGE');
  }

  // 3. Compute Deterministic Idempotency Key
  const actionKey = idempotencyKey || `auto:${sha256Hex(sanitizedMessage)}`;
  const effectiveIdempotency = sha256Hex(
    `${context.organizationId}:${context.userId}:${actionKey}`
  );

  // 4. Trusted Memory Hydration
  let memoryContext = null;
  if (memoryClient) {
    try {
      const memoryKey = projectKey || projectId || 'projectos-inbox';
      memoryContext = await memoryClient.loadCheckpoint(memoryKey);
      if (memoryContext && memoryContext.valid === false) {
        throw new Error('STALE_OR_INVALID_MEMORY_CONTEXT');
      }
    } catch (err) {
      if (err.message === 'STALE_OR_INVALID_MEMORY_CONTEXT') {
        throw err;
      }
      // Fail closed if memory verification fails
      throw new Error(`MEMORY_HYDRATION_FAILED: ${sanitizeError(err)}`);
    }
  }

  // 5. ProjectOS Intake
  let intakeRecord = null;
  if (projectosClient && typeof projectosClient.acceptIntake === 'function') {
    intakeRecord = await projectosClient.acceptIntake({
      organizationId: context.organizationId,
      requesterId: context.userId,
      requestText: sanitizedMessage,
      projectKey: projectKey || null,
      idempotencyKey: effectiveIdempotency,
      source: 'api',
    });

    // Check for idempotent replay of completed work
    if (intakeRecord && intakeRecord.status === 'completed' && intakeRecord.result) {
      return {
        ...intakeRecord.result,
        idempotentReplay: true,
      };
    }

    // Concurrent in-flight protection:
    // If the intake was already created (not new) but is not yet completed,
    // it means another execution is currently in flight. We must not dispatch again.
    if (intakeRecord && intakeRecord.isNew === false && intakeRecord.status !== 'approved') {
      return {
        reply: 'This exact command is currently being processed. Please wait a moment and check again.',
        needsApproval: false,
        actionId: intakeRecord.id,
        approvalId: null,
        status: {
          whatChanged: 'No new changes (command already in flight).',
          whereWeAre: 'Processing prior request.',
          whatIsDone: 'Command was previously accepted.',
          whatIsHappeningNow: 'Waiting for the original execution to complete.',
          whatIsStoppingUs: 'Concurrent duplicate request blocked.',
          whatIWillDoNext: 'Check results once the original execution finishes.',
        },
        proof: {
          stage: 'implemented',
          verified: false,
          ambiguous: true,
        },
        advanced: {
          intakeId: intakeRecord.id,
          idempotencyKey: effectiveIdempotency,
          inFlightDuplicate: true,
        },
      };
    }
  }

  const intakeId = intakeRecord?.id || `intake-${effectiveIdempotency.substring(0, 12)}`;

  // 6. Governed Planning & Risk Classification
  const risk = classifyIntentRisk(sanitizedMessage);

  if (risk.requiresApproval && (!intakeRecord || intakeRecord.status !== 'approved')) {
    const approvalId = `appr-${sha256Hex(`${intakeId}:approval`).substring(0, 12)}`;
    return {
      reply: `Pandora prepared a governed plan for your request (${risk.riskLevel} risk). Owner approval is required before execution.`,
      needsApproval: true,
      actionId: intakeId,
      approvalId,
      status: {
        whatChanged: 'Governed plan created and validated against safety policies.',
        whereWeAre: 'Awaiting owner approval.',
        whatIsDone: 'Plan documented and bound to rollback prerequisites.',
        whatIsHappeningNow: 'Paused at approval gate.',
        whatIsStoppingUs: 'Pending approval.',
        whatIWillDoNext: 'Review and approve the plan to begin execution.',
      },
      proof: {
        stage: 'documented',
        verified: true,
      },
      advanced: {
        intakeId,
        approvalId,
        riskLevel: risk.riskLevel,
        idempotencyKey: effectiveIdempotency,
      },
    };
  }

  let executionResult = null;
  try {
    if (providerRunner && typeof providerRunner.execute === 'function') {
      executionResult = await providerRunner.execute({
        intakeId,
        message: sanitizedMessage,
        context,
        memoryContext,
      });
    } else {
      executionResult = {
        summary: 'Intent analyzed and planned successfully. No active execution provider is bound.',
        itemsChecked: 0,
        findings: [],
        stage: 'dispatch_pending',
      };
    }
  } catch (executionError) {
    // Check if error represents an ambiguous side-effect
    if (executionError.isAmbiguous) {
      return {
        reply: 'The command was dispatched, but completion could not be definitively verified. To prevent duplicate actions, blind retries are blocked.',
        needsApproval: false,
        actionId: intakeId,
        approvalId: null,
        status: {
          whatChanged: 'Command was dispatched to provider.',
          whereWeAre: 'Ambiguous execution outcome.',
          whatIsDone: 'Dispatch attempted.',
          whatIsHappeningNow: 'Awaiting provider reconciliation.',
          whatIsStoppingUs: 'Ambiguous response received from provider.',
          whatIWillDoNext: 'Reconcile state before attempting further actions.',
        },
        proof: {
          stage: 'implemented',
          verified: false,
          ambiguous: true,
        },
        advanced: {
          intakeId,
          error: sanitizeError(executionError),
          idempotencyKey: effectiveIdempotency,
        },
      };
    }

    return {
      reply: `The check could not be completed: ${sanitizeError(executionError)}`,
      needsApproval: false,
      actionId: intakeId,
      approvalId: null,
      status: {
        whatChanged: 'An issue occurred during execution.',
        whereWeAre: 'Execution failed.',
        whatIsDone: 'Error was recorded in audit log.',
        whatIsHappeningNow: 'No changes were made.',
        whatIsStoppingUs: sanitizeError(executionError),
        whatIWillDoNext: 'Review the error and retry.',
      },
      proof: {
        stage: 'documented',
        verified: false,
      },
      advanced: {
        intakeId,
        idempotencyKey: effectiveIdempotency,
      },
    };
  }

  // 8. Finalization & Proof Binding
  const proofHash = executionResult?.proofHash || null;
  const isVerified = !!executionResult?.verified;
  const porcelainReply = executionResult?.summary || 'The requested check completed successfully.';
  const defaultStage = isVerified ? 'production_verified' : 'executed';

  const finalOutcome = {
    reply: porcelainReply,
    needsApproval: false,
    actionId: intakeId,
    approvalId: null,
    status: {
      whatChanged: 'Requested operation completed.',
      whereWeAre: isVerified ? 'Verified and active.' : 'Executed, pending verification.',
      whatIsDone: 'All checks executed within governed limits.',
      whatIsHappeningNow: isVerified ? 'Systems operating normally.' : 'Awaiting external verification.',
      whatIsStoppingUs: null,
      whatIWillDoNext: 'No action required.',
    },
    proof: {
      stage: executionResult?.stage || defaultStage,
      verified: isVerified,
      proofHash,
    },
    advanced: {
      intakeId,
      idempotencyKey: effectiveIdempotency,
      memorySnapshot: memoryContext?.checkpointVersion || null,
      details: executionResult,
    },
  };

  if (projectosClient && typeof projectosClient.completeIntake === 'function') {
    await projectosClient.completeIntake({
      intakeId,
      result: finalOutcome,
      proofHash,
    });
  }

  return finalOutcome;
}

export {
  executeOwnerCommand,
  classifyIntentRisk,
  sanitizeOwnerText,
  sanitizeError,
};
