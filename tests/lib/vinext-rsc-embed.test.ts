import { describe, expect, it } from "vitest";
import { extractRscPayloadFromPrerenderedHtml } from "../../node_modules/vinext/dist/build/prerender.js";
import { createRscEmbedTransform } from "../../node_modules/vinext/dist/server/app-ssr-stream.js";

const encoder = new TextEncoder();

function streamFrom(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

async function embedAndExtract(chunks: Uint8Array[]) {
  const transform = createRscEmbedTransform(streamFrom(chunks));
  const scripts = await transform.finalize();
  const payload = extractRscPayloadFromPrerenderedHtml(`<html><body>${scripts}</body></html>`);

  if (!payload) throw new Error("Expected an embedded RSC payload");
  return { payload, scripts };
}

describe("patched Vinext RSC embedding", () => {
  it("keeps split UTF-8 text as text instead of Base64", async () => {
    const input = encoder.encode("row:中文🙂end\n");
    const chunks = [input.slice(0, 5), input.slice(5, 8), input.slice(8, 11), input.slice(11)];

    const { payload, scripts } = await embedAndExtract(chunks);

    expect(payload).toEqual(input);
    expect(scripts).not.toContain(".rsc.push([3,");
    expect(scripts).toContain('.rsc.push("中")');
    expect(scripts).toContain('.rsc.push("🙂end\\n")');
  });

  it("preserves genuinely non-UTF-8 bytes with Base64", async () => {
    const input = Uint8Array.of(0x66, 0xff, 0x67);

    const { payload, scripts } = await embedAndExtract([input]);

    expect(payload).toEqual(input);
    expect(scripts).toContain(".rsc.push([3,");
  });

  it("preserves an incomplete UTF-8 tail at end of stream", async () => {
    const input = encoder.encode("中").slice(0, 2);

    const { payload, scripts } = await embedAndExtract([input]);

    expect(payload).toEqual(input);
    expect(scripts).toContain(".rsc.push([3,");
  });
});
