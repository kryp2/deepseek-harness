# Agent Note: 用户问答瀑布，用于可插拔的人类参与渠道

Status: proposed

[English](2026-08-16-user-questions-waterfall-telegram.md) | 中文

## 问题

`ctx.userQuestions` 是单提供者 seam：`UserQuestionService.registerProvider()` 在第二次注册时抛出 `DUPLICATE_PROVIDER`，而 `ask()` 委托给那唯一的 `this.provider`。宿主 `dsh-host-apiproxy` 在其 `apply()` 中无条件注册了那唯一的 Web GUI 提供者。这使得「向人提问」的路径成了一个封闭的单渠道表面：第二个回答渠道（Telegram、邮件、消息桥）无法与 Web GUI 共存，也无法回答同一个问题。

`ctx.approval` 已经做对了。`ApprovalService` 分发一个以请求 agent 为作用域的 `approval/request` 瀑布，让回答与调用方的中止信号竞争，并在失败时关闭为 `'unavailable'`。任意数量的回答者都可以在该瀑布上注册；Web 代理只是众多 `ctx.on('approval/request', …)` 监听器之一。从结构上讲，提问路径没有理由不与之镜像 —— 一个 seam 是单提供者，而它的同类却是瀑布，这种不对称是唯一阻碍可插拔提问渠道的东西。

## 提案

赋予 `UserQuestionService` 与 `ApprovalService` 相同的瀑布形态，同时为现有 Web 提供者保留一条迁移路径：

1. **新增一个类型化事件** —— `'user-questions/ask'`，模式为 waterfall，以提问 agent 为作用域，契约与 `approval/request` 相同：监听器返回 `AskUserQuestionAnswer` 即认领该问题，或调用 `next()` 让下一个回答者尝试。链的终点（越过最后一个监听器）是失败关闭的默认值。

2. **在 `ask()` 中通过瀑布分发** —— 将 `return this.provider.ask(request)` 替换为在 `'user-questions/ask'` 上的作用域瀑布，与 `request.signal` 竞争，并按 approval 路径归一化。把现有的活跃性检查（CALLER_NOT_LIVE、DELEGATED_CALLER、EMPTY_QUESTIONS、BAD_INTENT）保留在分发之前。

3. **把 Web 代理从提供者迁移为监听器。** 待回答注册表和 mux 广播是代理关注点，而非渠道关注点，因此它们进入一个 `ctx.on('user-questions/ask', …)` 监听器。随后移除 `registerProvider`（单数提供者已无消费者），而不是保留为 shim。

4. **Telegram 回答者（可选、可插拔）** —— 一个新的可选用插件注册自己的 `ctx.on('user-questions/ask', …)` 监听器，把问题发送到 Telegram（内联按钮 + 自由文本）并从回复中解析答案。它与 Web 监听器共存：谁先回答谁赢得瀑布。

## 后果

- **跨渠道先答者胜。** 一个问题同时到达每个已注册的回答者；第一个产生合法 `AskUserQuestionAnswer` 的人结算 `ask()`。中止仍会从所有监听器撤回该问题。
- **失败关闭。** 在没有组合任何监听器的情况下，`ask()` 解析为文档化的错误（镜像 `'unavailable'`）而非 `NO_PROVIDER`；已发布的 Web 监听器保持默认行为完全不变。
- **与 approval 对称。** 两个人类交互 seam 共享同一种形态、同一条作用域规则和同一套归一化策略。这就是一步到位的「更宽的人类参与 seam」，因为同一条 seam 也为 `ask_user_question` 接纳了一个 approval 风格的回答者，而无需触碰 approval 路径（它已经是瀑布）。
- **作用域纪律。** 瀑布监听器通过 `dsh-scope` 以 agent 为作用域，与 `approval/request` 匹配；一个渠道只回答它拥有的 agent 的问题。

## 已考虑过的替代方案

- **多提供者注册（保留 N 个提供者）。** 被拒绝：改变了「提供者」的含义，迫使每个消费者都要推理哪个提供者作答，并且没有复用 approval 已经拥有的、经过验证的瀑布/竞争/归一化机制。
- **一个 agent 必须显式调用的独立 Telegram 工具**（`ask_via_telegram`）。这是 `peck-meta` 桥今天所做的，且可用，但并不无缝：模型必须选择渠道。瀑布让每个渠道对调用方透明。
- **在更高层级包装现有提供者。** 被拒绝：待回答注册表和 mux 广播是代理私有的，任何包装器都无法在不复制代理内部细节的情况下触及它们。

## 必要验证

- `packages/interaction/user-questions` 单元测试：瀑布分发、先答者胜、失败关闭、中止竞争、作用域过滤（镜像 `user-approval/tests/approval.spec.ts`）。
- 一个真实组合测试，证明 Web 监听器仍能端到端回答 `ask_user_question`（产品可见路径不得回退）。
- 针对组装后的 `ask_user_question` 转录记录一个无密钥快照。
- 对受影响包运行 `typecheck`、`build`、`test:coverage`，并运行一次 doc-sync。

## 实现状态（fork `kryp2/deepseek-harness`，分支 `feat/user-questions-waterfall-telegram`）

已完成且通过（`user-questions`、`tool-ask-user`、`plan-mode`、`apiproxy` 共 459 个测试）：

- `UserQuestionService` 通过作用域化的 `'user-questions/ask'` 瀑布分发；抛错的回答者传播自身错误，链的未到达终点是失败关闭的 `NO_ANSWERER`。`registerProvider` 仍作为注册监听器的 shim 保留。
- `dsh-host-apiproxy` 将其 Web GUI 回答者注册为 `ctx.on('user-questions/ask', …)`，不再注入 `userQuestions`。
- `@deepseek-ai/dsh-scope` 作为 `user-questions` 的 peer/dev 依赖加入。
- 下游 `NO_PROVIDER` 断言更新为 `NO_ANSWERER`。
- 新增 `telegram-answerer` 包：一个可选用插件，注册 `ctx.on('user-questions/ask', …)`，把问题发送到 Telegram 并从回复解析答案；纯辅助函数已通过单元测试，包已接入 host 聚合与各文档门。

仍待完成：

1. **真实组合测试 + 无密钥快照**，证明 Web 回答者仍回答 `ask_user_question`，且第二个回答者（Telegram）也能回答。
2. **完整门运行**：`pnpm run typecheck`、`pnpm run test:coverage`、`pnpm run build`、`pnpm run doc-sync`、`pnpm run hygiene` 对整个 workspace 执行。
3. **切换**：把本 DSH 安装指向 fork（构建 fork 并加载其 `apps/cli` bundle 以替代 npm `@deepseek-ai/dsh@0.1.0-rc.6`），然后把 Telegram 回答者行重新加入宿主/预设组合。
