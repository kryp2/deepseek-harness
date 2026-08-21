# Agent Note: Cordis inspect providers register idempotently

Status: implemented

[English](2026-08-18-cordis-inspect-provider-idempotent.md) | 中文

## 问题

`@deepseek-ai/dsh-tool-cordis` 在每次挂载时都会注册四个 host 全局的 Cordis inspect providers（`Service`、`Event`、`Builtin`、`Tool`），而它既随 shipped 的 `cordis` preset 分发，也被复制该 preset 的 fork（`peck` preset）携带。`cordisInspect` 注册表是进程全局的，因此挂载第二个 preset 时会抛出 `Host Cordis inspect provider "Service" is already registered`，在浏览器侧表现为 `SessionCreateError` 和一个失效的「New session」按钮。每次使第二个 preset 挂载的 preset/config 变更都会复发。

## 决策

`CordisInspectRegistryService.register()` 现在按 manifest id 幂等。首次挂载持有该条目；同一 id 的后续每次挂载增加一次引用，disposer 只在该条目的最后一个持有者释放时才将其驱逐。相同的 manifest 因此可以共存；在已被占用的 id 下注册真正不同的 manifest 仍然是首次注册者的问题（与之前相同——过去仅凭 id 就冲突）。

只有 Host inspect 注册表被放宽。其余所有「already registered」守卫（工具、skills、subagents、LSP、session projections、agent factories）保持 fail-loud 的重复检查——在那里冲突是编写错误，而不是已知的幂等跨 preset 重挂载。

## 已考虑的替代方案

- **保持 fail-loud 并要求 preset 去重** —— 落选：shipped 与 fork 的 preset 本来就会合法地把同样的 provider 挂载两次，第二次挂载是正常操作；把它当成 `SessionCreateError` 加失效按钮暴露出来，正是这个 bug 本身。
- **以同样方式放宽其他注册表** —— 落选：对工具、skills、subagents、LSP、session projections 与 agent factories 而言，重复是编写错误，fail-loud 守卫正是捕获它的机制。

## 后果

多 preset 组合下的重复检查误报消失，代价是每个共享条目多一次引用计数。注册表旁边应有一个引用计数单元测试；目前没有可扩展的 `inspect-registry` spec，它将随下一次 cordis-host-runner 测试补齐。其他所有重复守卫均未触碰。
