import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GtmWorkspaceForm, type GtmWorkspaceFormProps } from './GtmWorkspaceForm';
import type { GtmWorkspaceContext } from '~/lib/gtm/types';
import { DEFAULT_GTM_WORKSPACE, GTM_CONTEXT_LIMITS, GTM_CRMS, GTM_ROLES, getGtmCrm } from '~/lib/gtm/workspace';

function render(props: Partial<GtmWorkspaceFormProps> = {}) {
  return renderToStaticMarkup(
    createElement(GtmWorkspaceForm, {
      value: DEFAULT_GTM_WORKSPACE,
      onChange: () => undefined,
      variant: 'full',
      ...props,
    }),
  );
}

function withValue(updates: Partial<GtmWorkspaceContext>): GtmWorkspaceContext {
  return { ...DEFAULT_GTM_WORKSPACE, ...updates };
}

interface Control {
  tag: string;
  id: string;
  html: string;
}

/** Every form control in document order, with its opening tag. */
function controls(markup: string): Control[] {
  return [...markup.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((match) => ({
    tag: match[1],
    id: /\bid="([^"]+)"/.exec(match[0])?.[1] ?? '',
    html: match[0],
  }));
}

function control(markup: string, name: string): Control {
  const found = controls(markup).find((item) => item.id.endsWith(`-${name}`));

  if (!found) {
    throw new Error(`No control named ${name}`);
  }

  return found;
}

function count(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

describe('GtmWorkspaceForm', () => {
  it('offers the six roles as toggle buttons with none selected by default', () => {
    const markup = render();

    expect(GTM_ROLES).toHaveLength(6);
    expect(count(markup, '<button type="button" aria-pressed="false"')).toBe(6);
    expect(markup).not.toContain('aria-pressed="true"');

    for (const role of GTM_ROLES) {
      expect(markup).toContain(`>${role.label}</span>`);
      expect(markup).toContain(`>${role.description}</span>`);
    }
  });

  it('marks only the selected role as pressed', () => {
    const markup = render({ value: withValue({ role: 'revops' }) });

    expect(count(markup, 'aria-pressed="true"')).toBe(1);
    expect(count(markup, 'aria-pressed="false"')).toBe(5);
    expect(markup).toMatch(/aria-pressed="true"[^>]*>.*?>RevOps<\/span>/s);
  });

  it('names the role group and gives every control a label', () => {
    for (const variant of ['compact', 'full'] as const) {
      const markup = render({ variant });
      const group = /role="group" aria-labelledby="([^"]+)"/.exec(markup);

      expect(group).not.toBeNull();
      expect(markup).toContain(`<span id="${group?.[1]}"`);

      for (const item of controls(markup)) {
        expect(item.id).not.toBe('');
        expect(count(markup, `<label for="${item.id}"`)).toBe(1);
      }
    }
  });

  it('asks only for role and CRM in the compact variant', () => {
    const markup = render({ variant: 'compact' });

    expect(controls(markup).map((item) => item.tag)).toEqual(['select']);
    expect(control(markup, 'crm').tag).toBe('select');
    expect(count(markup, 'aria-pressed=')).toBe(6);

    for (const crm of GTM_CRMS) {
      expect(markup).toContain(`<option value="${crm.id}">${crm.label}</option>`);
    }
  });

  it('shows every workspace field in the full variant, with the sales motion last', () => {
    const names = controls(render({ variant: 'full' })).map(
      (item) => `${item.tag}:${item.id.split('-').slice(1).join('-')}`,
    );

    expect(names).toEqual([
      'select:crm',
      'input:company',
      'textarea:product',
      'textarea:icp',
      'input:stages',
      'input:segments',
      'select:revenue-model',
      'input:currency',
      'select:fiscal-year',
      'textarea:notes',
      'select:sales-motion',
    ]);
  });

  it('labels the full-only fields', () => {
    const markup = render({ variant: 'full' });

    for (const label of [
      'Company',
      'What you sell',
      'Ideal customer profile (ICP)',
      'Deal stages',
      'Segments',
      'Revenue model',
      'Reporting currency',
      'Fiscal year starts in',
      'Anything else: terms you use, team structure',
      'Primary sales motion',
    ]) {
      expect(markup).toContain(`>${label}</label>`);
      expect(render({ variant: 'compact' })).not.toContain(`>${label}</label>`);
    }

    expect(control(markup, 'segments').html).toContain('placeholder="SMB, Mid-Market, Enterprise"');
  });

  it('limits free text to the lengths the store enforces', () => {
    const markup = render({ variant: 'full' });

    const limits: Record<string, number> = {
      company: GTM_CONTEXT_LIMITS.companyName,
      product: GTM_CONTEXT_LIMITS.productDescription,
      icp: GTM_CONTEXT_LIMITS.icp,
      stages: GTM_CONTEXT_LIMITS.dealStages,
      segments: GTM_CONTEXT_LIMITS.segments,
      notes: GTM_CONTEXT_LIMITS.notes,
      currency: 3,
    };

    for (const [name, limit] of Object.entries(limits)) {
      expect(control(markup, name).html.toLowerCase()).toContain(`maxlength="${limit}"`);
    }
  });

  it('suggests deal stages in the wording of the selected CRM', () => {
    const generic = control(render(), 'stages').html;
    const hubspot = control(render({ value: withValue({ crm: 'hubspot' }) }), 'stages').html;

    expect(generic).toContain('placeholder="Discovery, Demo, Proposal, Negotiation"');
    expect(hubspot).toContain(`placeholder="${getGtmCrm('hubspot')?.stagesPlaceholder}"`);
  });

  it('reflects the saved values', () => {
    const markup = render({
      value: withValue({
        crm: 'salesforce',
        companyName: 'Acme',
        icp: 'Mid-market logistics companies',
        revenueModel: 'usage',
        salesMotion: 'outbound',
        currency: 'EUR',
        fiscalYearStartMonth: 4,
      }),
    });

    expect(markup).toContain('<option value="salesforce" selected="">Salesforce</option>');
    expect(markup).toContain('<option value="usage" selected="">Usage-based</option>');
    expect(markup).toContain('<option value="outbound" selected="">Outbound-led</option>');
    expect(markup).toContain('<option value="4" selected="">April</option>');
    expect(control(markup, 'company').html).toContain('value="Acme"');
    expect(control(markup, 'currency').html).toContain('value="EUR"');
    expect(markup).toContain('>Mid-market logistics companies</textarea>');
  });

  it('does not depend on theme colours inside the first-run dialog', () => {
    expect(render({ variant: 'compact' })).toContain('bolt-elements-');
    expect(render({ variant: 'compact', tone: 'onboarding' })).not.toContain('bolt-elements-');
    expect(render({ variant: 'full', tone: 'onboarding' })).not.toContain('bolt-elements-');
  });
});
