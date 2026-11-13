export interface FoldModelSettingsInput {
  chatStarted: boolean;

  /** The provider the chat will use. */
  providerName: string | undefined;

  /** API keys saved in this browser, by provider name. */
  apiKeys: Record<string, string | undefined>;
}

/**
 * Whether the landing page may fold the model picker and API-key field away.
 * Only before the chat starts, and only when the selected provider already has
 * a key saved in this browser: a key for another provider does not help, and
 * hiding the key field then would leave the first message to fail on auth.
 */
export function shouldFoldModelSettings({ chatStarted, providerName, apiKeys }: FoldModelSettingsInput): boolean {
  if (chatStarted || !providerName) {
    return false;
  }

  const key = apiKeys[providerName];

  return typeof key === 'string' && key.trim() !== '';
}
