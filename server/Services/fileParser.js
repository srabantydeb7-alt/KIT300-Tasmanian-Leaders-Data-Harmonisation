const path = require("node:path");
const XLSX = require("@e965/xlsx");

const MAX_ROWS = 50_000;
const MAX_COLUMNS = 500;
const MAX_CELL_CHARACTERS = 32_000;
const ALLOWED_EXTENSIONS = Object.freeze([".csv", ".xlsx", ".xls"]);
const UNSAFE_HEADERS = new Set(["__proto__", "prototype", "constructor"]);

class DatasetParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "DatasetParseError";
    this.status = 400;
  }
}

function assertFileSignature(buffer, extension) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new DatasetParseError("The uploaded dataset is empty.");
  }

  if (extension === ".xlsx") {
    if (
      buffer[0] !== 0x50 ||
      buffer[1] !== 0x4b ||
      buffer[2] !== 0x03 ||
      buffer[3] !== 0x04
    ) {
      throw new DatasetParseError("The uploaded file is not a valid XLSX workbook.");
    }
    return;
  }

  if (extension === ".xls") {
    const oleSignature = "d0cf11e0a1b11ae1";
    if (buffer.subarray(0, 8).toString("hex") !== oleSignature) {
      throw new DatasetParseError("The uploaded file is not a valid XLS workbook.");
    }
    return;
  }

  if (buffer.includes(0)) {
    throw new DatasetParseError("The CSV contains binary data and cannot be read safely.");
  }
  if (buffer.toString("utf8").includes("\uFFFD")) {
    throw new DatasetParseError("The CSV must use UTF-8 text encoding.");
  }
}

function cleanHeader(value, index) {
  const header = String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim();

  if (!header) {
    throw new DatasetParseError(`Column ${index + 1} has no header.`);
  }
  if (header.length > 250) {
    throw new DatasetParseError(`Column ${index + 1} has an excessively long header.`);
  }
  if (UNSAFE_HEADERS.has(header.toLowerCase())) {
    throw new DatasetParseError(`The header "${header}" is not supported.`);
  }
  return header;
}

function sheetContainsFormula(sheet) {
  return Object.entries(sheet).some(
    ([reference, cell]) => !reference.startsWith("!") && cell && cell.f,
  );
}

function parseDatasetBuffer(buffer, originalName) {
  const extension = path.extname(originalName || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new DatasetParseError("Only CSV and Excel (.xls or .xlsx) files are supported.");
  }

  assertFileSignature(buffer, extension);

  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      raw: true,
      sheetRows: MAX_ROWS + 2,
      cellFormula: true,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      bookVBA: false,
      password: undefined,
    });
  } catch (error) {
    throw new DatasetParseError(`The dataset could not be parsed: ${error.message}`);
  }

  if (!workbook.SheetNames.length) {
    throw new DatasetParseError("The workbook does not contain a worksheet.");
  }

  const worksheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[worksheetName];
  if (sheetContainsFormula(sheet)) {
    throw new DatasetParseError(
      "Formula cells are not supported. Upload a values-only survey export.",
    );
  }

  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false,
  });

  if (!matrix.length) {
    throw new DatasetParseError("The dataset does not contain a header row.");
  }
  if (matrix.length - 1 > MAX_ROWS) {
    throw new DatasetParseError(`Datasets are limited to ${MAX_ROWS} data rows.`);
  }
  if (matrix[0].length > MAX_COLUMNS) {
    throw new DatasetParseError(`Datasets are limited to ${MAX_COLUMNS} columns.`);
  }

  const headers = matrix[0].map(cleanHeader);
  const normalisedHeaders = new Set();
  for (const header of headers) {
    const normalised = header.toLocaleLowerCase("en-AU");
    if (normalisedHeaders.has(normalised)) {
      throw new DatasetParseError(`The dataset contains a duplicate header: ${header}.`);
    }
    normalisedHeaders.add(normalised);
  }

  const rows = matrix.slice(1).map((values, rowIndex) => {
    if (values.length > MAX_COLUMNS) {
      throw new DatasetParseError(`Row ${rowIndex + 2} exceeds the column limit.`);
    }
    const row = Object.create(null);
    headers.forEach((header, columnIndex) => {
      const rawValue = values[columnIndex] ?? "";
      const value = rawValue instanceof Date ? rawValue.toISOString() : String(rawValue);
      if (value.length > MAX_CELL_CHARACTERS) {
        throw new DatasetParseError(
          `Cell at row ${rowIndex + 2}, ${header} exceeds the character limit.`,
        );
      }
      row[header] = value;
    });
    return row;
  });

  return {
    rows,
    headers,
    worksheetName,
    format: extension.slice(1),
  };
}

module.exports = {
  ALLOWED_EXTENSIONS,
  DatasetParseError,
  MAX_ROWS,
  MAX_COLUMNS,
  parseDatasetBuffer,
};
