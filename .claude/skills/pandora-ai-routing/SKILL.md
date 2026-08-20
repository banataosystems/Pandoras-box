---
name: pandora-ai-routing
description: "Choose how a task gets done — deterministic code, a small model, or a large model — and design routing, fallback, evaluation, and cost/latency tradeoffs. Load when selecting a model, designing an agent or prompt strategy, deciding whether AI is the right tool at all, building evaluations, or diagnosing AI output quality. Provider-agnostic; optimizes for the cheapest method that reliably satisfies the proof gate."
---

# Pandora AI & Model Routing

**Use the least expensive method that reliably satisfies the task and its proof gate.**

Two words carry the weight. *Reliably* — an unreliable cheap method is not cheap, because verification and rework cost more than the saving. *Proof gate* — the required output quality is set by what must be proven, not by what looks impressive.

## Deterministic first

Before routing to any model, ask whether the task needs one.

A model is the wrong tool when: the answer is computable · the rule is fixed · a schema can validate it · exactness is required · it runs at high volume with a stable shape.

A model is right when: input is genuinely unstructured natural language · the task needs judgment across ambiguous context · the space of valid outputs is too large to enumerate · it is generation rather than decision.

The most common design error in agent systems is using a model for something a function does better, faster, cheaper, and verifiably. Hash comparison, SHA verification, schema validation, and risk classification against a known catalog are all deterministic — never delegate them to a model's judgment.

## Routing

Route by required capability, not by habit:

- **Small/fast** — classification, extraction, routing, short structured transforms, high volume.
- **Mid** — most implementation, summarization, review of bounded scope.
- **Large/frontier** — hard reasoning, architecture, security review, ambiguous multi-step work, anything where a subtle error is expensive.

Escalate on evidence: low confidence, a failed validation, an ambiguous result, or a high-stakes gate. Escalating is cheaper than a wrong answer at a proof gate.

Stay provider-agnostic. Keep model identity behind an interface so routing policy is configuration rather than code changes, and so a provider outage is a routing change rather than an incident.

## Fallback

Design for provider failure: a fallback path for outage or rate limiting, a bounded retry (never on a confirmed mutation), and a defined behavior when every option fails — which must be an honest failure, not a fabricated answer.

Fallback to a weaker model is a **quality change**. Record which model produced an output, so nobody later mistakes a degraded result for a normal one.

## Context economy

Cost and latency track context size, and so does error rate — a model given everything reasons worse than one given what matters.

Retrieve rather than stuff. Summarize stable background. Keep volatile detail (current state) out of static instructions and pull it from the authoritative source at request time — this is exactly why Pandora skills hold procedures while Memory holds state. Put stable content first so it caches.

## Evaluation

An agent system without evaluation drifts and nobody notices until something visible breaks.

Build eval sets from **real** cases, including the ones that failed before. Test the boundary cases where behavior should change, and include negative cases where the correct answer is a refusal, an escalation, or "I could not verify this".

Measure what matters for the task: correctness against a known answer, safety (did it escalate when it should), and cost per successful outcome. Not tokens consumed — **cost per success**. A cheaper model that fails a third of the time is more expensive once rework is counted.

Track quality, cost, and latency over time. A routing change that saves money and quietly loses accuracy is a regression.

## Agent design

Give an agent the smallest tool set for its job; every extra tool is a chance to do the wrong thing. Bound every loop by iterations, time, and spend. Checkpoint state so a failure is resumable rather than restartable.

**Detect loops.** Repeating the same failing action is the characteristic agent failure mode. Detect it, stop, and escalate rather than burning budget.

**Terminate safely.** On budget exhaustion or repeated failure, stop and report honestly — never fabricate a completion to end the loop. Verify outcomes against evidence rather than the agent's own assertion, which is the whole reason independent review exists as a separate skill here.

## Prompt strategy

Say what the task is, what good output looks like, and what the constraints are. Prefer showing a correct example over describing one. Ask for structured output when it will be parsed, and validate it — never assume the shape.

Give the model a way to say "I don't know" or "I could not verify". Without that path, it will invent something, and a fabricated verification is worse than an absent one.

## Output

```
TASK          <what needs doing>
METHOD        deterministic | small | mid | large — <why this is the cheapest reliable option>
PROOF GATE    <what the output must satisfy>
FALLBACK      <on failure or unavailability>
CONTEXT       <what is included, and why that is the minimum>
EVAL          <how quality is measured>
COST          <per successful outcome>
BOUNDS        <iteration, time, spend limits>
```
