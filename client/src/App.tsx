import "./App.css";
import { Routes, Route } from "react-router-dom";

import Sidebar from "./components/Sidebar";
import OverviewPage from "./pages/OverviewPage";
import RiskPage from "./pages/RiskPage";
import ExpansionPage from "./pages/ExpansionPage";
import Customer360Page from "./pages/Customer360Page";
import CopilotPage from "./pages/CopilotPage";

function App() {
  return (
    <div className="app-layout">
      <Sidebar />

      <main className="main-content">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/risk" element={<RiskPage />} />
          <Route path="/expansion" element={<ExpansionPage />} />
          <Route path="/customers" element={<Customer360Page />} />
          <Route path="/copilot" element={<CopilotPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;