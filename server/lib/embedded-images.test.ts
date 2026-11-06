import { test } from "node:test";
import assert from "node:assert/strict";
import { hostEmbeddedImages } from "./embedded-images.js";

const PNG = "iVBORw0KGgo=";

test("inline images become hosted links, each picture uploaded once", async () => {
  const uploads: string[] = [];
  const upload = async (_b: Buffer, name: string, type: string) => {
    uploads.push(`${name}|${type}`);
    return { url: `https://files.example.com/${name}` };
  };
  const html = `<img src="data:image/png;base64,${PNG}"><p>x</p><img src='data:image/png;base64,${PNG}'><img src="https://ok.example.com/a.png">`;
  const out = await hostEmbeddedImages(html, upload);

  assert.equal(uploads.length, 1);
  assert.match(uploads[0], /^img-[0-9a-f]{16}\.png\|image\/png$/);
  assert.ok(!out.includes("data:image"));
  assert.equal(out.match(/https:\/\/files\.example\.com\/img-/g)?.length, 2);
  assert.ok(out.includes(`src='https://files.example.com/`), "keeps the original quote style");
  assert.ok(out.includes(`src="https://ok.example.com/a.png"`));
});

test("nothing to host, or no storage: the html is untouched", async () => {
  const html = `<img src="https://ok.example.com/a.png">`;
  assert.equal(await hostEmbeddedImages(html, async () => ({ url: "x" })), html);
  const inline = `<img src="data:image/png;base64,${PNG}">`;
  assert.equal(await hostEmbeddedImages(inline, null), inline);
});
