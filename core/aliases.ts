// Query aliases. 2026-10-13.
//
// A short query is matched against a small embedding model and a keyword index, and neither knows that
// "psychokinesis" is what the program calls "mind-matter interaction", or that "QRNG" is spelled out in most
// abstracts. Each entry maps a term people type (whole words, any case) to the words the abstracts use. The
// expansion is appended, so the original text still leads both the keyword score and the embedding. Keep the
// expansions literal (the spelled-out term, a synonym the program uses), not thematic: "LLM" once pulled in
// "machine consciousness" and the list filled with philosophy of AI talks that never mention a language model.

const ALIASES: [string[], string][] = [
  [["llm", "llms", "chatgpt", "gpt"], "large language model LLM"],
  [["ai"], "artificial intelligence"],
  [["qrng", "rng", "trng", "random number generator", "random number generators", "quantum randomness"], "random number generator RNG quantum randomness mind-matter interaction"],
  [["psychokinesis", "pk", "micro-pk", "micro pk", "telekinesis", "mind over matter"], "psychokinesis mind-matter interaction psi random number generator anomalous"],
  [["psi", "parapsychology", "esp", "telepathy", "precognition", "presentiment", "remote viewing", "clairvoyance"], "psi parapsychology anomalous cognition nonlocal"],
  [["rigor", "rigour", "rigorous", "replication", "replication crisis", "open science", "preregistered", "prereg"], "preregistration replication confirmatory methodology"],
  [["iit"], "integrated information theory"],
  [["orch or", "orch-or", "orchor"], "orchestrated objective reduction microtubules Penrose Hameroff"],
  [["gwt", "gnwt", "global workspace"], "global workspace theory"],
  [["hot", "higher-order", "higher order"], "higher-order theory"],
  [["nde", "ndes", "near death"], "near-death experience"],
  [["obe", "obes", "out of body", "out-of-body"], "out-of-body experience"],
  [["psychedelic", "psychedelics"], "psilocybin LSD DMT ayahuasca"],
  [["meditation", "meditator", "meditators"], "mindfulness contemplative practice"],
  [["qualia", "hard problem"], "phenomenal experience explanatory gap"],
  [["free will"], "agency volition mental causation"],
  [["eeg", "meg", "fmri", "neuroimaging"], "neural correlates"],
];

const PATTERNS = ALIASES.map(([terms, add]) => ({
  re: new RegExp(`(^|[^a-z0-9])(?:${terms.map((t) => t.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})(?=$|[^a-z0-9])`, "i"),
  add,
}));

/** The text, followed by the program's own words for any field term it contains. */
export function expandQuery(text: string): string {
  const lower = text.toLowerCase();
  const extra: string[] = [];
  for (const p of PATTERNS) {
    if (!p.re.test(text)) continue;
    for (const w of p.add.split(" ")) if (!lower.includes(w.toLowerCase()) && !extra.includes(w)) extra.push(w);
  }
  return extra.length ? `${text} ${extra.join(" ")}` : text;
}
