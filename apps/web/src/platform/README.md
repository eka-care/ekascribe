# `src/platform/` — Platform Capability Layer

Platform-divergent behaviour (storage, file picker, audio, clipboard, print, …) is
defined here as **capability contracts**, implemented once per platform, and selected at
build time. Application code depends on capabilities — never on `window.*Api` or
"am I Electron".

**Canonical docs (source of truth):**

- Architecture: [`.claude/docs/architecture/platform-capability-layer.md`](../../.claude/docs/architecture/platform-capability-layer.md)
- How to add/change capabilities: [`.claude/docs/architecture/implementation-guide.md`](../../.claude/docs/architecture/implementation-guide.md)
- Migration status: [`.claude/plans/platform-migration-tracker.md`](../../.claude/plans/platform-migration-tracker.md)

Run `/platform-capability` before touching this layer.

```
contracts/  I<Capability> interfaces + CapabilityId descriptors (platform-agnostic)
web/        browser implementations
electron/   window.*Api adapters (feature-detecting, degrade gracefully)
bridge/     contract.d.ts (shared with DeskDocEka) + version.ts
registry.ts build-time wiring + active descriptor set
provider.tsx / hooks.ts / index.ts   React + non-React consumption
```
