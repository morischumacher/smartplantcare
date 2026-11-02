import assert from "node:assert/strict";
import { test } from "node:test";
import { matchSpecies, normalizeName } from "./species.ts";

const list = [
  { id: "1", scientific_name: "Monstera deliciosa", common_name_de: "Fensterblatt", aliases: ["Monstera", "Swiss Cheese Plant"] },
  { id: "2", scientific_name: "Monstera adansonii", common_name_de: "Monstera adansonii", aliases: ["Affenmaske"] },
  { id: "3", scientific_name: "Goeppertia orbifolia", common_name_de: "Korbmarante orbifolia", aliases: ["Calathea orbifolia"] },
  { id: "4", scientific_name: "Alocasia × amazonica", common_name_de: "Pfeilblatt", aliases: ["Alocasia Polly"] },
  { id: "5", scientific_name: "Dracaena trifasciata", common_name_de: "Bogenhanf", aliases: ["Sansevieria trifasciata"] },
  { id: "6", scientific_name: "Epipremnum aureum", common_name_de: "Efeutute", aliases: ["Pothos"] },
];

test("normalizeName strips cultivars, accents and hybrid sign", () => {
  assert.equal(normalizeName("Monstera deliciosa 'Thai Constellation'"), "monstera deliciosa");
  assert.equal(normalizeName("Alocasia × amazonica"), "alocasia amazonica");
  assert.equal(normalizeName("  Grünlilie "), "grunlilie");
});

test("matches scientific, German and alias names", () => {
  assert.equal(matchSpecies("Efeutute", list)?.id, "6");
  assert.equal(matchSpecies("calathea orbifolia", list)?.id, "3");
  assert.equal(matchSpecies("Sansevieria trifasciata 'Laurentii'", list)?.id, "5");
  assert.equal(matchSpecies("Alocasia amazonica", list)?.id, "4");
});

test("matches by binomial when variety or subspecies is given", () => {
  assert.equal(matchSpecies("Epipremnum aureum var. marble queen", list)?.id, "6");
});

test("bare genus matches only via alias or a single known species", () => {
  assert.equal(matchSpecies("Monstera", list)?.id, "1"); // alias
  assert.equal(matchSpecies("Goeppertia", list)?.id, "3"); // only one Goeppertia
  assert.equal(matchSpecies("Ficus", list), null);
  assert.equal(matchSpecies("", list), null);
});
