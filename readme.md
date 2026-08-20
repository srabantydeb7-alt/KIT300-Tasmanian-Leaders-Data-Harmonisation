# KIT300 Tasmanian Leaders Data Harmonisation Platform

A complete local/internal workflow for turning differently structured survey files into repeatable, traceable, harmonised outputs.

## What works

- CSV, XLSX, and XLS import with file-size and content checks
- Source profiling: columns, types, missing values, identifiers, duplicate identifiers, and detected numeric scales
- Exact/alias question mapping plus advisory token-similarity suggestions
- Human approval, manual remapping, explicit exclusion, and approved-rule selection per question
- Editable, immutable rule versions using typed transformations (`identity`, `linear`, `reverse`, and `categoricalMap`)
- Deterministic long-format harmonisation with original question/value and source location retained
- HMAC-pseudonymised identifiers; raw identifiers are excluded from saved run payloads and exports
- Located validation errors/warnings and export gating
- Persistent saved runs and automatic resume after restart
- Harmonised, validation, unmapped-question, and mapping CSV exports
- Downloadable run-summary PDF
- Responsive Overview, Datasets, Mapping, Scale Rules, Validation, and Export screens

## Quick start

Requires Node.js 20 or newer.

```bash
npm run setup
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The API runs at `http://127.0.0.1:5050`.

Choose **Load demonstration run** for an immediate end-to-end example, or upload [`sample-data/tasmanian-leaders-demo.csv`](sample-data/tasmanian-leaders-demo.csv).

## Production-style local run

Build the React app, then serve the UI and API together from the Express server:

```bash
npm run build
npm start
```

Open [http://127.0.0.1:5050](http://127.0.0.1:5050).

## Workflow

1. **Datasets** - upload a survey and enter program, year, round, and quality tier metadata.
2. **Mapping** - review confidence scores; approve, change, or exclude every question.
3. **Scale rules** - inspect or add an approved typed conversion rule and rounding policy.
4. **Validation** - run deterministic conversion and inspect located schema, mapping, range, missing-value, and duplicate issues.
5. **Export** - once blocking issues are resolved, download the harmonised data and audit outputs.

The same source data, mapping decisions, and rule versions produce the same canonical output hash.

## Verification

```bash
npm test
npm run coverage
npm run build
npm run audit
```

Or run the combined release check:

```bash
npm run verify
```

## Privacy and deployment boundary

This release is intentionally an unauthenticated, single-user internal/local tool. The server binds to `127.0.0.1` by default and accepts local browser origins. Add organisational authentication, authorisation, TLS, retention rules, and managed encrypted storage before exposing it on a shared or public network.

- Uploaded raw files and application data are excluded from Git.
- Each raw upload is deleted after secure parsing. The private workspace retains pseudonymised response rows, original question/value evidence, and the source checksum, not the original participant-identifying file.
- A random HMAC secret is created locally on first run unless `HARMONISATION_HMAC_SECRET` is supplied.
- A supplied HMAC secret must be at least 32 bytes.
- Identifier-like columns are detected from headers and email/phone-shaped values, then removed from public run state.
- Spreadsheet cells beginning with formula characters are escaped in CSV output.

Copy [`.env.example`](.env.example) values into your local environment when customising storage, ports, or allowed origins. Never commit real participant data or secrets.

For a non-default API address during client development, create `client/.env.local` with `VITE_API_URL=http://127.0.0.1:5050`.

## Project structure

- `client/` - React workbench and UI tests
- `server/` - Express API, harmonisation services, persistence, exports, and tests
- `sample-data/` - sanitised demonstration input
- `docs/testing/` - TDD and verification evidence

Developed for KIT300 Professional Experience at the University of Tasmania.
