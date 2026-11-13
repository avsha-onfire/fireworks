// @unocss-include
import type { GtmBlueprint, GtmBlueprintCategoryId, GtmRoleId } from './types';
import { getGtmRole } from './workspace';

export interface GtmBlueprintCategory {
  id: GtmBlueprintCategoryId;
  label: string;

  /** UnoCSS icon class. */
  icon: string;
}

export const GTM_BLUEPRINT_CATEGORIES: GtmBlueprintCategory[] = [
  { id: 'sales', label: 'Sales', icon: 'i-ph:handshake' },
  { id: 'prospecting', label: 'Prospecting', icon: 'i-ph:phone-outgoing' },
  { id: 'marketing', label: 'Marketing', icon: 'i-ph:megaphone' },
  { id: 'revops', label: 'RevOps', icon: 'i-ph:gear-six' },
  { id: 'customer-success', label: 'Customer Success', icon: 'i-ph:heartbeat' },
  { id: 'leadership', label: 'Leadership', icon: 'i-ph:compass' },
];

const CLOSING_SENTENCE = 'Start with sample data and let me import my own CSV later.';

/*
 * Metric definitions that several prompts share. Each is worded once, so the
 * catalog cannot drift from the definitions the builder itself is given.
 */
const PIPELINE_COVERAGE =
  'pipeline coverage = open pipeline closing this quarter / remaining quota (quota minus closed won), showing Quota met when nothing remains';

const WEIGHTED_PIPELINE = 'weighted pipeline = sum of amount × stage probability over open deals';
const WIN_RATE_BY_COUNT = 'win rate by count = won / (won + lost) for deals closed in the period, open deals excluded';

const SALES_VELOCITY =
  'sales velocity = qualified opportunities × win rate × average won deal size / average sales cycle days';

const NRR = 'NRR = (starting ARR + expansion - contraction - churn) / starting ARR';
const GRR = 'GRR = (starting ARR - contraction - churn) / starting ARR, never above 100%';

/**
 * Assembles a blueprint prompt from its paragraphs: the opening sentence
 * (which becomes the chat title), then data, views, rules, metrics and sample
 * data. Every prompt ends with the same sentence, so the first build runs on
 * sample data and offers an import for the user's own export.
 */
function blueprintPrompt(paragraphs: string[]): string {
  return `${paragraphs.join('\n\n')} ${CLOSING_SENTENCE}`;
}

/*
 * The catalog. Order matters: with no role selected the gallery shows the
 * first six, which are the most broadly useful blueprint of each category.
 *
 * Prompts describe the tool, never the technology, and spell out metric
 * definitions so the numbers are right whichever model builds the app. Stage
 * names, probabilities and forecast categories are asked for as editable
 * settings because every team's differ. Sample volumes are kept small so the
 * first build stays responsive.
 */
export const GTM_BLUEPRINTS: GtmBlueprint[] = [
  {
    id: 'pipeline-review-board',
    title: 'Pipeline Review Board',
    category: 'sales',
    summary: 'Inspect every open deal before the weekly pipeline call: risk flags, coverage and stalled deals.',
    dataInputs:
      'an opportunity export (owner, amount, stage, stage entry date, close and created dates, last activity, push count) and rep quotas',
    icon: 'i-ph:kanban',
    roles: ['sales', 'leadership', 'revops'],
    tags: ['pipeline', 'deal inspection', 'coverage'],
    prompt: blueprintPrompt([
      'Build a pipeline review board for a sales manager running weekly deal inspection.',
      'Data: reps (name, team, quarterly quota) and opportunities (account, owner, amount, stage, stage entry date, forecast category, close and created dates, last activity date, next step, close date push count). Stage names and win probabilities are editable settings.',
      'Views: (1) team summary with open pipeline by stage; (2) deal table with risk flags, filtered by rep, team, stage and close quarter; (3) deal detail with stage history, next step and flag reasons.',
      "Rules: flag a deal with no activity for 14 days, a close date in the past, two or more pushes, or more time in its stage than 1.5 times that stage's median. Hide a flag, saying why, when an import lacks its column.",
      `Metrics: ${PIPELINE_COVERAGE}; ${WEIGHTED_PIPELINE}; ${WIN_RATE_BY_COUNT}, plus win rate by value; average sales cycle on won deals.`,
      'Sample data: 8 reps and 140 opportunities, a few very large, a quarter of the open ones stale or pushed, plus two quarters of closed deals.',
    ]),
  },
  {
    id: 'forecast-rollup',
    title: 'Forecast Roll-Up',
    category: 'leadership',
    summary: 'Roll rep calls up to manager and company, track commit against quota and see what moved this week.',
    dataInputs: 'an opportunity export with forecast category and close date, plus quotas by rep and manager',
    icon: 'i-ph:chart-line-up',
    roles: ['leadership', 'sales', 'revops'],
    tags: ['forecast', 'commit', 'quota'],
    prompt: blueprintPrompt([
      'Build a weekly sales forecast roll-up for the current quarter by rep, manager and company.',
      'Data: managers and reps with quarterly quotas; opportunities (account, owner, amount, stage, forecast category, close date); and weekly deal snapshots. Forecast categories are Pipeline, Best Case, Commit, Closed and Omitted (excluded from roll-ups): an editable list, separate from stage.',
      "Views: (1) roll-up grid by manager and rep with quota, closed won, commit, best case, open pipeline, the manager's call and gap to quota; (2) week-over-week changes: deals added, pulled in, pushed out, resized, won or lost; (3) forecast accuracy by rep for past quarters.",
      'Rules: a manager enters a call and a note for each rep, then locks the weekly snapshot.',
      `Metrics: commit forecast = closed won + commit deals; best case forecast = commit forecast + best case deals; ${PIPELINE_COVERAGE}; attainment = closed won / quota; forecast accuracy = 1 - |manager's week-3 call - final closed won| / max(final closed won, call), floored at 0.`,
      "Sample data: 3 managers, 12 reps, 160 opportunities, 8 weekly snapshots this quarter and each rep's week-3 call and final closed won for the last 4 quarters; calls run low for two reps, high for two.",
    ]),
  },
  {
    id: 'campaign-attribution',
    title: 'Campaign Attribution Dashboard',
    category: 'marketing',
    summary: 'See which campaigns and channels sourced and influenced pipeline, under five attribution models.',
    dataInputs: 'campaign costs, campaign member or touch records, and an opportunity export with amounts and dates',
    icon: 'i-ph:chart-pie-slice',
    roles: ['marketing', 'revops'],
    tags: ['attribution', 'campaigns', 'pipeline'],
    prompt: blueprintPrompt([
      'Build a campaign attribution dashboard that shows which campaigns create pipeline and revenue.',
      'Data: campaigns (name, channel such as paid search, paid social, webinar, event or email, region, dates, actual cost), touches (contact, account, campaign, date, whether it created a new lead) and opportunities (account, segment, amount, created date, close date, outcome of open, won or lost).',
      'Views: (1) overview of monthly spend against attributed pipeline; (2) campaign table with cost, new leads, cost per lead, attributed pipeline, attributed won revenue and return, with drill-down to opportunities and touches; (3) channel comparison. A model switcher (first touch, last touch, linear, U-shaped 40/20/40, time decay with a 7-day half-life) recalculates every attributed number. Filter by date range, channel, region and segment.',
      "Rules: credit only touches made before the opportunity was created, and make each opportunity's credit total 100% so campaign totals never double count. Show influenced pipeline separately: the full amount of every opportunity a campaign touched before close, not additive across campaigns.",
      'Metrics: sourced pipeline = opportunities whose first touch before creation is the campaign (may differ from the CRM lead source); pipeline return = attributed pipeline / cost; revenue return = (attributed won revenue - cost) / cost.',
      'Sample data: 40 campaigns over 12 months, 2,000 touches and 250 opportunities; paid channels costly, webinars efficient.',
    ]),
  },
  {
    id: 'target-account-prioritizer',
    title: 'Target Account Prioritizer',
    category: 'prospecting',
    summary: "Score and tier a target account list by fit and intent, then build this week's call list.",
    dataInputs: 'an account list (industry, size, region, owner, last touch) and optional contacts and intent signals',
    icon: 'i-ph:target',
    roles: ['sdr', 'sales'],
    tags: ['account scoring', 'tiering', 'intent'],
    prompt: blueprintPrompt([
      'Build an account prioritization tool that scores and tiers my target account list.',
      'Data: accounts (name, domain, industry, employee count, region, owner, status of untouched, working, meeting set, open opportunity, customer or disqualified, last touched date), contacts (account, name, title, seniority, department, buying-committee role mapped from title) and signals (account, type such as funding, hiring, leadership change or web visit, date, strength).',
      "Views: (1) ranked account table with fit, intent and total scores and tier, filtered by owner, industry, tier and status; (2) scoring editor where I edit criterion and signal weights, the fit and intent split and tier cut-offs, with ranks updating live; (3) account detail with contacts, buying-committee coverage and a signal timeline. Let me add accounts to this week's call list and export it.",
      'Metrics: fit score = weighted sum of matching criteria; intent score = sum of signal strengths decayed with a 30-day half-life; both scaled to 0-100; total score = fit weight × fit + intent weight × intent (default 60/40); persona coverage = buying-committee roles with at least one contact / roles required; share of tier 1 accounts not touched in 30 days; whitespace = tier 1 and 2 accounts with no open opportunity.',
      'Sample data: 250 accounts skewed toward SMB, 600 contacts and 400 signals concentrated on a fifth of accounts.',
    ]),
  },
  {
    id: 'customer-health-scorecard',
    title: 'Customer Health Scorecard',
    category: 'customer-success',
    summary: 'Score every account on usage, support and sentiment, and review the ones sliding toward churn.',
    dataInputs: 'an account list (ARR, CSM, renewal date) and monthly usage, support and NPS numbers per account',
    icon: 'i-ph:heartbeat',
    roles: ['cs', 'leadership'],
    tags: ['health score', 'churn risk', 'adoption'],
    prompt: blueprintPrompt([
      'Build a customer health scorecard and weekly risk review for a customer success team.',
      'Data: accounts (name, segment, ARR, CSM, renewal date), monthly signals per account (licensed seats, active users, key feature adoption %, support tickets, NPS, days since the last executive touch, overdue invoices) and risk notes with action items, owners and due dates.',
      'Views: (1) portfolio overview with accounts and ARR by health band, ARR at risk, and an account table with score, change against 90 days ago, renewal date and CSM, filtered by CSM, segment and renewal window; (2) account detail with the score by component, 12-month trends, notes and the action plan; (3) score model editor where I change component weights and band thresholds and see how many accounts change band.',
      'Rules: scale each component to 0-100 before weighting; weights must total 100. A CSM can override a score only with a written reason, shown beside the calculated score. Flag accounts that are red or dropped 15 points or more.',
      'Metrics: seat utilization = active users / licensed seats; ARR at risk = ARR of red accounts renewing in the next 180 days; health distribution by account count and by ARR.',
      'Sample data: 120 accounts with ARR from 6k to 400k and 12 months of signals, about 15% red and 25% yellow.',
    ]),
  },
  {
    id: 'commission-calculator',
    title: 'Commission Calculator',
    category: 'revops',
    summary: 'Calculate payouts from closed deals and let reps test what their next deal is worth.',
    dataInputs: 'a closed-won export (rep, close date, amount, deal type) and your comp plan tiers, quotas and rates',
    icon: 'i-ph:calculator',
    roles: ['revops', 'sales'],
    tags: ['commission', 'comp plan', 'what-if'],
    prompt: blueprintPrompt([
      'Build a sales commission calculator with a what-if simulator for reps and sales managers.',
      'Data: comp plans (role, on-target earnings, base and variable split, quota, monthly or quarterly period, commission tiers with attainment thresholds and rate multipliers, optional cap), reps (name, role, plan, start date) and closed won deals (rep, account, close date, amount, deal type of new business, expansion or renewal, split %).',
      'Views: (1) rep statement for a period with a deal-by-deal payout table, attainment against quota and year-to-date earnings; (2) what-if simulator where I add hypothetical deals and see the payout and the value of the next dollar of bookings; (3) team payout summary with a plan editor for tiers and rates.',
      "Rules: apply each tier's rate only to the bookings that fall inside that tier (marginal, not retroactive), with accelerators above 100% attainment and the cap applied last. Credit a split deal by its split %.",
      'Metrics: base commission rate = target variable pay / quota; attainment = credited bookings in the period / quota for the same period; effective commission rate = payout / credited bookings; compensation cost of sales = total payout / total bookings.',
      'Sample data: 3 plans, 12 reps with attainment from 40% to 140% and 200 closed deals across four quarters.',
    ]),
  },
  {
    id: 'deal-action-list',
    title: 'Deal Action List',
    category: 'sales',
    summary: "A rep's daily list of open deals that need a next step, a new close date or a follow-up.",
    dataInputs: 'your opportunity export with stage, amount, close date, next step and last activity date',
    icon: 'i-ph:list-checks',
    roles: ['sales'],
    tags: ['account executive', 'next steps', 'deal hygiene'],
    prompt: blueprintPrompt([
      'Build a daily action list that shows an account executive which open deals need attention.',
      'Data: my opportunities, open or closed this quarter (account, amount, stage, close date, forecast category, next step, next step date, last activity date, days in stage), and my quarterly quota. Stage names and win probabilities are editable settings.',
      "Views: (1) today's list, grouping open deals by the reason they need action, ordered by amount, where I update the next step, its date and the close date in place and snooze a deal; (2) all my open deals in a sortable table filtered by stage and close month; (3) quarter summary with closed won, commit, weighted pipeline and gap to quota.",
      "Rules: a deal needs action when its next step is missing or overdue, its close date is in the past, it has had no activity for 10 days, or it has spent more than twice the stage's median time in its stage. Show every reason that applies.",
      `Metrics: ${PIPELINE_COVERAGE}; ${WEIGHTED_PIPELINE}.`,
      'Sample data: 45 open deals for one rep, a third needing action, plus 12 deals closed this quarter.',
    ]),
  },
  {
    id: 'win-loss-analysis',
    title: 'Win/Loss Analysis',
    category: 'sales',
    summary: 'Find where and why deals are won or lost: by segment, competitor, stage and loss reason.',
    dataInputs: 'a closed opportunity export with outcome, amount, segment, source, competitor and loss reason',
    icon: 'i-ph:scales',
    roles: ['sales', 'leadership', 'revops'],
    tags: ['win rate', 'loss reasons', 'competitors'],
    prompt: blueprintPrompt([
      'Build a win/loss analysis app that shows where and why we win and lose deals.',
      'Data: closed opportunities (account, owner, segment, source, deal type of new business, expansion or renewal, amount, created date, close date, outcome of won or lost, primary competitor, loss reason, last stage reached).',
      'Views: (1) overview with win rate, average won deal size and sales cycle against the prior period, and a quarterly trend; (2) breakdown table of win rate by segment, source, competitor, owner or deal size band, each row opening its deals; (3) loss reasons ranked by count and lost amount, and the stage where lost deals dropped out.',
      'Rules: recompute every rate from summed wins and losses, never by averaging percentages. Mark groups under 10 closed deals as a small sample. Filter by close date range, segment and deal type.',
      `Metrics: ${WIN_RATE_BY_COUNT}; win rate by value = won amount / (won amount + lost amount); competitive win rate = win rate by count on deals with a named competitor; sales cycle = days from created to close on won deals, as average and median.`,
      'Sample data: 400 closed opportunities over six quarters, win rate near 25% and lower against one competitor.',
    ]),
  },
  {
    id: 'sdr-activity-scorecard',
    title: 'SDR Activity Scorecard',
    category: 'prospecting',
    summary: 'Connect dials, emails and meetings to qualified pipeline, rep by rep and step by step.',
    dataInputs: 'daily activity counts per rep, a meetings export with outcomes, and monthly SQO quotas',
    icon: 'i-ph:ranking',
    roles: ['sdr', 'leadership'],
    tags: ['activity', 'meetings', 'SQO'],
    prompt: blueprintPrompt([
      'Build an SDR team scorecard that links daily activity to meetings and qualified pipeline.',
      'Data: SDRs (name, team, start date, monthly SQO quota), daily activity (date, SDR, dials, connects, emails delivered, replies), meetings (SDR, account, source of inbound or outbound, booked date, scheduled date, held or no-show) and the opportunities created from them (accepted date, amount). An SQO is a sales qualified opportunity: a held meeting that an account executive accepted as real pipeline.',
      "Views: (1) team leaderboard of SQOs against quota, filtered by date range, team and source; (2) SDR page with a funnel from dials to SQOs and weekly trends, each step opening its records; (3) coaching view of each rep's weakest conversion step against the team median.",
      'Metrics: connect rate = connects / dials; reply rate = replies / emails delivered; meeting held rate = meetings held / meetings booked, for meetings whose date has passed; meeting to SQO rate = SQOs / meetings held, not booked; quota attainment = SQOs / quota for the same month, prorated for ramping reps; pipeline sourced = sum of SQO amounts. Team rates come from summed counts, never averaged rep percentages.',
      'Sample data: 8 SDRs, 90 days of activity and 300 meetings with 20% no-shows; 45% of held meetings become SQOs and some busy reps convert poorly.',
    ]),
  },
  {
    id: 'call-prep-brief',
    title: 'Call Prep Brief',
    category: 'prospecting',
    summary: 'One page per meeting: who is in the room, what changed at the account and what to ask.',
    dataInputs: 'your meeting list and an account and contact export; research notes are pasted in per account',
    icon: 'i-ph:notepad',
    roles: ['sdr', 'sales', 'cs'],
    tags: ['meeting prep', 'discovery', 'questions'],
    prompt: blueprintPrompt([
      'Build a call prep tool that assembles a one-page brief for each of my sales meetings.',
      'Data: meetings (date, account, type of cold call, discovery, demo or renewal, attendees), accounts (name, industry, size, current tools, open opportunity stage and amount, last interaction), contacts (name, title, buying-committee role, notes) and a question library (question, persona, industry, meeting type, the pain it uncovers).',
      "Views: (1) this week's meetings with a prep status, filtered by day and meeting type; (2) brief editor with sections for account snapshot, attendees and what each cares about, recent developments I paste in, my hypothesis of their problem, three goals for the call, questions suggested from the library by persona, industry and meeting type, likely objections with responses, and the next step I will ask for; (3) an editable question and objection library.",
      'Rules: a brief is ready only when it has a goal, three questions and a proposed next step. Start each brief from the last one for that account. Give every brief a print view that fits one page, and let me copy it as plain text.',
      "Metrics: share of this week's meetings with a ready brief; most used questions.",
      'Sample data: 15 meetings this week across 12 fictional accounts, 30 contacts and a library of 40 questions and 15 objections.',
    ]),
  },
  {
    id: 'funnel-velocity-analyzer',
    title: 'Funnel and Velocity Analyzer',
    category: 'revops',
    summary: 'Measure conversion from lead to closed won on cohorts, and see what drives sales velocity.',
    dataInputs:
      'a lead export with MQL and SQL dates and converted opportunity ID, and an opportunity export with ID, amount, dates, source and outcome',
    icon: 'i-ph:funnel',
    roles: ['revops', 'marketing', 'leadership'],
    tags: ['funnel', 'conversion', 'sales velocity'],
    prompt: blueprintPrompt([
      'Build a funnel and sales velocity analyzer for a revenue operations team.',
      'Data: leads (lead ID, source, segment, created date, MQL date, SQL date, converted opportunity ID) and opportunities (opportunity ID, segment, source, owner, amount, created, qualified and close dates, outcome). MQL = passed the marketing score threshold; SQL = qualified by a rep; qualified opportunity = accepted by an account executive as real pipeline.',
      'Views: (1) funnel from lead to closed won with conversion and median days per step; (2) cohort table by lead created month, greying out cohorts still maturing; (3) sales velocity by segment, source and rep, with a slider per driver. Filter by source too.',
      "Rules: measure conversion on cohorts: of the leads created in a period, the share that reached the next or any later step (a skipped step counts as passed). Never divide this month's wins by this month's leads.",
      `Metrics: ${WIN_RATE_BY_COUNT}; sales cycle = average days from created to close on won deals; ${SALES_VELOCITY}.`,
      'Sample data: 1,500 leads over 15 months and 300 opportunities, win rate near 22%, cycles of 20 to 150 days by segment.',
    ]),
  },
  {
    id: 'pipeline-generation-tracker',
    title: 'Pipeline Generation Tracker',
    category: 'revops',
    summary: 'Track new pipeline created each week against target, by source, segment and team.',
    dataInputs: 'an opportunity export with created date, amount, source and segment, plus pipeline targets by source',
    icon: 'i-ph:chart-bar',
    roles: ['revops', 'marketing', 'sdr', 'leadership'],
    tags: ['pipeline generation', 'targets', 'sources'],
    prompt: blueprintPrompt([
      'Build a pipeline generation tracker that compares new pipeline with target by source and week.',
      'Data: opportunities (account, owner, team, segment, source of marketing, SDR outbound, AE self-sourced, partner or customer expansion, created date, qualified date, amount, outcome) and quarterly pipeline targets by source and segment, spread evenly across the weeks of the quarter.',
      'Views: (1) quarter summary with pipeline created against target and the gap to date, for the company and each source; (2) weekly chart of pipeline created by source against the weekly target line, with a cumulative option, filtered by segment, team and quarter; (3) the opportunities behind any number.',
      'Rules: count an opportunity in the week it was created, even if it was later lost. A switch shows qualified pipeline instead: only opportunities that reached the qualified stage, in the week they did. The fiscal year start month is a setting.',
      'Metrics: attainment to date = pipeline created to date / target to date; required weekly run rate = remaining target / weeks left in the quarter; average new opportunity size; share of pipeline by source; created to qualified rate = qualified opportunities / opportunities created, by creation cohort.',
      'Sample data: 5 sources, 3 segments and 350 opportunities over three quarters, with marketing ahead of target and SDR outbound behind this quarter.',
    ]),
  },
  {
    id: 'renewal-expansion-tracker',
    title: 'Renewal and Expansion Tracker',
    category: 'customer-success',
    summary: 'Never miss a renewal: upcoming renewals, notice deadlines, expansion pipeline, NRR and GRR.',
    dataInputs: 'a contract or subscription export with customer, owner, ARR, term start, term end and notice period',
    icon: 'i-ph:arrows-clockwise',
    roles: ['cs', 'leadership'],
    tags: ['renewals', 'NRR', 'expansion'],
    prompt: blueprintPrompt([
      'Build a renewal and expansion tracker for account managers at a subscription business.',
      'Data: customers (name, segment, owner, start date), contracts with 12 months of history (ARR, term start, term end, days of notice, outcome of renewed, downgraded or churned), renewals (stage, forecast of committed, likely, at risk or churning, expected renewal ARR, churn reason) and expansion opportunities (type, amount, stage, close date).',
      'Views: (1) renewal calendar by month with ARR up for renewal and renewals due within 90 days; (2) renewal table where I update stage, forecast and expected ARR, flagging those near their notice deadline; (3) retention summary with NRR, GRR, logo retention and an ARR bridge.',
      'Rules: notice deadline = term end minus the notice period. Measure retention over the trailing 12 months, only on customers active at the start; only closed-won expansion counts toward NRR.',
      `Metrics: ${GRR}; ${NRR}; renewal rate = renewed / up for renewal, by ARR and by logos.`,
      'Sample data: 150 customers with ARR from 5k to 500k, 12 months of past renewals, downgrades, churns and closed-won expansions, 18 months of upcoming renewals clustered at quarter ends, 9% annual logo churn and 40 open expansion opportunities.',
    ]),
  },
  {
    id: 'marketing-budget-pacing',
    title: 'Marketing Budget Pacing',
    category: 'marketing',
    summary: 'Track plan, committed and actual spend by line, and forecast where each quarter will land.',
    dataInputs: 'your budget plan by line and month, and a spend or invoice export with amount, date and status',
    icon: 'i-ph:gauge',
    roles: ['marketing'],
    tags: ['budget', 'pacing', 'spend'],
    prompt: blueprintPrompt([
      'Build a marketing budget pacing tracker for the fiscal year.',
      'Data: budget lines (name, category such as paid media, events, content, tools, agencies or ABM programs, owner, region, planned amount per month) and spend items (budget line, vendor, description, amount, month, status of planned, committed or invoiced). Take the fiscal year start month from a setting.',
      'Views: (1) summary with plan, committed, actual and remaining for the year and the quarter to date, plus cumulative actual spend against plan; (2) grid of budget lines by month, coloured where a line is over or under pace, filtered by quarter, category and owner; (3) spend ledger where I add and edit items.',
      'Rules: flag a line forecast to finish the period above 110% or below 80% of its budget, and flag uncommitted budget in a quarter with fewer than 30 days left.',
      'Metrics: pacing = actual spend to date / planned spend to date, not actual / full-period budget; forecast at period end = actual + committed and not yet invoiced + planned and not yet committed; variance = forecast - budget; cost per lead by category when I enter lead counts.',
      'Sample data: a 1.2M annual budget across 25 lines and 250 spend items with invoices up to today in the current fiscal quarter, events overspent and content underspent.',
    ]),
  },
  {
    id: 'event-lead-follow-up',
    title: 'Event Lead Follow-Up',
    category: 'marketing',
    summary: 'Import badge scans, assign reps and track follow-up speed and pipeline for every event.',
    dataInputs: 'a badge-scan or registration list per event (name, email, company, title) and your event costs',
    icon: 'i-ph:identification-badge',
    roles: ['marketing', 'sdr'],
    tags: ['events', 'lead follow-up', 'field marketing'],
    prompt: blueprintPrompt([
      'Build an event lead follow-up tracker for field marketing and sales reps.',
      'Data: events (name, type of trade show, hosted dinner, webinar or sponsorship, date, cost, goals for leads, meetings and pipeline) and leads (event, name, email, company, title, attendance of registered, attended, no-show or booth scan, priority, assigned rep, follow-up status of not contacted, contacted, meeting booked, opportunity or disqualified, first follow-up date, linked opportunity amount).',
      'Views: (1) event list with leads, meetings and pipeline against goal; (2) follow-up table for one event, filtered by rep, priority and status, with bulk updates; (3) event type comparison by cost and outcome.',
      'Rules: imports merge duplicate leads by email. An opportunity is event-sourced when created within 90 days after the event from an attendee or booth scan with no open opportunity before it, and event-influenced when it was already open and a contact attended.',
      'Metrics: attendance rate = attended / (attended + no-show) for past events, booth scans excluded; cost per lead = event cost / leads; cost per meeting = event cost / meetings booked; follow-up SLA = share of leads first contacted within 2 business days of the event; event-sourced pipeline / event cost.',
      'Sample data: 10 events over four quarters and 800 leads; trade shows bring many cold leads, dinners a few that convert well.',
    ]),
  },
  {
    id: 'abm-account-heatmap',
    title: 'ABM Account Heatmap',
    category: 'marketing',
    summary: 'See which target accounts are heating up week by week, and which high-fit ones are still cold.',
    dataInputs: 'a target account list with tier and owner, contacts with roles, and an activity export by account',
    icon: 'i-ph:fire',
    roles: ['marketing', 'sdr'],
    tags: ['ABM', 'engagement', 'target accounts'],
    prompt: blueprintPrompt([
      'Build an ABM account engagement heatmap for our target account list.',
      'Data: accounts (name, industry, owner, tier 1, 2 or 3, fit score 0-100, open pipeline), contacts (account, name, title, buying-committee role of economic buyer, champion, technical evaluator, end user or procurement) and activities (account, contact, type such as ad click, site visit, email reply, webinar, event, content download or meeting, date).',
      'Views: (1) heatmap with accounts as rows and the last 12 weeks as columns, coloured by engagement score, sorted by score or by change, filtered by tier, owner and industry; (2) account detail with an activity timeline, buying-committee coverage and notes; (3) program summary by tier.',
      'Rules: activity type weights are editable. Flag high-fit accounts with no engagement in 30 days, and accounts whose score doubled in two weeks with no open opportunity.',
      'Metrics: engagement score = sum of activity weights decayed with a 30-day half-life; committee coverage = roles with at least one engaged contact / roles required; account penetration = target accounts with any engagement in the last 30 days / target accounts; pipeline penetration = target accounts with an open opportunity / target accounts.',
      'Sample data: 150 accounts (15 tier 1, 45 tier 2, 90 tier 3), 500 contacts and 2,500 activities over 12 weeks, concentrated on a few accounts.',
    ]),
  },
  {
    id: 'utm-builder',
    title: 'UTM Builder and Audit',
    category: 'marketing',
    summary: 'Generate campaign links that follow your naming rules and audit the ones already in the wild.',
    dataInputs: 'your approved sources, mediums and naming rules, plus a list of existing tagged URLs to audit',
    icon: 'i-ph:link',
    roles: ['marketing'],
    tags: ['UTM', 'campaign tracking', 'governance'],
    prompt: blueprintPrompt([
      'Build a UTM link builder and audit tool that keeps campaign tracking consistent.',
      'Data: a taxonomy of approved sources (such as google, linkedin, newsletter and partner names) and mediums (cpc, paid-social, email, organic-social, display, referral, event), a campaign naming convention built from fiscal quarter, region, program type and short name (for example fy27q1-emea-webinar-security-trends), and links (destination URL, source, medium, campaign, content, term, owner, final tagged URL).',
      'Views: (1) builder form with taxonomy dropdowns, a live preview of the tagged URL, validation messages and a copy button, plus a bulk mode that combines one destination with several sources and content variants; (2) link library with search, filters by campaign, source and owner, and export; (3) audit view where I paste or import existing URLs and each is parsed, checked and given a suggested fix.',
      'Rules: enforce lowercase, hyphens instead of spaces, no special characters, a valid destination, and required source, medium and campaign. Keep existing query parameters and fragments intact. Warn about duplicates and about mismatches such as email used as a source or cpc paired with an organic source.',
      'Metrics: compliance rate = compliant links / audited links; violations by type; links by channel.',
      'Sample data: 150 compliant links across 15 campaigns and a messy 80-row audit list with mixed case, typos, spaces and missing parameters.',
    ]),
  },
  {
    id: 'crm-data-quality-audit',
    title: 'CRM Data Quality Audit',
    category: 'revops',
    summary: 'Find duplicates, missing fields and stale records in a CRM export and produce a clean file.',
    dataInputs: 'account and contact exports with record ID, name, domain or email, owner and last activity date',
    icon: 'i-ph:broom',
    roles: ['revops', 'marketing'],
    tags: ['data quality', 'duplicates', 'CRM hygiene'],
    prompt: blueprintPrompt([
      'Build a CRM data quality audit tool that finds duplicates and missing fields in my exports.',
      'Data: accounts (record ID, name, domain, industry, owner, last modified date), contacts (record ID, name, email, title, phone, account, owner, last activity date) and editable audit rules with severity weights.',
      'Views: (1) health summary with an overall score, fill rate by field and issues by type and owner; (2) issue queue filtered by rule, owner and record type, with single and bulk fixes; (3) duplicate review of candidate pairs side by side with match confidence, where I pick the surviving value per field, then merge or dismiss.',
      'Rules: check for missing required fields, invalid or personal email addresses, contacts without an account, accounts without an owner and records untouched for 180 days. Match duplicate accounts on normalized domain, or on name without punctuation and suffixes such as Inc or Ltd; match duplicate contacts on exact email. Never merge or delete without my confirmation. Export the cleaned file and a merge map of losing to surviving IDs.',
      'Metrics: fill rate = valid non-empty values / records; quality score = 100 minus severity-weighted issues per record, averaged; duplicate rate = records in a duplicate group / records.',
      'Sample data: 600 accounts and 1,500 contacts with 7% duplicates, 20% missing fields and messy formatting.',
    ]),
  },
  {
    id: 'qbr-builder',
    title: 'QBR Builder',
    category: 'customer-success',
    summary: 'Assemble a quarterly business review per customer: goals, usage, value delivered and next steps.',
    dataInputs:
      'an account list and monthly usage and support numbers per account; goals and wins are entered in the app',
    icon: 'i-ph:presentation-chart',
    roles: ['cs'],
    tags: ['QBR', 'business review', 'value realization'],
    prompt: blueprintPrompt([
      'Build a QBR builder that assembles a quarterly business review for each customer account.',
      'Data: accounts (name, segment, ARR, CSM, renewal date), success goals (goal, measure, baseline, target, current value), monthly metrics per account (licensed seats, active users, key feature adoption %, support tickets) and action items (owner on our side or theirs, due date, status).',
      'Views: (1) account list of reviews due this quarter with their status, filtered by CSM and segment; (2) review editor for one account and quarter with sections for goals and progress, usage and adoption trends, support summary, value delivered, risks and next steps, where numbers fill in from the data and I add commentary; (3) printable presentation view of the finished review, one section per page.',
      'Rules: every chart states its period and compares it with the prior quarter. A goal is achieved, on track or at risk by its current value against target. A new review carries open action items forward from the last one. The presentation view hides internal notes.',
      'Metrics: seat utilization = active users / licensed seats; goal attainment = goals achieved or on track / goals; action items closed on time / action items due.',
      'Sample data: 20 fictional accounts with four quarters of monthly metrics, three goals each and two past reviews.',
    ]),
  },
  {
    id: 'onboarding-tracker',
    title: 'Customer Onboarding Tracker',
    category: 'customer-success',
    summary: 'Run every new customer through the same milestones and catch stalled onboardings early.',
    dataInputs: 'a list of new customers with segment, contract start date and owner; milestones come from a template',
    icon: 'i-ph:rocket-launch',
    roles: ['cs', 'leadership'],
    tags: ['onboarding', 'time to value', 'milestones'],
    prompt: blueprintPrompt([
      'Build a customer onboarding tracker that runs from kickoff to first value.',
      "Data: onboardings (customer, segment, onboarding manager, contract start date, target go-live date) and milestones from an editable template per segment (name, phase of kickoff, setup, integrations, training, go-live or first value, owner on our side or the customer's, due date as days after contract start, completed date, blocker note).",
      'Views: (1) portfolio table of active onboardings with phase, progress, projected go-live and health, filtered by manager and segment; (2) detail with the milestone checklist by phase, where I complete milestones, edit dates and record blockers; (3) summary of time to first value by segment and the phases where onboardings stall.',
      'Rules: health is green when nothing is overdue, amber when a milestone is up to 7 days overdue, red beyond that or while a blocker is open. Changing the contract start date shifts open due dates. Show overdue customer-owned milestones separately from ours.',
      'Metrics: progress = completed milestones / milestones; time to first value = days from contract start to the first value milestone, as a median by segment; on-time go-live rate = onboardings live by the target date / onboardings that have gone live.',
      'Sample data: 30 onboardings, 18 active, on templates of 12 to 20 milestones, a few stalled in integrations.',
    ]),
  },
  {
    id: 'board-gtm-metrics',
    title: 'Board GTM Metrics',
    category: 'leadership',
    summary: 'The board-deck numbers in one place: ARR bridge, NRR, GRR, CAC payback and magic number.',
    dataInputs: 'monthly ARR movements by customer, quarterly sales and marketing spend, and plan targets',
    icon: 'i-ph:presentation',
    roles: ['leadership', 'revops'],
    tags: ['ARR', 'retention', 'efficiency'],
    prompt: blueprintPrompt([
      'Build a board-level GTM metrics dashboard for a subscription business.',
      'Data: customers (segment, region, start month), monthly ARR movements per customer (new, expansion, contraction, churn), quarterly sales and marketing (S&M) spend, gross margin % and quarterly plan targets.',
      'Views: (1) summary cards for ending ARR, net new ARR, NRR, GRR, CAC payback and magic number, each against the prior quarter and plan; (2) ARR bridge by quarter from starting to ending ARR, each bar opening its customers; (3) plan against actual table with editable targets and comments. Filter by segment and region.',
      'Rules: keep ARR separate from bookings and recognized revenue; one-time fees are never ARR. Use my fiscal quarters. NRR and GRR cover the trailing 12 months, only for customers active at the start.',
      `Metrics: net new ARR = new + expansion - contraction - churn; ${NRR}; ${GRR}; magic number = net new ARR in the quarter / prior-quarter S&M spend; CAC payback months = prior-quarter S&M spend / (new-customer ARR added this quarter × gross margin) × 12.`,
      'Sample data: 36 months, 200 customers growing from 4M to 22M ARR, NRR near 108%, GRR near 89%, one weak quarter.',
    ]),
  },
  {
    id: 'territory-planner',
    title: 'Territory Planner',
    category: 'leadership',
    summary: "Balance accounts, potential and workload across reps before you assign next year's books.",
    dataInputs: 'an account list (owner, segment, region, potential, open pipeline) and a rep roster with quotas',
    icon: 'i-ph:map-trifold',
    roles: ['leadership', 'revops'],
    tags: ['territories', 'book of business', 'account assignment'],
    prompt: blueprintPrompt([
      'Build a territory planner that balances books of business across sales reps.',
      'Data: reps (name, segment, region, manager, annual quota, maximum number of accounts) and accounts (name, region, segment, current owner, customer or prospect, addressable potential, open pipeline, last touched date).',
      'Views: (1) balance summary with one row per rep: account count, total potential, open pipeline, quota and potential to quota ratio, highlighting reps furthest from the average, filtered by segment, region and manager; (2) account table where I reassign accounts singly or in bulk and the balance updates at once; (3) comparison of the current assignment with a saved draft, listing each account that moves with its old and new rep.',
      "Rules: warn when a rep exceeds their account maximum, an account with open pipeline changes owner, or an account sits outside its owner's segment or region. Nothing changes until I apply a draft. Export the draft as account, current owner and new owner.",
      'Metrics: territory equity = standard deviation of potential per rep / average potential per rep (lower is more even); potential to quota ratio = total potential / quota; share of potential in accounts not touched for 90 days.',
      'Sample data: 16 reps in three segments and 600 accounts with uneven potential, two overloaded reps and one new hire with a thin book.',
    ]),
  },
];

/**
 * Blueprints ordered for a role. First those curated for the role, led by
 * the role's own categories; then other blueprints from those categories;
 * then everything else. Catalog order is kept within each group, and with no
 * role the catalog order is returned as is.
 */
export function getBlueprintsForRole(role: GtmRoleId | ''): GtmBlueprint[] {
  const categories = getGtmRole(role)?.blueprintCategories;

  if (!role || !categories) {
    return [...GTM_BLUEPRINTS];
  }

  const rank = (blueprint: GtmBlueprint) => {
    const categoryIndex = categories.indexOf(blueprint.category);
    const categoryRank = categoryIndex === -1 ? categories.length : categoryIndex;

    if (blueprint.roles.includes(role)) {
      return categoryRank;
    }

    // Past every curated blueprint: same-category ones first, the rest last.
    return categories.length + 1 + (categoryIndex === -1 ? 1 : 0);
  };

  // Array.prototype.sort is stable, so equal ranks keep catalog order.
  return [...GTM_BLUEPRINTS].sort((a, b) => rank(a) - rank(b));
}
