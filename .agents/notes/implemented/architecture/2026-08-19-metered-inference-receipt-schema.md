# Agent Note: Freeze metered inference receipt schema and golden vectors (C.3)

Status: implemented

English | [中文](2026-08-19-metered-inference-receipt-schema.zh.md)

## Problem

Peck Harness requires exact, cryptographic token and cost accounting for inference routed through `llm.peck.to`. To guarantee auditability and non-repudiation between the Harness, the Go LLM Gateway, the BSV overlay schema, and on-chain payment channels, the receipt schema and its canonical serialization must be frozen and verifiable across languages.

## Decision

We introduce `@deepseek-ai/dsh-session-metered-receipt` implementing:
1. **Receipt Schema (`peck/v1/inference-receipt`)**: Zod-validated fields capturing request ID, payment channel outpoint and sequence, route and upstream model ID, catalog hash, price schedule ID, detailed token breakdown (uncached input, cache read, cache write, output, reasoning), exact satoshi charges, response digest, and cryptographic signatures.
2. **Canonical Serialization (`canonicalizeReceipt`)**: Strict deterministic line-delimited key-value encoding that produces identical byte sequences across TypeScript, Go, and Python.
3. **Cross-Language Golden Vectors**: Committed in `vectors/receipt-vectors.json` asserting exact SHA-256 digests for standard streaming and complex cached/reasoning calls.
4. **Session Projection (`meteredReceipts`)**: Automatically aggregates verified signed receipts and cumulative satoshi balances folded over the session log.

## Consequences

- The receipt schema and canonical line-based byte layout are frozen as a shared contract across all Peck inference components.
- Any future changes to the receipt layout require bumping the version tag (`peck/v2/...`) to prevent signature invalidation.
- Session projections gain direct access to audited satoshi costs and token breakdown per session.

## Alternatives considered

- **Reusing raw HTTP headers only**: Relies on unstructured headers and risks serialization drift between Go gateway and Node harness.
- **Protobuf / JSON serialization**: Non-canonical JSON encoding whitespace and key ordering variances can cause signature verification failures across platforms. Line-delimited canonical strings eliminate ambiguity.
