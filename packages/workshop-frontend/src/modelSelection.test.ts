// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { getStoredSelectedModel, persistSelectedModel } from './modelSelection'
const models = [{ type: 'agent' as const, id: 'old', name: 'Old' }, { type: 'agent' as const, id: 'gpt-6.1-sol', name: 'GPT 6.1 Sol' }]
afterEach(() => localStorage.clear())
it('uses the server preference until an explicit local selection is made', () => {
  expect(getStoredSelectedModel(models, 'gpt-6.1-sol')).toBe('gpt-6.1-sol')
  persistSelectedModel('old')
  expect(getStoredSelectedModel(models, 'gpt-6.1-sol')).toBe('old')
  persistSelectedModel(null)
  expect(getStoredSelectedModel(models, 'gpt-6.1-sol')).toBeNull()
})
