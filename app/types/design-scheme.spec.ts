import { describe, expect, it } from 'vitest';
import {
  defaultDesignScheme,
  designFeatures,
  designFonts,
  designSchemePresets,
  findDesignSchemePreset,
  paletteRoles,
} from './design-scheme';

const ROLE_KEYS = paletteRoles.map((role) => role.key);

/** WCAG 2.x relative luminance of a `#rrggbb` colour. */
function luminance(hex: string) {
  const [red, green, blue] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;

    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);

  return (lighter + 0.05) / (darker + 0.05);
}

describe('defaultDesignScheme', () => {
  it('is a light data-app scheme with borders and soft shadows', () => {
    expect(luminance(defaultDesignScheme.palette.background)).toBeGreaterThan(0.9);
    expect(luminance(defaultDesignScheme.palette.surface)).toBeGreaterThan(0.9);
    expect(luminance(defaultDesignScheme.palette.text)).toBeLessThan(0.05);
    expect(defaultDesignScheme.palette.primary).toBe('#2563EB');
    expect(defaultDesignScheme.features).toEqual(['rounded', 'border', 'shadow']);
    expect(defaultDesignScheme.font).toEqual(['sans-serif']);
  });
});

describe('designSchemePresets', () => {
  it('offers four or five presets with unique ids and labels', () => {
    expect(designSchemePresets.length).toBeGreaterThanOrEqual(4);
    expect(designSchemePresets.length).toBeLessThanOrEqual(5);
    expect(new Set(designSchemePresets.map((preset) => preset.id)).size).toBe(designSchemePresets.length);
    expect(new Set(designSchemePresets.map((preset) => preset.label)).size).toBe(designSchemePresets.length);
  });

  it('lists the default scheme first and includes a dark scheme', () => {
    expect(designSchemePresets[0].scheme).toEqual(defaultDesignScheme);

    const darkPresets = designSchemePresets.filter(
      ({ scheme }) => luminance(scheme.palette.background) < 0.05 && luminance(scheme.palette.text) > 0.8,
    );

    expect(darkPresets).toHaveLength(1);
  });

  it.each(designSchemePresets)('$id is a complete scheme', ({ id, label, description, scheme }) => {
    expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(label.trim()).toBe(label);
    expect(label.length).toBeGreaterThan(0);
    expect(description.length).toBeGreaterThan(20);

    // Every role is present, and nothing the colour editor cannot show.
    expect(Object.keys(scheme.palette).sort()).toEqual([...ROLE_KEYS].sort());

    // `<input type="color">` only accepts six-digit hex values.
    for (const key of ROLE_KEYS) {
      expect(scheme.palette[key], key).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }

    const featureKeys = designFeatures.map((feature) => feature.key);
    const fontKeys = designFonts.map((font) => font.key);

    expect(scheme.features.length).toBeGreaterThan(0);
    expect(scheme.features.every((feature) => featureKeys.includes(feature))).toBe(true);
    expect(new Set(scheme.features).size).toBe(scheme.features.length);
    expect(scheme.font.length).toBeGreaterThan(0);
    expect(scheme.font.every((font) => fontKeys.includes(font))).toBe(true);
  });

  it.each(designSchemePresets)('$id keeps text readable and controls visible', ({ scheme }) => {
    const { palette } = scheme;

    for (const backdrop of [palette.background, palette.surface]) {
      // WCAG AA for body text.
      expect(contrastRatio(palette.text, backdrop)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette.textSecondary, backdrop)).toBeGreaterThanOrEqual(4.5);

      // WCAG 1.4.11 for interactive elements and status indicators.
      for (const key of ['primary', 'success', 'warning', 'error']) {
        expect(contrastRatio(palette[key], backdrop), key).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('findDesignSchemePreset', () => {
  it.each(designSchemePresets)('recognises $id from its own scheme', (preset) => {
    expect(findDesignSchemePreset(preset.scheme)?.id).toBe(preset.id);
  });

  it('ignores hex case and the order of features', () => {
    const [preset] = designSchemePresets;

    const palette = Object.fromEntries(
      Object.entries(preset.scheme.palette).map(([key, value]) => [key, value.toLowerCase()]),
    );

    expect(
      findDesignSchemePreset({ palette, features: [...preset.scheme.features].reverse(), font: preset.scheme.font })
        ?.id,
    ).toBe(preset.id);
  });

  it('returns nothing once a colour, feature or font differs', () => {
    const { palette, features, font } = defaultDesignScheme;

    expect(findDesignSchemePreset({ palette: { ...palette, primary: '#000000' }, features, font })).toBeUndefined();
    expect(findDesignSchemePreset({ palette, features: [...features, 'gradient'], font })).toBeUndefined();
    expect(findDesignSchemePreset({ palette, features: features.slice(1), font })).toBeUndefined();
    expect(findDesignSchemePreset({ palette, features, font: ['serif'] })).toBeUndefined();
  });

  it('does not throw on a palette with missing roles', () => {
    expect(findDesignSchemePreset({ palette: {}, features: [], font: [] })).toBeUndefined();
  });
});
