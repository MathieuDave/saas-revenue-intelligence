import "./App.css";
import { Routes, Route, Outlet } from "react-router-dom";

import Sidebar from "./components/Sidebar";
import OverviewPage from "./pages/OverviewPage";
import RiskPage from "./pages/RiskPage";
import ExpansionPage from "./pages/ExpansionPage";
import Customer360Page from "./pages/Customer360Page";
import CopilotPage from "./pages/CopilotPage";
import MorningBriefPage from "./pages/MorningBriefPage";

// Mise en page de la V1 : sidebar + la page demandée (dans l'Outlet)
function V1Layout() {
  return (
    <div className="app-layout">
      <Sidebar />

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

function App() {
  return (
    <Routes>
      {/* V2 : le Morning Brief en pleine page, sans la sidebar V1 */}
      <Route path="/brief" element={<MorningBriefPage />} />

      {/* V1 : les pages d'exploration, avec la sidebar */}
      <Route element={<V1Layout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/risk" element={<RiskPage />} />
        <Route path="/expansion" element={<ExpansionPage />} />
        <Route path="/customers" element={<Customer360Page />} />
        <Route path="/copilot" element={<CopilotPage />} />
      </Route>
    </Routes>
  );
}

export default App;