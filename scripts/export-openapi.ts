import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createApp, openApiDocumentConfig } from "../src/app";

async function main() {
  const outputArg = process.argv[2] ?? "openapi/openapi.json";
  const outputPath = resolve(outputArg);
  const app = createApp();
  const document = app.getOpenAPI31Document(openApiDocumentConfig);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

  console.log(`OpenAPI document written to ${outputPath}`);
}

void main();
