import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import type { GtmWorkspaceContext } from '~/lib/gtm/types';
import { DEFAULT_GTM_WORKSPACE } from '~/lib/gtm/workspace';
import { gtmWorkspaceStore } from '~/lib/stores/gtmWorkspace';

/**
 * The GTM workspace for rendering.
 *
 * The store is filled from localStorage as soon as its module loads in the
 * browser, while the server only ever has the defaults. Reading the store
 * directly in a component that is server-rendered (everything on the landing
 * page is) would therefore hydrate with different markup. This hook returns
 * the defaults for the server render and the first client render, and the
 * saved workspace after mount.
 */
export function useGtmWorkspace(): GtmWorkspaceContext {
  const workspace = useStore(gtmWorkspaceStore);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted ? workspace : DEFAULT_GTM_WORKSPACE;
}
