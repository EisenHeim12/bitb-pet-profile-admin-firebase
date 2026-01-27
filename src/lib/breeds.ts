// src/lib/breeds.ts
// Wrapper so the app can keep importing from "@/lib/breeds"

export type { BreedType, BreedRecord } from "./breeds.generated";
export { BREEDS } from "./breeds.generated";

// These are app-specific options (not part of FCI/AKC datasets)
export const SPECIAL_BREEDS = [
  "Indie (Indian Pariah)",
  "Mix-breed",
  "Cross-breed",
] as const;

// Compatibility helper used by the UI
import type { BreedRecord } from "./breeds.generated";
import { BREEDS as LIST } from "./breeds.generated";

export function findBreedRecordByLabel(label: string): BreedRecord | undefined {
  const q = label.trim().toLowerCase();
  return LIST.find((b) => b.label.toLowerCase() === q);
}
