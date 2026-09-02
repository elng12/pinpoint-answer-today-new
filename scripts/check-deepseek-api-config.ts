import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AI_MAX_OUTPUT_TOKENS,
  buildOpenAICompatibleRequestBody,
  requestAIResponseContent,
  resolveDefaultModel,
} from "../lib/puzzle-generation/provider-client";
import {
  buildLLMRequestBody,
  callLLM,
  LLM_MAX_OUTPUT_TOKENS,
} from "../worker/src/enrich-llm";

const model = "deepseek-v4-flash";
const workerBody = buildLLMRequestBody("Return JSON", model);

assert.equal(LLM_MAX_OUTPUT_TOKENS, 8_192);
assert.equal(workerBody.model, model);
assert.equal(workerBody.max_tokens, 8_192);
assert.equal(workerBody.stream, false);
assert.deepEqual(workerBody.response_format, { type: "json_object" });
assert.deepEqual(workerBody.thinking, { type: "disabled" });

const siteBody = buildOpenAICompatibleRequestBody({
  prompt: "Return JSON",
  provider: "openai",
  model,
  systemPrompt: "Return JSON only",
});

assert.equal(AI_MAX_OUTPUT_TOKENS, 8_192);
assert.equal(siteBody.model, model);
assert.equal(siteBody.max_tokens, 8_192);
assert.equal(siteBody.stream, false);
assert.deepEqual(siteBody.response_format, { type: "json_object" });
assert.deepEqual(siteBody.thinking, { type: "disabled" });
assert.equal(
  resolveDefaultModel("openai", "https://api.deepseek.com"),
  model,
);
assert.equal(
  resolveDefaultModel("openai", "https://openrouter.ai/api/v1"),
  "meta-llama/llama-3.3-70b-instruct",
);

const root = fileURLToPath(new URL("..", import.meta.url));
const wranglerConfig = readFileSync(`${root}/worker/wrangler.toml`, "utf8");
assert.equal(
  (wranglerConfig.match(/LLM_BASE_URL\s+=\s+"https:\/\/api\.deepseek\.com"/g) ?? []).length,
  3,
);
assert.equal(
  (wranglerConfig.match(/AUTO_ENRICH_MODEL\s+=\s+"deepseek-v4-flash"/g) ?? []).length,
  3,
);
assert.doesNotMatch(wranglerConfig, /openrouter\.ai\/api\/v1/i);

async function checkTruncatedResponses(): Promise<void> {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "length",
              message: { content: '{"partial":true' },
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );

    await assert.rejects(
      () =>
        callLLM("Return JSON", {
          apiKey: "test-key",
          baseUrl: "https://api.deepseek.com",
          model,
        }),
      /truncated at max_tokens=8192/,
    );
    await assert.rejects(
      () =>
        requestAIResponseContent({
          prompt: "Return JSON",
          apiKey: "test-key",
          provider: "openai",
          model,
          endpoint: "https://api.deepseek.com",
          systemPrompt: "Return JSON only",
        }),
      /truncated at max_tokens=8192/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

checkTruncatedResponses()
  .then(() => console.log("DeepSeek API configuration checks passed."))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
