import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const UA = "tsc-compass/0.1 (unofficial attendee tool)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function cachedFetch(
  url: string,
  cacheFile: string,
  opts: { fetchFn?: typeof fetch; delayMs?: number } = {},
): Promise<string> {
  if (new URL(url).hostname !== "tsc2026.org") throw new Error(`refusing non tsc2026.org url: ${url}`);
  if (existsSync(cacheFile)) return readFileSync(cacheFile, "utf8");
  const fetchFn = opts.fetchFn ?? fetch;
  const res = await fetchFn(url, { headers: { "User-Agent": UA } });
  if (res.status !== 200) throw new Error(`GET ${url} -> ${res.status}`);
  const body = await res.text();
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, body);
  await sleep(opts.delayMs ?? 400);
  return body;
}
