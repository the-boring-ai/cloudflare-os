import type { UserAiModelRecord } from './user.js';

/** Reuse an existing OpenAI connection entirely server-side, without overwriting older models. */
export function createOpenAi61Record(
  records: UserAiModelRecord[], preferred: string | null, sourceModelId?: string,
): UserAiModelRecord {
  const id = 'gpt-6.1-sol';
  const existing = records.find((entry) => entry.profile.id === id);
  if (existing) {
    if (existing.config.provider !== 'openai' || existing.config.model !== id) {
      throw new Error('The GPT-6.1 model ID is already used by a different configuration.');
    }
    return existing;
  }
  const candidates = records.filter((entry) => entry.config.provider === 'openai' && entry.config.apiToken);
  const source = sourceModelId
    ? candidates.find((entry) => entry.profile.id === sourceModelId)
    : candidates.find((entry) => entry.profile.id === preferred) ?? (candidates.length === 1 ? candidates[0] : undefined);
  if (!source) {
    throw new Error(candidates.length > 1
      ? 'Choose the existing OpenAI model whose connection should be used.'
      : 'Add an OpenAI connection before selecting GPT-6.1.');
  }
  return {
    profile: { type: 'agent', id, name: 'GPT 6.1 Sol' },
    config: { ...source.config, model: id },
  };
}
