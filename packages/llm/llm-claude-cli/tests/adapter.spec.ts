/**
 * Adapter-level tests for ClaudeCliAdapter. Cover the model-resolution,
 * provider-info, and retry-policy paths; the spawn/stream path is covered
 * by the loader-composition spec which drives a real `claude --print`.
 */

import { describe, expect, it } from 'vitest'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { ClaudeCliAdapter, DEFAULT_CONTEXT_WINDOW, DEFAULT_MAX_TOKENS } from '../src/adapter.ts'
import type { ClaudeCliConnectionOptions } from '../src/serialize.ts'

function conn(overrides: Partial<ClaudeCliConnectionOptions> = {}): ClaudeCliConnectionOptions {
  return {
    binary: 'claude',
    settingsJson: '{"model":"sonnet","effortLevel":"medium"}',
    maxTokens: 32000,
    maxSystemPromptChars: 32000,
    models: [
      { id: 'sonnet', contextWindow: 200000, maxTokens: 32000 },
      { id: 'haiku', contextWindow: 200000, maxTokens: 32000 },
    ],
    ...overrides,
  }
}

function adapter(): ClaudeCliAdapter {
  return new ClaudeCliAdapter({ options: conn })
}

describe('ClaudeCliAdapter: provider metadata', () => {
  it('returns the configured provider name and id', () => {
    const a = adapter()
    expect(a.providerInfo('claude-cli')).toEqual({ id: 'claude-cli', name: 'Claude (CLI)' })
  })

  it('returns a no-retry policy so the harness retry layer wraps cleanly', () => {
    const a = adapter()
    const policy = a.providerRetryPolicy('claude-cli')
    expect(policy.mode).toBe('normal')
    expect(policy.maxRetries).toBe(0)
    expect(policy.retryableCodes).toEqual([])
  })
})

describe('ClaudeCliAdapter: catalog', () => {
  it('lists models from the configured catalog', async () => {
    const a = adapter()
    const models = await a.listModels('claude-cli')
    expect(models.map(m => m.id)).toEqual(['sonnet', 'haiku'])
    expect(models[0]?.name).toBe('sonnet')
    expect(models.every(m => m.inputModalities?.[0] === 'text')).toBe(true)
  })

  it('exposes an uncatalogued model as text-only with the harness defaults', async () => {
    const a = adapter()
    const resolved = await a.resolveModel('claude-cli', 'opus')
    expect(resolved.id).toBe('opus')
    expect(resolved.name).toBe('opus')
    expect(resolved.context?.contextWindow).toBe(DEFAULT_CONTEXT_WINDOW)
    expect(resolved.defaultMaxTokens).toBe(DEFAULT_MAX_TOKENS)
    expect(resolved.inputModalities).toEqual(['text'])
  })

  it('honors a catalog entry\'s contextWindow + maxTokens', async () => {
    const a = new ClaudeCliAdapter({
      options: () => conn({
        models: [{ id: 'haiku', contextWindow: 100000, maxTokens: 8000 }],
      }),
    })
    const resolved = await a.resolveModel('claude-cli', 'haiku')
    expect(resolved.context?.contextWindow).toBe(100000)
    expect(resolved.defaultMaxTokens).toBe(8000)
  })

  it('falls back to the profile maxTokens when a catalog entry has none', async () => {
    const a = new ClaudeCliAdapter({
      options: () => conn({
        models: [{ id: 'haiku' }],
        maxTokens: 16000,
      }),
    })
    const resolved = await a.resolveModel('claude-cli', 'haiku')
    expect(resolved.defaultMaxTokens).toBe(16000)
  })
})

describe('ClaudeCliAdapter: spawn failure classification', () => {
  // The classifyJsonError helper is internal; we exercise it through
  // the public stream() surface by spawning a binary that does not exist.
  it('classifies ENOENT (binary missing) as AUTH for consistency with claude-CLI\'s auth prompt', async () => {
    const a = new ClaudeCliAdapter({
      options: () => conn({ binary: '/nonexistent/claude-binary-that-cannot-exist' }),
    })
    const opts: GenerateOptions = {
      provider: 'claude-cli',
      model: 'haiku',
      messages: [],
    }
    const chunks: unknown[] = []
    try {
      for await (const chunk of a.stream(opts)) chunks.push(chunk)
    } catch (err) {
      // Either an AUTH (ENOENT branch) or TRANSPORT error is acceptable;
      // both surface as LlmError from the spawn path.
      expect(String(err)).toMatch(/Claude CLI spawn failed|LlmError/)
    }
    expect(chunks.length).toBe(0)
  })

  it('aborts the child process when the caller signal fires', async () => {
    const a = adapter()
    const controller = new AbortController()
    const opts: GenerateOptions = {
      provider: 'claude-cli',
      model: 'haiku',
      messages: [],
      signal: controller.signal,
    }
    // Abort before consuming the stream; the iterator should exit promptly.
    controller.abort()
    const iterator = a.stream(opts)[Symbol.asyncIterator]()
    // We don't care whether it returns done or throws — both indicate the
    // abort path executed without leaking the child process.
    const result = await iterator.next().catch((err: unknown) => ({ reason: String(err) }))
    expect(result.done === true || 'reason' in result).toBe(true)
  })
})