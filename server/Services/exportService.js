function protectSpreadsheetCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = String(value).replace(/\u0000/g, "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value) {
  const text = protectSpreadsheetCell(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function createCsv(headers, rows) {
  return `${[
    headers.map((header) => csvCell(header.label)).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header.key])).join(",")),
  ].join("\r\n")}\r\n`;
}

function harmonisedCsv(run) {
  return createCsv(
    [
      ["dataset", "Dataset"],
      ["personId", "person_id"],
      ["sourceRow", "Source row"],
      ["sourceColumn", "Source column"],
      ["originalQuestion", "Original question"],
      ["originalValue", "Original value"],
      ["targetQuestionCode", "question"],
      ["targetQuestion", "Target question"],
      ["domain", "ELF domain"],
      ["construct", "ELF construct"],
      ["reverseScored", "Reverse scored item"],
      ["harmonisedValue", "value"],
      ["status", "Status"],
      ["ruleId", "Rule ID"],
      ["ruleVersion", "Rule version"],
    ].map(([key, label]) => ({ key, label })),
    (run.records || []).map((record) => ({
      ...record,
      dataset: run.datasetCode,
    })),
  );
}

function metadataValue(header, run) {
  const normalised = String(header).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/^(?:program|programme)$/.test(normalised)) return run.metadata?.program || "";
  if (/^(?:year|cohort year|cohort)$/.test(normalised)) return run.metadata?.year || "";
  if (/^(?:round|survey round)$/.test(normalised)) return run.metadata?.round || "";
  return "";
}

function destinationCsv(run) {
  const destination = run.destination;
  if (!destination?.headers?.length) return "";
  const headers = destination.headers.map((header) => ({ key: header, label: header }));
  const identifierColumns = new Set(destination.identifierColumns || []);
  const metadataColumns = new Set(destination.metadataColumns || []);
  const grouped = new Map();

  for (const record of run.records || []) {
    const key = `${record.personId}|${record.sourceRow}`;
    if (!grouped.has(key)) {
      const row = Object.fromEntries(destination.headers.map((header) => [header, ""]));
      const firstIdentifier = [...identifierColumns][0];
      if (firstIdentifier) row[firstIdentifier] = record.personId;
      for (const column of metadataColumns) row[column] = metadataValue(column, run);
      grouped.set(key, row);
    }
    if (destination.headers.includes(record.targetQuestion)) {
      grouped.get(key)[record.targetQuestion] = record.harmonisedValue ?? "";
    }
  }
  return createCsv(headers, [...grouped.values()]);
}

function validationCsv(run) {
  return createCsv(
    [
      { key: "severity", label: "Severity" },
      { key: "code", label: "Check code" },
      { key: "message", label: "Message" },
      { key: "location", label: "Location" },
      { key: "recommendation", label: "Recommended action" },
    ],
    run.validation?.issues || [],
  );
}

function unmappedCsv(run) {
  return createCsv(
    [
      { key: "sourceQuestion", label: "Source question" },
      { key: "confidence", label: "Confidence" },
      { key: "method", label: "Suggestion method" },
      { key: "status", label: "Status" },
    ],
    run.mappings.filter((mapping) =>
      ["unmapped", "review"].includes(mapping.status),
    ),
  );
}

function mappingsCsv(run) {
  return createCsv(
    [
      { key: "sourceQuestion", label: "Source question" },
      { key: "targetQuestionCode", label: "Target question code" },
      { key: "targetQuestion", label: "Target question" },
      { key: "confidence", label: "Confidence" },
      { key: "confidenceBand", label: "Confidence band" },
      { key: "method", label: "Method" },
      { key: "status", label: "Status" },
      { key: "ruleId", label: "Rule ID" },
      { key: "ruleVersion", label: "Rule version" },
    ],
    run.mappings,
  );
}

function pdfText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "-")
    .replace(/([\\()])/g, "\\$1");
}

function summaryPdf(run) {
  const lines = [
    { text: "Tasmanian Leaders - Harmonisation Run Summary", size: 18 },
    { text: `Run: ${run.id}`, size: 10 },
    { text: `Dataset: ${run.source?.originalName || "Demo dataset"}`, size: 10 },
    { text: `Source SHA-256: ${run.source?.sha256 || "Not available"}`, size: 8 },
    { text: `Program: ${run.metadata?.program || "Not supplied"}`, size: 10 },
    { text: `Year / round: ${run.metadata?.year || "-"} / ${run.metadata?.round || "-"}`, size: 10 },
    { text: `Stage: ${run.stage}`, size: 10 },
    { text: `Source rows: ${run.profile?.rowCount || 0}`, size: 10 },
    { text: `Question columns: ${run.profile?.questionColumns?.length || 0}`, size: 10 },
    { text: `Harmonised responses: ${run.records?.length || 0}`, size: 10 },
    { text: `Valid responses: ${run.validation?.validResponses || 0}`, size: 10 },
    { text: `Validation errors: ${run.validation?.errors || 0}`, size: 10 },
    { text: `Validation warnings: ${run.validation?.warnings || 0}`, size: 10 },
    { text: `Exportable: ${run.validation?.exportable ? "Yes" : "No"}`, size: 10 },
    { text: `Processed: ${run.processedAt || "Not processed"}`, size: 10 },
    { text: `Configuration SHA-256: ${run.configurationHash || "Not available"}`, size: 8 },
    { text: `Result SHA-256: ${run.resultHash || "Not available"}`, size: 8 },
    { text: "Identifiers are represented by deterministic HMAC pseudonyms.", size: 9 },
    { text: "Every output row retains its source row, question, rule ID and rule version.", size: 9 },
  ];

  let y = 750;
  const commands = ["BT"];
  for (const line of lines) {
    commands.push(`/F1 ${line.size} Tf`);
    commands.push(`1 0 0 1 45 ${y} Tm (${pdfText(line.text)}) Tj`);
    y -= line.size + 10;
  }
  commands.push("ET");
  const stream = `${commands.join("\n")}\n`;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];

  let pdf = "%PDF-1.4\n%KIT300\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

const EXPORTERS = Object.freeze({
  harmonised: { contentType: "text/csv; charset=utf-8", extension: "csv", create: harmonisedCsv },
  validation: { contentType: "text/csv; charset=utf-8", extension: "csv", create: validationCsv },
  unmapped: { contentType: "text/csv; charset=utf-8", extension: "csv", create: unmappedCsv },
  mappings: { contentType: "text/csv; charset=utf-8", extension: "csv", create: mappingsCsv },
  mapping: { contentType: "text/csv; charset=utf-8", extension: "csv", create: mappingsCsv },
  destination: { contentType: "text/csv; charset=utf-8", extension: "csv", create: destinationCsv },
  summary: { contentType: "application/pdf", extension: "pdf", create: summaryPdf },
});

module.exports = {
  EXPORTERS,
  createCsv,
  destinationCsv,
  harmonisedCsv,
  mappingsCsv,
  protectSpreadsheetCell,
  summaryPdf,
  unmappedCsv,
  validationCsv,
};
