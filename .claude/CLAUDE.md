# Weave — Project Instructions

## Context

Weave is Kayleigh's entry for the **2026 Vibe Coding Game Jam** (jam.pieter.com/2026).

**Jam deadline: 2026-05-01 13:37 UTC.** Everything we do is in service of shipping a complete, playable, polished jam entry before that timestamp.

**Jam rule:** 90%+ of all code in this repo must be AI-written. When writing or editing code, default to having Claude do it. Human contributions should be creative direction, gameplay tuning, architectural judgment calls, and asset curation — not typing.

## Source of truth

- **Design doc:** `docs/plans/2026-04-09-weave-design.md` — canonical spec, MVP scope, stretch list, architecture, schema. Read this before making scope decisions.
- **Linear team:** `weave` (identifier `WEA`) — **Linear is the source of truth for ticket structure, acceptance criteria, and milestone sequencing.** The design doc has the game design; Linear has the execution plan.
- **Milestones:** WEA-1 through WEA-8 (8 vertical slices). Bug tickets can be created during playtesting. Do not create new feature tickets unless explicitly scoping new work.

## Scope discipline

**The stretch list in the design doc is off-limits until MVP is end-to-end playable and deployed.** "End-to-end playable" = a stranger loads the URL, crashes, submits a score, sees themselves on the leaderboard, without help.

Stretch priority (in order): (1) Vibe Jam portal, (2) Twitter/X share card, (3) daily seed challenge, (4) motorcycle unlock, (5) off-ramp shortcuts, (6) achievements.

## Git workflow

**Never commit directly to `main`** — always via a worktree + PR. The only exception was the very first seed commit (README + docs + gitignore + this file) which had no branch to come from.

Branch naming:
- `feature/wea-N-short-slug` for milestone work
- `fix/short-slug` for bugs
- `chore/short-slug` for scaffolding / config

Worktrees live at `.worktrees/<branch-name>` (gitignored).

Follow `superpowers:test-driven-development` — write tests first for pure logic (input, game state, scoring math). Rendering code doesn't need tests; game-feel tuning is playtested, not unit-tested.

## Tech stack (locked — do not change without user approval)

- **Vite 8 + TypeScript 6 + Three.js** (WebGL, not WebGPU)
- **No UI framework** (no React/Svelte/etc.)
- **No physics engine** — custom AABB collisions
- **Tone.js** for audio
- **Supabase** for leaderboard (project name: `weave`)
- **Vercel** for hosting (default `*.vercel.app` subdomain — no custom domain)
- **GitHub repo:** `kmigdol/weave` (public)

## Pre-implementation rule

Before writing ANY implementation code for a new milestone or non-trivial task, state a plan in 3–5 bullets and wait for user approval. Wrong-approach corrections are the #1 waste of jam time.

## Pre-coding checks

Run `verify-library-api` before touching:
- Three.js APIs (version churn, WebGPU additions)
- Tone.js APIs
- Supabase JS client + edge function runtime
- Vite plugin APIs

Do NOT trust training knowledge for these — library APIs evolve fast.

## When delegating to agents

Include this in every framework-touching agent prompt:

> Check the installed version of the library in package.json or node_modules before making claims about conventions. If anything doesn't match expected patterns, use WebSearch to look up docs for that specific version. Do NOT rely on training knowledge — flag uncertainty rather than asserting code is broken.

## Linear status conventions

- Start work → `In Progress`
- PR open → `In Progress` with PR URL added to ticket description
- PR merged → `Done`
- Always preserve the `Feature`/`Bug`/`Improvement` label when updating tickets.
