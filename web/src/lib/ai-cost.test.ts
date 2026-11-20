import assert from "node:assert/strict";
import { test } from "node:test";
import { costUsd, summarize, type UsageRow } from "./ai-cost.ts";
import { AI_COPY_BUDGET, aiCopyPath, fitToBudget, withAiCopies } from "./ai-copy.ts";

const row = (over: Partial<UsageRow>): UsageRow => ({
  created_at: "2026-11-20T10:00:00Z",
  function: "analyze-photo",
  model: "claude-opus-5-5",
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  image_count: 0,
  image_tokens: null,
  image_tokens_full: null,
  ...over,
});

test("cost from list prices", () => {
  // 1M input at $4 + 0.5M output at $20
  assert.equal(costUsd(row({ input_tokens: 1_000_000, output_tokens: 500_000 })), 14);
  assert.equal(costUsd(row({ model: "unknown-model", input_tokens: 1_000_000 })), 4);
});

test("summary groups by function and measures the image saving", () => {
  const s = summarize([
    row({ input_tokens: 3000, output_tokens: 1000, image_count: 2, image_tokens: 2340, image_tokens_full: 4988 }),
    row({ input_tokens: 2000, output_tokens: 800, image_count: 1, image_tokens: 1170, image_tokens_full: 2494 }),
    row({ function: "plant-species:profile", input_tokens: 500, output_tokens: 700 }),
  ]);
  assert.equal(s.calls, 3);
  assert.equal(s.byFunction[0].fn, "analyze-photo");
  assert.equal(s.byFunction[0].calls, 2);
  assert.equal(s.byFunction[0].avgInput, 2500);
  assert.ok(s.images);
  assert.equal(s.images.savedTokens, 4988 + 2494 - 2340 - 1170);
  assert.ok(Math.abs(s.images.savedShare - 3972 / 7482) < 1e-9);
});

test("no image rows → no image saving", () => {
  assert.equal(summarize([row({ input_tokens: 10 })]).images, null);
  assert.equal(summarize([]).calls, 0);
});

test("AI copy sizing and paths", () => {
  const r = fitToBudget(1600, 1200);
  assert.ok(Math.ceil(r.width / 28) * Math.ceil(r.height / 28) <= AI_COPY_BUDGET);
  assert.equal(aiCopyPath("p/x.jpg"), "p/x.ai.jpg");
  assert.deepEqual(withAiCopies(["p/x.jpg", "r/scan.pdf"]), ["p/x.jpg", "p/x.ai.jpg", "r/scan.pdf"]);
});
