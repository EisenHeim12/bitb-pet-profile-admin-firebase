// src/lib/breeds.ts

export type BreedType = "Purebred" | "Mix-breed" | "Cross-breed";

export type BreedRecord = {
  key: string;          // stable internal key (slug)
  label: string;        // what user sees/selects
  aliases?: string[];   // optional alternate spellings/names
  sources: Array<"FCI" | "AKC">;
  fci?: { groupNo: number; groupName: string };
  akc?: { groupName: string };
};

export const SPECIAL_BREEDS = [
  "Indie (Indian Pariah)",
  "Mix-breed",
  "Cross-breed",
] as const;

export const BREEDS: BreedRecord[] = [
  {
    key: "indie-indian-pariah",
    label: "Indie (Indian Pariah)",
    sources: [],
  },
  {
    key: "golden-retriever",
    label: "Golden Retriever",
    sources: ["FCI", "AKC"],
    fci: { groupNo: 8, groupName: "Retrievers - Flushing Dogs - Water Dogs" },
    akc: { groupName: "Sporting" },
  },
  {
    key: "german-shepherd-dog",
    label: "German Shepherd Dog",
    sources: ["FCI", "AKC"],
    fci: { groupNo: 1, groupName: "Sheepdogs and Cattledogs (except Swiss Cattledogs)" },
    akc: { groupName: "Herding" },
    aliases: ["German Shepherd"],
  },
];

export function findBreedRecordByLabel(label: string): BreedRecord | undefined {
  const q = label.trim().toLowerCase();
  return BREEDS.find(b =>
    b.label.toLowerCase() === q ||
    (b.aliases ?? []).some(a => a.toLowerCase() === q)
  );
}
