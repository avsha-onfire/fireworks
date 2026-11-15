import { afterEach, describe, expect, it, vi } from 'vitest';
import { onSignInMessage, startVendorSignIn } from './connector-sign-in';
import { SIGN_IN_CHANNEL, SIGN_IN_MESSAGE_TYPE } from './sign-in-result';

const AUTHORIZATION_URL = 'https://mcp.hubspot.com/oauth/authorize/user?client_id=abc&state=xyz';

function stubStart(response: Response) {
  const fetchMock = vi.fn(async () => response);

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

function stubWindow(popup: { closed: boolean; opener: unknown; location: { href: string }; close: () => void } | null) {
  const assign = vi.fn();
  const open = vi.fn(() => popup);

  vi.stubGlobal('window', { open, location: { assign } });

  return { open, assign };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('startVendorSignIn', () => {
  it('opens the pop-up first, then points it at the vendor without a handle on this window', async () => {
    const popup = { closed: false, opener: {} as unknown, location: { href: '' }, close: vi.fn() };
    const { open, assign } = stubWindow(popup);
    const fetchMock = stubStart(Response.json({ authorizationUrl: AUTHORIZATION_URL }));

    expect(await startVendorSignIn('gtm-salesforce', 'sandbox')).toBe('popup');
    expect(open).toHaveBeenCalledBefore(fetchMock);
    expect(fetchMock).toHaveBeenCalledWith('/api/mcp-oauth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectorId: 'gtm-salesforce', variant: 'sandbox' }),
    });
    expect(popup.opener).toBeNull();
    expect(popup.location.href).toBe(AUTHORIZATION_URL);
    expect(assign).not.toHaveBeenCalled();
  });

  it('sends this tab to the vendor when pop-ups are blocked', async () => {
    const { assign } = stubWindow(null);

    stubStart(Response.json({ authorizationUrl: AUTHORIZATION_URL }));

    expect(await startVendorSignIn('gtm-hubspot', 'default')).toBe('redirect');
    expect(assign).toHaveBeenCalledWith(AUTHORIZATION_URL);
  });

  it("closes the pop-up and shows the server's message when sign-in cannot start", async () => {
    const popup = { closed: false, opener: null, location: { href: '' }, close: vi.fn() };

    stubWindow(popup);
    stubStart(Response.json({ error: 'HubSpot sign-in is not set up on this server.' }, { status: 409 }));

    await expect(startVendorSignIn('gtm-hubspot', 'default')).rejects.toThrow(
      'HubSpot sign-in is not set up on this server.',
    );
    expect(popup.close).toHaveBeenCalled();
    expect(popup.location.href).toBe('');
  });

  it('refuses an authorization URL that is not HTTPS', async () => {
    const popup = { closed: false, opener: null, location: { href: '' }, close: vi.fn() };

    stubWindow(popup);
    stubStart(Response.json({ authorizationUrl: 'javascript:alert(1)' }));

    await expect(startVendorSignIn('gtm-hubspot', 'default')).rejects.toThrow('Sign-in could not start.');
    expect(popup.location.href).toBe('');
  });
});

describe('onSignInMessage', () => {
  it('passes on results from the callback page and ignores anything else on the channel', async () => {
    const listener = vi.fn();
    const unsubscribe = onSignInMessage(listener);
    const sender = new BroadcastChannel(SIGN_IN_CHANNEL);

    sender.postMessage({ type: 'something-else', connectorId: 'gtm-hubspot', result: 'connected' });
    sender.postMessage({ type: SIGN_IN_MESSAGE_TYPE, connectorId: 'gtm-hubspot', result: 'stolen' });
    sender.postMessage({ type: SIGN_IN_MESSAGE_TYPE, connectorId: 'gtm-hubspot', result: 'connected' });

    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));

    expect(listener).toHaveBeenCalledWith({
      type: SIGN_IN_MESSAGE_TYPE,
      connectorId: 'gtm-hubspot',
      result: 'connected',
    });

    sender.close();
    unsubscribe();
  });
});
