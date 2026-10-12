export const AXES = ["ontology", "mechanism", "evidence", "scope"] as const;
export type Axis = (typeof AXES)[number];
export type AxisScores = Record<Axis, number | null>;

export const DISCIPLINES = [
  "neuroscience", "physics", "biology", "philosophy", "psychology",
  "contemplative/experiential", "anomalous/psi research", "AI/computation",
  "arts/humanities", "medicine/clinical",
] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export const METHODS = [
  "EEG/MEG", "fMRI", "other imaging", "anesthesia", "psychedelics", "meditation",
  "phenomenology/first-person", "survey/questionnaire", "formal/mathematical model",
  "computational simulation", "lab physics/biophysics", "animal study", "clinical",
  "theoretical argument", "case reports", "art/practice",
] as const;
export type Method = (typeof METHODS)[number];

export type PresType = "Plenary" | "Concurrent" | "Poster" | "Panel" | "Remote" | "Workshop";

/** One presentation as scraped from its official abstract page. Contains raw text: never exported. */
export interface RawRecord {
  id: string;            // slug, e.g. "jack-tuszynski"
  name: string;
  affiliation: string;
  title: string;
  abstract: string;
  bio: string;
  url: string;
  day: string | null;    // ISO date "2026-10-12"
  sessionCode: string | null; // "PL-1", "MON-1", "PS-1"
  sessionName: string | null;
  room: string | null;
  types: PresType[];
  workshops: string[];   // workshop anchor ids from tag links, e.g. ["quantum-biology"]
}

export interface Enrichment {
  core_claim: string;
  discipline: Discipline;
  methods: Method[];
  axes: AxisScores;
  concepts: string[];
  ask_question: string;
  challenge_question: string;
}

/** Public, exportable view of a presentation. */
export interface Doc {
  id: string;
  name: string;
  affiliation: string;
  title: string;
  url: string;
  day: string | null;
  sessionCode: string | null;
  sessionName: string | null;
  room: string | null;
  types: PresType[];
  workshops: string[];
  coreClaim: string;
  discipline: Discipline;
  methods: Method[];
  axes: AxisScores;
  concepts: string[];
  askQuestion: string;
  challengeQuestion: string;
  xy: [number, number];
}

export type SlotKind = "workshop" | "plenary" | "concurrent" | "poster";
/** streamed/zoomUrl: the official program links this session to its public Zoom stream. */
export interface SlotOption { id: string; label: string; room: string | null; docIds: string[]; streamed?: boolean; zoomUrl?: string }
export interface Slot { id: string; day: string; start: string; end: string | null; kind: SlotKind; options: SlotOption[] }
