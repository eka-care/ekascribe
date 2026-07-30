/**
 * Apply STATE_SNAPSHOT / STATE_DELTA frames to a local ScribeState.
 *
 * STATE_SNAPSHOT replaces state wholesale.
 * STATE_DELTA carries an RFC 6902 JSON Patch over the existing state.
 *
 * We implement a minimal subset of JSON Patch (add, replace, remove)
 * since that's what the AG-UI ScribeState mutator emits — paths are
 * always rooted at `/sections/...` or `/omitted_sections/...` per the
 * BE state ops in voice2rx/services/templates/ag_ui/state_ops.py.
 */

import type { JsonPatchOp } from './ag-ui-stream';
import type { ScribeState } from './types';

export const EMPTY_SCRIBE_STATE: ScribeState = {
  template_id: '',
  txn_id: '',
  document_id: '',
  transcript: '',
  sections: [],
  omitted_sections: [],
  pending_tool_call_id: null,
};

export function applySnapshot(snapshot: unknown): ScribeState {
  if (!snapshot || typeof snapshot !== 'object') return { ...EMPTY_SCRIBE_STATE };
  const s = snapshot as Partial<ScribeState>;
  return {
    template_id: s.template_id ?? '',
    txn_id: s.txn_id ?? '',
    document_id: s.document_id ?? '',
    transcript: s.transcript ?? '',
    sections: Array.isArray(s.sections) ? s.sections : [],
    omitted_sections: Array.isArray(s.omitted_sections) ? s.omitted_sections : [],
    pending_tool_call_id: s.pending_tool_call_id ?? null,
  };
}

export function applyPatch(state: ScribeState, ops: JsonPatchOp[]): ScribeState {
  // Deep-clone once. ScribeState is small (≤ a few dozen sections);
  // structural-sharing tricks aren't worth the bug surface.
  const next = JSON.parse(JSON.stringify(state)) as ScribeState;
  for (const op of ops) {
    try {
      applyOp(next as unknown as Record<string, unknown>, op);
    } catch (e) {
      // Patch ops occasionally race against snapshot resets. Log and
      // keep going — the next snapshot will reconcile.
      console.warn('AG-UI patch op failed', op, e);
    }
  }
  return next;
}

function applyOp(root: Record<string, unknown>, op: JsonPatchOp): void {
  const tokens = parsePointer(op.path);
  if (tokens.length === 0) {
    // Replace whole document — rare, but spec-compliant.
    if (op.op === 'replace' && op.value && typeof op.value === 'object') {
      Object.keys(root).forEach((k) => delete root[k]);
      Object.assign(root, op.value as Record<string, unknown>);
    }
    return;
  }

  const lastToken = tokens[tokens.length - 1];
  const parent = walkTo(root, tokens.slice(0, -1));
  if (parent === undefined) return;

  if (op.op === 'add' || op.op === 'replace') {
    setAt(parent, lastToken, op.value);
  } else if (op.op === 'remove') {
    removeAt(parent, lastToken);
  } else if (op.op === 'move' || op.op === 'copy') {
    if (!op.from) return;
    const fromTokens = parsePointer(op.from);
    const fromParent = walkTo(root, fromTokens.slice(0, -1));
    if (fromParent === undefined) return;
    const value = readAt(fromParent, fromTokens[fromTokens.length - 1]);
    if (op.op === 'move') removeAt(fromParent, fromTokens[fromTokens.length - 1]);
    setAt(parent, lastToken, value);
  }
}

function parsePointer(pointer: string): string[] {
  if (!pointer || pointer === '/') return pointer === '/' ? [''] : [];
  if (!pointer.startsWith('/')) return [];
  return pointer
    .slice(1)
    .split('/')
    .map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function walkTo(root: unknown, tokens: string[]): unknown {
  let cur: unknown = root;
  for (const t of tokens) {
    if (Array.isArray(cur)) {
      const idx = parseInt(t, 10);
      if (Number.isNaN(idx)) return undefined;
      cur = cur[idx];
    } else if (cur && typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[t];
    } else {
      return undefined;
    }
    if (cur === undefined) return undefined;
  }
  return cur;
}

function readAt(parent: unknown, token: string): unknown {
  if (Array.isArray(parent)) {
    const idx = token === '-' ? parent.length : parseInt(token, 10);
    return parent[idx];
  }
  if (parent && typeof parent === 'object') {
    return (parent as Record<string, unknown>)[token];
  }
  return undefined;
}

function setAt(parent: unknown, token: string, value: unknown): void {
  if (Array.isArray(parent)) {
    if (token === '-') {
      parent.push(value);
      return;
    }
    const idx = parseInt(token, 10);
    if (Number.isNaN(idx)) return;
    // 'add' on an array index inserts; 'replace' overwrites. We can't
    // easily distinguish here, but pydantic's emitter consistently uses
    // explicit indices for replace and `-` for append, so a positional
    // assign is correct in both cases.
    parent[idx] = value;
    return;
  }
  if (parent && typeof parent === 'object') {
    (parent as Record<string, unknown>)[token] = value;
  }
}

function removeAt(parent: unknown, token: string): void {
  if (Array.isArray(parent)) {
    const idx = parseInt(token, 10);
    if (Number.isNaN(idx)) return;
    parent.splice(idx, 1);
    return;
  }
  if (parent && typeof parent === 'object') {
    delete (parent as Record<string, unknown>)[token];
  }
}
