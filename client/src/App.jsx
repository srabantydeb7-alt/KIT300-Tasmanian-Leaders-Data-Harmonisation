import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./styles/tl-theme.css";
import "./App.css";
import { api, ApiError } from "./api";
import WorkspaceLayout from "./components/WorkspaceLayout";
import OverviewPage from "./pages/Overview/OverviewPage";
import DatasetsPage from "./pages/Datasets/DatasetsPage";
import MappingPage from "./pages/Mapping/MappingPage";
import RulesPage from "./pages/Rules/RulesPage";
import ValidationPage from "./pages/Validation/ValidationPage";
import ExportPage from "./pages/Export/ExportPage";

const EMPTY_OVERVIEW = { datasets: 0, questionVariants: 0, warnings: 0, exportable: 0 };

function normaliseOverview(data = {}) {
  return {
    datasets: data.datasets ?? data.uniqueDatasets ?? data.totalRuns ?? 0,
    questionVariants: data.questionVariants ?? data.normalisedQuestionVariants ?? 0,
    warnings: data.warnings ?? data.activeValidationWarnings ?? 0,
    exportable: data.exportable ?? data.readyForExport ?? 0,
  };
}

function messageFrom(error) {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Please try again.";
}

function App() {
  const [activePage, setActivePage] = useState("overview");
  const [runs, setRuns] = useState([]);
  const [activeRun, setActiveRun] = useState(null);
  const [overview, setOverview] = useState(EMPTY_OVERVIEW);
  const [rules, setRules] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const refreshWorkspace = useCallback(async (preferredRunId) => {
    const [overviewData, runData, ruleData, questionData] = await Promise.all([
      api.getOverview(), api.listRuns(), api.listRules(), api.listQuestions(),
    ]);
    setOverview(normaliseOverview(overviewData));
    setRuns(Array.isArray(runData) ? runData : []);
    setRules(Array.isArray(ruleData) ? ruleData : []);
    setQuestions(Array.isArray(questionData) ? questionData : []);
    const runId = preferredRunId || activeRun?.id;
    if (runId) {
      const exists = (runData || []).some((run) => run.id === runId);
      setActiveRun(exists ? await api.getRun(runId) : null);
    }
  }, [activeRun?.id]);

  useEffect(() => {
    let live = true;
    Promise.all([api.getOverview(), api.listRuns(), api.listRules(), api.listQuestions()])
      .then(async ([overviewData, runData, ruleData, questionData]) => {
        if (!live) return;
        const savedRuns = Array.isArray(runData) ? runData : [];
        setOverview(normaliseOverview(overviewData));
        setRuns(savedRuns);
        setRules(Array.isArray(ruleData) ? ruleData : []);
        setQuestions(Array.isArray(questionData) ? questionData : []);
        if (savedRuns[0]?.id) {
          const restoredRun = await api.getRun(savedRuns[0].id);
          if (live) setActiveRun(restoredRun);
        }
      })
      .catch((error) => live && setNotice({ kind: "error", text: messageFrom(error) }));
    return () => { live = false; };
  }, []);

  const runAction = useCallback(async (action, successMessage) => {
    setBusy(true);
    setNotice(null);
    try {
      const run = await action();
      if (run?.id) setActiveRun(run);
      await refreshWorkspace(run?.id);
      setNotice({ kind: "success", text: successMessage });
      return run;
    } catch (error) {
      setNotice({ kind: "error", text: messageFrom(error) });
      return null;
    } finally {
      setBusy(false);
    }
  }, [refreshWorkspace]);

  const handleSelectRun = useCallback(async (runId) => {
    if (!runId) return setActiveRun(null);
    setBusy(true);
    try {
      setActiveRun(await api.getRun(runId));
      setNotice({ kind: "success", text: "Saved workspace restored." });
    } catch (error) {
      setNotice({ kind: "error", text: messageFrom(error) });
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDemo = useCallback(async () => {
    const run = await runAction(() => api.createDemoRun(), "Demonstration survey profiled and ready for review.");
    if (run) setActivePage("mapping");
  }, [runAction]);

  const handleUpload = useCallback(async (formData) => {
    const run = await runAction(() => api.uploadDataset(formData), "Dataset securely parsed, pseudonymised, and profiled.");
    if (run) setActivePage("mapping");
    return Boolean(run);
  }, [runAction]);

  const handleMapping = useCallback(async (mapping) => {
    if (!activeRun) return false;
    return Boolean(await runAction(
      () => api.updateMapping(activeRun.id, mapping),
      "Mapping decision saved to the reusable workspace.",
    ));
  }, [activeRun, runAction]);

  const handleProcess = useCallback(async () => {
    if (!activeRun) return false;
    return Boolean(await runAction(
      () => api.processRun(activeRun.id),
      "Harmonisation and validation completed deterministically.",
    ));
  }, [activeRun, runAction]);

  const handleCreateRule = useCallback(async (rule) => {
    setBusy(true);
    try {
      await api.createRule(rule);
      setRules(await api.listRules());
      setNotice({ kind: "success", text: "A new immutable rule version was saved." });
      return true;
    } catch (error) {
      setNotice({ kind: "error", text: messageFrom(error) });
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const handleCreateRuleVersion = useCallback(async (ruleId, rule) => {
    setBusy(true);
    try {
      await api.createRuleVersion(ruleId, rule);
      setRules(await api.listRules());
      setNotice({ kind: "success", text: "A new immutable rule version was saved." });
      return true;
    } catch (error) {
      setNotice({ kind: "error", text: messageFrom(error) });
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const pageProps = useMemo(() => ({
    run: activeRun, runs, rules, questions, busy, onNavigate: setActivePage,
    onDemo: handleDemo, onUpload: handleUpload, onSelectRun: handleSelectRun,
    onSaveMapping: handleMapping, onProcess: handleProcess, onCreateRule: handleCreateRule,
    onCreateRuleVersion: handleCreateRuleVersion,
  }), [activeRun, busy, handleCreateRule, handleCreateRuleVersion, handleDemo, handleMapping, handleProcess, handleSelectRun, handleUpload, questions, rules, runs]);

  const pages = {
    overview: <OverviewPage overview={overview} {...pageProps} />,
    datasets: <DatasetsPage {...pageProps} />,
    mapping: <MappingPage {...pageProps} />,
    rules: <RulesPage {...pageProps} />,
    validation: <ValidationPage {...pageProps} />,
    export: <ExportPage {...pageProps} />,
  };

  return (
    <WorkspaceLayout activePage={activePage} activeRun={activeRun} runs={runs} busy={busy}
      notice={notice} onDismissNotice={() => setNotice(null)} onNavigate={setActivePage} onSelectRun={handleSelectRun}>
      {pages[activePage] || pages.overview}
    </WorkspaceLayout>
  );
}

export default App;
