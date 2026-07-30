# EkaScribe Web - Coding Guidelines

## Project Architecture

This is a Next.js app using the **feature-based** folder structure:

```
src/
  app/              → Pages and routing (Next.js app router)
  features/         → Feature modules (session, sidebar, settings, etc.)
  shared-components/→ Reusable UI components used across features
  shared-hooks/     → Reusable hooks used across features
  store/            → Zustand store (global state)
  constants/        → Types, enums, config constants
  utils/            → Pure utility functions used across features
  fetch-client/     → API client and retry logic
```

Each feature owns its full vertical slice:

```
features/<feature>/
  components/       → UI components scoped to this feature
  hooks/            → Hooks scoped to this feature
  utils/            → Helper functions scoped to this feature
  config/           → Configuration objects scoped to this feature
  screens/          → Full-page screen components
```

### Where to put things

- If it's **used by one feature** → inside that feature's folder.
- If it's **used across features** → `shared-components/`, `shared-hooks/`, or `utils/`.
- If it's a **type, enum, or constant** → `constants/`.
- If it's **global state** → `store/`.
- Don't put feature-specific code in shared folders. Don't put shared code inside a feature folder.

## Keep Files Small and Focused

- One component per file. One hook per file. One clear responsibility per file.
- If a component file has too much non-rendering logic (data fetching, state derivation, complex callbacks), extract that logic into a hook. Components should focus on rendering.
- If a hook is doing too many things (CRUD + tab building + status tracking), split it into separate hooks.
- Don't let a file grow into a god file. If you're scrolling to find things, it's time to split.

## Write Reusable Code

- Before writing a new component or hook, check if something similar already exists in `shared-components/`, `shared-hooks/`, or within the feature folder.
- When you build something that could be reused, design it with clean props/interfaces — but don't over-engineer. Only move it to `shared-*` when a second consumer actually needs it.
- Configuration objects (footer configs, tab configs) go in `config/` — keep rendering logic and configuration separate.

## State Management

- **Store** is for data that multiple components need or that must survive across tab/screen switches.
- **Local React state / hooks** are for UI-only concerns scoped to a single feature area.
- Never have two disconnected systems managing the same state. Pick one owner.
- If two things share the same shape and lifecycle, store them the same way. Don't give one special treatment.

## Component Design

- Components that manage user input should be **self-contained** — read their own data, manage their own internal state. Don't pass data down as props when the component can read it directly from the source.
- Children signal parents through **callbacks**. Don't have the child write to shared state and the parent read from it separately — one system, one direction.
- When a parent owns UI state, pass update functions down. The child calls them; the parent renders the result.

## Keep Code Simple and Clean

- No dead code. No commented-out code. No unused imports.
- Don't add comments, docstrings, or type annotations to code you didn't change.
- Don't add error handling for scenarios that can't happen.
- Don't build abstractions for one-time operations. Three similar lines > premature abstraction.
- Prefer explicit and readable over clever and compact.

## Preventing Unnecessary Re-renders

- Memoized components remount when props change. Every callback passed as a prop must have a **stable reference**.
- Never pass inline arrow functions as props to memoized components — extract them as named, memoized callbacks.

## Conditional Behavior Across Screens

- When a hook has behavior that only applies in certain screens, use an **opt-in flag** that defaults to off. Don't run it unconditionally and risk stale data in other contexts.

## General

- Prefer editing existing files over creating new ones.
- When fixing a bug, identify the root cause before changing code. Don't retry blindly.
- Keep related things together, separate things apart.
