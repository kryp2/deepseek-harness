# @deepseek-ai/dsh-session-metered-receipt

English | [中文](README.zh.md)

Cross-language receipt schema, canonical serialization, and verification for Peck metered model inference.

## Overview

This package defines the canonical schema and cryptographic verification helpers for metered LLM inference calls funded via BSV / BRC-104 payment channels behind `llm.peck.to`.

- **Schema version:** `peck/v1/inference-receipt`
- **Deterministic canonicalization:** Line-delimited ASCII representation (`canonicalizeReceipt`) matching Go (`llm-gateway`) and sCrypt contracts byte-for-byte.
- **Session Projection:** Aggregates verified signed receipts and cumulative satoshi charges across the log (`meteredReceipts` projection).

## Golden Vectors

Cross-language golden vectors are committed in `vectors/receipt-vectors.json` and asserted across the test suites.

## Model Experience

### Metered receipt projection

#### What the model sees

Nothing. `peck/metered-receipt` is log-only and never enters the session surface, `deriveMessages()`, the system prompt, tool schemas, or a request prefix.

#### Token effect

Zero. Verified receipts append to the log only and add no tokens to any model request; cumulative satoshi charges reach projections and UI, not model context.

#### KV Cache effect

None. Receipt events do not change any request's reconstructed content or cache key.

## Known Limitations and Deferred Work

- V1 assumes channel state is tracked through `amount_spent_new_sats` monotonic accumulation; multi-channel routing within a single turn is deferred to later milestones.
