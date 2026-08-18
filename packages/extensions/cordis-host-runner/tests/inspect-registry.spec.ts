import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CordisInspectRegistryService } from '../src/inspect-registry.ts'
import type { HostCordisInspectProviderRegistration } from '../src/inspect-registry.ts'

const EMPTY_INPUT = { type: 'object', properties: {}, additionalProperties: false }
const OUTPUT = { description: 'JSON data owned by this inspect provider.' }

/** Minimal valid Host provider registration for one manifest id. */
function registration(id: string): HostCordisInspectProviderRegistration {
  return {
    manifest: {
      id,
      description: `${id} provider`,
      methods: [{
        name: 'list',
        description: 'list',
        inputSchema: EMPTY_INPUT,
        outputSchema: OUTPUT,
      }],
    },
    query(methodName) {
      if (methodName !== 'list') throw new Error(`unknown method "${methodName}"`)
      return Promise.resolve({ id })
    },
  }
}

describe('CordisInspectRegistryService.register', () => {
  it('registers a provider once and serves it', () => {
    const registry = new CordisInspectRegistryService(new Context())
    registry.register(registration('Service'))
    expect(registry.list().some(view => view.id === 'Service' && view.platform === 'host')).toBe(true)
  })

  it('is idempotent across preset mounts of the same provider id', () => {
    const registry = new CordisInspectRegistryService(new Context())
    const first = registry.register(registration('Service'))
    // A second preset mounting the same id must not throw (regression: a second
    // preset mount used to fail session creation with "already registered").
    const second = registry.register(registration('Service'))
    expect(registry.list().filter(view => view.id === 'Service')).toHaveLength(1)
    expect(first).toBeTypeOf('function')
    expect(second).toBeTypeOf('function')
  })

  it('evicts the shared entry only after the last holder disposes', () => {
    const registry = new CordisInspectRegistryService(new Context())
    const first = registry.register(registration('Service'))
    const second = registry.register(registration('Service'))
    first()
    // The remaining holder still sees its provider.
    expect(registry.list().some(view => view.id === 'Service')).toBe(true)
    second()
    expect(registry.list().some(view => view.id === 'Service')).toBe(false)
  })

  it('serves a provider whose first holder already disposed, through the surviving registration', () => {
    const registry = new CordisInspectRegistryService(new Context())
    const disposers = [registration('Service'), registration('Service')].map(r => registry.register(r))
    disposers[0]!()
    expect(registry.list().some(view => view.id === 'Service')).toBe(true)
    disposers[1]!()
  })
})