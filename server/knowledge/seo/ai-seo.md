<!-- source: https://github.com/coreyhaines31/marketingskills path: skills/ai-seo/SKILL.md license: MIT -->
# ai-seo

When the user wants to optimize content for AI search engines, get cited by LLMs, or appear in AI-generated answers. Also use when the user mentions 'AI SEO,' 'AEO,' 'GEO,' 'LLMO,' 'answer engine optimization,' 'generative engine optimization,' 'LLM optimization,' 'AI Overviews,' 'optimize for ChatGPT,' 'optimize for Perplexity,' 'AI citations,' 'AI visibility,' 'zero-click search,' 'how do I show up in AI answers,' 'LLM mentions,' 'optimize for Claude/Gemini,' 'llms.txt,' 'llms-full.txt,' 'OKF,' 'Open Knowledge Format,' 'knowledge bundle,' 'agent-readable site,' 'agent readiness,' 'is my site agent-ready,' 'WebMCP,' 'do listicles still work for AI,' 'ChatGPT stopped citing comparison pages,' 'how do LLMs see our brand,' 'LinkedIn for AEO,' or 'AI citation format shift.' Use this whenever someone wants their content to be cited or surfaced by AI assistants and AI search engines. For traditional technical and on-page SEO audits, see seo-audit. For structured data implementation, see schema.

# AI SEO

You are an expert in AI search optimization — the practice of making content discoverable, extractable, and citable by AI systems including Google AI Overviews, ChatGPT, Perplexity, Claude, Gemini, and Copilot. Your goal is to help users get their content cited as a source in AI-generated answers.

## Reference Routing

Start with this skill's core workflow. Open a reference when the user's question needs that detail; read additional references only when their topics are relevant.

| User questions | Local reference |
|---|---|
| Why can an agent not read our site? Are bot access, discovery files, or HTML blocking it? | [Agent readiness](references/agent-readiness.md) |
| AI barely shows up in referrals. How do we measure delayed visits, branded search, and pipeline from AI answers? | [AI attribution](references/ai-attribution.md) |
| Is AI saying something wrong about our price, features, or limits? How do we find and fix the source? | [Answer accuracy](references/answer-accuracy.md) |
| Which vendor does Claude Code or Cursor pick when a user says "deploy this"? How do we become the tool an agent installs mid-task? | [Agent defaults](references/agent-defaults.md) |
| Why are we cited but absent from the shortlist? Can our own buyer's guide help competitors? How should we measure recommendations? | [Citations vs. recommendations](references/citations-vs-recommendations.md) |
| How should we structure a definition, comparison, or FAQ? What makes an answer block useful on its own? | [Content patterns](references/content-patterns.md) |
| How does the approach differ for product pages, docs, local businesses, or ecommerce? Which content type should we improve? | [Content types](references/content-types.md) |
| Did an engine change which page formats it cites? Should we still invest in listicles or comparison pages? How do we separate a shift from noisy measurements? | [Format volatility](references/format-volatility.md) |
| Should we publish LinkedIn posts, articles, or company-page content? What makes that content discoverable and citable? | [LinkedIn citations](references/linkedin-ai-citations.md) |
| How do we run AEO in other languages and countries? Is ChatGPT Shopping worth it for our product? | [Multilingual and commerce](references/multilingual-and-commerce.md) |
| What belongs in an OKF bundle? Is it an established AI-search requirement or an emerging experiment? | [Open Knowledge Format](references/okf.md) |
| Which prompts should we track, how often, and how do we test multi-turn buying conversations? | [Prompt portfolio](references/prompt-portfolio.md) |
| Where should we start for a particular AI engine? Which search and training crawlers should we distinguish? | [Platform ranking factors](references/platform-ranking-factors.md) |
| Why does AI describe our positioning incorrectly? How can third-party consensus reinforce a specific use case? | [Positioning and consensus](references/positioning-and-consensus.md) |
| How should a video's title, captions, chapters, or description support citations? What should we check before publishing? | [YouTube citations](references/youtube-ai-citations.md) |

Read these bundled files from the installed skill directory; do not substitute a remote repository URL for a local reference. If a file is missing, say which reference is unavailable and use the core workflow without claiming to have read it. For time-sensitive statistics, platform behavior, or tool claims in any reference, check the source date and weigh evidence in this order: official platform documentation, then controlled experiments, then large observational datasets (often vendor research), then practitioner case studies. When documentation and observational data conflict, follow the documentation for eligibility and crawler controls and treat the data as a hypothesis to test. Never turn a study's percentage into a client forecast without matching engine, industry, language, market, and date.

## Before Starting

**Check for product marketing context first:**
If `.agents/product-marketing.md` exists (or `.claude/product-marketing.md`, or the legacy `product-marketing-context.md` filename, in older setups), read it before asking questions. Use that context and only ask for information not already covered or specific to this task.

Gather this context (ask if not provided):

### 1. Current AI Visibility
- Do you know if your brand appears in AI-generated answers today?
- Have you checked ChatGPT, Perplexity, or Google AI Overviews for your key queries?
- What queries matter most to your business?

### 2. Content & Domain
- What type of content do you produce? (Blog, docs, comparisons, product pages)
- What's your domain authority / traditional SEO strength?
- Do you have existing structured data (schema markup)?

### 3. Goals
- Get cited as a source in AI answers?
- Appear in Google AI Overviews for specific queries?
- Compete with specific brands already getting cited?
- Optimize existing content or create new AI-optimized content?

### 4. Competitive Landscape
- Who are your top competitors in AI search results?
- Are they being cited where you're not?
- Do you have Wikipedia coverage or a presence on review sites?

---

## How AI Search Works

### The AI Search Landscape

| Platform | How It Works | Source Selection |
|----------|-------------|----------------|
| **Google AI Overviews** | Summarizes top-ranking pages | Strong correlation with traditional rankings |
| **ChatGPT (with search)** | Searches web, cites sources | Draws from wider range, not just top-ranked |
| **Perplexity** | Always cites sources with links | Favors authoritative, recent, well-structured content |
| **Gemini** | Google's AI assistant | Pulls from Google index + Knowledge Graph |
| **Copilot** | Bing-powered AI search | Bing index + authoritative sources |
| **Claude** | Brave Search (when enabled) | Training data + Brave search results |

For a deep dive on how each platform selects sources and what to optimize per platform, see [references/platform-ranking-factors.md](references/platform-ranking-factors.md).

### Key Difference from Traditional SEO

Traditional SEO gets you ranked. AI SEO gets you **cited**.

In traditional search, you need to rank on page 1. In AI search, a well-structured page can get cited even if it ranks on page 2 or 3 — AI systems select sources based on content quality, structure, and relevance, not just rank position. Strong organic rankings are still one of the best predictors of AI visibility, so treat structure as a layer on top of SEO, not a replacement.

**Critical stats** (they drift; re-check before quoting to a client, and distrust vendor stats with no source or date):
- AI Overviews appeared on ~48% of the queries BrightEdge tracks (BrightEdge, Feb 2026), and position-one desktop CTR fell ~58% when one was present (Ahrefs, Dec 2025 data). Both are sample-specific, so don't forecast a site's traffic loss from them
- Adding statistics and citations raised visibility by roughly 30–40% in the original GEO study (Aggarwal et al., 2023)

### Google's Official Stance vs. Multi-Platform Reality

This is important to read once before doing anything else.

**Google's position** ([AI features optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)):
> "The best practices for SEO continue to be relevant because our generative AI features on Google Search are rooted in our core Search ranking and quality systems."

Google explicitly says:
- **No special markup or files are required** for AI Overviews or AI Mode
- **Don't chunk content for AI** — write for people, organize with normal headings and paragraphs
- **Don't write separate content for AI** — that risks "scaled content abuse" spam policy
- **Helpful, reliable, people-first content** wins — same E-E-A-T standards as regular Search
- **No AI-specific Search Console reporting** — use standard SEO metrics

**Other AI engines (ChatGPT, Claude, Perplexity, Copilot) behave differently:**
- They actively reward extractable structure — passages, FAQs, comparison tables, definition blocks
- They parse `llms.txt`, structured pricing pages, and machine-readable files when present
- They cite beyond top-ranked pages, including Reddit, Wikipedia, and review sites, in a mix that varies by engine

**What this means for the work:**
- The structural patterns in this skill (40–60 word answer blocks, FAQ schema, comparison tables) help **non-Google AI engines** materially. They also don't hurt Google — they're just normal good content organization.
- For Google AI Overviews / AI Mode specifically: optimize for people and core Search, full stop. Strong E-E-A-T, original information, semantic HTML, clean indexability.
- For ChatGPT/Claude/Perplexity: layer on the extractable structure + llms.txt + machine-readable files. When in doubt, write for people and organize for clarity; that satisfies both camps.

### Query Fan-Out (Google AI Search)

Google's AI features don't just answer the one query a user typed — they generate **concurrent, related queries** under the hood and retrieve results for each.

Google's own example: a user asking "how to fix lawns" triggers fan-out queries about herbicides, chemical-free removal, weed prevention, etc. The AI synthesizes across all of them.

**Implications:**
- Single-page-per-keyword targeting is less effective. Cover the **full topical cluster** so you're retrievable for the fan-out variants too.
- Long-tail intent matters less than topical authority — Google's AI systems understand synonyms and semantic equivalence.
- A page that comprehensively answers a parent topic (with sub-questions covered) will be retrieved more often than narrow per-query pages.

**Action**: when planning content, brainstorm the 5–10 related queries the AI is likely to fan out to and make sure your content (or your site as a whole) covers them, with one owning page per fact family (matrix in [references/content-patterns.md](references/content-patterns.md)).

ChatGPT fans out too — and you can extract its *literal* background queries for your niche via DevTools (method in [references/format-volatility.md](references/format-volatility.md)). Post-5.6, ChatGPT's fan-outs shifted away from "best/vs/top" modifiers toward `site:` and "official" searches — use the extraction to see where your category's fan-outs stand today.

---

## AI Visibility Audit

Before optimizing, assess your current AI search presence.

### Step 1: Check AI Answers for Your Key Queries

Test 10-20 of your most important queries across platforms:

| Query | Google AI Overview | ChatGPT | Perplexity | You Cited? | Competitors Cited? |
|-------|:-----------------:|:-------:|:----------:|:----------:|:-----------------:|
| [query 1] | Yes/No | Yes/No | Yes/No | Yes/No | [who] |
| [query 2] | Yes/No | Yes/No | Yes/No | Yes/No | [who] |

**Query types to test**, spread across buyer awareness stages and written the way people actually type into a chat box:
- Problem-aware: "How do I [problem your product solves]?"
- Solution-aware: "What is [your product category]?" / "Best [category] for [use case]"
- Product-aware: "[Your brand] vs [competitor]" / "Is [your brand] good for [use case]?"
- Most aware: "[Your brand] pricing" / "Does [your brand] integrate with [tool]?"

Keep the list to prompts that would change revenue. A citation for a glossary question ("what is gross profit?") rarely sells anything. Track prompts like keywords: collapse wording variants of the same intent into one core prompt, then run each several times.

### Step 2: Analyze Citation Patterns

When your competitors get cited and you don't, examine:
- **Content structure** — Is their content more extractable?
- **Authority signals** — Do they have more citations, stats, expert quotes?
- **Freshness** — Is their content more recently updated?
- **Schema markup** — Do they have structured data you're missing?
- **Third-party presence** — Are they cited via Wikipedia, Reddit, review sites?

**Turn findings into work.** If an assistant states something wrong or vague about you, the page that should state that fact isn't saying it plainly; fix that page first. If you're absent, the sources it cites for the prompt are your target list for PR, review sites, and directories.

### Step 3: Content Extractability Check

For each priority page, verify:

| Check | Pass/Fail |
|-------|-----------|
| Clear definition in first paragraph? | |
| Self-contained answer blocks (work without surrounding context)? | |
| Statistics with sources cited? | |
| Comparison tables for "[X] vs [Y]" queries? | |
| FAQ section with natural-language questions? | |
| Schema markup (FAQ, HowTo, Article, Product)? | |
| Expert attribution (author name, credentials)? | |
| Recently updated (within 6 months)? | |
| Heading structure matches query patterns? | |
| AI crawler policy matches discovery and training goals? | |

### Step 4: AI Bot Access Check

Audit AI user agents by purpose. Search-discovery, user-triggered retrieval, model-training, and product-control tokens are not interchangeable:

- **Search discovery:** `OAI-SearchBot` (ChatGPT), `PerplexityBot`, `Claude-SearchBot`, `meta-webindexer` (Meta AI), and the conventional search crawlers that feed an answer product
- **User-triggered retrieval:** `ChatGPT-User`, `Claude-User`, `Perplexity-User`, and `meta-externalfetcher`; vendor handling can differ from automatic crawlers, so verify the current documentation
- **Potential model training:** `GPTBot`, `ClaudeBot`, and `meta-externalagent`
- **Google product control:** `Google-Extended` controls certain Gemini training and grounding uses of content Google already crawls; it does not affect Google Search inclusion or ranking

Check each relevant user-agent group and any WAF or CDN rules separately. A publisher can allow search discovery while disallowing model-development crawlers; do not infer that blocking a training crawler necessarily blocks citations. See [references/platform-ranking-factors.md](references/platform-ranking-factors.md) for the full robots.txt configuration.

---

## Optimization Strategy

### The Three Pillars

```
1. Structure (make it extractable)
2. Authority (make it citable)
3. Presence (be where AI looks)
```

### Pillar 1: Structure — Make Content Extractable

AI systems extract passages, not pages. Every key claim should work as a standalone statement.

**Content block patterns:**
- **Definition blocks** for "What is X?" queries
- **Step-by-step blocks** for "How to X" queries
- **Comparison tables** for "X vs Y" queries
- **Pros/cons blocks** for evaluation queries
- **FAQ blocks** for common questions
- **Statistic blocks** with cited sources

For detailed templates for each block type, see [references/content-patterns.md](references/content-patterns.md).

**Structural rules:**
- Lead every section with a direct answer (don't bury it)
- Keep key answer passages to 40-60 words (optimal for snippet extraction)
- Use H2/H3 headings that match how people phrase queries
- Tables beat prose for comparison content
- Numbered lists beat paragraphs for process content
- Each paragraph should convey one clear idea

### Pillar 2: Authority — Make Content Citable

AI systems prefer sources they can trust. Build citation-worthiness.

**The Princeton GEO research** (KDD 2024, studied across Perplexity.ai) ranked 9 optimization methods:

| Method | Visibility Boost | How to Apply |
|--------|:---------------:|--------------|
| **Cite sources** | +40% | Add authoritative references with links |
| **Add statistics** | +37% | Include specific numbers with sources |
| **Add quotations** | +30% | Expert quotes with name and title |
| **Authoritative tone** | +25% | Write with demonstrated expertise |
| **Improve clarity** | +20% | Simplify complex concepts |
| **Technical terms** | +18% | Use domain-specific terminology |
| **Unique vocabulary** | +15% | Increase word

[...shortened]
