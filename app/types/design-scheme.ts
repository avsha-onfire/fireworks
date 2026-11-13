export interface DesignScheme {
  palette: { [key: string]: string }; // Changed from string[] to object
  features: string[];
  font: string[];
}

export const defaultDesignScheme: DesignScheme = {
  palette: {
    primary: '#2563EB',
    secondary: '#0EA5E9',
    accent: '#7C3AED',
    background: '#F8FAFC',
    surface: '#FFFFFF',
    text: '#0F172A',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    success: '#16A34A',
    warning: '#D97706',
    error: '#DC2626',
  },
  features: ['rounded', 'border', 'shadow'],
  font: ['sans-serif'],
};

export const paletteRoles = [
  {
    key: 'primary',
    label: 'Primary',
    description: 'Main brand color - use for primary buttons, active links, and key interactive elements',
  },
  {
    key: 'secondary',
    label: 'Secondary',
    description: 'Supporting brand color - use for secondary buttons, inactive states, and complementary elements',
  },
  {
    key: 'accent',
    label: 'Accent',
    description: 'Highlight color - use for badges, notifications, focus states, and call-to-action elements',
  },
  {
    key: 'background',
    label: 'Background',
    description: 'Page backdrop - use for the main application/website background behind all content',
  },
  {
    key: 'surface',
    label: 'Surface',
    description: 'Elevated content areas - use for cards, modals, dropdowns, and panels that sit above the background',
  },
  { key: 'text', label: 'Text', description: 'Primary text - use for headings, body text, and main readable content' },
  {
    key: 'textSecondary',
    label: 'Text Secondary',
    description: 'Muted text - use for captions, placeholders, timestamps, and less important information',
  },
  {
    key: 'border',
    label: 'Border',
    description: 'Separators - use for input borders, dividers, table lines, and element outlines',
  },
  {
    key: 'success',
    label: 'Success',
    description: 'Positive feedback - use for success messages, completed states, and positive indicators',
  },
  {
    key: 'warning',
    label: 'Warning',
    description: 'Caution alerts - use for warning messages, pending states, and attention-needed indicators',
  },
  {
    key: 'error',
    label: 'Error',
    description: 'Error states - use for error messages, failed states, and destructive action indicators',
  },
];

export const designFeatures = [
  { key: 'rounded', label: 'Rounded Corners' },
  { key: 'border', label: 'Subtle Border' },
  { key: 'gradient', label: 'Gradient Accent' },
  { key: 'shadow', label: 'Soft Shadow' },
  { key: 'frosted-glass', label: 'Frosted Glass' },
];

export const designFonts = [
  { key: 'sans-serif', label: 'Sans Serif', preview: 'Aa' },
  { key: 'serif', label: 'Serif', preview: 'Aa' },
  { key: 'monospace', label: 'Monospace', preview: 'Aa' },
  { key: 'cursive', label: 'Cursive', preview: 'Aa' },
  { key: 'fantasy', label: 'Fantasy', preview: 'Aa' },
];

export interface DesignSchemePreset {
  id: string;
  label: string;
  description: string;
  scheme: DesignScheme;
}

export const designSchemePresets: DesignSchemePreset[] = [
  {
    id: 'data-app-light',
    label: 'Clean light',
    description: 'Light, neutral palette for dashboards, trackers and other internal data apps.',
    scheme: defaultDesignScheme,
  },
  {
    id: 'data-app-dark',
    label: 'Slate dark',
    description: 'Dark counterpart of the default, for wallboards and teams that work in dark mode.',
    scheme: {
      palette: {
        primary: '#60A5FA',
        secondary: '#38BDF8',
        accent: '#A78BFA',
        background: '#0F172A',
        surface: '#1E293B',
        text: '#F8FAFC',
        textSecondary: '#94A3B8',
        border: '#334155',
        success: '#4ADE80',
        warning: '#FBBF24',
        error: '#F87171',
      },
      features: ['rounded', 'border'],
      font: ['sans-serif'],
    },
  },
  {
    id: 'high-contrast',
    label: 'High contrast',
    description: 'Black text, strong borders and deeper status colours for projectors and maximum legibility.',
    scheme: {
      palette: {
        primary: '#1D4ED8',
        secondary: '#0F766E',
        accent: '#6D28D9',
        background: '#FFFFFF',
        surface: '#F4F4F5',
        text: '#000000',
        textSecondary: '#3F3F46',
        border: '#71717A',
        success: '#166534',
        warning: '#92400E',
        error: '#B91C1C',
      },
      features: ['rounded', 'border'],
      font: ['sans-serif'],
    },
  },
  {
    id: 'buyer-facing',
    label: 'Buyer-facing',
    description: 'Brighter indigo palette with gradient accents for landing pages and tools shared with buyers.',
    scheme: {
      palette: {
        primary: '#4F46E5',
        secondary: '#DB2777',
        accent: '#EA580C',
        background: '#FFFFFF',
        surface: '#F5F3FF',
        text: '#1E1B4B',
        textSecondary: '#55517A',
        border: '#DDD6FE',
        success: '#15803D',
        warning: '#B45309',
        error: '#DC2626',
      },
      features: ['rounded', 'gradient', 'shadow'],
      font: ['sans-serif'],
    },
  },
];

function hasSameMembers(a: string[], b: string[]) {
  return a.length === b.length && b.every((item) => a.includes(item));
}

/**
 * Returns the preset a scheme is identical to, if any. Colours are compared
 * case-insensitively because the native colour input reports lower-case hex.
 */
export function findDesignSchemePreset(scheme: DesignScheme): DesignSchemePreset | undefined {
  return designSchemePresets.find(
    (preset) =>
      paletteRoles.every(
        ({ key }) => scheme.palette[key]?.toLowerCase() === preset.scheme.palette[key]?.toLowerCase(),
      ) &&
      hasSameMembers(scheme.features, preset.scheme.features) &&
      hasSameMembers(scheme.font, preset.scheme.font),
  );
}
