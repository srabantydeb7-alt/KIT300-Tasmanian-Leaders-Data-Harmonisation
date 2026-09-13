const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createApp } = require("../app");

async function withServer(callback) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kit300-api-"));
  const app = createApp({ dataDir });
  const server = app.listen(0, "127.0.0.1");

  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

test("uploads, profiles, processes, resumes, and exports a CSV run", async () => {
  await withServer(async (baseUrl) => {
    const csv = [
      "Email,Name,How confident are you as a leader?,The program built my network",
      "ada@example.com,Ada,4,5",
      "ben@example.com,Ben,2,3",
    ].join("\n");
    const form = new FormData();
    form.append("dataset", new Blob([csv], { type: "text/csv" }), "survey.csv");
    form.append("program", "Tasmanian Leaders Program");
    form.append("year", "2026");
    form.append("round", "Round 1");
    form.append("qualityTier", "tier1");
    form.append("sourcePath", "2026/round-1");

    const uploadResponse = await fetch(`${baseUrl}/api/datasets/upload`, {
      method: "POST",
      body: form,
    });
    const upload = await uploadResponse.json();

    assert.equal(uploadResponse.status, 201);
    assert.equal(upload.success, true);
    assert.equal(upload.data.profile.rowCount, 2);
    assert.equal(upload.data.metadata.sourcePath, "2026/round-1");
    assert.equal(upload.data.profile.questionColumns.length, 2);
    assert.ok(upload.data.mappings.every((mapping) => mapping.status === "approved"));
    assert.equal(upload.data.profile.preview.length, 2);
    assert.match(upload.data.profile.preview[0].Email, /^person-/);
    assert.equal(upload.data.profile.preview[0].Email, upload.data.profile.preview[0].Name);
    assert.equal(upload.data.profile.preview[0]["How confident are you as a leader?"], "4");
    assert.equal(upload.data.source.checksum, upload.data.source.sha256);
    assert.equal(JSON.stringify(upload).includes("ada@example.com"), false);
    assert.equal(JSON.stringify(upload).includes("ben@example.com"), false);

    const processResponse = await fetch(
      `${baseUrl}/api/runs/${upload.data.id}/process`,
      { method: "POST" },
    );
    const processed = await processResponse.json();

    assert.equal(processResponse.status, 200);
    assert.equal(processed.data.stage, "exportable");
    assert.equal(processed.data.validation.exportable, true);
    assert.equal(processed.data.records.length, 4);

    const resumeResponse = await fetch(`${baseUrl}/api/runs/${upload.data.id}`);
    const resumed = await resumeResponse.json();
    assert.equal(resumed.data.stage, "exportable");

    const exportResponse = await fetch(
      `${baseUrl}/api/runs/${upload.data.id}/exports/harmonised`,
    );
    const exportedCsv = await exportResponse.text();

    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get("content-type"), /text\/csv/);
    assert.match(exportedCsv, /LEAD_CONF/);
    assert.equal(exportedCsv.includes("ada@example.com"), false);
    assert.equal(exportedCsv.includes("ben@example.com"), false);
  });
});

test("rejects unsupported files with a consistent JSON error", async () => {
  await withServer(async (baseUrl) => {
    const form = new FormData();
    form.append("dataset", new Blob(["not a survey"]), "survey.txt");

    const response = await fetch(`${baseUrl}/api/datasets/upload`, {
      method: "POST",
      body: form,
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys(body).sort(), ["error", "success"]);
    assert.equal(body.success, false);
    assert.match(body.error.message, /CSV|Excel/);
  });
});

test("creates immutable rule versions and lists saved runs", async () => {
  await withServer(async (baseUrl) => {
    const ruleResponse = await fetch(`${baseUrl}/api/rules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ruleId: "SCALE_1_5_TO_7",
        name: "1-5 to 1-7",
        transformType: "linear",
        sourceScale: { min: 1, max: 5 },
        targetScale: { min: 1, max: 7 },
        decimals: 1,
        status: "approved",
      }),
    });
    const firstRule = await ruleResponse.json();
    assert.equal(ruleResponse.status, 201);
    assert.equal(firstRule.data.version, "v1");

    const newVersionResponse = await fetch(
      `${baseUrl}/api/rules/SCALE_1_5_TO_7/versions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decimals: 2, status: "approved" }),
      },
    );
    const secondRule = await newVersionResponse.json();
    assert.equal(secondRule.data.version, "v2");

    const rulesResponse = await fetch(`${baseUrl}/api/rules`);
    const rules = await rulesResponse.json();
    assert.equal(rules.data.filter((rule) => rule.ruleId === "SCALE_1_5_TO_7").length, 2);

    const runsResponse = await fetch(`${baseUrl}/api/runs`);
    const runs = await runsResponse.json();
    assert.deepEqual(runs.data, []);
  });
});

test("persists demo runs across app restarts and exposes dashboard overview", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kit300-restart-"));

  async function useApp(callback) {
    const app = createApp({ dataDir, hmacSecret: "restart-test-secret-with-32-bytes-minimum" });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));

    try {
      await callback(`http://127.0.0.1:${server.address().port}`);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  try {
    let demoRunId;
    await useApp(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/datasets/demo`, {
        method: "POST",
      });
      const body = await response.json();
      assert.equal(response.status, 201);
      assert.equal(body.success, true);
      demoRunId = body.data.id;
    });

    await useApp(async (baseUrl) => {
      const runsResponse = await fetch(`${baseUrl}/api/runs`);
      const runs = await runsResponse.json();
      assert.ok(runs.data.some((run) => run.id === demoRunId));

      const overviewResponse = await fetch(`${baseUrl}/api/overview`);
      const overview = await overviewResponse.json();
      assert.equal(overview.success, true);
      assert.equal(overview.data.totalRuns, 1);
      assert.ok(overview.data.latestRun);
    });
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("updates a mapping and serves every traceability export", async () => {
  await withServer(async (baseUrl) => {
    const csv = [
      "Email,The programme helped build my professional network",
      "ada@example.com,4",
    ].join("\n");
    const form = new FormData();
    form.append("dataset", new Blob([csv], { type: "text/csv" }), "network.csv");

    const uploadResponse = await fetch(`${baseUrl}/api/datasets/upload`, {
      method: "POST",
      body: form,
    });
    const upload = await uploadResponse.json();
    const runId = upload.data.id;
    assert.notEqual(upload.data.mappings[0].status, "approved");

    const mappingResponse = await fetch(`${baseUrl}/api/runs/${runId}/mappings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceQuestion: "The programme helped build my professional network",
        targetQuestionCode: "NETWORKS",
        targetQuestion: "Professional networks",
        status: "approved",
        ruleId: "SCALE_1_5_TO_100",
      }),
    });
    assert.equal(mappingResponse.status, 200);

    const processResponse = await fetch(`${baseUrl}/api/runs/${runId}/process`, {
      method: "POST",
    });
    assert.equal(processResponse.status, 200);

    for (const type of ["harmonised", "validation", "unmapped", "mappings"]) {
      const response = await fetch(`${baseUrl}/api/runs/${runId}/exports/${type}`);
      assert.equal(response.status, 200, type);
      assert.match(response.headers.get("content-type"), /text\/csv/, type);
    }

    const summaryResponse = await fetch(
      `${baseUrl}/api/runs/${runId}/exports/summary`,
    );
    assert.equal(summaryResponse.status, 200);
    assert.match(summaryResponse.headers.get("content-type"), /application\/pdf/);
    const summary = Buffer.from(await summaryResponse.arrayBuffer());
    assert.equal(summary.subarray(0, 5).toString(), "%PDF-");
  });
});

test("produces byte-equivalent canonical CSV for the same input and configuration", async () => {
  await withServer(async (baseUrl) => {
    const csv = [
      "Email,How confident are you as a leader?",
      "ada@example.com,4",
    ].join("\n");

    async function uploadAndExport() {
      const form = new FormData();
      form.append("dataset", new Blob([csv]), "repeatable.csv");
      form.append("program", "Tasmanian Leaders Program");
      form.append("year", "2026");
      form.append("round", "Round 1");
      const upload = await (await fetch(`${baseUrl}/api/datasets/upload`, {
        method: "POST",
        body: form,
      })).json();
      await fetch(`${baseUrl}/api/runs/${upload.data.id}/process`, { method: "POST" });
      return (await fetch(
        `${baseUrl}/api/runs/${upload.data.id}/exports/harmonised`,
      )).text();
    }

    assert.equal(await uploadAndExport(), await uploadAndExport());
  });
});

test("uses an uploaded destination schema and exports destination-shaped rows", async () => {
  await withServer(async (baseUrl) => {
    const source = [
      "Email,Leadership confidence",
      "private@example.test,4",
    ].join("\n");
    const destination = [
      "Respondent ID,Leadership confidence,Future framework field",
      "destination-private-1,1,Alpha",
      "destination-private-2,5,Beta",
    ].join("\n");
    const form = new FormData();
    form.append("dataset", new Blob([source]), "source.csv");
    form.append("destination", new Blob([destination]), "destination.csv");
    form.append("program", "Tasmanian Leaders Program");
    form.append("year", "2026");

    const response = await fetch(`${baseUrl}/api/datasets/upload`, {
      method: "POST",
      body: form,
    });
    const uploaded = await response.json();
    assert.equal(response.status, 201);
    assert.equal(uploaded.data.destination.type, "uploaded");
    assert.deepEqual(uploaded.data.destination.headers, [
      "Respondent ID", "Leadership confidence", "Future framework field",
    ]);
    assert.equal(uploaded.data.mappings[0].targetQuestion, "Leadership confidence");
    assert.equal(uploaded.data.mappings[0].status, "approved");
    assert.equal(JSON.stringify(uploaded).includes("destination-private"), false);

    await fetch(`${baseUrl}/api/runs/${uploaded.data.id}/process`, { method: "POST" });
    const destinationExport = await fetch(
      `${baseUrl}/api/runs/${uploaded.data.id}/exports/destination`,
    );
    const output = await destinationExport.text();
    assert.equal(destinationExport.status, 200);
    assert.match(output, /^Respondent ID,Leadership confidence,Future framework field\r?\n/);
    assert.match(output, /,4,/);
    assert.equal(output.includes("private@example.test"), false);
    assert.equal(output.includes("destination-private"), false);
  });
});
