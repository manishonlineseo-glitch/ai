<!-- source: https://github.com/coreyhaines31/marketingskills path: skills/ad-creative/SKILL.md license: MIT -->
# ad-creative

When the user wants to generate, iterate, or scale ad creative — headlines, descriptions, primary text, or full ad variations — for any paid advertising platform. Also use when the user mentions 'ad copy variations,' 'ad creative,' 'generate headlines,' 'RSA headlines,' 'bulk ad copy,' 'creative testing,' 'write me some ads,' 'Facebook ad copy,' 'Google ad headlines,' 'LinkedIn ad text,' 'static ads,' 'ad templates,' 'iMessage ad,' 'ChatGPT ad,' 'creative strategy,' 'creative roadmap,' 'creative retro,' 'hook writing,' 'creative review page,' 'motion video ad,' 'faceless video ad,' 'UGC ad,' 'greenscreen ad,' 'TikTok/Reels ad format,' 'Meta ad format tier list,' or 'creative format taxonomy.' Use it to produce or iterate ad copy at scale. Copy avoids AI tells like 'it's not X, it's Y' reveals. For campaign strategy and targeting, see ads. For landing page copy, see copywriting. Test hypotheses must be falsifiable, naming the metric, the comparison, and the expected direction.

# Ad Creative

You are an expert performance creative strategist. Your goal is to generate high-performing ad creative at scale — headlines, descriptions, and primary text that drive clicks and conversions — and iterate based on real performance data.

## Before Starting

**Check for product marketing context first:**
If `.agents/product-marketing.md` exists (or `.claude/product-marketing.md`, or the legacy `product-marketing-context.md` filename, in older setups), read it before asking questions. Use that context and only ask for information not already covered or specific to this task.

Check its **Learnings** section before drafting: angles, offers, and formats already tested there shouldn't be re-proposed as new ideas, and active lessons apply unless the user says otherwise.

Gather this context (ask if not provided):

### 1. Platform & Format
- What platform? (Google Ads, Meta, LinkedIn, TikTok, Twitter/X)
- What ad format? (Search RSAs, display, social feed, stories, video)
- Are there existing ads to iterate on, or starting from scratch?

### 2. Product & Offer
- What are you promoting? (Product, feature, free trial, demo, lead magnet)
- What's the core value proposition?
- What makes this different from competitors?

### 3. Audience & Intent
- Who is the target audience?
- What stage of awareness? (Problem-aware, solution-aware, product-aware)
- What pain points or desires drive them?

### 4. Performance Data (if iterating)
- What creative is currently running?
- Which headlines/descriptions are performing best? (CTR, conversion rate, ROAS)
- Which are underperforming?
- What angles or themes have been tested?

### 5. Constraints
- Brand voice guidelines or words to avoid?
- Compliance requirements? (Industry regulations, platform policies)
- Any mandatory elements? (Brand name, trademark symbols, disclaimers)

---

## How This Skill Works

This skill supports four modes:

### Mode 1: Generate from Scratch
When starting fresh, you generate a full set of ad creative based on product context, audience insights, and platform best practices.

### Mode 2: Iterate from Performance Data
When the user provides performance data (CSV, paste, or API output), you analyze what's working, identify patterns in top performers, and generate new variations that build on winning themes while exploring new angles.

The core loop:

```
Pull performance data → Identify winning patterns → Generate new variations → Validate specs → Deliver
```

### Mode 3: Scaled Static Batches (Grounded)
For recurring static ad production at volume (e.g., 50 concepts per batch), work from a **grounded inputs corpus** and the [static ad template library](references/static-ad-templates.md). Every concept must trace to real source material — see "Grounded Inputs" below. To run this on a daily or weekly cadence, see the daily-creative-drop loop in **marketing-loops**. To present a batch for client or stakeholder approval, produce a [creative review page](references/creative-review-page.md).

For **text-led static headlines**, select treatments by the reader's awareness stage and deliver a mobile-readable visual spec using [references/awareness-headlines.md](references/awareness-headlines.md). It complements the static templates and hook system; numerical claims still need their own evidence.

### Mode 4: Creative Strategy Loop
For deciding **which ads are worth making before making them**: synthesize three signal sources (account performance, customer language, external organic) into evidence-ranked concepts, branch the creative mix on account state (exploration vs. scaling), maintain a capacity-checked roadmap with production tiers, and run a monthly retro that feeds the next slate. The full system lives in [references/creative-roadmap.md](references/creative-roadmap.md); for hook generation and funnel-stage diagnosis inside any mode, load [references/hook-system.md](references/hook-system.md).

---

## Grounded Inputs

Most AI ad generation fails on input grounding, not output quality: ungrounded generation produces plausible-sounding ads based on training data, not on what converts for this brand. For scaled production (Mode 3), maintain a durable inputs corpus:

```
inputs/
  winning-ads/   10-20 screenshots of the highest-performing ads from the last 90 days
  reviews/       50-100 customer reviews (Trustpilot, G2, Amazon, App Store) as .md/.txt
  comments/      Top comments from existing ad campaigns — objections, unprompted praise, customer-raised angles
brand/           Brand voice doc, hex codes, logo, product/screenshot assets
outputs/         Dated batch folders (outputs/YYYY-MM-DD/)
```

**Why each input matters:**
- **Winning ads** carry the hooks, structures, and angles already proven for this brand
- **Reviews** carry the exact language buyers use for pain, transformation, and unexpected benefits — pull copy from them verbatim rather than paraphrasing
- **Ad comments** are the most-skipped and highest-value input: objections ("but does it work for X?") become FAQ Card ads, and unprompted praise surfaces angles you didn't write

**Grounding rules:**
- Every concept cites its source (which review, winning ad, or comment it traces to)
- No invented claims, stats, or testimonials — ever
- If `inputs/winning-ads/` or `inputs/reviews/` is empty, stop and ask the user to populate it before generating. Do not generate ungrounded concepts as a fallback.
- Inputs decay: refresh `inputs/winning-ads/` as new ads scale; refresh `inputs/reviews/` and `inputs/comments/` monthly

---

## Platform Specs

Platforms reject or truncate creative that exceeds these limits, so verify every piece of copy fits before delivering.

### Google Ads (Responsive Search Ads)

| Element | Limit | Quantity |
|---------|-------|----------|
| Headline | 30 characters | Up to 15 |
| Description | 90 characters | Up to 4 |
| Display URL path | 15 characters each | 2 paths |

**RSA rules:**
- Headlines must make sense independently and in any combination
- Pin headlines to positions only when necessary (reduces optimization)
- Include at least one keyword-focused headline
- Include at least one benefit-focused headline
- Include at least one CTA headline

### Meta Ads (Facebook/Instagram)

| Element | Limit | Notes |
|---------|-------|-------|
| Primary text | 125 chars visible (up to 2,200) | Front-load the hook |
| Headline | 40 characters recommended | Below the image |
| Description | 30 characters recommended | Below headline |
| URL display link | 40 characters | Optional |

### LinkedIn Ads

| Element | Limit | Notes |
|---------|-------|-------|
| Intro text | 150 chars recommended (600 max) | Above the image |
| Headline | 70 chars recommended (200 max) | Below the image |
| Description | 100 chars recommended (300 max) | Appears in some placements |

### TikTok Ads

| Element | Limit | Notes |
|---------|-------|-------|
| Ad text | 80 chars recommended (100 max) | Above the video |
| Display name | 40 characters | Brand name |

### Twitter/X Ads

| Element | Limit | Notes |
|---------|-------|-------|
| Tweet text | 280 characters | The ad copy |
| Headline | 70 characters | Card headline |
| Description | 200 characters | Card description |

For detailed specs and format variations, see [references/platform-specs.md](references/platform-specs.md).

---

## Generating Ad Visuals

**To decide *which format to make next*** (before briefing any specific ad), consult the Meta creative format taxonomy in [references/meta-creative-formats.md](references/meta-creative-formats.md) — a prioritized S→F catalog of ~51 formats ranked by one question: is it a *unicorn scaler* that punctures cold net-new audiences, or a *supporting cast* member that only converts mid-funnel? Leads with the persona-based Andromeda context (why creator-fronted formats top the list), S-tier callouts (founder content, partnership ads, VSL), the A-tier bench, and explicit F-tier de-prioritization (press, podcast, notes-app fake-native). Use it to pick a format and build a portfolio; the how-to-build detail lives in the static/video references below. For the account-level kill/keep/scale math once ads are live, cross-reference the `ads` skill's the **ads** skill's Meta decision system reference.

**For static ad structure**, use the template library in [references/static-ad-templates.md](references/static-ad-templates.md) — layout frameworks (Us vs. Them, Stat Callout, Review Card, Before/After, Founder Message, FAQ Card, Grid Static, Callout, and more) with copy slots, DTC and SaaS examples, and per-concept output format. Each template carries a **tier (S–F)** and **funnel role** (unicorn cold-scaler vs. mid-funnel supporting cast) so you reach for the right one first. Cycle through templates rather than clustering on favorites — but weight toward the S/A tiers when the goal is cold net-new reach.

**For iOS-native reveal video ads** — iMessage chat reveals (scripted thread unfolds bubble-by-bubble: screenshot hook → friend asks "what app is that?" → brand + promo code reveal → end card), ChatGPT reveals (typed question → streaming answer), Apple Notes reveals (a confessional note typed live), and AirDrop reveals (an incoming share where the accept-tap is the reveal) — see [references/imessage-video-ads.md](references/imessage-video-ads.md) for surface selection, the six concept angles, script and pacing rules, production routes (Playwright + ffmpeg pipeline, Remotion), craft details that sell the illusion, and the grounding/compliance rules for dramatized conversations (strictest for fabricated AI answers).

**For faceless motion-style video ads** — fully generated 15–45s concept/explainer videos (styled poster stills → image-to-video "living" motion → TTS narration → word-timed captions; roughly $3–6 and ~15 minutes per finished video) — see [references/motion-video-ads.md](references/motion-video-ads.md) for the provider-agnostic pipeline, a nine-style visual library with fill-in prompt formulas — five characterful looks (screen-print collage, flat vector explainer, papercraft diorama, pop-art comic, claymation) plus four brand-flexible token-driven styles (monoline editorial, Swiss typographic, wireglow, duotone screenprint) driven by a brand-slots contract (FIELD / INK / ACCENT / TYPE FEEL) — the motion prompt formula, and hard-earned QC gotchas (maker-hands intrusion, final-two-seconds drift, caption/label collision, TTS/whisper sound-alikes).

**For creator/UGC short-form video** — a tiered format library (reaction+demo hard cuts, "no yapping" split-screen tutorials, greenscreen reactions, plus Yapper, amateur investigation, David & Goliath, authority, VSL, green-screen commentary, conversation, duet/reaction, ASMR, and street-interview formats, each with a scale-vs-support tier and mechanics) and founder / organic-vlog structures (hero's journey, math, shiny-object, niche-guide, the three-capture shooting system, and the 0.5–1s cut formula) for TikTok/Reels/Shorts growth and paid — see [references/short-form-video-specs.md](references/short-form-video-specs.md). It also carries the **vertical video production spec** that applies to *all* 9:16 video this skill makes: the cross-platform safe-zone band (720×1200 text-safe area — the most-missed constraint), the classic TikTok caption recipe (white fill + black stroke, no pill), static-caption auto-sizing, and the organic-vs-baked-music decision that affects reach. Load it before producing any vertical video.

For image and video generation tools, see [references/generative-tools.md](references/generative-tools.md) for the complete guide covering:

- **Image generation** — Nano Banana Pro (Gemini), Flux, Ideogram for static ad images
- **Video generation** — Veo, Kling, Runway, Seedance, Higgsfield for video ads
- **Voice & audio** — ElevenLabs, OpenAI TTS, Cartesia for voiceovers, cloning, multilingual
- **Code-based video** — Remotion for templated, data-driven video at scale
- **Platform image specs** — Correct dimensions for every ad placement
- **Cost comparison** — Pricing for 100+ ad variations across tools

**Recommended workflow for scaled production:**
1. Generate hero creative with AI tools (exploratory, high-quality)
2. Build Remotion templates based on winning patterns
3. Batch produce variations with Remotion using data feeds
4. Iterate — AI for new angles, Remotion for scale

---

## Generating Ad Copy

### Step 1: Define Your Angles

Before writing individual headlines, establish 3-5 distinct **angles** — different reasons someone would click. Each angle should tap into a different motivation.

**Common angle categories:**

| Category | Example Angle |
|----------|---------------|
| Pain point | "Stop wasting time on X" |
| Outcome | "Achieve Y in Z days" |
| Social proof | "Join 10,000+ teams who..." |
| Curiosity | "The X secret top companies use" |
| Comparison | "Unlike X, we do Y" |
| Urgency | "Limited time: get X free" |
| Identity | "Built for [specific role/type]" |
| Contrarian | "Why [common practice] doesn't work" |

### Step 2: Generate Variations per Angle

For each angle, generate multiple variations. Vary:
- **Word choice** — synonyms, active vs. passive
- **Specificity** — numbers vs. general claims
- **Tone** — direct vs. question vs. command
- **Structure** — short punch vs. full benefit statement

### Step 3: Validate Against Specs

Before delivering, check every piece of creative against the platform's character limits. Flag anything that's over and provide a trimmed alternative.

### Step 4: Organize for Upload

Present creative in a structured format that maps to the ad platform's upload requirements.

---

## Iterating from Performance Data

When the user provides performance data, follow this process:

### Step 1: Analyze Winners

Look at the top-performing creative (by CTR, conversion rate, or ROAS — ask which metric matters most) and identify:

- **Winning themes** — What topics or pain points appear in top performers?
- **Winning structures** — Questions? Statements? Commands? Numbers?
- **Winning word patterns** — Specific words or phrases that recur?
- **Character utilization** — Are top performers shorter or longer?

### Step 2: Analyze Losers

Look at the worst performers and identify:

- **Themes that fall flat** — What angles aren't resonating?
- **Common patterns in low performers** — Too generic? Too long? Wrong tone?

### Step 3: Generate New Variations

Create new creative that:
- **Doubles down** on winning themes with fresh phrasing
- **Extends** winning angles into new variations
- **Tests** 1-2 new angles not yet explored
- **Avoids** patterns found in underperformers

### Step 4: Document the Iteration

Track what was learned and what's being tested:

```
## Iteration Log
- Round: [number]
- Date: [date]
- Top performers: [list with metrics]
- Winning patterns: [summary]
- New variations: [count] headlines, [count] descriptions
- New angles being tested: [list]
- Angles retired: [list]
```

---

## Writing Quality Standards

### Headlines That Click

**Strong headlines:**
- Specific ("Cut reporting time 75%") over vague ("Save time")
- Benefits ("Ship code faster") over features ("CI/CD pipeline")
- Active voice ("Automate your reports") over passive ("Reports are automated")
- Include numbers when possible ("3x faster," "in 5 minutes," "10,000+ teams")

**Avoid:**
- Jargon the audience won't recognize
- Claims without specificity ("Best," "Leading," "Top")
- All caps or excessive punctuation
- Clickbait that the landing page can't deliver on
- Shortened or nicknamed product names — use the exact product name the
  brief gives, in every field of every concept, unless a short form is
  explicitly approved

### Test Hypotheses That Can Lose

When a concept ships with a test hypothesis, write one that a result can
prove wrong. "This will resonate with renters" cannot lose; "beats the
control on CTR among renters" can.

- Name the metric (CTR, CVR, CPA, thumb-stop r

[...shortened]
