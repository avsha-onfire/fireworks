import { designSchemePresets, findDesignSchemePreset, type DesignScheme } from '~/types/design-scheme';
import { classNames } from '~/utils/classNames';

const SWATCH_ROLES = ['background', 'primary', 'accent'];

interface DesignSchemePresetRowProps {
  /** The scheme currently being edited; the preset it matches is shown as pressed. */
  scheme: DesignScheme;
  onSelect: (scheme: DesignScheme) => void;
}

export function DesignSchemePresetRow({ scheme, onSelect }: DesignSchemePresetRowProps) {
  const activePresetId = findDesignSchemePreset(scheme)?.id;

  return (
    <div role="group" aria-labelledby="design-scheme-presets-label" className="mb-4 space-y-2">
      <div id="design-scheme-presets-label" className="text-sm font-medium text-bolt-elements-textSecondary">
        Start from a preset
      </div>
      {/* The padding keeps the focus ring from being clipped by the dialog's scroll container. */}
      <div className="flex flex-wrap gap-2 p-0.5">
        {designSchemePresets.map((preset) => {
          const isActive = preset.id === activePresetId;

          return (
            <button
              key={preset.id}
              type="button"
              title={preset.description}
              aria-pressed={isActive}
              onClick={() => onSelect(preset.scheme)}
              className={classNames(
                'flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive',
                isActive
                  ? 'bg-bolt-elements-item-backgroundAccent border-bolt-elements-borderColorActive text-bolt-elements-item-contentAccent'
                  : 'bg-bolt-elements-bg-depth-3 border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:border-bolt-elements-borderColorActive hover:text-bolt-elements-textPrimary',
              )}
            >
              <span aria-hidden="true" className="flex gap-0.5">
                {SWATCH_ROLES.map((role) => (
                  <span
                    key={role}
                    className="w-3 h-3 rounded-full border border-bolt-elements-borderColor"
                    style={{ backgroundColor: preset.scheme.palette[role] }}
                  />
                ))}
              </span>
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
