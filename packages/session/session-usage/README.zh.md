# @deepseek-ai/dsh-session-usage

[English](README.md) | 中文

注册 `usageByRoute` 投影单元的函数插件：从最近的请求配置与组装完成的助手消息中折叠出整份日志的按路由 token 用量，并通过 session-projection 接缝（注册表快照、变更流与各投影载体）对外提供。客户端可渲染不受分页与压缩影响的按订阅用量。

## 折叠语义

- 归属以最近的 `request/header`（config 中的 `provider`/`model`）或 `request/context`（自身的 `provider`/`model`）字段为准。agent-loop 会在请求发出前记录两者，因此每一步的 `assistant/message` 都归属到其组装时当前的路由。
- `calls` 在每条已组装且路由已知的助手消息上递增，即使没有用量报告（一条 max-tokens 的 usage-host 消息仍是一次完成的调用）。
- token 字段（`inputTokens`、`outputTokens`、`cacheReadTokens`、`cacheWriteTokens`、`reasoningTokens`）仅在消息报告有限非负计数时累加；格式错误的报告会像窗口折叠保护节点用量那样被忽略，不产生任何贡献。
- 计数互斥，与 `TokenUsage` 一致：`inputTokens` 是未缓存输入，缓存输入在 cache 字段中，`reasoningTokens` 是输出的一个细分。
- `routes` 按日志中出现顺序列出每个路由一次，并按输出 token 降序排列；`totalCalls` 汇总调用次数。
- 已组合的注册表始终提供该键，因此客户端读取的是值，从不依据键是否存在。

## 组合

```yaml
- id: session-usage
  name: '@deepseek-ai/dsh-session-usage'
```

注入 `sessionProjections` —— 这是插件的全部用途；在没有注册表的装配中，fiber 保持挂起，不注册任何内容。

## 模型体验

无：插件仅为已记录的会话事件计算面向客户端的读取模型，不触碰任何提示、消息、schema、流或工具结果。

#### KV Cache 影响

无；插件从不会组装或发送提供方请求。

## 已知限制与待办

- **归属是单一指针而非逐步托管** —— 折叠将每条消息归属到最近的请求配置，因此会话中途切换配置后组装的消息归属到新路由；这与循环的顺序一致（配置在其描述的请求之前被记录）。
- **用量由提供方报告且可选** —— 未报告用量的路由仍会累加 `calls`，但 token 为零；token 数值只与适配器报告的完整程度一致。
- **不包含成本、余额或 CLI-agent 聚合** —— 本单元只统计 token 与调用次数；`$` 定价、外部余额（`/credits`）以及 `usage.jsonl`（codex/claude/opencode CLI agent）都属于后续的仪表盘层，不在这里。
