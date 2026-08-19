---
name: governing-customer-data-learning
description: "Governs whether customer data may support analytics, retrieval, evaluation, or model improvement. Use before reusing prompts, code, logs, documents, outcomes, or production behavior beyond direct service delivery."
---

# Governing Customer Data Learning

## Outcome

A purpose-limited, consented, privacy-preserving data-use decision with isolation, retention, deletion, and audit controls.

## Use when

- Customer data could enter analytics or training.
- Outcome telemetry is reused across projects or tenants.
- A proprietary model or benchmark dataset is proposed.

## Workflow

1. Classify data source, owner, contract, purpose, jurisdiction, sensitivity, and whether content is confidential or regulated.
2. Separate service operation, security logging, product analytics, evaluation, retrieval, and training purposes.
3. Require explicit authorization, minimization, de-identification where valid, tenant isolation, retention, deletion, and access controls.
4. Prevent secrets, private KYC, financial documents, protected messages, and customer code from entering unauthorized datasets.
5. Audit downstream copies, models, indexes, exports, and deletion propagation.

## Proof required

- Data-use matrix and legal/contract basis.
- Consent and access evidence.
- Retention/deletion and downstream lineage.

## Stop conditions

- Authorization or customer policy is absent.
- De-identification is claimed without re-identification risk analysis.
- A dataset contains protected or secret material.

## Outputs

- `data-use-decision`
- `dataset-lineage`
- `retention-and-deletion-controls`
