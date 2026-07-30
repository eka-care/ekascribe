---
name: platform-capability
description: Enforce the EkaScribe Platform Capability Layer architecture. Use this BEFORE writing or changing any platform-divergent behaviour (storage, file picker, audio capture, clipboard, print, notifications, system/shell, auth tokens, host bridge, network) or any code under src/platform/. Also use when adding a new capability, a new platform family, or a window.*Api bridge, or when gating UI by platform/capability (DesktopOnly / WebOnly / Capability). Triggers on direct use of localStorage/sessionStorage, IndexedDB, getUserMedia/getDisplayMedia, navigator.clipboard, window.print, window.open, or any window.*Api / isElectronApp.
---

# Platform Capability Layer — Working Rules

You are changing platform-divergent behaviour in EkaScribe-Web. Follow the capability
layer at `src/platform/`. The full design and the step-by-step playbooks live in:

- **Architecture:** `.claude/docs/architecture/platform-capability-layer.md`
- **How-to + code templates:** `.claude/docs/architecture/implementation-guide.md`
- **Migration status / what to do next:** `.claude/plans/platform-migration-tracker.md`

Read the implementation guide before writing code. The reference implementation to mirror
is `src/transport/`.

## Hard rules

1. **Depend on capabilities, not platforms (P1).** Outside `src/platform/`, never write
   `window.*Api`, `isElectronApp`, or raw `localStorage` / `IndexedDB` / `getUserMedia` /
   `navigator.clipboard` / `window.print` for a concern a capability covers. Use
   `usePlatform()` / `getPlatform()` and the capability interface.
2. **One capability = its own files (P5).** A capability is `contracts/<cap>.ts` +
   `web/<cap>.ts` + `electron/<cap>.ts` + a hook. Adding a capability **creates** files; it
   does not bloat shared ones. Register in the family `index.ts` alphabetically, one line.
3. **Electron adapters feature-detect and degrade (P4).** Every `window.*Api` call is
   guarded by `typeof window.xApi?.method === 'function'`. A missing bridge disables just
   that capability (descriptor `false`) — it never throws.
4. **Bridge contract is additive-only (P3/AP-6).** `src/platform/bridge/contract.d.ts` is
   shared with DeskDocEka. New members are **optional**; never change/remove an existing
   signature. Bump `BRIDGE_CONTRACT_VERSION` in `bridge/version.ts` on any addition.
5. **Gate UI on descriptors, not platform identity (AP-4).** For behaviour, use
   `<Capability id="…">` / `useCapabilities().has(...)`. The **only** sanctioned host-identity
   gate is `<DesktopOnly>` / `<WebOnly>` (from `@/platform`) for *pure show/hide*. Never write
   `isElectronApp` / `window.*Api` / a raw host check in feature UI — those stay in
   `src/platform/`.
6. **Contracts stay platform-agnostic.** No `window`, browser globals, or Electron in
   `contracts/*`.

## Before you start

- Check the tracker for which phase/capability is active and whether this concern is
  already migrated. If it is, route through the existing capability.
- If it is NOT yet migrated and you only need a small change, prefer routing the change
  through the capability if it exists; otherwise flag that the concern belongs to a future
  phase rather than adding new inline `window.*` / `localStorage` usage.

## When adding or changing a capability

Follow **Playbook A** (add a capability) or **Playbook B** (add a platform) in the
implementation guide. Definition of done:

- [ ] Contract + web impl + feature-detecting electron adapter + hook.
- [ ] All inline call sites for that concern now route through the capability.
- [ ] Descriptor wired; platform-specific UI gated on it (no `isElectronApp` in feature UI).
- [ ] `npx tsc --noEmit` and `npm run build` pass.
- [ ] Update `.claude/plans/platform-migration-tracker.md`: check the task; when the phase
      is fully done flip its status to `Done (YYYY-MM-DD)` and pick the next phase.
