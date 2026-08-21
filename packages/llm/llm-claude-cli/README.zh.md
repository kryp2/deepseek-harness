# @deepseek-ai/dsh-llm-claude-cli

[English](README.md) | 中文

> 状态：**V1 原型。** 已针对 Claude Code 2.1.x 测试。在用于生产工作之前，请先阅读 [已知限制与延期工作](#known-limitations-and-deferred-work)。

面向 DeepSeek Harness LLM 接缝的 `claude --print --output-format json` 适配器。让 DSH agent 无需 `ANTHROPIC_API_KEY` 即可运行 Claude 模型——方式是调用本地安装的 Claude Code CLI。身份验证走宿主机自己的 Claude 订阅（Pro/Max OAuth）——harness 本身不持有任何 Anthropic 凭证。

## 模型目录

| 线上别名 | 底层模型（Claude Code 2.1.x） | 备注 |
|---|---|---|
| `sonnet` | Claude Sonnet 4.5 | 默认；通过 `--settings` 模型固定匹配 |
| `haiku` | Claude Haiku 4.5 | 面向成本敏感 loop 的低价档 |
| `opus` | Claude Opus 4.x | 受订阅档位限制；可能不可用 |

桥接不会直接看到底层模型 id；它把 Claude Code 的 `modelUsage` payload 记入 session log 供诊断使用。

## 为什么存在这个包

`@deepseek-ai/dsh-llm-deepseek` 说的是 DeepSeek chat-completions API。这个包是它的姊妹包，面向首选模型是 Claude、并且已经为 Claude Code 付费的用户。该桥接把 `GenerateOptions` 折叠成一次 `claude --print` 调用，再把产生的 JSON 文档解析回 harness 的 `StreamChunk`。

## 安装

```sh
pnpm install
```

加入你的 `cordis.yml`：

```yaml
- id: llm-claude-cli
  name: '@deepseek-ai/dsh-llm-claude-cli'
  config:
    binary: claude                       # PATH-resolvable
    settingsJson: '{"model":"sonnet","effortLevel":"medium"}'
    maxTokens: 32000
    maxSystemPromptChars: 32000
    models:
      - id: sonnet
      - id: haiku
      - id: opus
```

该插件注册一条 provider 路由：`claude-cli`。把 DSH 的 `GenerateOptions` 指向它——`provider: "claude-cli"` 加任意已配置的模型别名。

## 线上协议

```
GenerateOptions
   │
   ▼  buildInvocation()
claude --print --output-format json \
       --model <alias> \
       --settings '<json>' \
       --max-turns 1 \
       --permission-mode plan \
       --allowed-tools "" \
       --system-prompt '<text>'
   │
   ▼  stdin: role-tagged transcript
Claude Code subprocess
   │
   ▼  stdout: { type:"result", result, usage, total_cost_usd, ... }
translate()
   │
   ▼
StreamChunk[]   { block-start, text-delta, block-end, usage, finish }
```

`--max-tokens` 有意不转发。Claude Code CLI 2.1.x 会把它当作未知选项拒绝；需要硬输出上限的部署应在 `--settings` 中固定模型，或依赖 Claude Code 自己的 `max_tokens` 策略。

## 公共 API

| 导出 | 备注 |
|---|---|
| `ClaudeCliAdapter` | extends `LlmAdapter`；每次插件挂载一个实例 |
| `Config` | schemastery schema；兼作 settings 区块形状 |
| `apply` | Cordis function plugin 入口；`inject: ['llm']` |
| `resolveAdapterOptions(config)` | 显式 resolve 步骤，fail-loud |
| `DEFAULT_CONTEXT_WINDOW` / `DEFAULT_MAX_TOKENS` / `DEFAULT_STREAM_IDLE_TIMEOUT_MS` | 与 adapter 共享 |
| `ClaudeCliCatalogModel` / `ClaudeCliConnectionOptions` | 类型 |
| `./invariant` | 注册包所有权的伴随插件 |

## 另见

- `@deepseek-ai/dsh-llm` — provider 中立的 LLM 服务接口
- `@deepseek-ai/dsh-llm-deepseek` — DeepSeek API 的姊妹适配器
- `docs/architecture.md` — 适配器注册生命周期
- `docs/cookbook/adding-a-package.md` — 本包遵循的包布局规则

## Model Experience

### Claude Code CLI 请求

#### 模型看到的内容

每次请求一次 `claude --print` 调用：stdin 上带角色标签的 transcript 加一个 `--system-prompt` 标志，不含适配器撰写的提示词文本。工具调用被禁用（`--allowed-tools ""`、`--max-turns 1`），DSH 工具 loop 保持工具执行的唯一事实来源。

#### Token 影响

计数来自 Claude Code 的 `usage` block，并以标准 harness `TokenUsage` 形状报告：不相交的 `inputTokens` / `outputTokens` 加上可选的 `cacheReadTokens`、`cacheWriteTokens` 和 `reasoningTokens`。适配器不会把 cache reads 算进 input tokens——harness 约定计数互不相交。

#### KV Cache 影响

每次调用都重写 Claude Code 的 prompt cache：短对话的 cache-write 成本可能压过 Anthropic 侧定价（30k token 系统提示词上的 1-token 回复可能报告 `cache_creation_input_tokens ~30000`），而长的多轮会话会摊薄这次重写，直到桥接反超 API。

### Claude Code CLI 响应

#### 模型看到的内容

JSON result 文档中的 `result` 文本成为 harness 分片；检测到的围栏 JSON 工具调用成为带 `id: "claude-cli-<n>"` 的合成块——该 id 对下游代码不透明，且不跨轮稳定。

#### Token 影响

生成 token 遵循 Claude Code 自己的生成策略；CLI 的 `total_cost_usd` 记入 session log，部署方可据此监控真实开销。

#### KV Cache 影响

保留的响应分片通过重建的 transcript 进入后续调用，并只在 Claude Code 自身缓存保留它们的范围内复用；每次调用仍支付一次缓存重写。

## Known Limitations and Deferred Work

- **无流式输出。** V1 读取完整 JSON 文档并发出一个 text-delta。线上协议支持 `stream-json`；V2 将启用它。
- **工具调用检测是机会主义的。** 序列化器告诉 Claude Code 不要调用工具（`--allowed-tools ""`、`--max-turns 1`），让 DSH 工具 loop 保持唯一事实来源。Claude 仍可能发出形如 `{"tool":"name","arguments":{...}}` 的围栏 JSON 块；翻译器会扫描它们并呈现为 `tool-call` 块。误报风险：响应中的任何围栏 JSON 都可能命中——只要它的 `tool` 字段恰好命名了某个已注册的工具 schema。V2 应切换到 `--output-format stream-json` 以获得结构化事件。
- **系统提示词上限。** Claude Code 会静默截断超长系统提示词。桥接以 `maxSystemPromptChars`（默认 32 000 字符）显式设限，触发时记录警告。拥有大型 `peck-docs` workspace 的部署应调大该值。
- **缓存写入成本。** 每次调用都重写缓存。短调用比 Anthropic API 更贵；长会话可以摊薄。桥接把 `total_cost_usd` 记入 session log，部署方可据此监控真实开销。
- **无图片输入。** V1 只声明 `inputModalities: ['text']`。Anthropic 图片支持需要原生 Messages API，而 Claude Code 的 `--print` 不暴露它。
- **无原生 Anthropic 工具调用形状。** 桥接发出的合成 tool-call 块带 `id: "claude-cli-<n>"`，因为 Claude Code 在 `--print` 模式下不产生 Anthropic 格式的 call id。DSH 工具 loop 会执行调用并回放结果；合成 id 不跨轮稳定，且对下游代码刻意保持不透明。
- **仅 OAuth 身份验证。** 本包不需要 API key，且若提供也会拒发。失败的 `claude --print` 调用会以 `LlmError('AUTH')` 附 stderr 细节呈现——Claude Code 的 `/login` 流程由用户自行完成。

延期工作：

- `stream-json` 输出，向 harness 提供真正的 SSE 流。
- 通过 Anthropic 格式 image blocks 支持视觉输入。
- 一个小型 `--bare` 模式 sidecar，直接暴露 Claude Code 内部 session 的 Anthropic 格式 HTTP；这将整体替换子进程适配器，无需逐调用重写即可解锁原生工具调用、视觉与 prompt-cache 复用。
- 子进程失败（如 OAuth 端点的瞬时 ECONNRESET）的可配置重试策略。
