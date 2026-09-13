const IDENTIFIER_PATTERN = /^(?:e-?mail(?: address)?|(?:work|contact|personal|participant|respondent|microsoft teams) e-?mail(?: address)?|name|full name|(?:participant|respondent|person) (?:full )?name|(?:first|middle|last|preferred) name|name \((?:prefix|first|middle|last|suffix)\)|what is the name of the person you are rating \((?:prefix|first|middle|last|suffix)\)|person(?: id)?|participant(?: id| name)?|respondent(?: id| name)?|contact id|user id(?: \(.+\))?|mobile(?: number)?|(?:contact )?(?:phone|telephone)(?: number)?)$/i;
const METADATA_PATTERN = /^(?:program(?:me)?|year|round|quality tier|cohort|survey date|submitted at|timestamp|created by \(user id\)|entry id|entry date|date updated|source url|transaction id|payment amount|payment date|payment status|post id|user agent|user ip|submission speed \(ms\)|survey total score|number|what year is your first workshop in\??|which program are you in\??|which i-lead are you in\??|what best describes your role\??|what best describes your relationship to the tasmanian leaders' participant\?)$/i;
const SENSITIVE_PATTERN = /^(?:(?:residential|postal|home|street) address(?:.*)?|address line(?:.*)?|suburb|postcode|postal code|date of birth|birth date|age|gender|pronouns?|sexuality|sexual orientation|aboriginal(?:.*)?|torres strait islander(?:.*)?|employer(?: name)?|organisation(?: name)?|organization(?: name)?|company(?: name)?|position title|job title|linkedin(?: profile| url)?|emergency contact(?:.*)?|medical(?:.*)?|health(?:.*)?|dietary(?:.*)?|faith|religion|referee(?:.*)?|profile photo|photograph|biography|bio)$/i;

function isMissing(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function inferKind(values) {
  const present = values.filter((value) => !isMissing(value));
  if (!present.length) return "empty";

  if (present.every((value) => Number.isFinite(Number(String(value).trim())))) {
    return "number";
  }
  if (
    present.every((value) =>
      ["yes", "no", "true", "false"].includes(String(value).trim().toLowerCase()),
    )
  ) {
    return "boolean";
  }
  if (
    present.every((value) =>
      /^\d{4}-\d{2}-\d{2}(?:[T ][^ ]+)?$/.test(String(value).trim()),
    )
  ) {
    return "date";
  }
  return "text";
}

function detectedScale(values, kind) {
  if (kind !== "number") return null;
  const numbers = values
    .filter((value) => !isMissing(value))
    .map((value) => Number(String(value).trim()));
  if (!numbers.length) return null;
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
}

function valuesLookLikeEmail(values) {
  const present = values.filter((value) => !isMissing(value)).map((value) => String(value).trim());
  return (
    present.length > 0 &&
    present.some((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
  );
}

function valuesLookLikePhone(values) {
  const present = values.filter((value) => !isMissing(value)).map((value) => String(value).trim());
  return (
    present.length > 0 &&
    present.some((value) => {
      if (/^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/.test(value)) return false;
      const digitCount = value.replace(/\D/g, "").length;
      return digitCount >= 7 && digitCount <= 15 && /^\+?[\d\s().-]+$/.test(value);
    })
  );
}

function countDuplicates(rows, identifierColumns) {
  if (!identifierColumns.length) return 0;
  const seen = new Set();
  let duplicates = 0;
  for (const row of rows) {
    const identifier = identifierColumns
      .map((column) => String(row[column] ?? "").trim().toLowerCase())
      .filter(Boolean)
      .join("|");
    if (!identifier) continue;
    if (seen.has(identifier)) duplicates += 1;
    else seen.add(identifier);
  }
  return duplicates;
}

function profileRows(rows) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const identifierColumns = headers.filter((header) => {
    if (METADATA_PATTERN.test(header.trim()) || SENSITIVE_PATTERN.test(header.trim())) {
      return false;
    }
    const values = rows.map((row) => row[header]);
    return (
      IDENTIFIER_PATTERN.test(header.trim()) ||
      valuesLookLikeEmail(values) ||
      valuesLookLikePhone(values)
    );
  });
  const metadataColumns = headers.filter(
    (header) =>
      !identifierColumns.includes(header) && METADATA_PATTERN.test(header.trim()),
  );
  const sensitiveColumns = headers.filter(
    (header) =>
      !identifierColumns.includes(header) &&
      !metadataColumns.includes(header) &&
      SENSITIVE_PATTERN.test(header.trim()),
  );
  const columns = {};

  for (const header of headers) {
    const values = rows.map((row) => row[header]);
    const kind = inferKind(values);
    const nonMissing = values.filter((value) => !isMissing(value));
    const uniqueValues = new Set(nonMissing.map((value) => String(value)));
    columns[header] = {
      kind,
      missingCount: values.length - nonMissing.length,
      uniqueCount: uniqueValues.size,
      detectedScale: detectedScale(values, kind),
      sampleValues: [...identifierColumns, ...metadataColumns, ...sensitiveColumns].includes(header)
        ? []
        : [...uniqueValues].slice(0, 5),
    };
  }

  const excluded = new Set([...identifierColumns, ...metadataColumns, ...sensitiveColumns]);
  return {
    rowCount: rows.length,
    columnCount: headers.length,
    identifierColumns,
    metadataColumns,
    sensitiveColumns,
    restrictedColumns: [...identifierColumns, ...sensitiveColumns],
    questionColumns: headers.filter((header) => !excluded.has(header)),
    unsupportedColumns: [],
    duplicateCount: countDuplicates(rows, identifierColumns),
    columns,
  };
}

module.exports = {
  countDuplicates,
  inferKind,
  isMissing,
  profileRows,
  valuesLookLikeEmail,
  valuesLookLikePhone,
};
