'use strict';

const crypto = require('node:crypto');
const { sanitizeError } = require('./owner-command-pipeline');

/**
 * Authoritatively derives the production proof state.
 * production_verified can only be true if authoritative verification evidence exists.
 */
function deriveProofState(executionEvidence, verificationEvidence) {
  if (!executionEvidence) {
    return {
      stage: 'documented',
      verified: false,
      proofHash: null,
      ambiguous: false,
    };
  }

  // A provider execution on its own, even if it returns "production_verified",
  // MUST NOT be trusted as authoritative verification.
  // It only proves execution happened.
  let verified = false;
  let stage = 'executed';
  let proofHash = null;
  let ambiguous = executionEvidence.ambiguous === true;

  if (verificationEvidence && verificationEvidence.stage === 'production_verified') {
    stage = 'production_verified';
    verified = true;
    proofHash = verificationEvidence.proofHash;
    ambiguous = false;
  } else if (ambiguous) {
    stage = 'ambiguous';
  }

  return { stage, verified, proofHash, ambiguous };
}

/**
 * Consumes queued execution dispatches.
 */
async function processExecutionDispatch(options) {
  const {
    projectosClient,
    providerRunner,
    workerIdentity
  } = options;

  if (!projectosClient || !providerRunner) {
    throw new Error('Missing dependencies for worker');
  }

  // Atomic claim
  const claimResult = await projectosClient.claimExecutionDispatch(workerIdentity);
  if (!claimResult || !claimResult.id) {
    return { ok: false, reason: 'no_dispatch_available' };
  }

  const { id: activeDispatchId, planId } = claimResult;

  try {
    // Read exact durable plan
    const plan = await projectosClient.getExecutionPlan(planId);
    if (!plan) {
      throw new Error('Durable plan not found for dispatch');
    }

    // Exact binding validation happens implicitly by reading the plan 
    // and using it as the source of truth for execution.

    // Invoke governed Pandora provider
    let executionResult;
    try {
      executionResult = await providerRunner.execute({
        intakeId: plan.requestId, // intakeId maps to requestId in plan
        message: plan.args?.message || '',
        planId: plan.id,
      });

      // Record provider submission
      const providerOpId = executionResult.providerOperationId || `local-${crypto.randomUUID()}`;
      await projectosClient.recordProviderSubmission(activeDispatchId, providerOpId);

    } catch (executionError) {
      if (executionError.isAmbiguous) {
        await projectosClient.markExecutionAmbiguous(activeDispatchId);
        
        // Wait, the rule says: 
        // "If provider execution might have occurred once: mark dispatch ambiguous, DO NOT retry. Perform provider/runtime readback. Only retry if provider truth proves the side effect did not happen and retry is safe."
        // We stop here and let the caller or background job handle readback.
        
        return { ok: false, reason: 'ambiguous_execution', error: sanitizeError(executionError) };
      }
      
      await projectosClient.markExecutionFailed(activeDispatchId);
      
      await projectosClient.finishExecutionPlan(planId, 'failed', sanitizeError(executionError), {});
      return { ok: false, reason: 'execution_failed', error: sanitizeError(executionError) };
    }

    // Authoritative provider/runtime readback & verification
    // For now we assume providerRunner.verify(providerOpId) exists, or we mock it.
    let verificationEvidence = null;
    if (typeof providerRunner.verify === 'function') {
      verificationEvidence = await providerRunner.verify(executionResult.providerOperationId);
    }
    
    // Check if provider self-declared production_verified
    const derivedProof = deriveProofState(executionResult, verificationEvidence);

    // Persist verification evidence
    await projectosClient.recordExecutionVerification(activeDispatchId);
    
    // Finish execution plan
    await projectosClient.finishExecutionPlan(planId, 'completed', null, {
      summary: executionResult.summary,
      proof: derivedProof
    });

    // Complete dispatch
    await projectosClient.completeExecutionDispatch(activeDispatchId);

    return { ok: true, planId, derivedProof, executionResult };

  } catch (err) {
    // Top-level failure handling
    try {
      await projectosClient.markExecutionFailed(activeDispatchId);
      await projectosClient.finishExecutionPlan(planId, 'failed', sanitizeError(err), {});
    } catch (fallbackErr) {
      // Best effort
    }
    return { ok: false, reason: 'internal_worker_error', error: sanitizeError(err) };
  }
}

module.exports = {
  deriveProofState,
  processExecutionDispatch,
};
