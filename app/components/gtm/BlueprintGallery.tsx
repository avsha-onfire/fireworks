import { useState } from 'react';
import { GTM_BLUEPRINT_CATEGORIES, getBlueprintsForRole } from '~/lib/gtm/blueprints';
import type { GtmBlueprint, GtmBlueprintCategoryId, GtmRoleId } from '~/lib/gtm/types';
import { classNames } from '~/utils/classNames';

/** Cards shown until the visitor asks for the whole catalog. */
export const BLUEPRINT_PREVIEW_COUNT = 6;

export type BlueprintFilter = GtmBlueprintCategoryId | 'all';

export interface BlueprintGalleryProps {
  /** Called with the chosen blueprint; the caller prefills the composer. */
  onSelect?: (blueprint: GtmBlueprint) => void;

  /** Orders the gallery for this role. */
  role?: GtmRoleId | '';

  /** The blueprints to show, in order. Defaults to the catalog ordered for `role`. */
  blueprints?: GtmBlueprint[];
}

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bolt-elements-borderColorActive';

/** The cards to show for a category filter, and whether more of them are hidden behind the toggle. */
export function selectBlueprintCards(blueprints: GtmBlueprint[], filter: BlueprintFilter, expanded: boolean) {
  const matching = filter === 'all' ? blueprints : blueprints.filter((blueprint) => blueprint.category === filter);

  return {
    cards: expanded ? matching : matching.slice(0, BLUEPRINT_PREVIEW_COUNT),
    canExpand: matching.length > BLUEPRINT_PREVIEW_COUNT,
  };
}

interface FilterChipProps {
  label: string;
  icon?: string;
  pressed: boolean;
  onPress: () => void;
}

function FilterChip({ label, icon, pressed, onPress }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={classNames(
        'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-theme',
        FOCUS_RING,
        pressed
          ? 'border-bolt-elements-borderColorActive bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
          : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary',
      )}
    >
      {icon && <span className={classNames(icon, 'text-sm')} aria-hidden="true" />}
      {label}
    </button>
  );
}

/** Home-screen gallery of GTM app blueprints. Choosing a card hands the blueprint to `onSelect`. */
export function BlueprintGallery({ onSelect, role = '', blueprints }: BlueprintGalleryProps) {
  const [filter, setFilter] = useState<BlueprintFilter>('all');
  const [expanded, setExpanded] = useState(false);

  const catalog = blueprints ?? getBlueprintsForRole(role);

  if (catalog.length === 0) {
    return null;
  }

  const categories = GTM_BLUEPRINT_CATEGORIES.filter((category) =>
    catalog.some((blueprint) => blueprint.category === category.id),
  );

  // The catalog can change under a chosen filter (the role loads after mount); never leave the grid empty.
  const activeFilter = categories.some((category) => category.id === filter) ? filter : 'all';
  const { cards, canExpand } = selectBlueprintCards(catalog, activeFilter, expanded);

  return (
    <section id="blueprints" aria-labelledby="blueprints-heading" className="w-full max-w-4xl mx-auto">
      <div className="text-center">
        <h2 id="blueprints-heading" className="text-lg font-semibold text-bolt-elements-textPrimary">
          Start from a blueprint
        </h2>
        <p className="mt-1 text-sm text-bolt-elements-textSecondary">
          Pick one to prefill the message box. Edit anything, attach your CSV export, then send.
        </p>
      </div>
      <div role="group" aria-label="Filter blueprints by category" className="mt-4 flex flex-wrap justify-center gap-2">
        <FilterChip label="All" pressed={activeFilter === 'all'} onPress={() => setFilter('all')} />
        {categories.map((category) => (
          <FilterChip
            key={category.id}
            label={category.label}
            icon={category.icon}
            pressed={activeFilter === category.id}
            onPress={() => setFilter(category.id)}
          />
        ))}
      </div>
      <ul id="blueprint-cards" className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((blueprint) => (
          <li key={blueprint.id} className="flex">
            <button
              type="button"
              data-blueprint-id={blueprint.id}
              onClick={() => onSelect?.(blueprint)}
              className={classNames(
                'flex w-full flex-col gap-2 rounded-lg border p-4 text-left transition-theme',
                'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
                'hover:border-bolt-elements-borderColorActive hover:bg-bolt-elements-background-depth-3',
                FOCUS_RING,
              )}
            >
              <span className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent"
                  aria-hidden="true"
                >
                  <span className={classNames(blueprint.icon, 'text-xl')} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs text-bolt-elements-textTertiary">
                    {categories.find((category) => category.id === blueprint.category)?.label}
                  </span>
                  <span className="text-sm font-semibold text-bolt-elements-textPrimary">{blueprint.title}</span>
                </span>
              </span>
              <span className="text-sm text-bolt-elements-textSecondary">{blueprint.summary}</span>
              <span className="mt-auto pt-1 text-xs text-bolt-elements-textTertiary">
                Works with: {blueprint.dataInputs}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {canExpand && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="blueprint-cards"
            onClick={() => setExpanded(!expanded)}
            className={classNames(
              'flex items-center gap-1.5 rounded-md bg-transparent px-3 py-1.5 text-sm transition-theme',
              'text-bolt-elements-textSecondary hover:bg-bolt-elements-item-backgroundActive hover:text-bolt-elements-textPrimary',
              FOCUS_RING,
            )}
          >
            {expanded ? 'Show fewer blueprints' : 'Show all blueprints'}
            <span className={expanded ? 'i-ph:caret-up' : 'i-ph:caret-down'} aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
