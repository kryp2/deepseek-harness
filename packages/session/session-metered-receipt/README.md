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

- model_facing: false
- tools: none
- system_prompt: none
- runtime_events: `peck/metered-receipt`
- context_contributions: none

## Known Limitations and Deferred Work

- V1 assumes channel state is tracked through `amount_spent_new_sats` monotonic accumulation; multi-channel routing within a single turn is deferred to later milestones.
