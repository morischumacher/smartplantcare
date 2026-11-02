// Looks up a freely licensed example photo for a plant species on Wikipedia / Wikimedia Commons.
// Only Commons files are used (they carry a free licence); author and licence are returned for attribution.

const UA = "SmartPlantMonitor/1.0 (private plant monitoring app)";

export interface WikiImage {
  url: string;
  author: string | null;
  license: string | null;
  source_url: string;
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`wikimedia ${res.status}`);
  return await res.json();
}

const stripHtml = (s: string | undefined) => (s ? s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() || null : null);

/** File name of the lead image of a Wikipedia article, if any. */
async function pageImage(lang: "en" | "de", title: string): Promise<string | null> {
  const q = new URLSearchParams({ action: "query", titles: title, prop: "pageimages", piprop: "name", redirects: "1", format: "json", origin: "*" });
  const data = await getJson(`https://${lang}.wikipedia.org/w/api.php?${q}`);
  const pages = (data.query as { pages?: Record<string, { pageimage?: string }> } | undefined)?.pages ?? {};
  return Object.values(pages).find((p) => p.pageimage)?.pageimage ?? null;
}

async function commonsInfo(file: string): Promise<WikiImage | null> {
  const q = new URLSearchParams({
    action: "query",
    titles: `File:${file}`,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "800",
    format: "json",
    origin: "*",
  });
  const data = await getJson(`https://commons.wikimedia.org/w/api.php?${q}`);
  const pages = (data.query as { pages?: Record<string, { missing?: string; imageinfo?: Record<string, unknown>[] }> } | undefined)?.pages ?? {};
  const info = Object.values(pages)[0]?.imageinfo?.[0];
  if (!info) return null; // not on Commons (e.g. a non-free local file)
  const meta = (info.extmetadata ?? {}) as Record<string, { value?: string }>;
  return {
    url: String(info.thumburl ?? info.url).split("?")[0],
    author: stripHtml(meta.Artist?.value),
    license: stripHtml(meta.LicenseShortName?.value),
    source_url: String(info.descriptionurl),
  };
}

export async function findSpeciesImage(scientificName: string, commonNameDe: string): Promise<WikiImage | null> {
  const attempts: ["en" | "de", string][] = [
    ["en", scientificName],
    ["de", scientificName],
    ["de", commonNameDe],
  ];
  for (const [lang, title] of attempts) {
    const file = await pageImage(lang, title).catch(() => null);
    if (!file) continue;
    const image = await commonsInfo(file).catch(() => null);
    if (image) return image;
  }
  return null;
}
