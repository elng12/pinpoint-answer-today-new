import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { PostPublishAuditArtifactV0 } from "../lib/puzzles/content-kitchen/types";
import {
  POST_PUBLISH_AUDIT_RUNNER_INPUT_VERSION,
  runContentKitchenPostPublishAuditJson,
  type PostPublishAuditRunnerInput,
} from "./run-content-kitchen-post-publish-audit";
import {
  runContentKitchenPostPublishBuildOutputAdapterFromFile,
} from "./run-content-kitchen-post-publish-build-output-adapter";
import {
  buildPostPublishObservedFacts,
} from "./run-content-kitchen-post-publish-observed-facts";

export const POST_PUBLISH_LOCAL_AUDIT_CHAIN_RESULT_VERSION =
  "content-kitchen-post-publish-local-audit-chain-result-v0";

export type ContentKitchenPostPublishLocalAuditChainResult = {
  schemaVersion: typeof POST_PUBLISH_LOCAL_AUDIT_CHAIN_RESULT_VERSION;
  dryRunOnly: true;
  sourcePath: string;
  outputPath?: string;
  sourceFiles: {
    appDir: string;
    htmlPath: string;
    sitemapPath?: string;
  };
  auditArtifact: PostPublishAuditArtifactV0;
};

type ParsedArgs = {
  inputPath: string;
  outputPath?: string;
  pretty: boolean;
};

function readArgValue(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }

  return value;
}

function parseArgs(argv: string[]): ParsedArgs {
  let inputPath = "";
  let outputPath: string | undefined;
  let pretty = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      inputPath = resolve(readArgValue(argv, index, "--input"));
      index += 1;
      continue;
    }

    if (arg === "--output") {
      outputPath = resolve(readArgValue(argv, index, "--output"));
      index += 1;
      continue;
    }

    if (arg === "--compact") {
      pretty = false;
      continue;
    }

    if (arg === "--pretty") {
      pretty = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new Error(
        "Usage: npm run content-kitchen:post-publish-local-audit -- --input <path> [--output <path>] [--pretty|--compact]",
      );
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!inputPath) {
    throw new Error("Missing required --input <path>");
  }
  if (outputPath === inputPath) {
    throw new Error("--output must be different from --input");
  }

  return {
    inputPath,
    outputPath,
    pretty,
  };
}

export async function runContentKitchenPostPublishLocalAuditChainFromFile(input: {
  inputPath: string;
  outputPath?: string;
}): Promise<ContentKitchenPostPublishLocalAuditChainResult> {
  const inputPath = resolve(input.inputPath);
  const outputPath = input.outputPath ? resolve(input.outputPath) : undefined;
  if (outputPath === inputPath) {
    throw new Error("--output must be different from --input");
  }

  const adapterResult = await runContentKitchenPostPublishBuildOutputAdapterFromFile({ inputPath });
  if (outputPath === adapterResult.sourceFiles.htmlPath) {
    throw new Error("--output must be different from resolved HTML source");
  }
  if (outputPath && adapterResult.sourceFiles.sitemapPath === outputPath) {
    throw new Error("--output must be different from resolved sitemap source");
  }

  const observed = await buildPostPublishObservedFacts({
    expected: adapterResult.observedFactsBuilderInput.expected,
    sources: adapterResult.observedFactsBuilderInput.sources,
    htmlPath: adapterResult.sourceFiles.htmlPath,
    ...(adapterResult.sourceFiles.sitemapPath ? { sitemapPath: adapterResult.sourceFiles.sitemapPath } : {}),
  });
  const auditRunnerInput: PostPublishAuditRunnerInput = {
    schemaVersion: POST_PUBLISH_AUDIT_RUNNER_INPUT_VERSION,
    artifactId: adapterResult.observedFactsBuilderInput.artifactId,
    checkedAt: adapterResult.observedFactsBuilderInput.checkedAt,
    expected: adapterResult.observedFactsBuilderInput.expected,
    observed,
  };
  const auditArtifact = runContentKitchenPostPublishAuditJson(auditRunnerInput);
  const result: ContentKitchenPostPublishLocalAuditChainResult = {
    schemaVersion: POST_PUBLISH_LOCAL_AUDIT_CHAIN_RESULT_VERSION,
    dryRunOnly: true,
    sourcePath: inputPath,
    ...(outputPath ? { outputPath } : {}),
    sourceFiles: adapterResult.sourceFiles,
    auditArtifact,
  };

  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(auditArtifact, null, 2)}\n`, "utf8");
  }

  return result;
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const result = await runContentKitchenPostPublishLocalAuditChainFromFile(args);
  console.log(JSON.stringify(result, null, args.pretty ? 2 : 0));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
