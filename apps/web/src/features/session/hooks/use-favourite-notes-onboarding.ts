'use client';

import { useCallback, useState } from 'react';
import { getStorage } from '@/platform';

const FEATURE_USED_KEY = 'favourite_notes_used';
const NEW_CHIP_SEEN_AT_KEY = 'favourite_notes_new_chip_seen_at';
const TUTORIAL_ATTEMPTS_KEY = 'favourite_notes_tutorial_attempts';
const NEW_CHIP_MAX_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TUTORIAL_ATTEMPTS = 2;

/**
 * First-time-experience state for favourite notes: the "New" chip on the star icon
 * (shown until the feature is used or 10 days pass, whichever comes first) and the
 * tutorial popup (shown on add attempts until the first favourite is added, capped
 * at MAX_TUTORIAL_ATTEMPTS attempts so it stops nagging if the user never completes it).
 */
export function useFavouriteNotesOnboarding(hasFavouriteNotes: boolean) {
  const [hasUsedFeature, setHasUsedFeature] = useState(
    () => getStorage().local.get(FEATURE_USED_KEY) === 'true'
  );

  const [tutorialAttempts, setTutorialAttempts] = useState(
    () => Number(getStorage().local.get(TUTORIAL_ATTEMPTS_KEY)) || 0
  );

  const [chipWindowActive] = useState(() => {
    const storage = getStorage().local;
    const seenAt = storage.get(NEW_CHIP_SEEN_AT_KEY);
    if (!seenAt) {
      storage.set(NEW_CHIP_SEEN_AT_KEY, new Date().toISOString());
      return true;
    }
    return Date.now() - new Date(seenAt).getTime() < NEW_CHIP_MAX_DAYS * DAY_MS;
  });

  // Notes coming from config also count as "used" (e.g. favourited on another device).
  const hasEverFavourited = hasUsedFeature || hasFavouriteNotes;

  const markFeatureUsed = useCallback(() => {
    getStorage().local.set(FEATURE_USED_KEY, 'true');
    setHasUsedFeature(true);
  }, []);

  const recordTutorialAttempt = useCallback(() => {
    setTutorialAttempts((prev) => {
      const next = prev + 1;
      getStorage().local.set(TUTORIAL_ATTEMPTS_KEY, String(next));
      return next;
    });
  }, []);

  return {
    showNewChip: chipWindowActive && !hasEverFavourited,
    showTutorial: !hasEverFavourited && tutorialAttempts < MAX_TUTORIAL_ATTEMPTS,
    markFeatureUsed,
    recordTutorialAttempt,
  };
}
