
# Festival POS System Constitution

## Core Principles

### I. Test-First (NON-NEGOTIABLE)
MUST write tests before implementation. Red-Green-Refactor cycle strictly enforced. No code merged without passing tests and user-approved test cases.

### II. Accessibility & Inclusion
MUST meet WCAG 2.1 AA for all user interfaces. Accessibility is a release blocker. All flows must be keyboard navigable, have sufficient color contrast, and support screen readers.

### III. Resilience (Offline-First where feasible)
MUST show clear error messages and retry options for every network failure. MUST provide an installable PWA shell with an offline-fallback page. Full offline-capable menu browsing and order queueing are RECOMMENDED but MAY be deferred to a post-MVP phase when the host platform (e.g. free-tier serverless) makes them disproportionately complex. Any such deferral MUST be documented in the corresponding plan's Complexity Tracking with a concrete trigger for re-evaluation.

### IV. Security & Privacy
MUST enforce HTTPS, secure/HttpOnly cookies, HSTS, and role-based access. Personal data without an accounting purpose (guest sessions without orders, login attempts, payment locks) MUST be deleted after at most 7 days. Accounting records (orders, payments, refunds, cash closings, audit log) MUST be kept for bookkeeping and are exempt from the 7-day rule; their retention and later deletion are decided per event by the operator. All payment actions MUST be logged with staff ID and timestamp.

### V. Performance & Perceived Real-Time
MUST meet, under the load profile declared in the feature spec: <3s menu load, 50+ concurrent users, 12h uptime. End-to-end API latency targets (p95) MUST be declared by the feature spec as a measurable NFR and MUST be ≤500ms; tighter targets (e.g. <200ms p95) apply only where the hosting tier can sustain them and MUST be stated explicitly.

Perceived real-time updates MUST be visible to the end user within the bounds declared in the feature spec. The default budget is **≤2s** for paid/managed-realtime transports (WebSockets/SSE). When polling transports are used (justified by hosting constraints), the spec MUST declare polling intervals and the corresponding visibility budgets MUST NOT exceed **≤5s for staff/production views** and **≤10s for guest views**.

### VI. Traceability & Coverage
All requirements and NFRs MUST be mapped to explicit tasks. No requirement may be left without a corresponding implementation and test task.

### VII. Terminology Consistency
MUST use standardized terms: "production station" (not "display"), "production queue" (not "order queue"). All artifacts must use consistent terminology.

### VIII. Simplicity (YAGNI)
MUST build only what a current requirement, bug or user request needs. No speculative features, options, configuration switches, abstraction layers, generic helpers or extension points "for later". Prefer the smallest change that solves the problem and the code that already exists over new structure. A second use case justifies an abstraction; an imagined one does not. Anything added beyond the request MUST be justified in the PR description, otherwise it is removed in review.

### IX. First-Time Users in Service
Waiters are club volunteers who use the app once a year or less; there are no regular waiters. The waiter screens MUST be usable without training by someone who sees them for the first time. Every element on a waiter screen MUST serve the core flow (order, serve, cash up). Features only an experienced user would use (handing out tables, overrides, statistics) MUST live with the shift lead or admin, not in the waiter view. A waiter "simple mode" switch is not allowed: the waiter view itself is the simple one.

## Quality Gates

- No code merged without passing all tests and accessibility checks.
- All NFRs and edge cases must have explicit tasks and test coverage.
- All referenced files/components must be defined in plan/spec.
- All requirements must use measurable, testable language (no vague adjectives).
- All timing requirements must be explicit (e.g., "within 2 seconds").
- No duplicate requirements or NFRs; consolidate and cross-reference as needed.

## Governance

This constitution supersedes all other practices. Amendments require documentation, approval, and a migration plan. All PRs/reviews must verify compliance. Complexity must be justified in writing.

**Version**: 2.3.0 | **Ratified**: 2026-01-31 | **Last Amended**: 2026-10-16

## Amendment Log

- **2026-05-28 — v2.0.0** (MAJOR): Principle III renamed to "Resilience (Offline-First where feasible)" — full offline order queueing demoted from MUST to RECOMMENDED with explicit deferral pathway, to reflect free-tier serverless hosting realities documented in feature 001-festival-pos-third-variant. Principle V renamed to "Performance & Perceived Real-Time" — fixed `<200ms p95` and `<2s` realtime budgets replaced by tiered, spec-declared budgets (≤500ms p95 baseline; ≤5s staff / ≤10s guest visibility when polling). Other principles unchanged.
- **2026-10-13 — v2.1.0** (MINOR): Principle IV — the 7-day deletion rule now applies to personal data without an accounting purpose; accounting records (orders, payments, refunds, cash closings, audit log) are kept for bookkeeping. Matches the implemented sweep. Feature spec 001-festival-pos-third-variant FR-042 now allows one daily Vercel Cron for the cleanup sweep.
- **2026-10-13 — v2.2.0** (MINOR): New principle VIII "Simplicity (YAGNI)": build only what a current requirement needs; no speculative features, options or abstractions.
- **2026-10-16 — v2.3.0** (MINOR): New principle IX "First-Time Users in Service": waiter screens are built for volunteers seeing them for the first time; expert features belong to the new shift lead role or the admin.
