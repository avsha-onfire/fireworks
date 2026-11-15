import type { GtmRoleId } from './types';

/*
 * Example requests shown as chips under the composer. A click sends the text
 * exactly as written, so each one is a complete request: an imperative
 * sentence of at most 60 characters that names the tool and what makes it
 * useful. The text also becomes the chat title.
 */

/** Shown until a role is chosen: one request from each part of the revenue team. */
export const DEFAULT_GTM_EXAMPLE_PROMPTS: string[] = [
  'Build a pipeline review board with stalled-deal flags',
  'Build a forecast roll-up by rep, manager and company',
  'Build a multi-touch campaign attribution dashboard',
  'Make a target account scoring tool with tiers',
  'Build a customer health scorecard with renewal dates',
  'Create a commission calculator with accelerators',
  'Build a win/loss dashboard by segment and competitor',
];

const ROLE_EXAMPLE_PROMPTS: Record<GtmRoleId, string[]> = {
  sales: [
    'Build a pipeline review board with stalled-deal flags',
    'Build a daily list of my deals that need a next step',
    'Build a win/loss dashboard by segment and competitor',
    'Create a mutual action plan tracker for late-stage deals',
    'Build a discount approval calculator for sales quotes',
    'Make a commission calculator with a what-if simulator',
    'Build a call prep brief builder for discovery meetings',
  ],
  sdr: [
    'Make a target account scoring tool with tiers',
    'Build an SDR scorecard from dials to qualified meetings',
    'Build a cold call script library by persona',
    'Build an inbound lead response time tracker',
    'Build a call prep brief builder for discovery meetings',
    'Create an objection handling library with responses',
    'Build a meeting no-show tracker by rep and source',
  ],
  marketing: [
    'Build a multi-touch campaign attribution dashboard',
    'Build a marketing budget pacing tracker by quarter',
    'Create a UTM link builder with naming rules',
    'Build an event lead follow-up tracker with SLA timers',
    'Build an ABM account engagement heatmap by week',
    'Make a lead-to-opportunity funnel by channel and month',
    'Build a content calendar with campaign and owner views',
  ],
  revops: [
    'Build a funnel conversion and sales velocity analyzer',
    'Build a pipeline generation tracker by source and week',
    'Create a commission calculator with accelerators',
    'Build a CRM data quality audit for duplicate accounts',
    'Build a lead routing simulator with territory rules',
    'Make a sales capacity planner with ramp and attrition',
    'Build a forecast roll-up by rep, manager and company',
  ],
  cs: [
    'Build a customer health scorecard with renewal dates',
    'Build a renewal tracker showing ARR at risk by quarter',
    'Create a QBR builder for my top 20 accounts',
    'Build a customer onboarding tracker with milestones',
    'Build an expansion pipeline board for account managers',
    'Make a churn analysis dashboard by reason and segment',
    'Build a support escalation tracker by account and ARR',
  ],
  leadership: [
    'Build a forecast roll-up by rep, manager and company',
    'Build a board dashboard with ARR bridge, NRR and GRR',
    'Build a territory planner that balances rep books',
    'Make a sales capacity planner with ramp and attrition',
    'Build a win/loss dashboard by segment and competitor',
    'Create a quota attainment dashboard by team and quarter',
    'Build a pipeline coverage tracker against remaining quota',
  ],
};

/** Example prompt chips for a role; the default list when no role is set. */
export function getExamplePrompts(role: GtmRoleId | ''): string[] {
  // An own-property check, so a stale or unexpected stored value falls back to the defaults.
  return Object.hasOwn(ROLE_EXAMPLE_PROMPTS, role)
    ? ROLE_EXAMPLE_PROMPTS[role as GtmRoleId]
    : DEFAULT_GTM_EXAMPLE_PROMPTS;
}
