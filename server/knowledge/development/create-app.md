<!-- source: https://github.com/wondelai/skills path: create-app/SKILL.md license: MIT -->
# create-app

Guided journey from a raw app idea to a validated, cleanly architected first version that ships on a sustainable cadence. Orchestrates ten skills phase by phase - lean-startup, design-sprint, clean-architecture, domain-driven-design, clean-code, pragmatic-programmer, system-design, ios-hig-design, 37signals-way, software-design-philosophy - asking the user questions at every decision point and recording results in the project docs/ folder (PRODUCT.md, ARCHITECTURE.md, EXPERIMENTS.md, CREATE-APP-PLAN.md) so the journey resumes across sessions. Use when the user wants to build a new app, validate an idea before writing code, architect an MVP that will not need a rewrite, or says ''help me build my app the right way''. App already exists: use improve-app or grow-app. Business idea not yet validated: run create-business first. Marketing site only: use create-website. Architecture-only question: design-code-architecture. For one framework in isolation, invoke that skill directly.

# Create an App

Take a raw app idea to a validated, cleanly architected first version that ships on a sustainable cadence — without over-building for scale you have not earned, or writing a prototype that calcifies into a rewrite. This journey runs ten phases: it asks before every decision and records each choice in `docs/` so you can stop and resume across sessions. The early phases often produce no code at all; once an experiment greenlights building, the engineering phases build the real thing well.

## Core Principle

**Validate fast while keeping options open: make the expensive-to-reverse decisions early and defer everything cheap.** Spend scarce early effort on the few things that compound — the riskiest assumption, the dependency boundaries, the domain language — and aggressively avoid waste everywhere else.

This skill sequences the phases, asks the questions, and records the decisions; the constituent skills carry the method. Invoke them rather than improvising their frameworks.

## Journey Map

| Phase | Skill | Question it answers | Artifact |
|---|---|---|---|
| 1 | lean-startup | Is the riskiest assumption true, and what is the MVP? | Creates docs/PRODUCT.md + docs/EXPERIMENTS.md |
| 2 | design-sprint | What should the core flow be? | Creates docs/DESIGN.md, extends docs/EXPERIMENTS.md — awaiting-evidence |
| 3 | clean-architecture | What boundaries keep options open? | Creates docs/ARCHITECTURE.md |
| 4 | domain-driven-design | What does the code mean? | Extends docs/ARCHITECTURE.md |
| 5 | clean-code | Is each function readable and tested? | Creates docs/TESTING.md |
| 6 | pragmatic-programmer | Which habits keep it healthy? | Extends docs/TESTING.md + docs/TECH-DEBT.md |
| 7 | system-design | How big must it really be? | Extends docs/ARCHITECTURE.md |
| 8 | ios-hig-design | Does it feel native on iOS? | Extends docs/DESIGN.md — iOS only |
| 9 | 37signals-way | What ships, and what is cut? | Extends docs/PRODUCT.md + docs/STRATEGY.md |
| 10 | software-design-philosophy | Where is complexity hiding? | Extends docs/TECH-DEBT.md + docs/ARCHITECTURE.md |

## Operating Rules

1. **Resume first.** Before anything else, read `docs/CREATE-APP-PLAN.md` and every artifact in the Journey Map. If the tracker exists, summarize the journey state in 3-5 lines and ask which phase to enter. Done when the user has confirmed an entry point. A journey with a tracker is resumed, never restarted.
2. **Intake on first run only.** No tracker: run the Intake below, then create `docs/CREATE-APP-PLAN.md` with every phase statused `pending | in-progress | awaiting-evidence | done | deferred: reason | skipped: reason`. Done when the tracker exists and the user has confirmed the phase plan.
3. **Phase entry.** Announce: what the phase does, the decision it forces, the artifact it produces, rough effort. Offer proceed / skip / defer — phases marked GATE may be deferred, never skipped. Mark the phase `in-progress` on proceed. Done when the user chose.
4. **Skill invocation and fallback.** Load the phase's skill and use it: each phase's Invoke line names the skill by slug — use that skill to run the phase. If it is not available, offer: `npx skills add wondelai/skills/<slug> --global`. If the user declines, run the phase from its Brief — the minimum viable method. State which mode you are in.
5. **In-phase decisions.** Ask every question under "Decide with the user" — with concrete options and your recommendation. Record the choice in the tracker's Key Decisions. A decision made silently is a defect.
6. **Phase exit.** Present the draft artifact content for sign-off before writing. On approval: write or extend the docs/ files, update the tracker (status, Key Decisions, Next Actions). Done when the files are written and the phase row shows `done`.
7. **Artifact discipline.** Read before writing; create a file only if missing, otherwise extend — add or update your sections, preserve everyone else's. Files are UPPERCASE in `docs/`. Every recommendation lands as a checkbox or a table row with owner and priority. See [references/artifact-templates.md](references/artifact-templates.md) when creating a docs/ file for the first time — create it from the full skeleton (all section headings), then fill the sections your phase names.
8. **The agent prepares and processes; only the human talks to customers and test users.** Draft sprint scripts and interview guides and score the results, then pause with status `awaiting-evidence` until the user returns with notes. The ios-hig-design phase applies only when shipping a native iOS app; skip it otherwise at intake.

## Intake

Ask these before creating the tracker:

1. What is the app idea in one sentence, and what is the riskiest belief behind it? (Gates Phase 1; if the job the app is hired for is fuzzy, add the jobs-to-be-done optional phase.)
2. Is the underlying idea already validated with behavioral evidence, or still a hunch? (Unvalidated and high-stakes makes Phase 1 mandatory; if paying customers already exist you may be in the wrong journey — improve-app or grow-app.)
3. What is the stage — weekend prototype, funded build toward launch, or a team forming around it? (A prototype leans on Phases 1-3 and 10; a forming team may add inspired-product.)
4. Will you ship a native iOS client? (Yes keeps Phase 8; no skips it.)
5. Do you have customers to talk to, or must you find them? (Gates the human evidence loop in Phases 1-2 and optional mom-test / continuous-discovery.)
6. What load do you expect in the first months — daily active users and actions per day? (Feeds Phase 7 capacity math and stops premature scaling.)
7. Solo build or team, and who owns shipping cadence? (Gates Phase 9 shaping.)

Phase-skip heuristics: skip Phase 2 when the core flow is already tested or trivial; skip Phase 8 unless shipping native iOS; skip Phase 7 only when load is obviously tiny — but still record the estimate; for a weekend prototype, run Phases 3-6 as one pass but never skip the Dependency Rule.

Then create `docs/CREATE-APP-PLAN.md` from the template with every phase statused, marking Phase 8 iOS-conditional. Done when `docs/CREATE-APP-PLAN.md` exists with every phase statused and the user has confirmed the plan.

## Phases

### Phase 1 — Validate the riskiest assumption (lean-startup)

**Purpose:** Prove the belief that would kill the app if false — before writing production code.

**Brief (fallback):** Plan Build-Measure-Learn backward: what must you learn, how will you know, what is the smallest build that finds out. Rank leap-of-faith assumptions by what is fatal, not what is easy to test. An MVP is a learning vehicle, often crude (Dropbox validated with a video, not a sync engine). Climb the validation ladder — signups weak, paid deposit strong, active usage strongest; aim for behavioral level 4-5, never "would you use this?" opinion.

**Invoke:** Use the `lean-startup` skill with the idea and, if CUSTOMER.md exists, the job statement. Ask for ranked leap-of-faith assumptions, the single smallest experiment that falsifies the riskiest, and a pre-committed behavioral success threshold.

**Decide with the user:** Which assumption is fatal if false? Which experiment type — smoke test (demand), concierge (value), Wizard of Oz (automation)? What go/pivot threshold, fixed before running? Only the user runs it with real people; then pause `awaiting-evidence`.

**Artifact:** Create docs/PRODUCT.md with `## Vision` and `## MVP Definition`; create docs/EXPERIMENTS.md with `## Experiment Cards` (EXP-001 with hypothesis, metric, decision rule) and `## Experiment Backlog`. Update the tracker.

**Done when:** the fatal assumption is named, EXP-001 has a pre-committed threshold, PRODUCT.md states the MVP scope, and the user has the experiment to run.

### Phase 2 — De-risk the core experience (design-sprint)

**Purpose:** Settle what the core flow should be with a tested facade, before committing engineering time.

**Brief (fallback):** Five days: Map the problem Monday, Sketch Tuesday, Decide Wednesday, Prototype Thursday, Test with five real users Friday. Output is a high-fidelity facade plus evidence, not code. The riskiest moment is a stranger's first ten minutes — test whether they understand it and finish the core task with no explanation. Five users surface the patterns; you need patterns, not significance. Never explain the prototype; watch where they get stuck.

**Invoke:** Use the `design-sprint` skill with the MVP scope from PRODUCT.md. Ask for a Monday map and How Might We reframes, a winning concept storyboard, and a five-act interview script with a note-taking grid (checkmark / cross / tilde per participant). Record the approved script under the sprint card in docs/EXPERIMENTS.md when pausing, so it survives the session break.

**Decide with the user (on return):** Does the tested flow work as-is, need a reshape, or expose a demand problem that loops back to Phase 1? Which confusions become fixes?

**Artifact:** Create docs/DESIGN.md with `## Design Direction`; extend docs/EXPERIMENTS.md `## Experiment Cards` with the sprint test and its verdict. Update the tracker.

**Done when:** DESIGN.md records the direction, the sprint result and verdict are in EXPERIMENTS.md, and the user chose proceed / reshape / loop.

### Phase 3 — Draw the boundaries (clean-architecture)

**Purpose:** Isolate business rules so the database, framework, and providers stay swappable details.

**Brief (fallback):** Source code dependencies point inward — frameworks toward use cases toward entities. Business rules must not import the framework or ORM. Use cases define interfaces (e.g. InvoiceRepository); infrastructure implements them; controllers translate an HTTP request into a plain request object and receive a plain response — no framework type crosses the boundary. Diagnostic: can you test the business rules with no database, web server, or framework running? Four circles are typical, not sacred — draw boundaries only at points of volatility.

**Invoke:** Use the `clean-architecture` skill with the validated MVP scope from PRODUCT.md. Ask for the layer map, the core use case with its request/response models, and the repository interfaces it depends on.

**Decide with the user:** Where are the real volatility boundaries (database, third-party APIs, delivery mechanism)? Full four layers, or collapse adapters and frameworks for a small app?

**Artifact:** Create docs/ARCHITECTURE.md with `## System Context` and `## Layer Map & Dependency Rule` (layers, what depends on what, a violations table). Update the tracker.

**Done when:** ARCHITECTURE.md names the layers, the Dependency Rule direction is explicit, and the core business rule is testable with no infrastructure.

### Phase 4 — Model the domain (domain-driven-design)

**Purpose:** Make the code speak the business so a domain expert could read it and spot what is wrong.

**Brief (fallback):** The model is the code. Build a Ubiquitous Language — name things after domain concepts, not technical roles (an `InvoiceDraft.finalize()` beats a `DataProcessor.process()`); hard-to-name is a design signal. Bounded contexts: a word means one thing inside a boundary ("Customer" in billing need not equal "Customer" in support). Aggregates: a cluster with one root that enforces invariants — keep them small, reference other aggregates by ID. Avoid the anemic model; push behavior into entities and value objects.

**Invoke:** Use the `domain-driven-design` skill with ARCHITECTURE.md's layer map. Ask for the ubiquitous language, the bounded contexts and context map, and the core aggregate with the invariants its root enforces.

**Decide with the user:** What is the core domain (your competitive edge) versus generic subdomains (auth, email, payments) to buy or use open source? Where does the same word legitimately mean different things across contexts?

**Artifact:** Extend docs/ARCHITECTURE.md: add `## Bounded Contexts & Context Map` and `## Domain Glossary (Ubiquitous Language)` (term | meaning | code name). Update the tracker.

**Done when:** the glossary names the core concepts, contexts and relationships are mapped, and the repository interface sits in the domain layer per Phase 3.

### Phase 5 — Write code to be read (clean-code)

**Purpose:** Keep every function readable and tested as the codebase grows.

**Brief (fallback):** Code is read far more than written. Small functions that do one thing at a single level of abstraction; intention-revealing names; no flag arguments (a smell — the function does two things); commands separate from queries; a well-named extracted function beats a comment. Tests are first-class — dirty tests are worse than none. Write them F.I.R.S.T. (Fast, Independent, Repeatable, Self-validating, Timely) with behavior-based names like shouldRejectNegativeTotal.

**Invoke:** Use the `clean-code` skill with the core module from Phases 3-4. Ask for a score-and-fix review against the rules and clean unit tests (arrange-act-assert, descriptive names, a builder helper) for the core use case.

**Decide with the user:** What quality bar gates a commit — function size, name clarity, no swallowed exceptions? Which happy-path and failure cases must the first tests cover?

**Artifact:** Create docs/TESTING.md with `## Test Strategy` (pyramid, tooling, what green gates) and `## Safety Net Map` (module | pinned behaviors | test files | gaps). Update the tracker.

**Done when:** TESTING.md states the strategy, the core use case has passing behavior-named tests that need no database, and the commit quality bar is recorded.

### Phase 6 — Install the meta-disciplines (pragmatic-programmer)

**Purpose:** Adopt the habits that keep the codebase easy to change over years.

**Brief (fallback):** Fire a tracer bullet — one thin real slice through every layer (UI to use case to database and back), kept, to surface integration bugs on day two. DRY applies to knowledge only, not coincidental similarity. Orthogonality: changing the database must not touch the UI. Reversibility: wrap third-party SDKs behind your own interfaces so Stripe or a model provider swaps without touching business logic. Broken windows: fix the first hack or board it up with a tracked ticket — never leave silent rot.

**Invoke:** Use the `pragmatic-programmer` skill with ARCHITECTURE.md and the core use case. Ask for the thinnest end-to-end tracer-bullet design and an adapter interface for each third-party dependency.

**Decide with the user:** What is the tracer-bullet slice? Is the broken-windows policy zero-tolerance with tracked tickets? Which dependencies get adapter interfaces now versus later?

**Artifact:** Extend docs/TESTING.md (`## CI Gates`) and docs/TECH-DEBT.md (`## Debt Budget & Broken-Windows Policy` and `## Adopted Conventions`). Update the tracker.

**Done when:** the tracer bullet is specified end-to-end, adapter interfaces are named for each provider, and the broken-windows policy is written down.

### Phase 7 — Size it honestly (system-design)

**Purpose:** Estimate the real load and prove what you do NOT need to build yet.

**Brief (fallback):** Start from requirements, not solutions. QPS = daily active users x actions/day / 86,400, peak 2-5x average; storage = records/day x record size x retention. For a few hundred users the math almost always says one well-indexed database plus a cache. Scale in order: vertical first, then read replicas, then cache aside, shard last. Reach for a queue to absorb spikes and decouple slow work (e.g. photo OCR) from the request path only when an estimate or real bottleneck justifies it.

**Invoke:** Use the `system-design` skill with the load numbers from intake. Ask for a back-of-the-envelope QPS and storage estimate and an explicit list of techniques you do NOT need yet.

**Decide with the user:** Given the estimate, which scaling do you deliberately defer? Which real bottleneck, if any, justifies a cache or queue now?

**Artifact:** Ext

[...shortened]
