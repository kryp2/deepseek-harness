# Agent Note: 固化计量推理收据 Schema 与黄金测试向量 (C.3)

Status: implemented

[English](2026-08-19-metered-inference-receipt-schema.md) | 中文

## 问题

Peck Harness 需要对经由 `llm.peck.to` 路由的推理调用进行精确、可加密验证的 token 与费用核算。为了保证 Harness、Go 语言 LLM Gateway、BSV Overlay Schema 以及链上支付通道之间的可审计性与不可否认性，收据 Schema 及其规范序列化必须得到固化并支持跨语言验证。

## 决策

我们引入了 `@deepseek-ai/dsh-session-metered-receipt` 包，实现以下内容：
1. **收据规范（`peck/v1/inference-receipt`）**：由 Zod 验证的结构体，包含请求 ID、支付通道 UTXO outpoint 与序列号、路由与上游模型 ID、目录哈希、价格计划 ID、详尽 token 分解（未命中缓存输入、缓存读取、缓存写入、输出、推理 token）、精确聪计费、响应体哈希及加密签名。
2. **规范序列化（`canonicalizeReceipt`）**：严格的确定性按行键值编码，在 TypeScript、Go 和 Python 之间产生逐字节一致的字节序列。
3. **跨语言黄金测试向量**：保存在 `vectors/receipt-vectors.json`，断言标准流式传输与复杂缓存/推理调用的精确 SHA-256 摘要。
4. **会话投影（`meteredReceipts`）**：自动聚合会话日志中已验证的签名收据与累计聪计费余额。

## 后果

- 收据 Schema 和基于行的规范字节布局作为所有 Peck 推理组件之间的共享契约得到固化。
- 未来对收据布局的任何修改都必须提升版本标签（`peck/v2/...`），以防签名失效。
- 会话投影获得了按会话直接访问经过审计的聪费用和 token 分解数据的能力。

## 考虑过的替代方案

- **仅复用原始 HTTP 头**：依赖非结构化头部，容易在 Go 网关与 Node harness 之间产生序列化偏差。
- **Protobuf / JSON 序列化**：非规范化的 JSON 空格与键顺序差异可能导致跨平台签名验证失败。按行规范字符串消除了歧义。
