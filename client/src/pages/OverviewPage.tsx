import { useEffect, useState } from "react";

import KpiCard from "../components/KpiCard";
import RevenueTrendChart from "../components/RevenueTrendChart";
import ChartCard from "../components/ChartCard";
import RevenueMovementsChart from "../components/RevenueMovementsChart";
import RetentionPriorityTable from "../components/RetentionPriorityTable";
import ExpansionPriorityTable from "../components/ExpansionPriorityTable";

type OverviewData = {
  arr: number;
  mrrGrowth: number;
  nrr: number;
  priorityArrAtRisk: number;
  expansionPriorityAccounts: number;
};

function OverviewPage() {
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);

  useEffect(() => {
    fetch("http://localhost:3000/api/overview")
      .then((response) => response.json())
      .then((data) => {
        setOverviewData(data);
      })
      .catch((error) => {
        console.error("Error fetching overview data:", error);
      });
  }, []);

  return (
    <div>
      <div className="app-header">
        <h1>Executive Overview</h1>
        <p>Revenue performance and business priorities.</p>
      </div>

      <div className="kpi-grid">
        <KpiCard
          title="Annual Recurring Revenue"
          value={
            overviewData
              ? `$${(overviewData.arr / 1000000).toFixed(2)}M`
              : "Loading..."
          }
          accent="green"
        />

        <KpiCard
          title="MRR Growth"
          value={
            overviewData
              ? `${overviewData.mrrGrowth.toFixed(2)}%`
              : "Loading..."
          }
          accent="blue"
        />

        <KpiCard
          title="Net Revenue Retention"
          value={
            overviewData
              ? `${overviewData.nrr.toFixed(2)}%`
              : "Loading..."
          }
          accent="purple"
        />

        <KpiCard
          title="Priority ARR at Risk"
          value={
            overviewData
              ? `$${(overviewData.priorityArrAtRisk / 1000).toFixed(2)}K`
              : "Loading..."
          }
          accent="orange"
        />

        <KpiCard
          title="Expansion Priority Accounts"
          value={
            overviewData
              ? overviewData.expansionPriorityAccounts.toString()
              : "Loading..."
          }
          accent="green"
        />
      </div>

      <ChartCard
        title="Monthly Recurring Revenue Trend"
        description="MRR evolution from March 2025 to August 2026"
      >
        <RevenueTrendChart />
      </ChartCard>

      <ChartCard
        title="Monthly Revenue Movements"
        description="New, expansion, contraction and churned MRR"
      >
        <RevenueMovementsChart />
      </ChartCard>

      <ChartCard
        title="Top Retention Priorities"
        description="Accounts requiring immediate retention attention"
      >
        <RetentionPriorityTable />
      </ChartCard>

      <ChartCard
        title="Top Expansion Priorities"
        description="Accounts with the strongest expansion signals"
      >
        <ExpansionPriorityTable />
      </ChartCard>
    </div>
  );
}

export default OverviewPage;