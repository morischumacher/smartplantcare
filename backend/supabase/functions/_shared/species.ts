// Matches a species name as Claude or the user writes it ("Calathea orbifolia", "Efeutute",
// "Monstera deliciosa 'Thai Constellation'") to an entry of the species table.
// Pure logic without Deno/Supabase imports, tested with node --test.

export interface SpeciesName {
  id: string;
  scientific_name: string;
  common_name_de: string;
  aliases: string[];
}

/** Lowercase, no accents, no cultivar in quotes, no hybrid sign, single spaces. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['‘’"„“].*?['‘’"„“]/g, " ") // cultivar names like 'Birkin'
    .replace(/\b(var|subsp|ssp|cv|f)\.\s*\S+/gi, " ")
    .replace(/[×x]\s+/g, (m) => (m.trim() === "×" ? " " : m))
    .replace(/[()]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best match for `name`: exact name or alias first, then the species part of a scientific name
 * (genus + epithet). A bare genus ("Monstera") only matches when exactly one species of that genus
 * is known – or when it is listed as an alias.
 */
export function matchSpecies<T extends SpeciesName>(name: string | null | undefined, list: T[]): T | null {
  if (!name) return null;
  const n = normalizeName(name);
  if (!n) return null;
  const names = (s: T) => [s.scientific_name, s.common_name_de, ...s.aliases].map(normalizeName);

  const exact = list.find((s) => names(s).includes(n));
  if (exact) return exact;

  const [genus, epithet] = n.split(" ");
  if (epithet) {
    const binomial = `${genus} ${epithet}`;
    const hit = list.find((s) => names(s).some((x) => x.split(" ").slice(0, 2).join(" ") === binomial));
    if (hit) return hit;
  }
  const sameGenus = list.filter((s) => names(s).some((x) => x.split(" ")[0] === genus && x.includes(" ")));
  return sameGenus.length === 1 && !epithet ? sameGenus[0] : null;
}
