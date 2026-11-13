import { useId } from 'react';
import { BRAND } from '~/lib/brand';
import { classNames } from '~/utils/classNames';

interface BrandProps {
  className?: string;
}

/**
 * The product mark: a firework burst on a rounded gradient tile. Decorative,
 * so it is hidden from assistive technology; pair it with the product name.
 */
export function BrandMark({ className }: BrandProps) {
  // Several marks can be on one page, and a gradient is referenced by document-wide id.
  const gradientId = `brand-mark-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width="24"
      height="24"
      className={classNames('shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7C4DFF" />
          <stop offset="0.5" stopColor="#E0409A" />
          <stop offset="1" stopColor="#FF8A2B" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7.5" fill={`url(#${gradientId})`} />
      <g stroke="#fff" strokeWidth="2.3" strokeLinecap="round" fill="none">
        <path d="M16 11L16 5.4" />
        <path d="M19.54 12.46L21.44 10.56" />
        <path d="M21 16L26.6 16" />
        <path d="M19.54 19.54L21.44 21.44" />
        <path d="M16 21L16 26.6" />
        <path d="M12.46 19.54L10.56 21.44" />
        <path d="M11 16L5.4 16" />
        <path d="M12.46 12.46L10.56 10.56" />
      </g>
      <g fill="#fff">
        <circle cx="23.5" cy="8.5" r="1.25" />
        <circle cx="23.5" cy="23.5" r="1.25" />
        <circle cx="8.5" cy="23.5" r="1.25" />
        <circle cx="8.5" cy="8.5" r="1.25" />
        <circle cx="16" cy="16" r="1.9" />
      </g>
    </svg>
  );
}

/** Mark plus product name, set in the page font. */
export function BrandLogo({ className }: BrandProps) {
  return (
    <span className={classNames('inline-flex items-center gap-2 text-bolt-elements-textPrimary', className)}>
      <BrandMark />
      <span className="text-lg font-semibold leading-none tracking-tight">{BRAND.name}</span>
    </span>
  );
}
