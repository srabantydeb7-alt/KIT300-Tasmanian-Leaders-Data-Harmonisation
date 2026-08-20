import React from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import DatasetsPage from "./pages/Datasets/DatasetsPage";
import Export from "./pages/Export/Export";
import MappingPage from "./pages/Mapping/MappingPage";
import Overview from "./pages/Overview/Overview";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<Overview />} />
        <Route path="/datasets" element={<DatasetsPage />} />
        <Route path="/mapping" element={<MappingPage />} />
        <Route path="/export" element={<Export />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
