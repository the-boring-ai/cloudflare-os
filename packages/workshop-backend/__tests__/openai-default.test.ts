import { describe, expect, it } from 'vitest';
import { createOpenAi61Record } from '../src/openai-default.js';
import type { UserAiModelRecord } from '../src/user.js';

const connection = (id: string, token = 'test-credential'): UserAiModelRecord => ({
  profile: { type: 'agent', id, name: id },
  config: { provider: 'openai', model: id, apiToken: token, apiUrl: 'https://provider.example/v1', accountId: 'existing-account' },
});

describe('OpenAI workspace default', () => {
  it('preserves the chosen connection and old configuration without putting the credential in metadata', () => {
    const old = connection('gpt-5.6-luna');
    const next = createOpenAi61Record([old], old.profile.id);
    expect(next.config).toEqual({ ...old.config, model: 'gpt-6.1-sol' });
    expect(next.profile).toEqual({ type: 'agent', id: 'gpt-6.1-sol', name: 'GPT 6.1 Sol' });
    expect(JSON.stringify(next.profile)).not.toContain('test-credential');
    expect(old.config.model).toBe('gpt-5.6-luna');
  });
  it('requires an explicit source when there are several connections and no preferred OpenAI model', () => {
    const records = [connection('a'), connection('b', 'second-test-credential')];
    expect(() => createOpenAi61Record(records, null)).toThrow('Choose the existing OpenAI model');
    expect(createOpenAi61Record(records, null, 'b').config.apiToken).toBe('second-test-credential');
    expect(() => createOpenAi61Record([], null)).toThrow('Add an OpenAI connection');
  });
  it('reuses the existing target and refuses a conflicting model ID', () => {
    const existing = connection('gpt-6.1-sol');
    expect(createOpenAi61Record([existing], null)).toBe(existing);
    expect(() => createOpenAi61Record([{ ...existing, config: { ...existing.config, provider: 'ollama' } }], null)).toThrow('already used');
  });
});
