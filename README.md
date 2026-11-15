# Fireworks

The AI app builder for go-to-market teams.

Describe the sales, marketing, RevOps or customer-success tool you need and Fireworks builds a working app for it: a pipeline review board, a commission calculator, a renewal tracker. It is for the people who run revenue (sales, SDR and BDR, marketing, RevOps, customer success, GTM leadership), not only for developers.

Fireworks is a fork of [bolt.diy](https://github.com/stackblitz-labs/bolt.diy), the open-source AI builder that runs a full development environment in the browser. Everything bolt.diy does still works. This fork adds a GTM layer on top and keeps that layer in its own files so upstream can be merged often.

## Contents

- [What Fireworks adds](#what-fireworks-adds)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Privacy and security](#privacy-and-security)
- [The Fireworks AI model provider](#the-fireworks-ai-model-provider)
- [Staying in sync with upstream](#staying-in-sync-with-upstream)
- [Available scripts](#available-scripts)
- [Licence](#licence)

## What Fireworks adds

- **GTM workspace.** Settings → GTM Workspace stores your role, company, what you sell, ICP, CRM, deal stages, segments, revenue model, sales motion, reporting currency, fiscal-year start and notes. Every field is optional. The details are added to the instructions sent with every chat and prompt-enhance request. The first-run dialog asks for role and CRM only.
- **Blueprints.** 22 app recipes in 6 categories (Sales, Prospecting, Marketing, RevOps, Customer Success, Leadership). Clicking one fills the message box. It does not send. Each card says which export to bring ("Works with: ...").
- **Role-aware examples.** 7 one-line example requests under the message box, chosen by the role in your workspace. Clicking one sends it straight away.
- **Data-file summaries.** Attach (Attach File in the message box menu), drop or paste a `.csv`, `.tsv` or `.json` file and a summary of its shape is added to your message. The file itself is not uploaded. Excel files are not read: export the sheet as CSV.
- **Data connectors.** Settings → Data connectors (MCP) lists vendor-hosted MCP servers. 12 can be added with a key (Zapier, Snowflake, Apollo, Airtable, Close, Intercom, Notion, PostHog, Mixpanel, Linear, Atlassian, Supabase). 15 need a vendor sign-in that this build does not support and are listed with a workaround: export a CSV and attach it (for Slack, paste the messages into your message).
- **GTM instructions.** Every chat request includes a GTM block, placed after the base build or discuss prompt: metric definitions (win rate, pipeline coverage, sales velocity, NRR, magic number), CRM stage and forecast defaults for Salesforce and HubSpot, standards for record, analytics and calculator apps, and rules for seed data and connected tools. The block tells the model to build non-GTM requests normally.
- **Prompt enhancer.** Enhance Prompt in the message box menu rewrites a short request into a first-version app spec: persona, entities, at most 3 views, 4 to 6 metrics with formulas, filters, seed data, CSV import and export.
- **Data-app starter.** An app request that names no framework starts from the `Vite Shadcn` starter (Vite, React, TypeScript, Tailwind, shadcn/ui). Naming a framework still selects that framework's starter. Solid, Remix and Expo are also sales words, so they count only when capitalised and used as a framework name ("with Solid", "a Remix site"). A request for a one-off script starts from a blank project.
- **Design palette.** Generated apps default to a light data-app palette. The Design Palette dialog has 4 presets, including a dark one.

What the build does not do:

- No vendor sign-in (OAuth) for connectors. Salesforce, HubSpot, Pipedrive, Attio, Outreach, Salesloft, Gong, ZoomInfo, Clay, Common Room, Zendesk, Slack, Asana, BigQuery and Amplitude are listed for reference only.
- No user accounts. See [Privacy and security](#privacy-and-security) before sharing one server between people.
- Attached data files are not written into the project. The model sees the summary. You load the file into the built app yourself.
- Connectors are used while building, to read your schema. Apps you build do not stay connected.

The rest is bolt.diy: an in-browser workbench (editor, terminal, diff view, live preview) on WebContainers, more than 20 model providers (OpenRouter, Anthropic, OpenAI and Google are enabled by default), Git import and push, ZIP export, deployment to Netlify and Vercel, push to GitHub and GitLab, Supabase integration and plugins. The in-app manual links to the [bolt.diy documentation](https://stackblitz-labs.github.io/bolt.diy/).

## Quick start

Prerequisites: Node.js 22.12.0 or later and pnpm 9.15.9 or later (`npm install -g pnpm`).

```bash
git clone https://github.com/avsha-onfire/fireworks.git
cd fireworks
pnpm install
pnpm run dev
```

Open [http://localhost:5173](http://localhost:5173). On first run a dialog takes you through 4 steps: profile, AI provider key, your team (role and CRM), appearance. Then:

1. Pick a blueprint, or type what you need in the message box.
2. Optional: attach a CRM export (`.csv`, `.tsv` or `.json`). Check the summary that appears in your message before you send.
3. Send. The builder is instructed to start with fictional sample data and a CSV import, so you can load your own file into the app once it runs.

### Docker

```bash
cp .env.example .env.local

# Development, with hot reload
docker compose --profile development up

# Production build
pnpm run dockerbuild:prod
docker compose --profile production up
```

Image and target names keep their upstream spelling (`bolt-ai`). Do not use `--profile prebuilt`: it pulls the upstream bolt.diy image, which has none of the changes in this fork.

### Desktop app

```bash
pnpm electron:build:dist
```

The app is named Fireworks. This repository publishes no installers, so build from source. The desktop updater checks this repository's GitHub releases.

`electron-builder.yml` still has upstream's `appId` (`com.stackblitz.bolt.diy`). The app identity is left for whoever distributes a desktop build to choose. Until it changes, a Fireworks build has the same macOS bundle id and Windows install key as an upstream bolt.diy desktop build, so the two are treated as one app on the same machine. Set your own `appId` before you distribute a desktop build.

## Configuration

### AI providers and keys

In the app: Settings → Cloud Providers or Local Providers. Keys entered there are saved in a cookie in your browser and sent to this server with each request.

On the server: copy `.env.example` to `.env.local` and set the providers you use.

```bash
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here

# Local providers
OLLAMA_API_BASE_URL=http://127.0.0.1:11434
LMSTUDIO_API_BASE_URL=http://127.0.0.1:1234
```

### Brand

`app/lib/brand.ts` is the single source of product identity: name, assistant name, tagline, landing headline and sub-headline, composer placeholder, repository and bug-report links, documentation link, upstream attribution and the prefix of exported file names. `pageTitle()` builds document titles and `providerDisplayName()` labels model providers.

Four files cannot import that module and are edited by hand when the name changes: `electron-builder.yml` (`productName` and the `publish` target), `electron-update.yml` (`owner` and `repo`), `pre-start.cjs` (the banner) and `package.json` (`description`). Comments in `.env.example` and `scripts/fork-footprint.sh` also name the product. Unit and e2e tests build the name from `BRAND`.

Internal identifiers keep their upstream `bolt` spelling on purpose: CSS tokens (`bolt-elements-*`), icons (`i-bolt:*`), `boltArtifact` and `boltAction` tags, storage and cookie keys, the package name and Docker image names. Renaming them would break merges and saved data. The desktop `appId` is also unchanged; see [Desktop app](#desktop-app).

### GTM modules

| File | Holds |
|---|---|
| `app/lib/gtm/workspace.ts` | Roles, CRMs with default stage examples and vocabulary, revenue models, sales motions, field limits, `sanitizeGtmWorkspace`, `formatGtmWorkspaceForPrompt` |
| `app/lib/stores/gtmWorkspace.ts` | The workspace store (localStorage key `gtm_workspace`) |
| `app/lib/gtm/prompt.ts` | The GTM instruction text (full and compact) and the prompt-enhancer guidance |
| `app/lib/.server/llm/prompt-gtm.ts` | Builds the GTM block for a chat request |
| `app/lib/.server/llm/starter-context.ts` | Replaces the stock shadcn/ui component bodies of the starter's own files with a list of file names in the text sent to the model. Projects you import are not collapsed |
| `app/lib/gtm/blueprints.ts` | The blueprint catalog and role ordering |
| `app/lib/gtm/example-prompts.ts` | Example requests, default and per role |
| `app/lib/gtm/starter-selection.ts` | Default starter, the starter's opening line, chat titles, handling of sales words that double as framework names ("solid", "expo", "remix", "script") |
| `app/lib/gtm/data-preview.ts`, `data-file-attach.ts`, `data-file-block.ts` | Data-file summaries: parsing, privacy rules, the attach handler, the fenced block |
| `app/lib/gtm/connectors.ts`, `connector-activation.ts` | The connector catalog and the add and remove flow |
| `app/components/gtm/` | Home sections, blueprint gallery, workspace form, workspace nudge |
| `app/components/@settings/tabs/gtm-workspace/` | The GTM Workspace settings tab |
| `app/types/design-scheme.ts` | Default palette and presets for generated apps |

The full instruction text is capped at 1,350 words and the compact variant at 280, because the system prompt is resent on every model step. The compact variant is used with the Tiny Tim prompt (Settings → Features → Prompt Library). Tests enforce both limits.

Connector endpoints, headers and scopes in `connectors.ts` were taken from each vendor's documentation on the date stored with the entry. No vendor endpoint was called while building the catalog, so treat a first connection as a test.

## Privacy and security

Fireworks has no user accounts and no server-side database. Chats are stored in your browser (IndexedDB). Read this section before you put real data in or share a deployment.

### What goes to the AI provider

Each chat request goes from your browser to this Fireworks server and on to the AI provider you select. It carries:

- Your messages, including any data-file summary in them.
- The system instructions, including the GTM block and your workspace details.
- Project files the builder reads or changes.
- Results of tools the model calls, including data returned by a connector. The instructions tell the model to read schemas, not records, and never to copy real names or contact details into generated files. That is an instruction to the model, not a technical control.

### Workspace details

The settings tab says:

> Fireworks adds these details to the instructions sent with every chat and prompt-enhance request. They are stored unencrypted in this browser, pass through this Fireworks server and go to the AI provider you select. Do not enter confidential or personal information.

"Show what is sent" on that tab prints the exact text. "Clear workspace" removes it from the browser and from future requests. Settings exports include the workspace.

### Data-file summaries

The file is read in your browser (the first 512 KB) and is not uploaded. A summary is added to your message, where you can read and edit it. The notice says:

> Added a summary of {file} to your message. The file itself was not uploaded. The summary has column names, types and a few example values such as stages, amounts and dates; names, e-mail addresses, phone numbers, links and free text are left out. Check it before you send: everything in the message goes to your AI provider.

Always in the summary:

- The file name (up to 80 characters) and every column name (up to 60 columns, 60 characters each).
- Row count, column count, delimiter and encoding notes.
- Per column: inferred type, fill rate, distinct count, and the format of numbers and dates.

Real values from the file appear only in these cases:

- Up to 3 example values for number, currency, percent and date columns.
- The value list of a category column (at most 12 distinct values), when the file has at least 20 data rows. Values that occur in at least 2 rows are listed; rarer ones are only counted, as in `(+2 rarer not shown)`.
- The spellings a yes/no column uses (`true/false`, `yes/no`, `y/n`, `1/0`).

Number and date examples appear only under a column name that does not look personal. Names such as owner, contact, name, email, phone, address, account, company or notes get no real values.

A category value list also needs a column name whose last word names an impersonal dimension, such as stage, status, source, region, segment, type, tier or industry. `Lead Source`, `Forecast Category`, `deal_stage` and `Region__c` qualify. Any other column name gets no value list, including team, territory, queue, group and names the rule does not know.

Everything else is described by shape: e-mail, phone and link columns get a placeholder such as `name@example.com`, and text columns and withheld category columns get a length range. E-mail addresses, links and phone numbers found in any emitted text are masked.

The header row is the first row of the file's usual width, or the line just before it when the records end with an extra delimiter or leave out a column the header names. A row that holds an e-mail address, phone number, link, number or date, or that has a value repeated in the same column below, is a record, not a header. A file without a header gets numbered columns.

Limits to know:

- Column names are sent as they are. A pivoted export whose column names are people or accounts will send those names. So will a header-less file whose first row is all text with no value repeated below it.
- The rules work on column names. A column of people's or company names under a qualifying name (a `Source` column that records who referred each deal, for example) can have its repeated values listed.
- A message that contains a summary, or is longer than 1,500 characters, is not saved to the `cachedPrompt` cookie. Shorter drafts are saved there for 30 days.

### Connector keys

The connector page says:

> Connector keys are saved unencrypted in this browser and are included in settings exports. They are sent to this Fireworks server, which keeps them in memory to call the vendor. This server has no user accounts: anyone who can open it can use the connectors configured on it and replace them. Add keys only on a server that you alone use, and use read-only, least-privilege keys.

In practice:

- The server holds one connector configuration for the whole process, not one per visitor. Do not share one server between people who must not share connectors.
- 4 of the 12 key-based entries are limited to reading by the connection itself (Close, Linear, PostHog, Supabase). For the other 8 the key decides what the connection can change, and the entry's note says so. Apollo accepts only a master key with full workspace access.
- When the server returns connector status to the browser, it masks header and environment values, the user name, password and query values of a server URL, and credentials in command arguments: values after `=`, the value after a flag named like a token, key, secret or password, `--header` values, URLs and `Bearer` tokens. The same values are masked in the connection errors it returns and logs. Its debug logs name the server only. A token in a URL path, in the command itself or in an argument without such a flag before it is not masked.
- Settings → Data Management → Export All Settings writes a JSON file that includes your API keys and connector keys. Treat the file as a secret.

### Environment variables

- Every `VITE_*` value is inlined into the JavaScript sent to each browser. Never put a secret that visitors must not have under a `VITE_` name. That includes the `VITE_*_ACCESS_TOKEN` variables in `.env.example`: set them only on a deployment you alone use.
- Starter templates are downloaded from GitHub by the server, as a branch archive where possible. The GitHub API is the other path, and it allows 60 unauthenticated requests an hour per IP address. On a shared deployment set `GITHUB_TOKEN` on the server so that path is not rate-limited.
- The server also uses `GITHUB_TOKEN` to answer GitHub requests (profile, repositories, branches) from visitors who have not connected their own account. Use a dedicated token that can only read public repositories, never a personal token with access to private ones.
- If the server cannot fetch a complete starter (a rate limit part-way through, for example), the request fails and the chat continues with a blank project instead of a partial one.

### Other outbound connections

- GitHub: starter templates come from public repositories in the `blueberry-llm` organisation (not vendored), and the plugin catalog comes from the bolt.diy community marketplace repository.
- StackBlitz: the WebContainer runtime that runs generated apps in your browser.
- Google Fonts and `cdn.simpleicons.org`: the interface font and some vendor icons.
- DuckDuckGo: the builder's web search tool, called from the server.
- Bug reports open an issue form on this repository. The server-side bug-report route is off unless `GITHUB_BUG_REPORT_TOKEN` is set.

## The Fireworks AI model provider

The provider list includes Fireworks AI, a model-hosting company. It is unrelated to this product and only shares the name. The model picker, the first-run dialog, Settings → Cloud Providers and the API key field show it as "Fireworks AI (model provider)". Its provider id and the `FIREWORKS_API_KEY` variable are unchanged.

## Staying in sync with upstream

bolt.diy moves fast, so the fork is built to merge often. New code lives in new files. An edit to an upstream file is a seam: an import plus the smallest call, element or line that does the job.

### Remotes

```bash
git remote add upstream https://github.com/stackblitz-labs/bolt.diy.git   # once per clone
git config merge.ours.driver true                                         # once per clone
```

`.gitattributes` marks `README.md` with `merge=ours`, so a merge keeps this README when upstream changes theirs. Git applies that only in a clone where the `ours` driver is defined, which is what the second command does. Without it a README change on both sides is an ordinary conflict.

### Merging

```bash
git fetch upstream
scripts/fork-footprint.sh        # lists the seams; "!" marks files upstream changed too
git merge upstream/main
pnpm install
pnpm run typecheck && pnpm run lint && pnpm test
```

`scripts/fork-footprint.sh` compares the merge base with your working tree using read-only git commands. It lists every upstream file the fork changed or deleted with line counts, every file added outside the fork's own paths, and a count of files inside them. Run it before each merge and after resolving conflicts. Its output is the current list. The table below explains that list by area.

Do not run `scripts/update.sh`. It is an upstream script that downloads the latest bolt.diy release and copies it over the project.

### Seams in upstream files

| Area | Files | Seam |
|---|---|---|
| Chat pipeline | `app/routes/api.chat.ts` | One import and one element at the start of the `system` array |
| | `app/lib/.server/llm/stream-text.ts` | One import and one line in `sanitizeText` |
| | `app/routes/api.enhancer.ts`, `app/lib/hooks/usePromptEnhancer.ts` | Instruction text from `app/lib/gtm/prompt.ts`; `gtmContext` in the request body |
| Home screen | `app/components/chat/BaseChat.tsx` | Headline from `BRAND`, `<GtmHomeSections />`, `setInput` prop, data-file guard in the file picker and paste handler, landing textarea height, model panel folded only when the selected provider has a saved key |
| | `app/components/chat/ChatBox.tsx` | Placeholder from `BRAND`, `setInput` prop, data-file guard in the drop handler, file-picker comment |
| | `app/components/chat/Chat.client.tsx` | `gtmContext` in the transport body, `setInput` passed down, prompt-cache guard, landing textarea height |
| | `app/components/chat/StarterTemplates.tsx`, `MCPTools.tsx` | One string each |
| Starter | `app/utils/selectStarterTemplate.ts` | Normalised message, chat title, default starter, starter opening line |
| | `app/routes/api.github-template.ts` | Archive first on Workers, no partial file lists |
| Settings | `app/components/@settings/core/{types.ts,constants.tsx,ControlPanel.tsx}` | `gtm-workspace` tab registration, connector tab label, attribution link |
| | `app/components/@settings/tabs/mcp/McpTab.tsx` | Renders `<McpCatalog />` |
| | `app/components/@settings/tabs/data/DataTab.tsx` | Export description |
| | `app/components/@settings/tabs/providers/cloud/CloudProvidersTab.tsx`, `app/components/chat/APIKeyManager.tsx` | `providerDisplayName()` on visible provider labels and toasts |
| | `app/components/onboarding/FirstRunOnboarding.tsx` | "Your team" step in place of the MCP JSON step |
| | `app/components/sidebar/Menu.client.tsx` | Listener that opens settings on a given tab |
| | `app/lib/services/importExportService.ts` | Workspace in export, import and reset |
| Connector secrets | `app/lib/services/mcpService.ts`, `app/routes/api.mcp-check.ts`, `app/routes/api.mcp-update-config.ts` | Redacted responses, server names only in debug logs, masked connection errors in error logs, security wrapper |
| Generated-app design | `app/types/design-scheme.ts`, `app/components/ui/ColorSchemeDialog.tsx` | Default palette, presets, preset row |
| Brand strings | Header, report-bug panel, chat and deploy alerts, model selector, terminal tab, documentation panel, several settings tabs, deploy dialogs, export file names, route `meta`, `api.bug-report.ts`, `api.system.git-info.ts` and a few service and store messages | One import of `BRAND` plus the string |
| Packaging | `electron-builder.yml`, `electron-update.yml`, `package.json` (`description`), `pre-start.cjs`, `.dockerignore`, 2 e2e tests | Product name, publish target, licence file shipped |
| Assets | `public/` icons and logo, `icons/logo.svg`, `assets/icons/` | Replaced. 7 unused upstream logo and preview images are deleted. |
| Docs | `README.md`, `.gitattributes`, `.env.example` | This file, the README merge rule, comments only |

Existing upstream specs that gained tests: `selectStarterTemplate.spec.ts`, `api.github-template.spec.ts`, `importExportService.spec.ts`.

Upstream prompt bodies under `app/lib/common/prompts/` are not edited. The GTM block overrides them from outside: identity, today's date, precedence over generic visual-design guidance and over "use Supabase by default".

## Available scripts

| Command | Description |
|---|---|
| `pnpm run dev` | Start the development server |
| `pnpm run build` | Build for production |
| `pnpm run preview` | Build, then serve the production build locally |
| `pnpm test` | Run unit and integration tests (Vitest) |
| `pnpm run typecheck` | Run TypeScript checks |
| `pnpm run lint` | Run ESLint on `app` |
| `pnpm run dockerbuild` | Build the development Docker image |
| `pnpm run dockerbuild:prod` | Build the production Docker image |
| `pnpm run electron:dev` | Start the desktop app in development mode |
| `pnpm electron:build:dist` | Build the desktop installers |
| `scripts/fork-footprint.sh` | List what the fork changes outside its own files |

## Licence

Fireworks is open source under the MIT License. It utilizes the [WebContainers API](https://webcontainers.io/enterprise), which has specific commercial licensing terms for enterprise deployment. [LICENSE](LICENSE) keeps the upstream copyright notice.

Based on bolt.diy (MIT): [github.com/stackblitz-labs/bolt.diy](https://github.com/stackblitz-labs/bolt.diy). bolt.diy was started by Cole Medin and is built by its community of contributors.
