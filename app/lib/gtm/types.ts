/*
 * Shared GTM (go-to-market) types.
 *
 * Pure type and constant declarations only: this file is imported by client
 * components, server routes and tests.
 */

export const GTM_ROLE_IDS = ['sales', 'sdr', 'marketing', 'revops', 'cs', 'leadership'] as const;
export type GtmRoleId = (typeof GTM_ROLE_IDS)[number];

export const GTM_CRM_IDS = [
  'salesforce',
  'hubspot',
  'pipedrive',
  'attio',
  'close',
  'dynamics',
  'zoho',
  'other',
  'none',
] as const;
export type GtmCrmId = (typeof GTM_CRM_IDS)[number];

export const GTM_SALES_MOTION_IDS = ['inbound', 'outbound', 'product-led', 'enterprise', 'channel', 'mixed'] as const;
export type GtmSalesMotionId = (typeof GTM_SALES_MOTION_IDS)[number];

export const GTM_REVENUE_MODEL_IDS = ['subscription', 'usage', 'one-time', 'services'] as const;
export type GtmRevenueModelId = (typeof GTM_REVENUE_MODEL_IDS)[number];

export const GTM_BLUEPRINT_CATEGORY_IDS = [
  'sales',
  'prospecting',
  'marketing',
  'revops',
  'customer-success',
  'leadership',
] as const;
export type GtmBlueprintCategoryId = (typeof GTM_BLUEPRINT_CATEGORY_IDS)[number];

/**
 * What the builder knows about the user's team. Stored in the browser, sent
 * with chat requests and rendered into the system prompt as reference data.
 */
export interface GtmWorkspaceContext {
  role: GtmRoleId | '';
  companyName: string;

  /** What the company sells, in the user's words. */
  productDescription: string;

  /** Ideal customer profile. */
  icp: string;
  crm: GtmCrmId | '';

  /** The team's deal stages in order, comma-separated, for example `Discovery, Demo, Proposal, Negotiation`. */
  dealStages: string;

  /** The segments the team reports on, comma-separated, for example `SMB, Mid-Market, Enterprise`. */
  segments: string;

  /** How the company charges. Decides whether ARR-family metrics apply. */
  revenueModel: GtmRevenueModelId | '';
  salesMotion: GtmSalesMotionId | '';

  /** ISO 4217 reporting currency, for example `USD`. */
  currency: string;

  /** 1 = January ... 12 = December. */
  fiscalYearStartMonth: number;

  /** Free-form extras: terminology, team structure, anything else the builder should know. */
  notes: string;
}

/** A ready-made app recipe shown on the home screen. Selecting one prefills the composer. */
export interface GtmBlueprint {
  /** Stable kebab-case id. */
  id: string;
  title: string;
  category: GtmBlueprintCategoryId;

  /** One benefit-led line, at most 110 characters. */
  summary: string;

  /** What to bring, shown as "Works with: ...", for example `an opportunity export and a rep quota sheet`. */
  dataInputs: string;

  /** UnoCSS icon class, for example `i-ph:funnel`. */
  icon: string;

  /** Roles this blueprint is most relevant to. */
  roles: GtmRoleId[];
  tags: string[];

  /** The prompt placed in the composer. Its first sentence becomes the chat title. */
  prompt: string;
}

/** Sets the composer text. Accepts an updater so several appends in one tick do not overwrite each other. */
export type ComposerInputSetter = (value: string | ((previous: string) => string)) => void;
