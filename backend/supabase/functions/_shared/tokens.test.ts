import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_COPY_BUDGET, aiCopyPath, displayTokensFromCopy, fitToBudget, imageSize, visualTokens } from "./tokens.ts";

test("visual tokens: one per 28 px patch, rounded up", () => {
  assert.equal(visualTokens(28, 28), 1);
  assert.equal(visualTokens(29, 28), 2);
  assert.equal(visualTokens(1600, 1200), 58 * 43);
});

test("visual tokens respect the high-resolution tier limits", () => {
  assert.ok(visualTokens(4032, 3024) <= 4784);
  assert.ok(visualTokens(8000, 200) <= 4784);
  assert.equal(visualTokens(0, 100), 0);
});

test("fitToBudget stays within the budget, keeps the aspect ratio and never upscales", () => {
  for (const [w, h] of [[1600, 1200], [1200, 1600], [1600, 900], [4032, 3024]]) {
    const r = fitToBudget(w, h, AI_COPY_BUDGET);
    assert.ok(visualTokens(r.width, r.height) <= AI_COPY_BUDGET, `${w}x${h}`);
    assert.ok(Math.abs(r.width / r.height - w / h) < 0.01);
    assert.ok(visualTokens(r.width, r.height) > AI_COPY_BUDGET * 0.9, "uses most of the budget");
  }
  assert.deepEqual(fitToBudget(600, 400, AI_COPY_BUDGET), { width: 600, height: 400 });
});

test("AI copy path sits next to the photo", () => {
  assert.equal(aiCopyPath("plant/abc.jpg"), "plant/abc.ai.jpg");
  assert.equal(aiCopyPath("plant/abc.JPEG"), "plant/abc.ai.jpg");
  assert.equal(aiCopyPath("plant/abc"), "plant/abc.ai.jpg");
});

test("display tokens estimated from the AI copy", () => {
  assert.equal(displayTokensFromCopy(1092, 819), visualTokens(1600, 1200));
});

test("image size from JPEG and PNG headers", () => {
  // Minimal JPEG: SOI, APP0 (length 16), SOF0 with height 300 and width 400.
  const jpeg = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x01, 0x90, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ]);
  assert.deepEqual(imageSize(jpeg), { width: 400, height: 300 });
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(png.buffer).setUint32(16, 1024);
  new DataView(png.buffer).setUint32(20, 768);
  assert.deepEqual(imageSize(png), { width: 1024, height: 768 });
  assert.equal(imageSize(new Uint8Array([1, 2, 3])), null);
});
