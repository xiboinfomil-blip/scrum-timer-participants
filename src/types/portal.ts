export type Hint = { participantId: string; hint: string; revision: number };
export type Notes = { day: string; hints: Hint[] };
export type NoteInput = Hint & { day: string };
export type Person = {
  id: string; name: string; mood: 1 | 2 | 3 | 4 | null;
  speakingSeconds: number; budgetSeconds: number; timeUp: boolean;
  score: number | null; meterTitle: string | null;
};
export type Round = { id: string; completedAt: string; people: Person[] };
export type PortalData = Notes & {
  team: { id: string; name: string; roster: { id: string; name: string; present: boolean }[] };
  history: Round[];
};