#!/usr/bin/env node

const path = require("node:path");

const { getOrCreateHmacSecret } = require("../server/app");
const { harmoniseDatasetPack } = require("../server/Services/datasetPackService");

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--source", "--output"].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a path.`);
    }
    values[argument.slice(2)] = value;
    index += 1;
  }
  if (!values.source) throw new Error("--source is required.");
  return values;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const repositoryRoot = path.resolve(__dirname, "..");
  const output = args.output || path.join(
    repositoryRoot,
    "private-output",
    `kit300-harmonised-${timestamp()}`,
  );
  const secret = getOrCreateHmacSecret(
    path.join(repositoryRoot, "server", "data"),
    process.env.HARMONISATION_HMAC_SECRET,
  );
  const result = await harmoniseDatasetPack({
    sourceDir: args.source,
    outputDir: output,
    hmacSecret: secret,
  });
  process.stdout.write([
    "KIT300 dataset pack harmonisation complete.",
    `Output: ${result.outputDir}`,
    `Catalogued datasets: ${result.manifest.counts.cataloguedDatasets}`,
    `Participant response records: ${result.manifest.counts.harmonisedParticipantResponses}`,
    `Historical aggregate records: ${result.manifest.counts.harmonisedAggregateRecords}`,
    `Validation errors: ${result.manifest.counts.validationErrors}`,
    `Validation warnings: ${result.manifest.counts.validationWarnings}`,
    "",
  ].join("\n"));
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Harmonisation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { main, parseArguments };
