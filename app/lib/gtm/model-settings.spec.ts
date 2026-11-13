import { describe, expect, it } from 'vitest';
import { shouldFoldModelSettings } from './model-settings';

describe('shouldFoldModelSettings', () => {
  it('folds on the landing page when the selected provider has a saved key', () => {
    expect(
      shouldFoldModelSettings({ chatStarted: false, providerName: 'Anthropic', apiKeys: { Anthropic: 'sk-ant-1' } }),
    ).toBe(true);
  });

  it('keeps the key field visible when only another provider has a key', () => {
    expect(
      shouldFoldModelSettings({ chatStarted: false, providerName: 'OpenRouter', apiKeys: { Anthropic: 'sk-ant-1' } }),
    ).toBe(false);
  });

  it('keeps it visible for an empty or blank key', () => {
    expect(shouldFoldModelSettings({ chatStarted: false, providerName: 'OpenAI', apiKeys: { OpenAI: '' } })).toBe(
      false,
    );
    expect(shouldFoldModelSettings({ chatStarted: false, providerName: 'OpenAI', apiKeys: { OpenAI: '  ' } })).toBe(
      false,
    );
  });

  it('keeps it visible without keys or without a selected provider', () => {
    expect(shouldFoldModelSettings({ chatStarted: false, providerName: 'OpenAI', apiKeys: {} })).toBe(false);
    expect(shouldFoldModelSettings({ chatStarted: false, providerName: undefined, apiKeys: { OpenAI: 'sk-1' } })).toBe(
      false,
    );
  });

  it('never folds once the chat has started', () => {
    expect(shouldFoldModelSettings({ chatStarted: true, providerName: 'OpenAI', apiKeys: { OpenAI: 'sk-1' } })).toBe(
      false,
    );
  });
});
