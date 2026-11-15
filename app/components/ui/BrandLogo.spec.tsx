import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BrandLogo, BrandMark } from './BrandLogo';
import { BRAND } from '~/lib/brand';

function gradientIds(markup: string): string[] {
  return [...markup.matchAll(/<linearGradient id="([^"]+)"/g)].map((match) => match[1]);
}

describe('BrandMark', () => {
  it('is decorative and keeps a default size that a class can override', () => {
    const markup = renderToStaticMarkup(createElement(BrandMark, { className: 'h-8 w-8' }));

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('width="24"');
    expect(markup).toContain('height="24"');
    expect(markup).toContain('class="shrink-0 h-8 w-8"');
  });

  it('fills the tile with its own gradient', () => {
    const markup = renderToStaticMarkup(createElement(BrandMark));
    const [id] = gradientIds(markup);

    expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
    expect(markup).toContain(`fill="url(#${id})"`);
  });

  it('gives every mark on a page a different gradient id', () => {
    const markup = renderToStaticMarkup(
      createElement(Fragment, null, createElement(BrandMark), createElement(BrandMark), createElement(BrandLogo)),
    );

    const ids = gradientIds(markup);

    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('BrandLogo', () => {
  it('shows the mark next to the product name in the primary text colour', () => {
    const markup = renderToStaticMarkup(createElement(BrandLogo, { className: 'ml-1' }));

    expect(markup).toContain('<svg');
    expect(markup).toContain(`>${BRAND.name}</span>`);
    expect(markup).toContain('text-bolt-elements-textPrimary');
    expect(markup).toContain('ml-1');
  });
});
