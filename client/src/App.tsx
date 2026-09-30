import './App.css'
import KpiCard from './components/KpiCard'

function App() {
  return (
    <div className="app">
      <div className="app-header">
        <h1>SaaS Revenue Intelligence</h1>
        <p>Revenue Intelligence Platform</p>
      </div>

      <div className="kpi-grid">
        <KpiCard
          title="Annual Recurring Revenue"
          value="$14.30M"
        />

        <KpiCard
          title="MRR Growth"
          value="3.03%"
        />

        <KpiCard
          title="Net Revenue Retention"
          value="101.46%"
        />
      </div>
    </div>
  )
}

export default App