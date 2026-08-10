export type SavedNoteEntry = { id: string; name: string; added_at?: string };

export function preserveSavedNoteDates(
  incoming?: SavedNoteEntry[],
  existing?: SavedNoteEntry[]
): SavedNoteEntry[] | undefined {
  if (!incoming?.length || !existing?.length) return incoming;

  const knownDates = new Map(
    existing.filter((note) => note.added_at).map((note) => [note.id, note.added_at])
  );

  return incoming.map((note) =>
    note.added_at ? note : { ...note, added_at: knownDates.get(note.id) }
  );
}
