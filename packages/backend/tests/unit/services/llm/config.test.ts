import { describe, it, expect } from 'vitest';
import {
  createLlmProvider,
  describeAiConfig,
  resolveLlmConfig,
} from '../../../../src/services/llm/config.js';
import { limits } from '../../../../src/config/limits.js';

/** Only the AI keys matter; resolution never reads anything else. */
function env(overrides: Record<string, string | undefined> = {}) {
  return overrides;
}

function expectOk(result: ReturnType<typeof resolveLlmConfig>) {
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.config;
}

describe('resolveLlmConfig — provider', () => {
  it('defaults to anthropic when AI_PROVIDER is unset', () => {
    const config = expectOk(resolveLlmConfig(env({ ANTHROPIC_API_KEY: 'sk-ant' })));
    expect(config.provider).toBe('anthropic');
  });

  it('accepts a provider in any casing', () => {
    const config = expectOk(
      resolveLlmConfig(env({ AI_PROVIDER: 'OpenAI', AI_API_KEY: 'sk', AI_MODEL: 'gpt-4.1-mini' })),
    );
    expect(config.provider).toBe('openai');
  });

  it('rejects an unsupported provider rather than throwing', () => {
    const result = resolveLlmConfig(env({ AI_PROVIDER: 'gemini', AI_API_KEY: 'sk' }));
    expect(result).toEqual({ ok: false, error: expect.stringContaining('gemini') });
  });
});

describe('resolveLlmConfig — AI_CHAT_ENABLED kill-switch', () => {
  it('disables AI even with a valid key when set to "false"', () => {
    const result = resolveLlmConfig(env({ ANTHROPIC_API_KEY: 'sk-ant', AI_CHAT_ENABLED: 'false' }));
    expect(result).toEqual({ ok: false, error: expect.stringContaining('disabled') });
    expect(
      describeAiConfig(env({ ANTHROPIC_API_KEY: 'sk-ant', AI_CHAT_ENABLED: 'false' })),
    ).toEqual({ configured: false, label: null });
  });

  it('treats common off spellings as disabled (case-insensitive, trimmed)', () => {
    for (const v of ['FALSE', '0', 'off', 'no', ' false ']) {
      expect(resolveLlmConfig(env({ ANTHROPIC_API_KEY: 'sk-ant', AI_CHAT_ENABLED: v })).ok).toBe(
        false,
      );
    }
  });

  it('stays enabled when unset (default on) or a non-off value', () => {
    for (const opts of [
      {},
      { AI_CHAT_ENABLED: 'true' },
      { AI_CHAT_ENABLED: '1' },
      { AI_CHAT_ENABLED: 'yes' },
    ]) {
      expect(resolveLlmConfig(env({ ANTHROPIC_API_KEY: 'sk-ant', ...opts })).ok).toBe(true);
    }
  });
});

describe('resolveLlmConfig — key', () => {
  // Deployments predating AI_PROVIDER must keep working untouched.
  it('falls back to ANTHROPIC_API_KEY for the anthropic provider', () => {
    const config = expectOk(resolveLlmConfig(env({ ANTHROPIC_API_KEY: 'sk-ant' })));
    expect(config.apiKey).toBe('sk-ant');
  });

  it('prefers AI_API_KEY over ANTHROPIC_API_KEY', () => {
    const config = expectOk(
      resolveLlmConfig(env({ AI_API_KEY: 'sk-new', ANTHROPIC_API_KEY: 'sk-old' })),
    );
    expect(config.apiKey).toBe('sk-new');
  });

  it('does not accept ANTHROPIC_API_KEY as an openai key', () => {
    const result = resolveLlmConfig(
      env({ AI_PROVIDER: 'openai', ANTHROPIC_API_KEY: 'sk-ant', AI_MODEL: 'gpt-4.1-mini' }),
    );
    expect(result.ok).toBe(false);
  });

  it('reports missing configuration when no key is set', () => {
    const result = resolveLlmConfig(env());
    expect(result).toEqual({ ok: false, error: expect.stringContaining('not configured') });
  });
});

describe('resolveLlmConfig — model', () => {
  it('defaults the anthropic model to the house model', () => {
    const config = expectOk(resolveLlmConfig(env({ ANTHROPIC_API_KEY: 'sk-ant' })));
    expect(config.model).toBe(limits.chat.model);
  });

  it('requires AI_MODEL for openai, since the endpoint could serve anything', () => {
    const result = resolveLlmConfig(env({ AI_PROVIDER: 'openai', AI_API_KEY: 'sk' }));
    expect(result).toEqual({ ok: false, error: expect.stringContaining('AI_MODEL') });
  });

  it('lets AI_MODEL override the anthropic default', () => {
    const config = expectOk(
      resolveLlmConfig(env({ ANTHROPIC_API_KEY: 'sk-ant', AI_MODEL: 'claude-opus-4-8' })),
    );
    expect(config.model).toBe('claude-opus-4-8');
  });
});

describe('resolveLlmConfig — privacy label', () => {
  it('names the provider when no base URL is set', () => {
    expect(expectOk(resolveLlmConfig(env({ ANTHROPIC_API_KEY: 'sk' }))).label).toBe(
      'Anthropic (Claude)',
    );
    expect(
      expectOk(
        resolveLlmConfig(
          env({ AI_PROVIDER: 'openai', AI_API_KEY: 'sk', AI_MODEL: 'gpt-4.1-mini' }),
        ),
      ).label,
    ).toBe('OpenAI');
  });

  // The panel shows this as a privacy notice, so it must name where data really
  // goes — calling an OpenRouter deployment "OpenAI" would be untrue.
  it('uses the base-URL host instead of the provider name', () => {
    const config = expectOk(
      resolveLlmConfig(
        env({
          AI_PROVIDER: 'openai',
          AI_API_KEY: 'sk',
          AI_MODEL: 'gpt-4.1-mini',
          AI_BASE_URL: 'https://openrouter.ai/api/v1',
        }),
      ),
    );
    expect(config.label).toBe('openrouter.ai');
  });

  it('falls back to the raw value when the base URL will not parse', () => {
    const config = expectOk(
      resolveLlmConfig(
        env({
          AI_PROVIDER: 'openai',
          AI_API_KEY: 'sk',
          AI_MODEL: 'm',
          AI_BASE_URL: 'not a url',
        }),
      ),
    );
    expect(config.label).toBe('not a url');
  });

  it('lets an operator override the label outright', () => {
    const config = expectOk(
      resolveLlmConfig(
        env({
          AI_PROVIDER: 'openai',
          AI_API_KEY: 'sk',
          AI_MODEL: 'm',
          AI_BASE_URL: 'https://llm.internal.example',
          AI_PROVIDER_LABEL: 'our self-hosted model (no data leaves the network)',
        }),
      ),
    );
    expect(config.label).toBe('our self-hosted model (no data leaves the network)');
  });
});

describe('describeAiConfig', () => {
  it('reports configured with a label', () => {
    expect(describeAiConfig(env({ ANTHROPIC_API_KEY: 'sk' }))).toEqual({
      configured: true,
      label: 'Anthropic (Claude)',
    });
  });

  it('reports unconfigured without leaking the reason or the key', () => {
    expect(describeAiConfig(env({ AI_PROVIDER: 'openai', AI_API_KEY: 'sk-secret' }))).toEqual({
      configured: false,
      label: null,
    });
  });
});

describe('createLlmProvider', () => {
  it('builds the adapter matching the resolved provider', () => {
    expect(
      createLlmProvider({ provider: 'anthropic', apiKey: 'k', model: 'm', label: 'l' }).id,
    ).toBe('anthropic');
    expect(createLlmProvider({ provider: 'openai', apiKey: 'k', model: 'm', label: 'l' }).id).toBe(
      'openai',
    );
  });
});
