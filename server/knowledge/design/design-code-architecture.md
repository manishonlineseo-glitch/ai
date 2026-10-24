<!-- source: https://github.com/wondelai/skills path: design-code-architecture/SKILL.md license: MIT -->
# design-code-architecture

Guided journey from an app idea to a deliberate architecture: boundaries, domain model, data decisions, and resilience, making only the expensive-to-reverse decisions and deferring the rest. Orchestrates eight skills phase by phase - clean-architecture, domain-driven-design, system-design, ddia-systems, software-design-philosophy, release-it, pragmatic-programmer, 37signals-way - asking the user questions at every decision point and recording results in the project docs/ folder (ARCHITECTURE.md, DESIGN-CODE-ARCHITECTURE-PLAN.md) so the journey resumes across sessions. Use when the user wants to design a new app''s architecture, choose boundaries and a domain model, decide monolith versus microservices, or says ''how should I structure this app''. If a codebase already exists, use remove-technical-debt (aged), improve-code-quality (fresh prototype), or architecture-optimization (slow but working); if unvalidated, run create-business or create-app first. For one framework in isolation, invoke that skill directly.

# Design Code Architecture

Design the architecture for a new app: get the small number of expensive-to-reverse decisions right and stay aggressively simple everywhere else. This is an interactive, resumable journey of eight phases — the agent asks before every decision and records the outcome in your project's `docs/` folder, so you can stop after any phase and resume later. It runs from the most foundational and hardest-to-reverse (boundaries, domain) through the tunable (data, resilience) to the cross-cutting disciplines (complexity, reversibility, scope) you apply throughout. A weekend project uses three phases lightly; a funded team building toward launch wants the whole stack.

## Core Principle

**Architecture is the set of decisions that are expensive to reverse: make exactly those deliberately, and defer everything cheap.** This skill sequences the phases, asks the decision questions, and records every choice in `docs/`. The constituent skills carry the method — invoke them rather than improvising their frameworks. The whole strategy is to convert expensive decisions into cheap ones by putting a boundary in front of them, so the irreducibly expensive set stays small enough to get right with care.

## Journey Map

| Phase | Skill | Question it answers | Artifact |
|---|---|---|---|
| 1 | clean-architecture | Do source-code dependencies point inward — is the core testable with no DB, web, or framework? | Creates docs/ARCHITECTURE.md |
| 2 | domain-driven-design | Where does the business actually split, and what does each term mean? | Extends docs/ARCHITECTURE.md |
| 3 | system-design | How little system does our real load actually need? | Extends docs/ARCHITECTURE.md |
| 4 | ddia-systems | Which data model, storage engine, and consistency does each workload need? | Extends docs/ARCHITECTURE.md |
| 5 | software-design-philosophy | Is complexity hidden behind deep modules, or is this classitis? | Extends docs/TECH-DEBT.md |
| 6 | release-it | Will it degrade gracefully when a dependency is slow or down? | Creates docs/RELIABILITY.md |
| 7 | pragmatic-programmer | What thin slice proves the boundaries, and what habits keep them reversible? | Extends docs/TESTING.md + docs/TECH-DEBT.md |
| 8 | 37signals-way | What is essential for v1, and what speculative abstraction do we cut? | Extends docs/ARCHITECTURE.md + docs/TECH-DEBT.md |

## Operating Rules

1. **Resume first.** Before anything else, read `docs/DESIGN-CODE-ARCHITECTURE-PLAN.md` and every artifact in the Journey Map. If the tracker exists, summarize the journey state in 3-5 lines and ask which phase to enter. Done when the user has confirmed an entry point. A journey with a tracker is resumed, never restarted.
2. **Intake on first run only.** No tracker: run the Intake below, then create `docs/DESIGN-CODE-ARCHITECTURE-PLAN.md` with every phase statused `pending | in-progress | awaiting-evidence | done | deferred: reason | skipped: reason`. Done when the tracker exists and the user has confirmed the phase plan.
3. **Phase entry.** Announce: what the phase does, the decision it forces, the artifact it produces, rough effort. Offer proceed / skip / defer — phases marked GATE may be deferred, never skipped. Mark the phase `in-progress` on proceed. Done when the user chose.
4. **Skill invocation and fallback.** Load the phase's skill and use it: each phase's Invoke line names the skill by slug — use that skill to run the phase. If it is not available, offer: `npx skills add wondelai/skills/<slug> --global`. If the user declines, run the phase from its Brief — the minimum viable method. State which mode you are in.
5. **In-phase decisions.** Ask every question under "Decide with the user" — with concrete options and your recommendation. Record the choice in the tracker's Key Decisions. A decision made silently is a defect.
6. **Phase exit.** Present the draft artifact content for sign-off before writing. On approval: write or extend the docs/ files, update the tracker (status, Key Decisions, Next Actions). Done when the files are written and the phase row shows `done`.
7. **Artifact discipline.** Read before writing; create a file only if missing, otherwise extend — add or update your sections, preserve everyone else's. Files are UPPERCASE in `docs/`. Every recommendation lands as a checkbox or a table row with owner and priority. See [references/artifact-templates.md](references/artifact-templates.md) when creating a docs/ file for the first time — create it from the full skeleton (all section headings), then fill the sections your phase names.
8. **Every expensive-to-reverse decision gets a Decision Log row (decision, why, alternatives rejected) before any code assumes it.** Default to a modular monolith: services split only along proven bounded contexts.

## Intake

Ask these before creating the tracker:

1. What will the app do, and what is the one feature that is genuinely your competitive advantage? (frames the core subdomain in Phase 2 — where to invest deep modeling versus buy off-the-shelf)
2. What stack are you leaning toward — language, web framework, ORM, database? (gates the Phase 1 boundary and Phase 4 data decisions; treated as a detail, never the skeleton)
3. What load is realistic in year one — rough daily active users and the main actions each takes? (gates Phase 3 sizing: requirements before solutions)
4. What outbound dependencies will it call — payments, email, LLM APIs, shipping, queues? (gates the Phase 6 integration-point audit)
5. Which data is the system of record, and are there second read patterns like search, analytics, or feeds? (gates Phase 4 consistency and derived-data decisions)
6. Has anyone validated that people actually want this app? (if not, route to create-business / create-app first — do not architect an unvalidated idea)
7. How many teams will own this system, and how much of the journey do you want now? (gates the team-topologies optional phase and the Phase 8 appetite)

Phase-skip heuristics: skip Phase 3's scaling machinery and most of Phase 4's replication when year-one load is far below any threshold (a single indexed DB is the answer — record it and move on); skip the team-topologies optional phase for a single-team app. Never skip Phase 1 or Phase 2 — boundaries and the domain model are the additive work that makes every later decision cheap; Phase 6 resilience is not optional once real users and outbound calls exist. Then create the tracker from the template and confirm the plan.

Done when `docs/DESIGN-CODE-ARCHITECTURE-PLAN.md` exists with every phase statused and the user has confirmed the plan.

## Phases

Phases run in the listed order, from hardest-to-reverse to tunable to cross-cutting — each assumes the previous phase's artifact exists. Any phase can be entered, skipped, or deferred per the Operating Rules; Phases 1-2 are the additive work that makes everything after them cheap to change.

The phases form a dependency chain that mirrors the system: Domain-Driven Design says *where* the boundaries belong (contexts and aggregate seams); Clean Architecture says *which way* dependencies cross them; Data-Intensive Apps decides what lives inside them at the persistence layer; System Design says how much infrastructure that actually requires — usually far less than feared. Software Design keeps the modules deep instead of multiplying into shallow ceremony, Release It! hardens the integration points, Pragmatic Programmer supplies the cross-cutting habits that hold the structure over time, and the 37signals Way governs the whole thing by fixing time and cutting scope.

### Phase 1 — Draw the boundaries (clean-architecture)

**Purpose:** Keep business rules independent of the framework, database, and vendors so every later decision stays swappable — the move that buys back all the others.

**Brief (fallback):** The Dependency Rule — source-code dependencies point inward: Frameworks → Interface Adapters → Use Cases → Entities; nothing inner names anything outer. Database, web, and vendors are details, plugins to your rules. Enforce with Dependency Inversion: a use case owns a repository interface; the Postgres/Stripe implementation lives in an outer adapter. Draw full boundaries only at real volatility (DB, external services, delivery); collapse layers elsewhere — direction matters, not folder count.

**Invoke:** Use the `clean-architecture` skill with a concrete first feature and the stack from intake. Ask it to layer that feature (entities, a use case with request/response models, repository + gateway interfaces, the HTTP controller and DB adapter in the outer ring), and to flag which boundaries are ceremony versus earning their cost at real volatility.

**Decide with the user:** (1) Modular monolith versus services — default to a modular monolith with clean internal boundaries; a microservice with a shared data model is a distributed monolith, strictly worse. (2) Which volatility points get full boundaries with interfaces now versus collapsed layers.

**Artifact:** Create docs/ARCHITECTURE.md with `## System Context` (what it does, integrations), `## Layer Map & Dependency Rule` (layers, what depends on what; violation | location | fix | status), and the monolith-versus-services choice in `## Decision Log` (date | decision | why | alternatives rejected). Update the tracker.

**Done when:** the layer map exists, the first feature is layered with framework/ORM types confined to the outer ring, the core is designed to test with no DB/web/framework, the monolith-versus-services decision is a Decision Log row, and Phase 1 shows `done`.

### Phase 2 — Model the domain (domain-driven-design)

**Purpose:** Put boundaries where the business actually splits and make the code speak the domain — cheapest now, inventing the vocabulary from a blank page.

**Brief (fallback):** The model is the code — build a Ubiquitous Language so team words are code words. Name after domain concepts (`Order.place()`, not `OrderManager.process()`); a name that resists is a design signal, not an annoyance. Bounded contexts: a region where a word means exactly one thing ("Customer" differs in billing versus support) — these are your future service seams. Aggregates: a small root cluster enforcing invariants, immediately consistent inside and eventually consistent outside; reference other aggregates by ID. Push behavior into entities — no anemic data bags.

**Invoke:** Use the `domain-driven-design` skill with the domain vocabulary and the Phase 1 layer map. Ask for the bounded-context map built from the words the team actually uses, the core aggregates with their invariants, and a subdomain classification (core / supporting / generic).

**Decide with the user:** (1) Where the same word legitimately means different things across contexts — do NOT unify into one omniscient model. (2) Which subdomain is core (invest deep modeling) versus generic (buy or use OSS — auth, email, payments).

**Artifact:** Extend docs/ARCHITECTURE.md: `## Bounded Contexts & Context Map` (contexts, relationships, anti-corruption layers) and `## Domain Glossary (Ubiquitous Language)` (term | meaning | code name); record aggregate and core-domain choices in `## Decision Log`. Update the tracker.

**Done when:** contexts are mapped with their relationships, the glossary names the core terms, each aggregate states its invariants and by-ID references, the core subdomain is chosen, and the context boundaries line up with the Phase 1 layer map.

### Phase 3 — Size the system honestly (system-design)

**Purpose:** Prove with numbers how small the system can be, so you skip the machinery you cannot justify.

**Brief (fallback):** Start with requirements, not solutions. Back-of-envelope: QPS = daily-active-users × actions/day ÷ 86,400, peak 2-5× average; storage = records/day × size × retention. For hundreds-to-thousands of users, a single indexed DB plus a read-path cache carries you a long time. Scale in order: vertical first, then cache-aside (TTL + explicit invalidation), then read replicas, and shard last, only with evidence. Reach for a message queue to decouple slow/spiky work, a CDN for global static assets. Premature sharding and premature service-splitting are named mistakes.

**Invoke:** Use the `system-design` skill with the load reality from intake. Ask for average and peak QPS, yearly storage, which component bottlenecks first, and a plain list of the techniques (sharding, replicas, CDN, queues, multi-region) you do NOT need yet.

**Decide with the user:** Which scaling moves to make now versus defer — tied to the numbers (don't build for 50k users while at 50) — and the first slow workload, if any, to move behind a message queue.

**Artifact:** Extend docs/ARCHITECTURE.md `## System Context` with the load reality and back-of-envelope numbers; record each scaling move (adopt now / defer with trigger) in `## Decision Log`. Update the tracker.

**Done when:** average/peak QPS and yearly storage are written down, the first bottleneck is named, and every scaling technique is either adopted with a reason or deferred with the number that would trigger it.

### Phase 4 — Make deliberate data decisions (ddia-systems)

**Purpose:** Get the layer that outlives the code right — data model, storage engine, and consistency chosen by access pattern, not habit.

**Brief (fallback):** Data outlives code. Match model to access pattern — relational for many-to-many and ad-hoc queries, document for self-contained aggregates with locality, graph for recursive traversals; storage engines trade reads against writes (LSM write-throughput versus B-tree read-latency). Most databases default to read-committed or snapshot, NOT serializable — naive read-then-write triggers write skew (two buyers taking the last unit). Lock explicitly (`SELECT ... FOR UPDATE`) or use a serializable transaction where invariants demand it. Single-leader + read replicas is the read-heavy default; replication lag forces deliberate read-your-writes. Separate system-of-record from rebuildable derived data.

**Invoke:** Use the `ddia-systems` skill with the workloads implied by the Phase 2 aggregates and the Phase 3 replica plan. Ask for a per-workload model + storage-engine fit, the actual default isolation level and its anomalies, and which read-then-write paths need locking.

**Decide with the user:** (1) One datastore versus polyglot persistence, per workload fit. (2) Which paths get a lock or serializable transaction versus tolerate eventual consistency; whether a second read pattern (search, analytics) justifies derived data kept in sync by CDC.

**Artifact:** Extend docs/ARCHITECTURE.md `## Data & Storage Decisions` (models, engines, isolation level, locked paths, system-of-record versus derived) and log the reasoning in `## Decision Log`. Update the tracker.

**Done when:** each workload has a model + engine chosen by fit, the default isolation level is documented, every write-skew-prone path is locked or serializable, and any derived data has a defined sync mechanism.

### Phase 5 — Keep modules deep (software-design-philosophy)

**Purpose:** Stop the structure from becoming its own disease — hide machinery behind simple interfaces instead of shattering into shallow classes.

**Brief (fallback):** Complexity is the enemy; the test for every decision is whether it makes the whole system simpler. Module depth = functionality ÷ interface complexity — deep modules hide power behind small interfaces; shallow ones (classitis) add interface cost without hiding complexity. Clean layering and deep modules are allies; clean layering and classitis are not. Information leakage — one design decision reflected in many modules — is a top red flag; encapsulate each piece of knowledge once. Strategic over tactical: invest 10-20% to keep the design clean; startup shortcuts compound into debt as the team grows.

**Invoke:** Use the `software-design-philosophy` skill with the module set proposed in Phase

[...shortened]
