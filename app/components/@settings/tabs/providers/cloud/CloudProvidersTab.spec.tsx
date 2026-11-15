import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CloudProvidersTab from './CloudProvidersTab';
import { BRAND, providerDisplayName } from '~/lib/brand';

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  logProvider: vi.fn(),
  updateProviderSettings: vi.fn(),
  switches: [] as Array<{ onCheckedChange?: (checked: boolean) => void }>,
  providers: {
    Fireworks: { settings: { enabled: false }, staticModels: [] },
    OpenAI: { settings: { enabled: true }, staticModels: [] },
  },
}));

/*
 * Server rendering never runs effects, and the tab builds its provider list in
 * one. Run effects during render instead (once per dependency change, like
 * useMemo) so the provider cards appear in the static markup.
 */
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();

  const useEffect = (effect: () => void, deps: readonly unknown[]) => {
    actual.useMemo(() => effect(), deps);
  };

  return { ...actual, default: { ...actual, useEffect }, useEffect };
});

vi.mock('react-toastify', () => ({ toast: { success: mocks.toastSuccess } }));
vi.mock('~/lib/hooks/useSettings', () => ({
  useSettings: () => ({ providers: mocks.providers, updateProviderSettings: mocks.updateProviderSettings }),
}));
vi.mock('~/lib/stores/logs', () => ({ logStore: { logProvider: mocks.logProvider } }));
vi.mock('~/lib/stores/settings', () => ({ URL_CONFIGURABLE_PROVIDERS: ['Ollama', 'LMStudio', 'OpenAILike'] }));
vi.mock('~/utils/constants', () => ({ providerBaseUrlEnvKeys: {} }));
vi.mock('~/components/ui/Switch', () => ({
  Switch: (props: { onCheckedChange?: (checked: boolean) => void }) => {
    mocks.switches.push(props);
    return null;
  },
}));

function render() {
  mocks.switches.length = 0;
  return renderToStaticMarkup(createElement(CloudProvidersTab));
}

describe('CloudProvidersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('titles the model provider that shares the product name as a model provider', () => {
    const markup = render();
    const label = providerDisplayName(BRAND.name);

    expect(label).not.toBe(BRAND.name);
    expect(markup).toContain(`>${label}</h4>`);
    expect(markup).toContain(`aria-label="${label} logo"`);
    expect(markup).not.toContain(`>${BRAND.name}</h4>`);
    expect(markup).toContain('>OpenAI</h4>');
  });

  it('uses the display name in toasts and the provider id in settings and logs', () => {
    render();

    // The first switch enables all cloud providers; the cards follow in name order.
    const fireworksSwitch = mocks.switches[1];

    fireworksSwitch.onCheckedChange?.(true);
    expect(mocks.toastSuccess).toHaveBeenCalledWith(`${providerDisplayName(BRAND.name)} enabled`);
    expect(mocks.updateProviderSettings).toHaveBeenCalledWith(BRAND.name, { enabled: true });
    expect(mocks.logProvider).toHaveBeenCalledWith(`Provider ${BRAND.name} enabled`, { provider: BRAND.name });

    fireworksSwitch.onCheckedChange?.(false);
    expect(mocks.toastSuccess).toHaveBeenLastCalledWith(`${providerDisplayName(BRAND.name)} disabled`);
  });
});
