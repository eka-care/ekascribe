---
allowed-tools: Bash(gh pr comment:*), Bash(gh pr view:*), Bash(gh pr diff:*), Bash(gh pr list:*), Bash(gh api:*), Bash(git log:*), Bash(git blame:*), Bash(git diff:*), Bash(git show:*)
description: EkaScribe-specific code review — checks Next.js 15, CLAUDE.md, Zustand patterns, React performance, TypeScript, and architecture
---

Perform a thorough code review of the current pull request, tailored to the EkaScribe Next.js codebase.

Follow these steps precisely:

1. Use a Haiku agent to determine whether this PR is eligible for review. Skip and stop if:
   - The PR is closed or draft
   - The PR looks automated or trivially simple (e.g. dependency bumps, minor text changes)
   - You have already posted a code review comment on this PR

2. Use a Haiku agent to collect the paths (not contents) of all relevant CLAUDE.md files: the root CLAUDE.md plus any CLAUDE.md files in directories touched by the PR diff.

3. Use a Haiku agent to read the PR description and diff, then return: (a) a one-paragraph summary of what changed and why, (b) the list of modified file paths.

4. Using the summary and file list from step 3, launch 5 parallel Sonnet agents to independently review the change. Each agent must read the actual diff and relevant file contents before reporting. Each agent returns a list of issues with: the issue description, the file path and approximate line numbers, and the reason it was flagged.

   Agent 1 — CLAUDE.md Compliance:
   Check the diff against the rules in CLAUDE.md. Focus on:
   - Feature-scoped code placed in shared-components/, shared-hooks/, or utils/ when it should be inside the feature folder (or vice versa — shared utilities duplicated inside a feature)
   - Components that have grown too large: rendering logic mixed with data fetching, state derivation, or complex callbacks that should be extracted into a hook
   - Hooks doing too many things — CRUD + tab building + status tracking in one hook
   - Dead code, commented-out code, or unused imports
   - Props drilled into a component when the component could read directly from the Zustand store
   - Children writing to shared state while the parent also reads from it separately (two disconnected systems for the same state)
   - Inline arrow functions passed as props to React.memo()-wrapped components — these break memoization

   Agent 2 — Next.js 15 App Router:
   Check for Next.js-specific issues. Focus on:
   - Dynamic route params: in Next.js 15, `params` is a Promise — pages must `await params` before destructuring (correct pattern: `const { id } = await params`)
   - 'use client' directive: components using hooks (useState, useEffect, useContext, useCallback, useMemo, etc.), browser APIs (window, document, localStorage), or event handlers must have 'use client' at the top. Server Components must not have it unless needed.
   - 'use client' boundary too high: if a page or layout adds 'use client' only because one leaf component needs it, that's a code smell — the directive should move to the leaf
   - metadata or generateMetadata exports in a file that also has 'use client' — this breaks static metadata generation
   - React hooks (useRouter, useSearchParams, usePathname) used in Server Components
   - <img> tags instead of next/image — causes layout shift and misses optimisation
   - Raw CSS @import for fonts instead of next/font — causes flash of unstyled text
   - React Query (useQuery/useMutation) used without staleTime/gcTime — defaults cause excessive refetches
   - API route handlers in app/api/ that don't handle errors or return proper Response objects

   Agent 3 — Performance & Re-render Prevention:
   Check for patterns that cause unnecessary re-renders or memory leaks. Focus on:
   - Zustand selectors that return a new array or object literal when the underlying data is absent — must use a stable constant defined outside the component (e.g. `const EMPTY: never[] = []` then `?? EMPTY`, not `?? []`)
   - Inline arrow functions or object literals passed as props to any React.memo() component — each render creates a new reference, breaking Object.is() comparison
   - useCallback/useMemo with a missing dependency (stale closure) or an over-broad dependency (causes the memo to recompute every render anyway)
   - List-item components that render inside .map() without React.memo() when the list can be long or the parent re-renders frequently (see RecordCard, RecordRow patterns in features)
   - Module-level mutable variables inside a hook file (e.g. `let count = 0`) that should be useRef — module-level state is shared across all instances and not cleaned up on unmount
   - useEffect with a Firestore onSnapshot / SDK listener that doesn't return a cleanup function to unsubscribe — causes listener accumulation
   - useEffect dependencies that include the entire store object rather than a fine-grained selector value

   Agent 4 — TypeScript & Code Quality:
   Check TypeScript discipline and code quality. Focus on:
   - New `any` types introduced (project enforces @typescript-eslint/no-explicit-any: warn)
   - `as` type casts on API response bodies that bypass runtime shape validation — especially dangerous for patient/clinical data
   - Missing return types on exported functions or hooks that are part of a feature's public API
   - noUnusedLocals / noUnusedParameters violations (project has strict: true)
   - Enums from constants/enums.ts used inconsistently — string literals used where an enum value exists (SESSION_PHASE, RECORDING_STATE, TEMPLATE_ID, ERROR_CODE)
   - console.log or console.error statements left in committed code
   - TODO/FIXME comments without a ticket reference or owner

   Agent 5 — Architecture & Security:
   Check structural correctness and security. Focus on:
   - New patient or clinical data (diagnoses, medications, vitals, transcripts) added to the global Zustand store (src/store/store.ts) when it belongs in a feature-scoped store
   - dangerouslySetInnerHTML without explicit sanitization — especially risky given the codebase converts markdown to HTML (see utils/convert-markdown-to-html.ts)
   - Authenticated API calls that bypass with401Retry — any fetch/axios/SDK call to a protected endpoint must go through the retry wrapper in src/fetch-client/
   - Patient identifiers, PHI (protected health information), or auth tokens logged to the console or included in error messages
   - Sensitive data (tokens, patient OIDs, session IDs) included in URL query params rather than POST bodies
   - New shared utilities or hooks that duplicate functionality already in shared-hooks/ or utils/

5. For each issue found across all 5 agents, launch a parallel Haiku agent to score it from 0–100. Give the agent this rubric verbatim:
   - 0: False positive. The issue does not hold up to scrutiny, or is pre-existing code not touched by this PR.
   - 25: Uncertain. Might be real but could not be verified. Stylistic issues not explicitly called out in CLAUDE.md.
   - 50: Likely real but minor. Won't affect functionality or only matters in edge cases.
   - 75: Real and important. Verified to be correct, will affect functionality or is explicitly in CLAUDE.md.
   - 100: Certain. Confirmed, will happen in practice frequently, evidence is direct.
   For CLAUDE.md issues, the agent must confirm the specific guideline is actually stated in CLAUDE.md before scoring above 50. For Next.js issues, the agent must confirm the pattern violates documented Next.js 15 behaviour.

6. Discard any issues scoring below 80. If none remain, do not post a comment.

7. Re-run the eligibility check from step 1 to confirm the PR is still open and hasn't been reviewed since step 1.

8. Output the review as a **preview** in the chat using the exact format below. Do NOT post to GitHub. Tell the user they can ask you to post it when ready.

---

### Code review

Found N issues:

1. <brief description of issue> (CLAUDE.md says "<direct quote from guideline>")

<https://github.com/owner/repo/blob/FULL_SHA/path/to/file.ext#Lstart-Lend>

2. <brief description of issue> (Next.js 15: <specific pattern violated>)

<https://github.com/owner/repo/blob/FULL_SHA/path/to/file.ext#Lstart-Lend>

3. <brief description of issue> (bug: <root cause>)

<https://github.com/owner/repo/blob/FULL_SHA/path/to/file.ext#Lstart-Lend>

🤖 Generated with [Claude Code](https://claude.ai/code)

<sub>- If this review was useful, please react with 👍. Otherwise, react with 👎.</sub>

---

Or if no issues passed the threshold:

---

### Code review

No issues found. Checked CLAUDE.md compliance, Next.js 15 patterns, performance, TypeScript, and architecture.

🤖 Generated with [Claude Code](https://claude.ai/code)

---

After showing the preview, tell the user: "Review ready. Say **post the review** when you want me to publish it to GitHub."

If the user then says to post it, use `gh pr comment` to post the exact preview text as a comment on the PR.

Notes:
- Never flag pre-existing issues in lines the PR did not touch.
- Do not run the build, typecheck, or tests — those run separately in CI.
- Use `gh` for all GitHub interactions; never use web fetch for GitHub URLs.
- Code links must use the full git SHA (not a branch name or abbreviated hash). Format: `https://github.com/owner/repo/blob/FULL40CHARSHA/path/to/file.ext#Lstart-Lend`. Provide at least 1 line of context on each side of the flagged line.
- Keep each issue description to one sentence. Put evidence in the parenthetical.
