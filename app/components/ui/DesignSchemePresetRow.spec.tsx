import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DesignSchemePresetRow } from './DesignSchemePresetRow';
import { defaultDesignScheme, designSchemePresets, type DesignScheme } from '~/types/design-scheme';

function render(scheme: DesignScheme) {
  return renderToStaticMarkup(createElement(DesignSchemePresetRow, { scheme, onSelect: () => undefined }));
}

describe('DesignSchemePresetRow', () => {
  it('renders one labelled button per preset with its description as the tooltip', () => {
    const markup = render(defaultDesignScheme);

    expect(markup.match(/<button /g)).toHaveLength(designSchemePresets.length);
    expect(markup.match(/type="button"/g)).toHaveLength(designSchemePresets.length);
    expect(markup).toContain('role="group"');
    expect(markup).toContain('Start from a preset');

    for (const preset of designSchemePresets) {
      expect(markup).toContain(`title="${preset.description}"`);
      expect(markup).toContain(`${preset.label}</button>`);
    }
  });

  it('marks only the preset that matches the edited scheme as pressed', () => {
    const [, darkPreset] = designSchemePresets;
    const markup = render(darkPreset.scheme);

    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(markup).toMatch(new RegExp(`title="${darkPreset.description}" aria-pressed="true"`));
  });

  it('marks no preset as pressed for a customised scheme', () => {
    const markup = render({
      ...defaultDesignScheme,
      palette: { ...defaultDesignScheme.palette, primary: '#123456' },
    });

    expect(markup).not.toContain('aria-pressed="true"');
    expect(markup.match(/aria-pressed="false"/g)).toHaveLength(designSchemePresets.length);
  });

  it('never reuses the title that opens the design dialog', () => {
    expect(render(defaultDesignScheme)).not.toContain('title="Design Palette"');
  });
});
