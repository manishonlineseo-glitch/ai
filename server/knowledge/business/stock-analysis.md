<!-- source: https://github.com/alirezarezvani/claude-skills path: finance/skills/stock-analysis/SKILL.md license: MIT -->
# stock-analysis

Produce a rigorous, sector-relative, multi-factor fundamental analysis of a publicly listed company — Indian (NSE/BSE) or US/global. Use when the user asks to analyse, research, evaluate, or value a stock, ticker, or listed company; asks whether a business is fundamentally strong, cheap, or expensive; compares companies or benchmarks one against its sector; or mentions OPM, ROCE, ROE, ROIC, P/E, EV/EBITDA, free cash flow, NIM, GNPA, CASA, promoter holding or pledging. Use it for accounting-quality and forensic questions — "is the profit real", "why is profit rising but cash isn't", auditor qualifications, related-party concerns — which route to the forensic-only mode, and for IPOs and not-yet-listed companies — "should I apply to this IPO", DRHP/RHP or S-1 questions, price band, grey market premium — which route to the IPO mode. Use it even when the request sounds casual ("is Infosys any good?"). Do not use it for personalised investment advice, portfolio allocation, or trading signals.

# Stock Analysis

Produce an evidence-backed fundamental analysis of one company, benchmarked against the right peers, and delivered as a written report plus a sector-relative scorecard.

## The principle that governs everything here

**A financial metric carries no meaning until you know the sector it came from and the company's own history.**

If X earns a 20% operating margin and Y earns 30%, that tells you nothing about which is the better business. Y may be in software (where 30% is mediocre) and X in distribution (where 20% is exceptional). Y's 30% may need three times the capital to produce, so X earns a far higher return on the money invested. Y's margin may be eroding while X's compounds.

Two consequences shape this whole skill:

1. **Never rank companies on a single metric.** Every judgement combines profitability, returns on capital, cash conversion, balance sheet, growth durability, governance, and price.
2. **Compare like with like.** Benchmark against sector peers or against the company's own multi-year record — never a raw cross-industry number. For banks, insurers, REITs and miners the standard ratios are not merely less useful, they are *undefined or inverted*; those sectors need their own metric set entirely.

Read `references/05-returns-and-dupont.md` for why return on capital, not margin, is the metric that actually determines compounding.

## Non-negotiables

### Never invent a number

This is the failure mode that destroys the value of the whole analysis. A fabricated revenue figure or a hallucinated ROCE produces a confident, well-formatted, *useless* report — and the user may act on it.

- Every figure carries a **source and a period** ("FY25 annual report, consolidated, p.112" / "10-K FY2024, Item 8" / "Q3 FY26 quarterly results filing, BSE").
- If a number cannot be sourced, write `not available` and say what would be needed. An analysis with acknowledged gaps is far more valuable than one with invented precision.
- Cross-check headline figures (revenue, net profit, debt, cash) against a second source when possible — at least one of the two must be a primary document.
- **Every financial figure in the analysis must trace to a primary document** — annual report, 10-K/10-Q, quarterly results filing, concall transcript, investor presentation, DRHP/RHP, exchange filing, or rating rationale. Aggregator websites (screener.in, Yahoo Finance, Tikr, etc.) are navigation aids for locating documents and optional labelled cross-checks — they are never a source of record. The one exception is current share price and market cap, which are inherently sourced from exchange or finance websites and must carry an as-of date.
- State **consolidated vs standalone** explicitly — for any company with subsidiaries these differ materially, and mixing them silently invalidates every ratio.
- State **currency and units**. Indian filings use crore/lakh; US filings use millions/billions. Getting this wrong by 10x is a common and embarrassing error.
- Flag stale data. A price or multiple without an as-of date is not usable.

Detailed sourcing routes and a verification protocol: `references/01-data-sourcing.md`.

### Official records are the source — and they hold far more than the financial statements

Two failure modes hide behind a report that looks well-sourced. Guard against both.

**First: the source of record is the company's own filings — nothing else is.** Rank sources by how many hands the number has passed through, and cite only the primary one:

1. **Primary filings** — annual report / 10-K, exchange filings (NSE/BSE, SEC EDGAR), quarterly results, the offer document (DRHP/RHP/S-1), audited statements.
2. **Company-published secondary** — concall transcripts, investor presentations, earnings releases.
3. **Regulator / third-party primary** — SEBI/MCA/ROC records, credit-rating rationales, exchange shareholding and pledge data.

Third-party research notes, brokerage reports, news articles and data aggregators (screener.in, Tikr, Yahoo/Google Finance, trendlyne) are **navigation and cross-check aids only** — they exist to help you *locate* the filing and to flag an outlier worth investigating. An aggregator or news figure must never be the thing you cite; when it disagrees with the filing, the filing wins and the disagreement is itself a finding. The one standing exception is live share price and market cap, which carry an as-of date. If a figure exists only in an aggregator and cannot be traced to a filing, it is `not sourced` — say so.

**Second: a filing is not just its three financial statements.** Most of what actually decides an analysis is the **non-financial** disclosure wrapped around the numbers, and it must be read and used as a first-class input — not skimmed on the way to the P&L:

- the **business, strategy and risk-factor** sections — what is sold and to whom, the stated moat, and the risks management is legally obliged to admit;
- **MD&A** read across 3–5 years — growth decomposed into volume / price / mix, capacity, capex plans, order book, guidance, and the drift between what was promised and what was delivered;
- the **auditor's report, CARO annexure, Key Audit Matters and emphasis-of-matter** — the auditor's own map of where the numbers are fragile;
- **related-party transactions, contingent liabilities, litigation and capital commitments** — the commonest routes for value to leave a minority shareholder, and quantifiable in one sitting;
- **governance and ownership** — board and audit-committee composition and independence, promoter holding trend and pledge, remuneration versus profit, auditor tenure and any resignation, AGM voting dissent, ESOP dilution;
- **segment and operational data** — segment-level revenue, EBIT and capital employed (segment ROCE is usually the report's most surprising number), plus the sector KPIs — capacity utilisation, occupancy/ARPOB, ANDA filings, same-store growth, order-book conversion — that never appear in the income statement;
- **ESG/BRSR, secretarial audit (MR-3), and subsidiary (AOC-1) disclosures.**

`references/15-document-diligence.md` is the runbook for extracting all of this, with a time-boxed reading order. Treat it as part of the core workflow, not an optional deep-dive: an analysis built only on the income statement, balance sheet and cash flow has read perhaps a fifth of the official record and skipped the four-fifths where the moat, the governance and the landmines live.

### Analysis, not advice

Produce analysis, evidence, and a reasoned view of business quality and valuation. Do not produce personalised investment advice, position sizing for the user, or buy/sell instructions framed as recommendations for their money. State clearly that the output is research, not licensed financial advice, and that the user is responsible for their own decisions.

Presenting a bull case, a bear case, a valuation range, and what would falsify the thesis is genuinely useful and stays on the right side of this line. "You should buy 50 shares" does not.

### Show the reasoning and the uncertainty

Where an estimate is used (normalised earnings, maintenance capex, mid-cycle margins), say it is an estimate, give the assumption, and show what changes if the assumption is wrong. False precision — a target price to two decimals off a hand-waved growth rate — is worse than an honest range.

## Choose a depth mode

Match effort to what the user asked for. Announce which mode you are running so expectations are set.

| Mode | When | What it covers |
|---|---|---|
| **Screen** | "quick take", "is this worth looking at" | Stages 0–3 plus valuation sanity check. Kill criteria, headline quality metrics, obvious red flags. Short verdict. |
| **Standard** (default) | "analyse this stock" | All stages, moderate depth per stage, full scorecard and report. |
| **Deep dive** | "detailed", "thorough", "maximum depth", or a position the user intends to size | All stages at full depth, situation playbook, document-level diligence, forensic pass, scenario valuation, explicit bear case. |
| **Forensic** | "is the profit real", "are they cooking the books", "cash flow doesn't match profit", "check the accounting" | A different question entirely — *can these accounts bear weight?* Skips business quality, growth and valuation. Follow `references/18-forensic-mode.md`. |
| **IPO** | The company is **not yet trading** — an open or upcoming IPO, a filed DRHP/RHP, "should I apply to X's IPO" | No market price and no public track record, so own-history benchmarking and market-price valuation are both unavailable. Follow `references/19-ipo-mode.md`. |

## The workflow

If you are running **Forensic mode**, stop here and follow `references/18-forensic-mode.md` instead — it has its own stages (F0–F5) and its own verdict scale, because "can I trust these numbers?" is not answered by a shorter version of "is this a good investment?".

If the company is **not yet listed**, stop here and follow `references/19-ipo-mode.md` — stages I0–I7. The workflow below assumes a traded security with a price and a public reporting history, and an IPO has neither. Note the boundary: a company that has *already listed* within the last two years uses this workflow with the recent-IPO overlay in `references/13-situations.md` §8, not IPO mode.

Otherwise work through these stages in order. Later stages depend on earlier ones — classifying the sector before you compute ratios is what stops you applying the wrong metric set.

### Stage 0 — Establish identity

Pin down exactly what is being analysed before touching numbers:

- Company, exchange, ticker, ISIN. Resolve ambiguity (many names collide across exchanges).
- **Which security**: ordinary shares, dual-class/DVR line, ADR/GDR, or a holdco that owns the operating company. These trade at different prices and confer different rights.
- Reporting currency and fiscal year end (needed to align peers).
- Consolidated or standalone basis for the analysis (consolidated is almost always correct).
- Market cap, enterprise value, free float.

If any of these do not exist because the company has not begun trading, you are in IPO mode — go to `references/19-ipo-mode.md`.

### Stage 1 — Acquire data

Follow `references/01-data-sourcing.md`. This is a **document-first** workflow: obtain the raw company documents before extracting any numbers.

**Step 1a — Document acquisition.** Before touching any numbers, identify and obtain the following documents (or as many as are available):

- Latest annual report or 10-K (and ideally the prior 4 years)
- Last 4–8 quarterly results filings from the exchange
- Latest 2 concall / earnings-call transcripts
- Latest investor presentation
- Quarterly shareholding pattern filings (last 4–8 quarters)
- Latest credit rating rationale
- DRHP/RHP if listed within the last 3–4 years

Source these from the company's investor-relations page, NSE/BSE corporate filings, SEC EDGAR, or equivalent primary repositories. Aggregator websites (screener.in, Tikr, Yahoo Finance) may be used to *locate* these documents — for example, screener.in links to underlying annual reports and concall transcripts — but the aggregator page itself is not the document.

**Step 1b — Extract the financials.** From the documents obtained above, gather at minimum 5 years of income statement, balance sheet and cash flow; quarterly trend for the last 8 quarters; and the shareholding pattern. Every figure must cite the specific document and page/section it was extracted from.

**Step 1c — Extract the non-financial record too.** The financial statements are only part of what these documents contain, and often not the part that decides the analysis. From the *same official documents*, extract and carry forward — each with its document and page/section cite:

- **Business & strategy** — the business-overview and MD&A narrative: what is sold, to whom, the stated moat and strategy, capacity and utilisation, capex plans, order book / backlog.
- **Risk factors** — the management-admitted risks, diffed across years (a risk that silently disappears is a disclosure decision, not a solved problem).
- **Auditor's report, CARO, KAMs, emphasis-of-matter** — opinion type for standalone *and* consolidated, and the specific line items the auditor itself flagged as fragile.
- **Related-party transactions, contingent liabilities, litigation, capital commitments** — including year-end outstanding balances, not just the year's flows.
- **Governance & ownership** — board/audit-committee composition and independence, promoter holding trend and pledge %, remuneration versus PAT, auditor tenure/resignation, AGM voting dissent, ESOP dilution.
- **Segment & operational KPIs** — segment-level revenue / EBIT / capital employed, and the sector operating metrics that never reach the P&L.

Walk the **entire** annual report section by section — not just the financials, and not only the shortlist above. Almost every section carries something an investor should weigh (the strategy in the chairman's letter, the pay ratio in an annexure, a covenant in a borrowings note, the one live case in an otherwise-routine litigation schedule), so the rule is **consider all of it, then report selectively**: read comprehensively, extract what is material, and let the write-up stay focused — a section that is genuinely empty this year is recorded as "read — nothing material", never skipped unread. `references/15-document-diligence.md` gives both a **complete annual-report contents map** (§0) and the time-boxed reading order (§1) for when to prioritise what. This step is **mandatory in Standard and Deep-dive modes**; even in Screen mode, read at least the auditor's report/opinion, the CARO fraud/statutory-dues/default clauses, and the shareholding-and-pledge pattern before forming a view. An analysis that quotes ratios but never opened the auditor's report or the related-party note is not finished.

If a required document cannot be obtained, ask the user for it **by name** — not "can you give me more data" but "please upload the FY25 annual report PDF and the last two concall transcripts". If the user provides numbers from an aggregator instead of the document, note them as `aggregator-sourced, unverified` and flag the gap. Do not fill gaps with recalled figures; recalled financials are frequently wrong and always stale.

**Then run the recency gate before you analyse anything.** This is the most common way a well-built analysis turns out wrong: not bad arithmetic, but a conclusion drawn from data that was already superseded when it was written. Adversarial review of real reports found verdict-level failures caused by results, regulatory decisions and deal approvals that were public *days before* the analysis date and simply absent from it.

So establish explicitly, and state in the report:

- **What is the latest period the company has actually reported**, and has a quarter been published since the annual figures you are using? Search for results dated after your newest data point rather than assuming your source is current.
- **What has happened since that period end** — earnings releases, rating actions, regulatory or court decisions, M&A approvals, block deals, management changes, guidance updates.
- **Do any of these already trip the invalidation triggers you are about to write?** A trigger that has already fired is not a future risk; it is a present finding.

Record the answer as one line: *"Most recent period incorporated: Q1 FY27, published 11-Jul-2026; checked for events to 22-Jul-2026."* A reader cannot judge staleness you have not disclosed.

**Then verify the data before you compute on it.** Assemble what you gathered into an intake file and run `python scripts/verify_data.py <intake>.json` (see `references/21-data-integrity-tools.md`). It is the mechanical enforcement of the sourcing rules above: it catches figures with no source or period, cross-source disagreements (the check that stops a wrong 

[...shortened]
