import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readJsonl } from "../src/jsonl.js";

describe("readJsonl", () => {
  it("does not split on U+2028 inside a JSON string", async () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), "aqua-jsonl-")), "t.jsonl");
    writeFileSync(file, `{"role":"user","text":"hello\u2028world"}\n{"role":"assistant","n":1}\n`);
    const lines = await readJsonl(file);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.value).toEqual({ role: "user", text: "hello\u2028world" });
  });
});
