import { cachedFetch } from "./fetch";

export const BASE = "https://tsc2026.org/";
export const LISTING_PAGES = ["program_details.html", "program.html", "concurrent.html", "posters.html", "workshops.html"];

export function listAbstractSlugs(listingHtml: string[]): string[] {
  const slugs = new Set<string>();
  for (const html of listingHtml)
    for (const m of html.matchAll(/abstracts_html\/([^"#]+)\.html/g)) slugs.add(m[1]);
  return [...slugs].sort();
}

async function main() {
  const pages: string[] = [];
  for (const p of LISTING_PAGES) pages.push(await cachedFetch(BASE + p, `data/raw/pages/${p}`));
  const slugs = listAbstractSlugs(pages);
  console.log(`${slugs.length} abstract pages`);
  let i = 0;
  for (const s of slugs) {
    await cachedFetch(`${BASE}abstracts_html/${s}.html`, `data/raw/abstracts/${s}.html`);
    if (++i % 50 === 0) console.log(i);
  }
  console.log("done");
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
