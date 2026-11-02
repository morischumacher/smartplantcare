// Renders Pflanzen.js with stand-ins for the Scriptable API, for every widget size, online and
// offline. Run: node --test scriptable/test/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../Pflanzen.js", import.meta.url), "utf8");
const sample = {
  generated_at: new Date(Date.now() - 5 * 60000).toISOString(),
  attention: 2,
  plants: [
    { name: "Efeutute", room: "Schlafzimmer", status: "water_now", moisture: 12, ml: 250, next: null, hint: "Gießen" },
    { name: "Ufopflanze", room: "Schlafzimmer", status: "water_soon", moisture: 22, ml: 150, next: new Date(Date.now() + 86400000).toISOString(), hint: null },
    { name: "Monstera", room: "Wohnzimmer", status: "ok", moisture: 38, ml: null, next: new Date(Date.now() + 4 * 86400000).toISOString(), hint: null },
    { name: "Dieffenbachie", room: "Wohnzimmer", status: "no_data", moisture: null, ml: null, next: null, hint: null },
  ],
  rooms: [{ name: "Schlafzimmer", humidity: 47, temperature: 21.2, status: "ok" }],
};

function run({ family, response, cached = null, token = "t" }) {
  const texts = [];
  let widget = null;
  const files = new Map(cached ? [["/cache/plants-summary.json", JSON.stringify(cached)]] : []);
  const keychain = new Map([...(token ? [["plants.summary-token", token]] : []), ["plants.web-url", "https://app.example"]]);
  class Stack {
    constructor() { this.children = []; }
    addText(v) { texts.push(v); return { rightAlignText() {} }; }
    addStack() { return new Stack(); }
    addImage() { return {}; }
    addSpacer() {}
    layoutHorizontally() {}
    layoutVertically() {}
    centerAlignContent() {}
    setPadding() {}
  }
  class ListWidget extends Stack {}
  const g = {
    ListWidget,
    Color: Object.assign(function (hex) { this.hex = hex; }, { dynamic: (a) => a, white: () => ({}) }),
    Font: { systemFont: () => ({}), boldSystemFont: () => ({}) },
    Size: function () {},
    SFSymbol: { named: () => ({ image: {} }) },
    Keychain: { contains: (k) => keychain.has(k), get: (k) => keychain.get(k), set: (k, v) => keychain.set(k, v), remove: (k) => keychain.delete(k) },
    FileManager: {
      local: () => ({
        cacheDirectory: () => "/cache",
        joinPath: (a, b) => `${a}/${b}`,
        fileExists: (p) => files.has(p),
        readString: (p) => files.get(p),
        writeString: (p, v) => files.set(p, v),
      }),
    },
    Request: class {
      constructor(url) { assert.match(url, /view=compact/); }
      async loadJSON() {
        if (response instanceof Error) throw response;
        assert.equal(this.headers["x-read-token"], token);
        this.response = { statusCode: 200 };
        return response;
      }
    },
    Alert: class {},
    config: { runsInWidget: true, runsInApp: false, widgetFamily: family },
    args: { widgetParameter: null, queryParameters: {} },
    Script: { setWidget: (w) => (widget = w), complete() {} },
  };
  const fn = new (Object.getPrototypeOf(async function () {}).constructor)(...Object.keys(g), source);
  return fn(...Object.values(g)).then(() => ({ texts, widget, files }));
}

for (const family of ["small", "medium", "large", "accessoryCircular", "accessoryRectangular", "accessoryInline"]) {
  test(`${family}: shows what needs water`, async () => {
    const { texts, widget } = await run({ family, response: sample });
    const all = texts.join(" | ");
    assert.ok(widget, "widget set");
    if (family === "accessoryCircular") assert.match(all, /2/);
    else assert.match(all, /1 Pflanze gießen/);
    if (family === "medium" || family === "large") assert.match(all, /Efeutute.*12 % · 250 ml/);
    if (family === "small") assert.match(all, /Efeutute · 12 %/);
  });
}

test("offline: falls back to the cached response and says so", async () => {
  const { texts } = await run({ family: "medium", response: new Error("offline"), cached: sample });
  assert.match(texts.join(" | "), /offline/);
});

test("no token and nothing cached: explains the setup", async () => {
  const { texts } = await run({ family: "small", response: sample, token: null });
  assert.match(texts.join(" | "), /Kein Token/);
});

test("all ok: no alarm", async () => {
  const calm = { ...sample, attention: 0, plants: sample.plants.map((p) => ({ ...p, status: "ok" })) };
  const { texts } = await run({ family: "small", response: calm });
  assert.match(texts.join(" | "), /Alles gut.*Nächstes Gießen morgen/);
});
