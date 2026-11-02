// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: leaf;

// Mo'sSmartPlantCare-Widget für Scriptable (iPhone). Liest die kompakte Übersicht der Edge Function `summary`
// und zeigt, welche Pflanzen Wasser brauchen. Größen: klein, mittel, groß und Sperrbildschirm.
//
// Einrichtung: Skript in Scriptable einmal direkt starten – es fragt nach dem Read-Token
// (SUMMARY_TOKEN) und der Adresse der Web-App und legt beides im Schlüsselbund ab. Später zeigt ein
// Start in der App eine Vorschau oder ändert die Einstellungen.

const SUMMARY_URL = "https://zvymcgkkjrfxqoartwrp.supabase.co/functions/v1/summary?view=compact";
const TOKEN_KEY = "plants.summary-token";
const WEB_KEY = "plants.web-url";
const CACHE_FILE = "plants-summary.json";
const REFRESH_MIN = 15;

const STATUS = {
  water_now: { label: "Gießen", color: new Color("#c25637"), symbol: "drop.fill" },
  water_soon: { label: "Bald", color: new Color("#d5a434"), symbol: "drop" },
  no_data: { label: "Keine Daten", color: new Color("#a5a091"), symbol: "wifi.slash" },
  ok: { label: "Gut", color: new Color("#348152"), symbol: "leaf.fill" },
};
const ALERT = {
  critical: new Color("#c25637"),
  warning: new Color("#d5a434"),
  symbol: { humidity: "humidity.fill", temperature: "thermometer.medium" },
};
const TEXT = Color.dynamic(new Color("#1f1e1a"), new Color("#f7f6f1"));
const MUTED = Color.dynamic(new Color("#7a7568"), new Color("#a5a091"));
// same palette as the web app ("Gewächshaus")
const BG = Color.dynamic(new Color("#f7f6f1"), new Color("#141411"));

// --- Setup -------------------------------------------------------------------

async function ask(title, message, placeholder, current) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  a.addTextField(placeholder, current ?? "");
  a.addAction("Speichern");
  a.addCancelAction("Abbrechen");
  if ((await a.presentAlert()) === -1) return null;
  return a.textFieldValue(0).trim() || null;
}

async function setup() {
  const token = await ask("Read-Token", "SUMMARY_TOKEN aus Supabase (Edge Functions → Secrets).", "Token", null);
  if (token) Keychain.set(TOKEN_KEY, token);
  const web = await ask("Web-App", "Adresse der Web-App, wird beim Antippen geöffnet.", "https://…vercel.app", Keychain.contains(WEB_KEY) ? Keychain.get(WEB_KEY) : "");
  if (web) Keychain.set(WEB_KEY, web.replace(/\/$/, ""));
}

// --- Data --------------------------------------------------------------------

function cache() {
  const fm = FileManager.local();
  return { fm, path: fm.joinPath(fm.cacheDirectory(), CACHE_FILE) };
}

/** Fresh data, or the last good response when offline (marked as stale). */
async function load() {
  const { fm, path } = cache();
  try {
    if (!Keychain.contains(TOKEN_KEY)) throw new Error("Kein Token – Skript in Scriptable einmal starten.");
    const req = new Request(SUMMARY_URL);
    req.headers = { "x-read-token": Keychain.get(TOKEN_KEY) };
    req.timeoutInterval = 20;
    const data = await req.loadJSON();
    if (req.response.statusCode !== 200) throw new Error(data.error ?? `HTTP ${req.response.statusCode}`);
    fm.writeString(path, JSON.stringify(data));
    return { data, stale: false, error: null };
  } catch (e) {
    if (fm.fileExists(path)) return { data: JSON.parse(fm.readString(path)), stale: true, error: String(e.message ?? e) };
    return { data: null, stale: true, error: String(e.message ?? e) };
  }
}

// --- Formatting --------------------------------------------------------------

function ago(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  return h < 24 ? `vor ${h} Std.` : `vor ${Math.round(h / 24)} T.`;
}

function until(iso) {
  if (!iso) return null;
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days <= 0) return "heute";
  if (days === 1) return "morgen";
  return `in ${days} T.`;
}

const moisture = (p) => (p.moisture === null ? "–" : `${p.moisture} %`);
const urgent = (data) => data.plants.filter((p) => p.status === "water_now" || p.status === "water_soon");
// climate alerts come from the backend (older responses have none)
const alerts = (data) => data.alerts ?? [];
const alertTitle = (a) => `${a.room}: ${a.message.split(" (")[0]}`;
/** water now and climate alerts – what the number on small and lock-screen widgets counts */
const todo = (data) => data.attention + alerts(data).length;

/** Most urgent first: water now, climate, water soon. */
function headline(data) {
  const now = data.plants.filter((p) => p.status === "water_now").length;
  if (now > 0) return now === 1 ? "1 Pflanze gießen" : `${now} Pflanzen gießen`;
  const a = alerts(data)[0];
  if (a) return alertTitle(a);
  const soon = data.plants.filter((p) => p.status === "water_soon").length;
  if (soon > 0) return soon === 1 ? "1 Pflanze bald" : `${soon} Pflanzen bald`;
  if (data.plants.length > 0 && data.plants.every((p) => p.status === "no_data")) return "Keine Sensordaten";
  return "Alles gut";
}

// --- Drawing -----------------------------------------------------------------

function symbol(name, size, color, stack) {
  const img = stack.addImage(SFSymbol.named(name).image);
  img.imageSize = new Size(size, size);
  img.tintColor = color;
  return img;
}

function text(stack, value, size, { bold = false, color = TEXT, lines = 1 } = {}) {
  const t = stack.addText(value);
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = lines;
  t.minimumScaleFactor = 0.7;
  return t;
}

function plantRow(stack, p, size) {
  const row = stack.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.spacing = 6;
  symbol(STATUS[p.status].symbol, size, STATUS[p.status].color, row);
  text(row, p.name, size, { bold: p.status === "water_now" });
  row.addSpacer();
  const detail = p.status === "water_now" && p.ml ? `${moisture(p)} · ${p.ml} ml` : moisture(p);
  text(row, detail, size - 1, { color: MUTED });
}

function alertRow(stack, a, size) {
  const row = stack.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.spacing = 6;
  symbol(ALERT.symbol[a.kind] ?? "exclamationmark.triangle.fill", size, ALERT[a.severity] ?? ALERT.warning, row);
  text(row, a.room, size, { bold: a.severity === "critical" });
  row.addSpacer();
  text(row, a.message, size - 1, { color: MUTED });
}

function footer(w, data, stale) {
  w.addSpacer();
  const f = text(w, `${stale ? "⚠︎ offline · " : ""}${ago(data.generated_at)}`, 9, { color: MUTED });
  f.rightAlignText();
}

function small(w, data, stale) {
  const top = urgent(data)[0] ?? data.plants[0];
  const alert = alerts(data)[0];
  // a climate alert outranks "water soon", not "water now"
  const showAlert = alert && top?.status !== "water_now";
  const head = w.addStack();
  head.centerAlignContent();
  if (showAlert) symbol(ALERT.symbol[alert.kind], 16, ALERT[alert.severity], head);
  else symbol(top ? STATUS[top.status].symbol : "leaf.fill", 16, top ? STATUS[top.status].color : STATUS.ok.color, head);
  head.addSpacer();
  text(head, String(todo(data)), 22, { bold: true, color: todo(data) > 0 ? STATUS.water_now.color : MUTED });
  w.addSpacer(6);
  text(w, headline(data), 14, { bold: true, lines: 2 });
  if (showAlert) {
    w.addSpacer(2);
    text(w, alert.message, 11, { color: MUTED, lines: 2 });
  } else if (top && top.status !== "ok" && top.status !== "no_data") {
    w.addSpacer(2);
    text(w, `${top.name} · ${moisture(top)}`, 11, { color: MUTED });
    if (top.ml) text(w, `${top.ml} ml`, 11, { color: MUTED });
  } else if (top) {
    const next = data.plants.map((p) => p.next).filter(Boolean).sort()[0];
    if (next) text(w, `Nächstes Gießen ${until(next)}`, 11, { color: MUTED, lines: 2 });
  }
  footer(w, data, stale);
}

function list(w, data, stale, max) {
  const head = w.addStack();
  head.centerAlignContent();
  text(head, headline(data), 14, { bold: true });
  head.addSpacer();
  const room = data.rooms.find((r) => r.humidity !== null);
  if (room) text(head, `${room.name} ${room.humidity} %`, 10, { color: MUTED });
  w.addSpacer(6);
  // rows: water now, climate alerts, then the rest of the plants
  const now = data.plants.filter((p) => p.status === "water_now");
  const rest = data.plants.filter((p) => p.status !== "water_now");
  const rows = [...now.map((p) => [plantRow, p]), ...alerts(data).map((a) => [alertRow, a]), ...rest.map((p) => [plantRow, p])];
  for (const [draw, item] of rows.slice(0, max)) {
    draw(w, item, 12);
    w.addSpacer(3);
  }
  if (rows.length > max) text(w, `+ ${rows.length - max} weitere`, 10, { color: MUTED });
  footer(w, data, stale);
}

function lockScreen(w, data, family) {
  const now = data.plants.filter((p) => p.status === "water_now").length;
  if (family === "accessoryInline") {
    text(w, now > 0 ? `💧 ${headline(data)}` : `🌿 ${headline(data)}`, 12);
    return;
  }
  if (family === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    const s = w.addStack();
    s.layoutVertically();
    s.centerAlignContent();
    symbol(now > 0 ? "drop.fill" : "leaf.fill", 14, Color.white(), s);
    text(s, String(todo(data)), 16, { bold: true, color: Color.white() });
    return;
  }
  // accessoryRectangular
  text(w, headline(data), 13, { bold: true, color: Color.white() });
  const lines = [
    ...data.plants.filter((p) => p.status === "water_now").map((p) => `${p.name} · ${moisture(p)}`),
    ...alerts(data).map(alertTitle),
    ...data.plants.filter((p) => p.status === "water_soon").map((p) => `${p.name} · ${moisture(p)}`),
  ].filter((l) => l !== headline(data));
  for (const l of lines.slice(0, 2)) text(w, l, 11, { color: Color.white() });
  if (lines.length === 0 && headline(data) === "Alles gut") text(w, `${data.plants.length} Pflanzen im grünen Bereich`, 11, { color: Color.white() });
}

function build(family, { data, stale, error }) {
  const w = new ListWidget();
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MIN * 60000);
  if (Keychain.contains(WEB_KEY)) w.url = Keychain.get(WEB_KEY);
  const lock = family.startsWith("accessory");
  if (!lock) {
    w.backgroundColor = BG;
    w.setPadding(12, 14, 10, 14);
  }
  if (!data) {
    text(w, "Mo'sPlantCare", 14, { bold: true, color: lock ? Color.white() : TEXT });
    text(w, error ?? "Keine Daten", 11, { color: lock ? Color.white() : MUTED, lines: 4 });
    return w;
  }
  if (lock) lockScreen(w, data, family);
  else if (family === "small") small(w, data, stale);
  else list(w, data, stale, family === "medium" ? 4 : 10);
  return w;
}

// --- Main --------------------------------------------------------------------

async function inApp() {
  if (!Keychain.contains(TOKEN_KEY)) await setup();
  const menu = new Alert();
  menu.title = "Mo'sSmartPlantCare";
  for (const a of ["Vorschau klein", "Vorschau mittel", "Vorschau groß", "Token / Adresse ändern"]) menu.addAction(a);
  menu.addCancelAction("Fertig");
  const choice = await menu.presentSheet();
  if (choice === 3) return setup();
  if (choice < 0) return;
  const result = await load();
  const family = ["small", "medium", "large"][choice];
  const w = build(family, result);
  await [w.presentSmall, w.presentMedium, w.presentLarge][choice].call(w);
}

if (config.runsInWidget) Script.setWidget(build(config.widgetFamily ?? "medium", await load()));
else await inApp();
Script.complete();
