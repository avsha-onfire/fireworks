import { useId, type ReactNode } from 'react';
import type { GtmCrmId, GtmRevenueModelId, GtmSalesMotionId, GtmWorkspaceContext } from '~/lib/gtm/types';
import {
  GTM_CONTEXT_LIMITS,
  GTM_CRMS,
  GTM_MONTHS,
  GTM_REVENUE_MODELS,
  GTM_ROLES,
  GTM_SALES_MOTIONS,
  getGtmCrm,
} from '~/lib/gtm/workspace';
import { classNames } from '~/utils/classNames';

export type GtmWorkspaceFormVariant = 'full' | 'compact';

/**
 * Where the form is shown. `theme` follows the app theme (settings panel);
 * `onboarding` matches the first-run dialog, which has its own fixed dark
 * palette and does not follow the theme.
 */
export type GtmWorkspaceFormTone = 'theme' | 'onboarding';

export interface GtmWorkspaceFormProps {
  value: GtmWorkspaceContext;
  onChange: (updates: Partial<GtmWorkspaceContext>) => void;

  /** `compact` asks for role and CRM only; `full` shows every workspace field. */
  variant: GtmWorkspaceFormVariant;
  tone?: GtmWorkspaceFormTone;
}

interface ToneClasses {
  label: string;
  hint: string;
  control: string;
  roleIdle: string;
  roleSelected: string;
  roleIcon: string;
}

const TONE_CLASSES: Record<GtmWorkspaceFormTone, ToneClasses> = {
  theme: {
    label: 'text-bolt-elements-textPrimary',
    hint: 'text-bolt-elements-textSecondary',
    control:
      'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:ring-2 focus:ring-purple-500/30',
    roleIdle:
      'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-2',
    roleSelected:
      'border-bolt-elements-borderColorActive bg-bolt-elements-background-depth-2 ring-1 ring-bolt-elements-borderColorActive',
    roleIcon: 'text-bolt-elements-textSecondary',
  },
  onboarding: {
    label: 'text-[#f4f1fa]',
    hint: 'text-[#a09baa]',
    control: 'border-[#302e39] bg-[#121116] text-[#f4f1fa] placeholder-[#6f6a7a] focus:border-[#8b5cf6]',
    roleIdle: 'border-[#393641] bg-[#121116] hover:bg-[#25232d]',
    roleSelected: 'border-[#8b5cf6] bg-[#25232d] ring-2 ring-[#8b5cf6]/40',
    roleIcon: 'text-[#a09baa]',
  },
};

const CONTROL_BASE = 'w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors';
const DEFAULT_STAGES_PLACEHOLDER = 'Discovery, Demo, Proposal, Negotiation';

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  classes: ToneClasses;
  children: ReactNode;
}

function Field({ id, label, hint, classes, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className={classNames('mb-1 block text-sm font-medium', classes.label)}>
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className={classNames('mt-1 text-xs', classes.hint)}>
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * The GTM workspace fields. Controlled: the parent owns the value and decides
 * when it is saved, so the same form serves onboarding (saved on Continue) and
 * the settings tab (saved as you type).
 */
export function GtmWorkspaceForm({ value, onChange, variant, tone = 'theme' }: GtmWorkspaceFormProps) {
  const formId = useId();
  const classes = TONE_CLASSES[tone];
  const controlClassName = classNames(CONTROL_BASE, classes.control);
  const fieldId = (name: string) => `${formId}-${name}`;
  const isFull = variant === 'full';

  return (
    <div className="space-y-5">
      <div role="group" aria-labelledby={fieldId('role')}>
        <span id={fieldId('role')} className={classNames('mb-2 block text-sm font-medium', classes.label)}>
          Your role
        </span>
        <div className={classNames('grid grid-cols-1 gap-2 sm:grid-cols-2', isFull && 'lg:grid-cols-3')}>
          {GTM_ROLES.map((role) => {
            const selected = value.role === role.id;

            return (
              <button
                key={role.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange({ role: selected ? '' : role.id })}
                className={classNames(
                  'flex appearance-none items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500',
                  selected ? classes.roleSelected : classes.roleIdle,
                )}
              >
                <span
                  aria-hidden="true"
                  className={classNames(role.icon, 'mt-0.5 h-5 w-5 shrink-0', classes.roleIcon)}
                />
                <span className="min-w-0">
                  <span className={classNames('block text-sm font-medium', classes.label)}>{role.label}</span>
                  <span className={classNames('block text-xs', classes.hint)}>{role.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Field id={fieldId('crm')} label="CRM" classes={classes}>
        <select
          id={fieldId('crm')}
          value={value.crm}
          onChange={(event) => onChange({ crm: event.target.value as GtmCrmId | '' })}
          className={controlClassName}
        >
          <option value="">Not set</option>
          {GTM_CRMS.map((crm) => (
            <option key={crm.id} value={crm.id}>
              {crm.label}
            </option>
          ))}
        </select>
      </Field>

      {isFull && (
        <>
          <Field id={fieldId('company')} label="Company" classes={classes}>
            <input
              id={fieldId('company')}
              type="text"
              autoComplete="organization"
              value={value.companyName}
              maxLength={GTM_CONTEXT_LIMITS.companyName}
              onChange={(event) => onChange({ companyName: event.target.value })}
              className={controlClassName}
            />
          </Field>

          <Field id={fieldId('product')} label="What you sell" classes={classes}>
            <textarea
              id={fieldId('product')}
              rows={3}
              value={value.productDescription}
              maxLength={GTM_CONTEXT_LIMITS.productDescription}
              onChange={(event) => onChange({ productDescription: event.target.value })}
              placeholder="Product, who buys it and how it is priced"
              className={classNames(controlClassName, 'resize-y')}
            />
          </Field>

          <Field id={fieldId('icp')} label="Ideal customer profile (ICP)" classes={classes}>
            <textarea
              id={fieldId('icp')}
              rows={3}
              value={value.icp}
              maxLength={GTM_CONTEXT_LIMITS.icp}
              onChange={(event) => onChange({ icp: event.target.value })}
              placeholder="Industries, company size, regions and buyer titles"
              className={classNames(controlClassName, 'resize-y')}
            />
          </Field>

          <Field
            id={fieldId('stages')}
            label="Deal stages"
            hint="In order, separated by commas. Apps use these instead of generic stage names."
            classes={classes}
          >
            <input
              id={fieldId('stages')}
              type="text"
              aria-describedby={`${fieldId('stages')}-hint`}
              value={value.dealStages}
              maxLength={GTM_CONTEXT_LIMITS.dealStages}
              onChange={(event) => onChange({ dealStages: event.target.value })}
              placeholder={getGtmCrm(value.crm)?.stagesPlaceholder ?? DEFAULT_STAGES_PLACEHOLDER}
              className={controlClassName}
            />
          </Field>

          <Field id={fieldId('segments')} label="Segments" classes={classes}>
            <input
              id={fieldId('segments')}
              type="text"
              value={value.segments}
              maxLength={GTM_CONTEXT_LIMITS.segments}
              onChange={(event) => onChange({ segments: event.target.value })}
              placeholder="SMB, Mid-Market, Enterprise"
              className={controlClassName}
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Field id={fieldId('revenue-model')} label="Revenue model" classes={classes}>
              <select
                id={fieldId('revenue-model')}
                value={value.revenueModel}
                onChange={(event) => onChange({ revenueModel: event.target.value as GtmRevenueModelId | '' })}
                className={controlClassName}
              >
                <option value="">Not set</option>
                {GTM_REVENUE_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              id={fieldId('currency')}
              label="Reporting currency"
              hint="Three-letter code, for example USD."
              classes={classes}
            >
              <input
                id={fieldId('currency')}
                type="text"
                aria-describedby={`${fieldId('currency')}-hint`}
                autoCapitalize="characters"
                spellCheck={false}
                value={value.currency}
                maxLength={3}
                onChange={(event) => onChange({ currency: event.target.value.toUpperCase() })}
                className={controlClassName}
              />
            </Field>

            <Field id={fieldId('fiscal-year')} label="Fiscal year starts in" classes={classes}>
              <select
                id={fieldId('fiscal-year')}
                value={value.fiscalYearStartMonth}
                onChange={(event) => onChange({ fiscalYearStartMonth: Number(event.target.value) })}
                className={controlClassName}
              >
                {GTM_MONTHS.map((month, index) => (
                  <option key={month} value={index + 1}>
                    {month}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field id={fieldId('notes')} label="Anything else: terms you use, team structure" classes={classes}>
            <textarea
              id={fieldId('notes')}
              rows={3}
              value={value.notes}
              maxLength={GTM_CONTEXT_LIMITS.notes}
              onChange={(event) => onChange({ notes: event.target.value })}
              className={classNames(controlClassName, 'resize-y')}
            />
          </Field>

          <Field id={fieldId('sales-motion')} label="Primary sales motion" classes={classes}>
            <select
              id={fieldId('sales-motion')}
              value={value.salesMotion}
              onChange={(event) => onChange({ salesMotion: event.target.value as GtmSalesMotionId | '' })}
              className={controlClassName}
            >
              <option value="">Not set</option>
              {GTM_SALES_MOTIONS.map((motion) => (
                <option key={motion.id} value={motion.id}>
                  {motion.label}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}
    </div>
  );
}
