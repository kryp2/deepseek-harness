# @deepseek-ai/dsh-session-metered-receipt

[English](README.md) | 中文

Peck 计量模型推理的跨语言收据 Schema、规范序列化与签名验证。

## 概述

本包定义通过 `llm.peck.to` 后端 BSV / BRC-104 支付通道提供资金的计量 LLM 推理调用的标准收据规范与加密验证工具。

- **Schema 版本：** `peck/v1/inference-receipt`
- **确定性规范化：** 逐行 ASCII 规范格式（`canonicalizeReceipt`），与 Go（`llm-gateway`）及 sCrypt 智能合约保持逐字节一致。
- **会话投影：** 跨日志聚合已验证的签名收据和累计聪计费（`meteredReceipts` 投影单元）。

## Golden Vectors

跨语言测试黄金向量保存在 `vectors/receipt-vectors.json` 并在测试用例中验证。

## Model Experience

- model_facing: false
- tools: none
- system_prompt: none
- runtime_events: `peck/metered-receipt`
- context_contributions: none

## Known Limitations and Deferred Work

- V1 假设通道状态通过 `amount_spent_new_sats` 单调累加跟踪；单个轮次内多通道路由留待后续里程碑实现。
