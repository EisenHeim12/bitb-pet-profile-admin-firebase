// scripts/gen-breeds.mjs
// GEN-BREEDS v5 (prints its own path so we can prove you’re running the right file)
//
// Sources:
// - AKC CSV: tmfilho/akcdata (note: first header cell is blank; breed name is column 0) :contentReference[oaicite:1]{index=1}
// - FCI list: paiv/fci-breeds repo (CSV exported from FCI nomenclature) :contentReference[oaicite:2]{index=2}

import fs from "node:fs";
import path from "node:path";

const VERSION = "GEN-BREEDS v5";

const FCI_CSV_URL =
  "https://raw.githubusercontent.com/paiv/fci-breeds/main/fci-breeds.csv";
const AKC_CSV_URL =
  "https://raw.githubusercontent.com/tmfilho/akcdata/master/data/akc-data-latest.csv";

const OUT_FILE = path.join(process.cwd(), "src", "lib", "breeds.generated.ts");

function stripBOM(s) {
  return (s || "").replace(/^\uFEFF/, "");
}

function normalize(s) {
  return stripBOM(String(s ?? ""))
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[()'’.,/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(s) {
  return normalize(s).replace(/\s/g, "-");
}

// CSV parser (supports quotes + commas)
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(cur);
      cur = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cur);
      cur = "";
      rows.push(row);
      row = [];
      continue;
    }

    cur += ch;
  }

  row.push(cur);
  rows.push(row);

  // drop totally-empty trailing rows
  return rows.filter((r) => r.some((x) => String(x ?? "").trim() !== ""));
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "bitb-breeds-generator/1.0" },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return await res.text();
}

function findIdx(headerLower, candidates) {
  for (const c of candidates) {
    const idx = headerLower.indexOf(c);
    if (idx !== -1) return idx;
  }
  return -1;
}

function asInt(v) {
  const n = Number.parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseFciFromCsv(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) throw new Error("FCI CSV empty/invalid.");

  const header = rows[0].map((h) => stripBOM(String(h ?? "").trim()));
  const hl = header.map((h) => h.toLowerCase());

  const nameIdx = findIdx(hl, ["name", "breed", "breedname", "breed_name"]);
  if (nameIdx === -1) {
    throw new Error(
      `FCI CSV: could not find breed name column. Header: ${header.join(", ")}`
    );
  }

  const breedNoIdx = findIdx(hl, ["breedno", "breed_no", "no", "number", "id"]);
  const groupNoIdx = findIdx(hl, ["groupno", "group_no", "group number", "groupnumber"]);
  const groupNameIdx = findIdx(hl, ["groupname", "group_name", "group"]);
  const sectionNoIdx = findIdx(hl, ["sectionno", "section_no", "section number", "sectionnumber"]);
  const sectionNameIdx = findIdx(hl, ["sectionname", "section_name", "section"]);

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const label = String(r[nameIdx] ?? "").trim();
    if (!label) continue;

    out.push({
      label,
      fci: {
        breedNo: breedNoIdx !== -1 ? asInt(r[breedNoIdx]) : undefined,
        groupNo: groupNoIdx !== -1 ? asInt(r[groupNoIdx]) : undefined,
        groupName:
          groupNameIdx !== -1 ? String(r[groupNameIdx] ?? "").trim() || undefined : undefined,
        sectionNo: sectionNoIdx !== -1 ? asInt(r[sectionNoIdx]) : undefined,
        sectionName:
          sectionNameIdx !== -1 ? String(r[sectionNameIdx] ?? "").trim() || undefined : undefined,
      },
    });
  }
  return out;
}

async function main() {
  console.log(`${VERSION}`);
  console.log(`cwd: ${process.cwd()}`);
  console.log(`script: ${new URL(import.meta.url).pathname}`);

  console.log("Fetching FCI CSV...");
  const fciCsv = await fetchText(FCI_CSV_URL);
  const fciRows = parseFciFromCsv(fciCsv);

  console.log("Fetching AKC CSV...");
  const akcCsv = await fetchText(AKC_CSV_URL);
  const akcRows = parseCsv(akcCsv);
  if (akcRows.length < 2) throw new Error("AKC CSV empty/invalid.");

  const akcHeader = akcRows[0].map((h) => stripBOM(String(h ?? "").trim()));
  const akcHL = akcHeader.map((h) => h.toLowerCase());

  // AKC: first header cell is blank; breed name is column 0. :contentReference[oaicite:3]{index=3}
  let breedIdx = akcHL.findIndex((x) => x === "breed" || x === "name");
  if (breedIdx === -1) breedIdx = 0;

  const groupIdx = akcHL.findIndex((x) => x === "group");
  if (groupIdx === -1) {
    throw new Error(
      `${VERSION}: AKC CSV missing 'group' header. Got: ${akcHeader
        .slice(0, 25)
        .join(", ")}`
    );
  }

  const akc = [];
  for (let i = 1; i < akcRows.length; i++) {
    const r = akcRows[i];
    const label = String(r[breedIdx] ?? "").trim();
    if (!label) continue;
    const groupName = String(r[groupIdx] ?? "").trim() || undefined;
    akc.push({ label, akc: { groupName } });
  }

  // Merge
  const map = new Map();

  for (const b of fciRows) {
    const k = normalize(b.label);
    map.set(k, {
      key: slugify(b.label),
      label: b.label,
      type: "Purebred",
      sources: ["FCI"],
      fci: b.fci,
      akc: undefined,
    });
  }

  for (const b of akc) {
    const k = normalize(b.label);
    const ex = map.get(k);
    if (ex) {
      ex.sources = Array.from(new Set([...ex.sources, "AKC"]));
      ex.akc = b.akc;
    } else {
      map.set(k, {
        key: slugify(b.label),
        label: b.label,
        type: "Purebred",
        sources: ["AKC"],
        fci: undefined,
        akc: b.akc,
      });
    }
  }

  const custom = [
    { key: "indie-indian-pariah", label: "Indie (Indian Pariah)", type: "Purebred", sources: [] },
    { key: "mix-breed", label: "Mix-breed", type: "Mix-breed", sources: [] },
    { key: "cross-breed", label: "Cross-breed", type: "Cross-breed", sources: [] },
  ];

  const merged = [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  const exclude = new Set(custom.map((x) => x.label));
  const finalList = [...custom, ...merged.filter((x) => !exclude.has(x.label))];

  const out = `// AUTO-GENERATED FILE. DO NOT EDIT BY HAND.
// Generated by ${VERSION}

export type BreedType = "Purebred" | "Mix-breed" | "Cross-breed";

export type BreedRecord = {
  key: string;
  label: string;
  type: BreedType;
  sources: Array<"FCI" | "AKC"> | [];
  fci?: {
    breedNo?: number;
    groupNo?: number;
    groupName?: string;
    sectionNo?: number;
    sectionName?: string;
  };
  akc?: { groupName?: string };
};

export const BREEDS: BreedRecord[] = ${JSON.stringify(finalList, null, 2)};
`;

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, out, "utf8");

  console.log(`✅ Wrote ${OUT_FILE}`);
  console.log(`FCI rows: ${fciRows.length}`);
  console.log(`AKC rows: ${akc.length}`);
  console.log(`Final options (incl. Indie/Mix/Cross): ${finalList.length}`);
}

main().catch((e) => {
  console.error(`❌ ${VERSION} failed:`, e);
  process.exitCode = 1;
});
