import { useEffect, useState } from "react";

import KpiCard from "../components/KpiCard";
import ChartCard from "../components/ChartCard";

import OpportunityDistributionChart from "../components/OpportunityDistributionChart";
import ArrByOpportunityChart from "../components/ArrByOpportunityChart";
import ExpansionDriversChart from "../components/ExpansionDriversChart";
import PriorityAccountsByPlanChart from "../components/PriorityAccountsByPlanChart";
import ExpansionAccountsTable from "../components/ExpansionAccountsTable";

/* =========================================================
   TYPES
   ========================================================= */

export type OpportunityLevelData = {
  opportunityLevel: string;
  accounts: number;
  arr: number;
};

export type ExpansionDriverData = {
  driver: string;
  points: number;
};

export type ExpansionPlanData = {
  plan: string;
  accounts: number;
  arr: number;
};

export type ExpansionAccount = {
  companyName: string;
  arr: number;
  plan: string;
  licenseUtilization: number;
  featureAdoption: number;
  opportunityScore: number;
  opportunityLevel: string;
  recommendedAction: string;
};

type ExpansionData = {
  kpis: {
    expansionPriorityAccounts: number;
    arrInExpansionAccounts: number;
    veryHighOpportunityAccounts: number;
    highOpportunityAccounts: number;
  };

  opportunityDistribution: OpportunityLevelData[];

  expansionDrivers: ExpansionDriverData[];

  expansionByPlan: ExpansionPlanData[];

  accounts: ExpansionAccount[];
};

/* =========================================================
   HELPERS
   ========================================================= */

function formatCurrency(value: number) {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }

  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }

  return `$${value.toLocaleString()}`;
}

/* =========================================================
   PAGE
   ========================================================= */

function ExpansionPage() {
  const [data, setData] = useState<ExpansionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadExpansionData() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          "http://localhost:3000/api/expansion"
        );

        if (!response.ok) {
          throw new Error(
            `Expansion API returned ${response.status}`
          );
        }

        const result: ExpansionData = await response.json();

        setData(result);
      } catch (error) {
        console.error(
          "Unable to load expansion data:",
          error
        );

        setError(
          "Unable to load expansion opportunity data."
        );
      } finally {
        setLoading(false);
      }
    }

    loadExpansionData();
  }, []);

  /* =======================================================
     LOADING
     ======================================================= */

  if (loading) {
    return (
      <div>
        <header className="app-header">
          <h1>Expansion Opportunities</h1>
          <p>
            Identify customers with the strongest signals for
            account expansion.
          </p>
        </header>

        <p>Loading expansion data...</p>
      </div>
    );
  }

  /* =======================================================
     ERROR
     ======================================================= */

  if (error || !data) {
    return (
      <div>
        <header className="app-header">
          <h1>Expansion Opportunities</h1>
          <p>
            Identify customers with the strongest signals for
            account expansion.
          </p>
        </header>

        <p>{error ?? "No expansion data available."}</p>
      </div>
    );
  }

  /* =======================================================
     PAGE CONTENT
     ======================================================= */

  return (
    <div>
      <header className="app-header">
        <h1>Expansion Opportunities</h1>

        <p>
          Identify customers with the strongest signals for
          account expansion.
        </p>
      </header>

      {/* ===================================================
          KPI
          =================================================== */}

      <section className="expansion-kpi-grid">
        <KpiCard
          title="Expansion Priority Accounts"
          value={data.kpis.expansionPriorityAccounts.toLocaleString()}
          accent="purple"
        />

        <KpiCard
          title="ARR in Expansion Accounts"
          value={formatCurrency(
            data.kpis.arrInExpansionAccounts
          )}
          accent="green"
        />

        <KpiCard
          title="Very High Opportunities"
          value={data.kpis.veryHighOpportunityAccounts.toLocaleString()}
          accent="purple"
        />

        <KpiCard
          title="High Opportunities"
          value={data.kpis.highOpportunityAccounts.toLocaleString()}
          accent="blue"
        />
      </section>

      {/* ===================================================
          CHARTS
          =================================================== */}

      <section className="expansion-charts-grid">
        <ChartCard
          title="Opportunity Distribution"
          description="Customer accounts by expansion opportunity level"
        >
          <OpportunityDistributionChart
            data={data.opportunityDistribution}
          />
        </ChartCard>

        <ChartCard
          title="ARR by Opportunity Level"
          description="Annual recurring revenue distributed across opportunity levels"
        >
          <ArrByOpportunityChart
            data={data.opportunityDistribution}
          />
        </ChartCard>

        <ChartCard
          title="Expansion Score Contribution"
          description="Contribution of each signal to expansion opportunity"
        >
          <ExpansionDriversChart
            data={data.expansionDrivers}
          />
        </ChartCard>

        <ChartCard
          title="Expansion Opportunities by Plan"
          description="Priority expansion accounts grouped by current subscription plan"
        >
          <PriorityAccountsByPlanChart
  data={data.expansionByPlan}
/>
        </ChartCard>
      </section>

      {/* ===================================================
          TABLE
          =================================================== */}

      <ChartCard
        title="Accounts with Expansion Potential"
        description="Highest-priority customer accounts based on current expansion signals"
      >
        <ExpansionAccountsTable
          accounts={data.accounts}
        />
      </ChartCard>
    </div>
  );
}

export default ExpansionPage;