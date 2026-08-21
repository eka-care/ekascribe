'use client';

/**
 * Session-level structuring model selector, shown in the header next to the
 * title field. Writes the same store key (`structuringModel`) the AG-UI run
 * hook already reads, so every "Convert to another template" / structuring
 * call sends the pick as `?model=` — no per-popover state.
 *
 * The first entry of appConfig.supported_models is the backend's default
 * (use-settings normalizes the store to it) and is labelled "(default)".
 */

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Cpu } from 'lucide-react';
import useVoice2RxStore from '@/store/store';
import type { TPreferenceItem } from '@/constants/types';

// Stable identity for the empty case (zustand getSnapshot-cache warning).
const NO_MODELS: TPreferenceItem[] = [];

const ModelSelector = () => {
  const supportedModels = useVoice2RxStore(
    (state) => state.appConfig.supported_models ?? NO_MODELS
  );
  const structuringModel = useVoice2RxStore((state) => state.structuringModel);
  const setStructuringModel = useVoice2RxStore((state) => state.setStructuringModel);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Nothing to choose from -> the backend falls back to its env default.
  if (supportedModels.length === 0) return null;

  // The qwen entry is the backend's default structuring model — it alone
  // carries the "(default)" tag, wherever it sits in the configured list.
  // Match on the id: display names are now generic labels ("Model 1").
  const defaultModel =
    supportedModels.find((m) => /qwen/i.test(m.id)) ?? supportedModels[0];
  const selectedModel =
    supportedModels.find((m) => m.id === structuringModel) ?? defaultModel;

  const labelFor = (model: TPreferenceItem) =>
    model.id === defaultModel.id ? `${model.name} (default)` : model.name;

  return (
    <div ref={rootRef} className="relative flex-1 sm:flex-none sm:w-56 min-w-0">
      {/* Sized to mirror SessionTitleField's boxed state: same border, radius,
          padding and type scale, so the two read as one control row. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Model used to structure notes"
        className="flex w-full items-center gap-2 rounded-lg border border-[#D1D1D1] bg-white px-3 py-1.5 text-left transition-colors hover:bg-[#F5F5F5] cursor-pointer"
      >
        <Cpu className="h-4 w-4 shrink-0 text-[#767676]" />
        <span className="flex-1 truncate text-sm font-medium text-[#1A1A1A]">
          {labelFor(selectedModel)}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#9CA3AF] transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 flex max-h-56 flex-col overflow-y-auto rounded-md border border-[#D1D1D1] bg-white shadow-md">
          {supportedModels.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => {
                setStructuringModel(model.id);
                setOpen(false);
              }}
              className="flex items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-[#F5F5F5] cursor-pointer"
            >
              <Check
                className={`h-4 w-4 shrink-0 text-primary ${
                  model.id === selectedModel.id ? 'opacity-100' : 'opacity-0'
                }`}
              />
              <span className="truncate text-sm text-[#191919]">{labelFor(model)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ModelSelector;
