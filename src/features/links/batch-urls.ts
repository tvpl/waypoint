import { canonicalUrl, pastedUrl } from "@/lib/url";

export const MAX_BATCH_LINKS = 100;
export function parseBatchUrls(text: string): {
  urls: string[];
  invalid: string[];
  repeated: number;
} {
  const urls: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  let repeated = 0;
  for (const line of text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"))) {
    const url = line.length <= 4096 ? pastedUrl(line) : null;
    if (!url) {
      invalid.push(line);
      continue;
    }
    const key = canonicalUrl(url);
    if (seen.has(key)) {
      repeated++;
      continue;
    }
    seen.add(key);
    urls.push(url);
  }
  return { urls, invalid, repeated };
}
