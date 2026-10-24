<!-- source: https://github.com/wondelai/skills path: improve-code-quality/SKILL.md license: MIT -->
# improve-code-quality

Guided journey from a working-but-untested vibe-coded prototype to a production-ready product with tests, clean structure, a business-rules boundary, and resilience at scale. Orchestrates nine skills phase by phase - working-with-legacy-code, clean-code, refactoring-patterns, software-design-philosophy, clean-architecture, pragmatic-programmer, release-it, system-design, ddia-systems - asking the user questions at every decision point and recording results in the project docs/ folder (TESTING.md, TECH-DEBT.md, IMPROVE-CODE-QUALITY-PLAN.md) so the journey resumes across sessions. Use when the user wants to harden an AI-generated prototype, add tests before refactoring, make code safe to change, or says ''this works on my machine but I am scared to touch it''. For an aged codebase, remove-technical-debt; for greenfield structure, design-code-architecture; for a product and UX pass, improve-app; to optimize speed and structure, architecture-optimization. For one framework in isolation, invoke that skill directly.

# Improve Code Quality

Turn a working-but-untested vibe-coded prototype into a product you can ship and operate. This is an
interactive, resumable journey of nine phases: the agent asks before every decision and records the
outcome in your project's `docs/` folder, so you can stop after any phase and pick up later. A
week-old prototype is already legacy code — so the first move is a safety net, and every phase after
it is verifiable because of that net.

## Core Principle

**A week-old untested prototype is already legacy code: flip tactical to strategic — safety net
first, then readability, structure, and production hardening in order.** This skill sequences the
phases, asks the decision questions, and records every choice in `docs/`. The constituent skills
carry the method — invoke them rather than improvising their frameworks. Skipping ahead (refactoring
before tests, scaling before sizing) is the exact failure mode this ordering exists to prevent.

## Journey Map

| Phase | Skill | Question it answers | Artifact |
|---|---|---|---|
| 1 | working-with-legacy-code | Can I change this code without breaking it unknowingly? | Creates docs/TESTING.md + docs/TECH-DEBT.md — GATE |
| 2 | clean-code | Is this readable to the next person (and agent)? | Extends docs/TECH-DEBT.md |
| 3 | refactoring-patterns | Can I reshape structure without changing behavior? | Extends docs/TECH-DEBT.md |
| 4 | software-design-philosophy | Is complexity hidden behind deep modules? | Extends docs/TECH-DEBT.md |
| 5 | clean-architecture | Do business rules depend on the framework, or vice versa? | Extends docs/ARCHITECTURE.md |
| 6 | pragmatic-programmer | What habits keep it clean after we stop? | Extends docs/TECH-DEBT.md |
| 7 | release-it | Will it survive a hostile production? | Creates docs/RELIABILITY.md |
| 8 | system-design | Is it sized for the load we actually have? | Extends docs/ARCHITECTURE.md + docs/RELIABILITY.md |
| 9 | ddia-systems | Is the data layer correct and durable under concurrency? | Extends docs/ARCHITECTURE.md |

## Operating Rules

1. **Resume first.** Before anything else, read `docs/IMPROVE-CODE-QUALITY-PLAN.md` and every artifact in the Journey Map. If the tracker exists, summarize the journey state in 3-5 lines and ask which phase to enter. Done when the user has confirmed an entry point. A journey with a tracker is resumed, never restarted.
2. **Intake on first run only.** No tracker: run the Intake below, then create `docs/IMPROVE-CODE-QUALITY-PLAN.md` with every phase statused `pending | in-progress | awaiting-evidence | done | deferred: reason | skipped: reason`. Done when the tracker exists and the user has confirmed the phase plan.
3. **Phase entry.** Announce: what the phase does, the decision it forces, the artifact it produces, rough effort. Offer proceed / skip / defer — phases marked GATE may be deferred, never skipped. Mark the phase `in-progress` on proceed. Done when the user chose.
4. **Skill invocation and fallback.** Load the phase's skill and use it: each phase's Invoke line names the skill by slug — use that skill to run the phase. If it is not available, offer: `npx skills add wondelai/skills/<slug> --global`. If the user declines, run the phase from its Brief — the minimum viable method. State which mode you are in.
5. **In-phase decisions.** Ask every question under "Decide with the user" — with concrete options and your recommendation. Record the choice in the tracker's Key Decisions. A decision made silently is a defect.
6. **Phase exit.** Present the draft artifact content for sign-off before writing. On approval: write or extend the docs/ files, update the tracker (status, Key Decisions, Next Actions). Done when the files are written and the phase row shows `done`.
7. **Artifact discipline.** Read before writing; create a file only if missing, otherwise extend — add or update your sections, preserve everyone else's. Files are UPPERCASE in `docs/`. Every recommendation lands as a checkbox or a table row with owner and priority. See [references/artifact-templates.md](references/artifact-templates.md) when creating a docs/ file for the first time — create it from the full skeleton (all section headings), then fill the sections your phase names.
8. **Phase 1 is a gate; commits stay single-purpose.** No phase touches code absent from the Safety Net Map — pin it first (absent means not listed under Pinned behaviors; entries in the Gaps column are off-limits too). Structural and behavioral changes never share a commit: refactor with tests green in a structure-only commit, then change behavior in its own commit. A test that goes red mid-refactoring means revert and retry in smaller steps, not debug. Safety-net test additions and docs/ updates are single-purpose commits of their own.

## Intake

Ask these before creating the tracker:

1. What does the app do, and what is the worst thing that happens if it breaks? (frames risk and sets phase priority)
2. Which module are you changing next, and which has the highest churn (`git log`) or is core domain? (picks the Phase 1 starting module — the three-axis heuristic)
3. Do any automated tests exist today, and does a test command run green? (scopes the Phase 1 safety net)
4. What is the stack — framework, ORM, database? (gates Phases 5 and 9 — the boundary and data decisions)
5. Is this in production with real user data, and roughly how many active users or requests? (gates Phases 7-9 — resilience is requirements-driven)
6. What outbound dependencies does it call — third-party APIs, payments, email, queues? (gates Phase 7 — the integration-point audit)
7. How much of the journey do you want now? (Phases 1-3 before real users; Phase 7 before launch; Phases 8-9 track actual growth)

Phase-skip heuristics: skip Phases 8-9 when real load is far below any scaling threshold (start with requirements, not solutions — don't build for 50k users while at 50). Phase 7 is not optional once real users exist — timeouts and a circuit breaker are table stakes even at low traffic (it may stay `deferred: reason`, never `skipped`). Never skip Phase 1; it is the gate. Then create the tracker from the template and confirm the plan.

Done when `docs/IMPROVE-CODE-QUALITY-PLAN.md` exists with every phase statused and the user has confirmed the plan.

## Phases

Phases run in the listed order — each assumes the previous phase's artifact exists. Any phase can be entered, skipped, or deferred per the Operating Rules, but Phase 1 gates them all: nothing downstream touches unpinned code.

### Phase 1 — Build the safety net (working-with-legacy-code) — GATE

**Purpose:** Pin current behavior at the change points so every later phase is verifiable. No phase may touch code absent from the Safety Net Map.

**Brief (fallback):** Legacy code is code without tests, so a week-old prototype qualifies. Cover and
modify, never edit and pray: identify change points, break inline dependencies with the
least-invasive seam (Parameterize Constructor with a production default; Extract and Override for one
buried call), then write characterization tests that photograph actual behavior — assert something
wrong, read the failure, pin the real value. When full coverage isn't feasible in time, Sprout/Wrap
the new code and track the untested host as debt.

**Invoke:** Use the `working-with-legacy-code` skill with the starting module chosen at intake. Ask for an effect
sketch from the entry method, the seams, and the smallest characterization-test set that pins current
signup / billing / core behavior.

**Decide with the user:** (1) Confirm the starting module by the three-axis heuristic — changing next, high churn, core domain. (2) Bugs found while characterizing: pin the wrong behavior and file it in the Debt Ledger, never silently fix — callers may depend on the quirk. Confirm the user accepts this.

**Artifact:** Create docs/TESTING.md with `## Test Strategy`, `## Safety Net Map` (module | pinned behaviors | test files | gaps), and `## Characterization Backlog`; create docs/TECH-DEBT.md with `## Debt Ledger` (item | location | type | risk | effort | priority | status) and `## Sprout / Wrap Register`. Update the tracker.

**Done when:** the target module's behavior is pinned, the suite runs green, both files exist, and Phase 1 shows `done` — only then are later phases unlocked.

### Phase 2 — Make the code readable (clean-code)

**Purpose:** Optimize for the reader — names, small single-purpose functions, safe error handling — now that changes are verifiable.

**Brief (fallback):** Code is read far more than written. Names reveal intent (`elapsedTimeInDays`,
not `d`); booleans read as predicates; functions do one thing at one level of abstraction with 0-2
arguments (a flag argument is two functions). Command-Query Separation: change state or return a
value, never both. Error handling: prefer exceptions to return codes, catch specific types, never
return or pass null (use an empty collection, Optional, or Null Object), and put operation + state
context in every thrown error.

**Invoke:** Use the `clean-code` skill with a target module. Ask for a 0-10 score across the six disciplines plus the top ten fixes in priority order, and an error-handling audit (bare catches, null returns, contextless errors).

**Decide with the user:** Which fixes to apply now versus log as debt, the naming / error-handling conventions the team adopts going forward, and whether the clean-code score becomes a CI gate.

**Artifact:** Extend docs/TECH-DEBT.md: add rows to `## Smell Inventory` (smell | location | refactoring | status) for each name / function / error smell, and record the agreed rules under `## Adopted Conventions`. Update the tracker.

**Done when:** the module scores 8+ or every gap below 8 is a Smell Inventory row with a fix, conventions are recorded, and the Phase 1 tests still pass.

### Phase 3 — Apply named refactorings (refactoring-patterns)

**Purpose:** Turn "clean it up" into named, behavior-preserving transformations executed in small steps.

**Brief (fallback):** Each smell maps to a named refactoring. Extract Method is the workhorse — if
you would write a comment to explain a block, extract it and name it after the comment. Also Replace
Magic Number with Symbolic Constant, Replace Nested Conditional with Guard Clauses, Replace
Conditional with Polymorphism, Introduce Parameter Object. Workflow: tests green, one transformation,
tests green, commit; a red test means revert, not debug. Preparatory Refactoring (make the change
easy, then make the easy change) and the Rule of Three guard against premature abstraction.

**Invoke:** Use the `refactoring-patterns` skill with a smelly function and the Phase 1 tests. Ask it to name each smell, cite the transformation, and apply one at a time with tests run between each.

**Decide with the user:** Scope — which smells to address this pass, whether an upcoming feature warrants a Preparatory Refactoring at its insertion point first, and whether the refactored module joins the CI gate list in TESTING.md.

**Artifact:** Extend docs/TECH-DEBT.md `## Smell Inventory`: for each smell, record the named refactoring applied and its status. Update the tracker.

**Done when:** targeted smells show a named refactoring and `done` / `ticketed` status, tests are green, and structural changes landed in structure-only commits.

### Phase 4 — Reduce complexity with deep modules (software-design-philosophy)

**Purpose:** Fight the classitis an unsupervised agent creates — hide real machinery behind simple interfaces instead of multiplying shallow classes.

**Brief (fallback):** Complexity is the enemy; minimize what a module imposes on the rest of the
system. Module depth = functionality ÷ interface complexity; deep modules hide machinery behind small
interfaces, shallow ones don't (classitis). Merge shallow classes that always travel together and
share state. Watch information leakage (one decision reflected in many modules) and temporal
decomposition (organizing by order-of-execution, not by knowledge). This is the tactical→strategic
flip: invest 10-20% to keep the design clean.

**Invoke:** Use the `software-design-philosophy` skill with the module set touched so far. Ask which classes are shallow, where information leaks across boundaries, and how to consolidate into deeper modules with simpler interfaces.

**Decide with the user:** Which consolidations to make now versus defer, guarding against over-merging unrelated concerns.

**Artifact:** Extend docs/TECH-DEBT.md `## Smell Inventory` with classitis / shallow-module / information-leakage entries and the consolidation applied. Update the tracker.

**Done when:** each shallow-module cluster is consolidated or logged with a fix, interface count did not grow for the sake of "modularity", and tests are green.

### Phase 5 — Draw the architecture boundary (clean-architecture)

**Purpose:** Make the framework and database depend on the business rules, not the reverse.

**Brief (fallback):** The Dependency Rule: source dependencies point inward — Entities, then Use
Cases, then Interface Adapters, then Frameworks/Drivers; nothing inner names anything outer. The
database and web are details, plugins to your rules. Enforce with Dependency Inversion: a Use Case
owns a repository interface; the Postgres/Stripe implementation lives in an outer adapter. SOLID are
the mid-level tools. Microservices sharing one data model are a distributed monolith — apply the rule
inside the service first.

**Invoke:** Use the `clean-architecture` skill with the current module map and the stack from intake. Ask it to map the dependency graph, list every violation where business logic imports the ORM or framework, and show the extraction to framework-free Use Cases behind owned interfaces.

**Decide with the user:** How far to push the boundary this pass, which vendors (payments, storage) to wrap behind owned interfaces first, and whether any planned service split waits until the in-service boundary holds (avoid a distributed monolith).

**Artifact:** Extend docs/ARCHITECTURE.md: record layers and current violations under `## Layer Map & Dependency Rule` (violation | location | fix | status) and the boundary choices under `## Decision Log`. Update the tracker.

**Done when:** every Dependency Rule violation is a tracked row with a fix, at least the highest-risk vendor is wrapped, business-rule tests run with no framework, and tests are green.

### Phase 6 — Lock in the habits (pragmatic-programmer)

**Purpose:** Set the meta-principles that keep the codebase changeable after this journey ends.

**Brief (fallback):** DRY is about knowledge, not text — de-duplicate the same rule in two places
(validation on client and server), leave coincidental look-alikes alone. Orthogonality: changing one
component shouldn't affect another. Broken Window Theory: fix hacks immediately or board them up with
a tracked ticket — never an untracked `// TODO`. Reversibility: wrap third-party vendors behind your
own interfaces. Tracer bullets: build the next feature as one thin real end-to-end slice, not layer
by layer.

**Invoke:** Use the `pragmatic-programmer` skill across the codebase. Ask it to flag duplicated knowledge (ignoring coincidental duplication) and any broken windows or untracked TODOs that need boarding up.

**Decide with the user:** The debt budget per iteration and the broken-windows policy — what gets fixed now versus ticketed.

**Artifact:** Extend docs/TECH-DEBT.md: record duplicated-knowledge and broken-window items in `## Debt Ledger`, and the agreed policy under `## Debt Budget & Broken-Windows Policy` and `## Adopted Conventions`. Update the tracker.

**Done when:** duplicated-knowledge hits are ledgered or fixed, no untracked hacks remain, and the debt-budget policy is written down.

### Phase 7 — Make it survive production (release-it)

**Purpose:** Harden every integration point so a slow or failing dependency degrades gracef

[...shortened]
