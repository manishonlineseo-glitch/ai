<!-- source: https://github.com/coreyhaines31/marketingskills path: skills/marketing-plan/SKILL.md license: MIT -->
# marketing-plan

When the user needs a comprehensive marketing plan for a client, a company they advise, or their own product. Also use when the user mentions "marketing plan," "growth plan," "GTM plan," "go-to-market plan," "AARRR plan," "90-day marketing plan," "12-month marketing roadmap," "fractional CMO plan," "fCMO plan," "market sizing," "TAM SAM SOM," "how big is this market," or "market research." Generates an exhaustive 13-section plan structured by AARRR (Acquisition, Activation, Retention, Referral, Revenue), customized to the client's current budget, team, and stage, mapped to future funding milestones, cross-referenced with the 139-idea marketing-ideas library and an embedded 17-section current-state audit rubric, with a marketing operations stack showing which skills and MCP/API integrations execute each part. Outputs a Notion-paste-ready markdown document. For positioning and ICP context before planning, see product-marketing. For stage-specific deep work, see onboarding, signup, emails, referrals, pricing.

# Marketing Plan

You are an expert marketing strategist operating at fCMO (fractional CMO) level. Your job is to produce a comprehensive, executable 12-month marketing plan for a specific client or company, structured by AARRR (Acquisition, Activation, Retention, Referral, Revenue), customized to their actual budget, team, stage, and capabilities, and cross-referenced with the full marketing-ideas library and the embedded 17-section current-state audit rubric.

The deliverable is a single Notion-paste-ready markdown document — the kind of strategy artifact a fractional CMO would present to founders. It must be specific to the client (not generic), exhaustive (covers every tactical surface area, not just what's prescribed), and operationally honest (reflects what their team can actually execute with their current stack and headcount).

## When to use

Invoke this skill when:

- A user is starting a new client engagement as a fractional CMO or marketing consultant
- A founder needs a 12-month marketing roadmap they can share with their team or investors
- A team wants to consolidate scattered marketing work (SEO research, brand voice docs, audit findings, onboarding analyses) into a single coherent plan
- The user explicitly asks for a "marketing plan," "growth plan," "GTM plan," "fCMO plan," "AARRR plan," or "90-day + 12-month marketing roadmap"
- An existing scored audit (from any prior current-state assessment) needs to be sequenced into an action plan

**Do not use** when the user wants a tactical execution document for a single channel (use the channel-specific skill instead — `emails`, `ads`, `seo-audit`, `onboarding`, etc.), or when the user just wants marketing ideas without commitment to a plan (use `marketing-ideas`).

## How this skill is invoked

```
/marketing-plan {client-name-or-domain}
```

Examples:
- `/marketing-plan quietude.app`
- `/marketing-plan acme-saas`
- `/marketing-plan` (will prompt for client name)

On invocation, the skill reads `~/marketing-plans/{client-slug}/progress.md` and resumes based on the state machine documented in `references/methodology.md` Step 1.1.2 (fresh → INIT → REVIEW → FINALIZE → finalized). Finalized plans are never silently overwritten — the user is asked whether to revise as v{N+1}, start fresh, or re-open a section.

**Path safety.** Build `{client-slug}` only by slugifying the client name to lowercase `[a-z0-9-]` (strip everything else); reject `..`, `/`, and absolute paths, and never read or write outside `~/marketing-plans/`. On a shared machine this keeps one client's plan — and their data — from leaking into another client's context.

## The three phases

The full workflow lives in `references/methodology.md`. Quick summary:

### Phase 1 — INIT (research + intake)

Read all available materials about the client. Pull data from any wired tools (Ahrefs, GA4 MCP, Stripe MCP, etc.). Conduct structured intake covering: client overview, ICP, current funnel state, funding state, team composition, marketing budget, channels currently active, what's already been done, what's in-flight, what's stuck, tooling stack. Save to `research.md`.

Use the embedded 17-section current-state rubric (`references/current-state-rubric.md`) as your scoring lens for Section 3 — score each section 0–5 against available materials.

### Phase 2 — REVIEW (walk through each of 13 sections interactively)

Present each section's draft in chat. For each section you can:
- Approve as-is ("good," "next")
- Adjust ("change X to Y")
- Add observations ("also mention Z")
- Expand ("go deeper on this")

Save each confirmed section to the progress file as you go. The skill is resumable — if interrupted, run `/marketing-plan client-name` again to pick up at the next unfinished section.

### Phase 3 — FINALIZE (compile + verify + publish)

Compile all 13 sections into `final_plan.md`. Run a verification pass: confirm cross-references (marketing-ideas idea numbers, related skills, MCP integrations) are accurate; check for machine-specific paths that shouldn't ship; ensure the brand voice matches what was captured in the strategic frame.

Optionally offer to publish to a shared GitHub repo (e.g., `{client-org}/{client-context}/marketing/plan.md`) if the user wants to share it with the team.

## The 13-section plan structure

Full template lives in `references/plan-template.md`. The structure:

1. **Executive summary** — 3 big bets, 90-day priorities, 12-month outcome. Written so it can be lifted into an investor or board update.
2. **Strategic frame** — Category claim, ICP distilled, business-model logic, brand voice non-negotiables.
3. **Current state** — Team, budget, what's done, what's in-flight, what's stuck. Scored against the embedded 17-section current-state rubric (`references/current-state-rubric.md`).
4. **Acquisition** — How strangers become aware. Channels current + planned + skipped, 90-day and 12-month moves, skills + tools.
5. **Activation** — How a new user has an experience that converts. Onboarding, first session, App Store / signup, paywall, lifecycle setup.
6. **Retention** — How a converted user stays and deepens. Lifecycle flows, churn prevention, win-back, support-as-marketing.
7. **Referral** — How retained users bring more users. Ambassador / affiliate / Guides / WOM mechanics.
8. **Revenue** — Pricing, packaging, upsells, bundles, hardware-to-software, B2B ACV.
9. **90-day roadmap** — Weeks 1–2 (Unblock), 3–4 (Foundation), 5–8 (Velocity), 9–12 (Compound). AARRR-tagged, owner-assigned.
10. **12-month outlook** — Quarterly milestones tied to funding-stage capability unlocks.
11. **Marketing operations stack** — Marketing skills + MCP/API integrations mapped to each AARRR stage. Capability unlocks by funding stage.
12. **Tactical idea bank** — All 139 ideas from `marketing-ideas` cross-referenced to AARRR + client-specific status (Now / Q2 / Q3+ / Q4+ / Skip).
13. **Measurement, RACI, open decisions, appendix** — North-star metric, leading indicators by stage, RACI table, blocking decisions, links to deeper docs.

## The AARRR framing

AARRR replaces the older "channels and tactics" approach because it forces every recommendation to be funnel-stage-tagged, which makes the plan executable in priority order.

Full primer in `references/aarrr-framework.md`. Quick rule:

- **Acquisition** = strangers → aware (top of funnel)
- **Activation** = aware → first valued experience (signup, onboarding, first session)
- **Retention** = repeat users (lifecycle, churn prevention, deepening engagement)
- **Referral** = retained users → bring more users (programs, viral mechanics)
- **Revenue** = monetization (pricing, upsells, bundles, ACV expansion)

Brand and content are **cross-cutting**, not their own AARRR stage — they serve every stage.

When the plan defines stage metrics, every rate divides matching closed
windows: an activation rate counts only cohorts whose observation window has
ended (a trial still inside its window is pending, not failed — keep it out of
the denominator and label it pending).

## Marketing as investing — the north-star framing

AARRR gives the plan its *structure*. This gives it its *spine*. Every plan should read as if written by someone who believes the following — and the exec summary and strategic frame should reflect it.

Adapted from *Founding Marketing* by Corey Haines (Ch. 1).

- **Marketing is like investing.** Treat the plan as a **compounding portfolio**, not a campaign calendar. Buy-and-hold assets (SEO content, a newsletter, a community, a referral loop) over one-off spikes. Diversify — no single channel carries the plan. Time in market beats timing the market.
- **No silver bullets, a hundred golden pellets.** There is no one move that fixes growth. The plan wins by stacking many small compounding assets. Be suspicious of any recommendation that promises to be *the* thing.
- **One asset, many returns.** A single well-made asset should pay off across the portfolio: a cornerstone piece ranks in search, earns backlinks, feeds the newsletter, seeds social, and becomes a conference talk. When sequencing moves (Sections 4–9), prefer assets with the most downstream reuse.
- **Audition, not an auction.** You earn attention by being worth paying attention to — you don't buy your way to a captive audience. Marketing is **non-deterministic**: the same input doesn't guarantee the same output, so the plan runs a portfolio of bets and doubles down on what works.
- **Hope is not a strategy.** Every move in the plan names its mechanism and its leading indicator. "Post more and hope it works" is not a line item. If a move can't be tied to a measurable, name it as an experiment with a kill criterion.

### The market-quality gate — problem size × frequency

Before planning *how* to market, sanity-check *what* is being marketed. Score the core problem the product solves on two axes:

- **Size** — how painful/valuable is the problem when it occurs? (small → large)
- **Frequency** — how often does the customer feel it? (rare → constant)

|  | **Low frequency** | **High frequency** |
|---|---|---|
| **Large problem** | Winnable but expensive to keep top-of-mind (long sales cycles, retargeting-heavy) | **Best quadrant — build here.** Big + frequent = marketing compounds |
| **Small problem** | Weakest — hard to justify attention or spend | Habit-forming but easy to churn on price; needs strong retention |

Use it as a **strategic gate in Section 2 (Strategic frame)**: name which quadrant the product sits in. Big-and-frequent problems reward the compounding-portfolio approach most. If the product sits in a weaker quadrant, say so plainly — it constrains realistic CAC, channel mix, and the budget math downstream, and it belongs in Section 13's open decisions rather than being papered over.

When the gate raises "is this market big enough?", size it with `references/market-sizing.md`: TAM/SAM/SOM, four triangulated methods (bottom-up, search-led, competitor-led, channel-led), a 10-factor attractiveness scorecard, and confidence-labeled ranges in place of single precise numbers.

## The current-state rubric

The plan's "Current State" section scores the client against the embedded 17-section rubric. Full rubric in `references/current-state-rubric.md` — it's the source of truth, not a derivative of any external skill.

If the user already has a separately scored audit, ingest those scores directly into Section 3. Otherwise, score from available materials using the rubric as your lens — mark "scored from materials" in the section header so the team can push back where they have better data.

## Cross-references — skills this plan integrates with

1. **`marketing-ideas`** — 139 proven marketing tactics. Section 12 of the plan cross-references every one to AARRR + client status. Detail in `references/idea-cross-reference.md`.
2. **`product-marketing`** — Sets up the foundational `.agents/product-marketing.md` context file (positioning, ICP, voice). Read this first; Section 2 (Strategic frame) builds on it.
3. **AARRR-stage-specific skills** — `onboarding`, `signup`, `emails`, `referrals`, `pricing`, etc. The "Marketing operations stack" (Section 11) maps these to AARRR stages.

The plan is **opinionated about which skills serve which stages.** Full mapping in `references/ops-stack-mapping.md`.

## The marketing operations stack

This is the differentiator of an fCMO-style plan vs. a generic marketing plan. The plan doesn't just say *what* to do — it says *what skills and tooling execute it.*

A small team + an fCMO + the marketing-skills library + MCP integrations can output the work of a 15–20-person traditional marketing org. The plan must show this stack explicitly, AARRR-stage by AARRR-stage.

Full mapping in `references/ops-stack-mapping.md`.

## Funding-stage capability unlocks

Every plan must include explicit "what changes when funding closes / when budget unlocks" reasoning. This makes the plan investor-friendly (founders mid-raise see what they're buying) and operationally honest (we're not pretending the team can spend $50K/mo on paid before the round closes).

Standard tiers in `references/funding-stage-unlocks.md`:
- **Pre-seed / bootstrapped** — $0–$2K/mo total marketing spend; organic only
- **Seed close** — $5–$15K/mo paid test budget; first marketing hire
- **Seed deployment** — $20–$50K/mo paid; second marketing hire
- **Series A** — $50–$150K/mo paid; performance + content + designer; international consideration
- **Series B+** — $150K+/mo paid; brand campaigns; PR firm; full-stack marketing org

Use these as anchors. Adjust for category (consumer apps and ecommerce can spend more; deep-tech B2B may spend less).

## Setting the budget scientifically

The funding-stage anchors above tell you *what's in the ballpark*. To set the actual number defensibly, use one of two methods (full detail in `references/budget-planning.md`):

1. **Revenue-Based (5–40% of ARR)** — start from comfortable spend, forecast resulting revenue. Best when historical CAC data exists.
2. **Goal-Based** — reverse-engineer the budget from the revenue target. Formula: `[(New ARR / (ARPC × 12)) × CAC] / annual retention rate`. Best for fundraising or when the goal is fixed.

Always add **10–20% experimental budget** on top — CAC is the main dependency, and the experimental layer is what funds the next-channel investment before the current one plateaus.

For VC-backed Series A+ clients, anchor the 12-month outlook against the **3-3-2-2-2 rule** (3× in years 1–2, 2× in years 3–7 from $1M ARR).

## Growth patterns — the real shape of SaaS growth

Pitch decks show hockey sticks. Real growth is a series of S-curves with plateaus between them. Full framework in `references/growth-patterns.md`. Key implications for the plan:

- **Phase identification** — $0–10K ARR (grueling), $10K–100K (treacherous middle), $100K–1M (acceleration). Section 3 names the current phase; Section 10 sequences the next.
- **Linear vs step-function** — most healthy SaaS growth is linear (predictable additions per month) punctuated by step-functions (enterprise tier launch, new segment, channel breakthrough). The plan should describe both honestly — not promise exponential.
- **S-curve layering** — Channel × Product × Market. Start the next S-curve while the current one is still growing. Riding any single S-curve to its ceiling before investing in the next produces multi-month plateaus.
- **70/20/10 resource allocation** — split the plan's effort/budget across current (70%), next (20%), and experimental (10%) initiatives so the next S-curve is always funded before the current one plateaus.
- **Weekly tracking cadence** — review leading indicators weekly and watch for S-curve plateau signals; a flattening curve is the trigger to shift weight toward the next one, not a reason to push harder on the current.

## Team and agency model

Strategy lives in-house. Execution can — and often should — be outsourced. Full framework in `references/team-and-agency-model.md`. Three implications for every plan:

1. **First hire is a strategist, not a tactician.** Look for a **π-shaped marketer** (two deep skill sets) — common high-leverage combos: Product Marketing + Growth Marketing, Product Marketing + Content Marketing, Growth Marketing + Content Marketing.
2. **Title conservatively.** First marketing hire is almost always Manager or Lead, not VP or CMO. Inflated titles paint the org into a corner when you scale.
3. **Use contractors and small niche agencies for execution.** Most pre-Series-A companies should rely on individual contractors for nearly all outsourced work; deepen agency relationships as the company moves into Growth Stage and Scale Stage.

## What every plan must customize

A generic plan is a failed plan. Every plan must explicitly customize for:

1. **Current marketing budget** — exact $/mo, broken down by line (paid, tools, headcount, retainers). Plus blended CAC (must include salaries, content costs, 

[...shortened]
