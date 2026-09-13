const fs = require("node:fs");
const path = require("node:path");

const { createInitialState } = require("../Services/questionLibrary");

function mergeBuiltIns(state) {
  const baseline = createInitialState();
  const rules = [...state.rules];
  for (const builtIn of baseline.rules) {
    if (!rules.some((rule) => rule.ruleId === builtIn.ruleId && rule.version === builtIn.version)) {
      rules.push(builtIn);
    }
  }

  const existingByCode = new Map(
    state.targetQuestions.map((question) => [question.code, question]),
  );
  const targetQuestions = baseline.targetQuestions.map((canonical) => {
    const existing = existingByCode.get(canonical.code);
    if (!existing) return canonical;
    existingByCode.delete(canonical.code);
    return {
      ...canonical,
      ...existing,
      aliases: [...new Set([...(canonical.aliases || []), ...(existing.aliases || [])])],
    };
  });
  targetQuestions.push(...existingByCode.values());
  return { ...state, rules, targetQuestions };
}

class JsonStore {
  constructor(dataDir) {
    this.dataDir = path.resolve(dataDir);
    this.filePath = path.join(this.dataDir, "harmonisation-store.json");
    fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });

    if (!fs.existsSync(this.filePath)) {
      this.#write(createInitialState());
    } else {
      const current = this.#read();
      const merged = mergeBuiltIns(current);
      if (JSON.stringify(merged) !== JSON.stringify(current)) this.#write(merged);
    }
  }

  read() {
    return structuredClone(this.#read());
  }

  mutate(mutator) {
    const nextState = structuredClone(this.#read());
    const result = mutator(nextState);
    this.#write(nextState);
    return structuredClone(result);
  }

  #read() {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    } catch (error) {
      throw new Error(`Unable to read harmonisation data store: ${error.message}`);
    }

    if (
      !parsed ||
      parsed.schemaVersion !== 1 ||
      !Array.isArray(parsed.runs) ||
      !Array.isArray(parsed.rules) ||
      !Array.isArray(parsed.targetQuestions)
    ) {
      throw new Error("Harmonisation data store has an unsupported structure.");
    }
    return parsed;
  }

  #write(state) {
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, this.filePath);
  }
}

module.exports = { JsonStore, mergeBuiltIns };
