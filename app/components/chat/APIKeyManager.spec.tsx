import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { APIKeyManager } from './APIKeyManager';
import { BRAND, providerDisplayName } from '~/lib/brand';

function render(providerName: string) {
  return renderToStaticMarkup(
    createElement(APIKeyManager, {
      provider: { name: providerName, staticModels: [] },
      apiKey: '',
      setApiKey: () => undefined,
    }),
  );
}

describe('APIKeyManager', () => {
  it('labels the key of the model provider that shares the product name as a model provider', () => {
    const markup = render(BRAND.name);

    expect(markup).toContain(`>${providerDisplayName(BRAND.name)} API Key:</span>`);
    expect(markup).not.toContain(`>${BRAND.name} API Key:</span>`);
  });

  it('labels other providers by their name', () => {
    expect(render('OpenRouter')).toContain('>OpenRouter API Key:</span>');
  });
});
