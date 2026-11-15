import { Badge } from '~/components/ui/Badge';
import type { GtmConnector, GtmConnectorAccess } from '~/lib/gtm/connectors';

/* Pieces shared by the connector catalog's key and sign-in sections. */

const ACCESS_BADGES: Record<GtmConnectorAccess, { label: string; variant: 'success' | 'warning' }> = {
  'read-only': { label: 'Read-only', variant: 'success' },
  'read-write': { label: 'May read and write', variant: 'warning' },
};

export const INPUT_CLASS =
  'mt-1.5 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-borderColorActive focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive';

export const SECONDARY_BUTTON_CLASS =
  'rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-1.5 text-sm font-medium text-bolt-elements-textPrimary transition-colors hover:border-bolt-elements-borderColorActive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive disabled:cursor-not-allowed disabled:opacity-50';

export const PRIMARY_BUTTON_CLASS =
  'rounded-md bg-bolt-elements-item-backgroundAccent px-3 py-1.5 text-sm font-medium text-bolt-elements-item-contentAccent transition-colors hover:bg-bolt-elements-item-backgroundActive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive disabled:cursor-not-allowed disabled:opacity-50';

export function AccessBadge({ access }: { access: GtmConnectorAccess }) {
  const badge = ACCESS_BADGES[access];

  return (
    <Badge variant={badge.variant} size="sm">
      {badge.label}
    </Badge>
  );
}

export function DocsLink({ connector }: { connector: GtmConnector }) {
  return (
    <a
      href={connector.docsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-bolt-elements-messages-linkColor hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive"
    >
      {connector.vendor} documentation
      <span className="i-ph:arrow-square-out h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
