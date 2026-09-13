const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createBuiltInDestination,
  createDestinationFromDataset,
  DestinationSchemaError,
} = require("../Services/destinationSchema");

test("creates a stable built-in ELF destination snapshot", () => {
  const first = createBuiltInDestination();
  const second = createBuiltInDestination();
  assert.equal(first.code, "ELF_2024_DRAFT_0_1");
  assert.equal(first.fingerprint, second.fingerprint);
  assert.ok(first.questions.length >= 43);
  assert.ok(first.headers.includes("person_id"));
  assert.ok(first.headers.includes("program"));
});

test("learns a custom destination schema while discarding destination response values", () => {
  const csv = [
    "Respondent ID,Program,Year,Leadership confidence,Comment",
    "private-001,TLP,2025,1,private comment",
    "private-002,TLP,2025,5,another private comment",
  ].join("\n");
  const destination = createDestinationFromDataset(Buffer.from(csv), "destination.csv");

  assert.equal(destination.type, "uploaded");
  assert.deepEqual(destination.headers, [
    "Respondent ID", "Program", "Year", "Leadership confidence", "Comment",
  ]);
  assert.deepEqual(destination.identifierColumns, ["Respondent ID"]);
  assert.ok(destination.questions.some((question) => question.label === "Leadership confidence"));
  assert.equal(JSON.stringify(destination).includes("private-001"), false);
  assert.equal(JSON.stringify(destination).includes("private comment"), false);
  assert.match(destination.fingerprint, /^[a-f0-9]{64}$/);
});

test("rejects an empty or identifier-only destination", () => {
  assert.throws(
    () => createDestinationFromDataset(Buffer.from("Respondent ID\nprivate-001"), "ids.csv"),
    DestinationSchemaError,
  );
});
