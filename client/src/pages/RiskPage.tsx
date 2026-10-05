import { useEffect, useState } from "react";

import KpiCard from "../components/KpiCard";
import ChartCard from "../components/ChartCard";

import RiskDistributionChart from "../components/RiskDistributionChart";
import ArrByRiskChart from "../components/ArrByRiskChart";
import RiskDriversChart from "../components/RiskDriversChart";
import RenewalUrgencyChart from "../components/RenewalUrgencyChart";
import RiskAccountsTable from "../components/RiskAccountsTable";

export type RiskLevelData = {
  riskLevel: string;
  accounts: number;
  arr: number;
};

export type RiskDriverData = {
  driver: string;
  points: number;
};

export type RenewalUrgencyData = {
  range: string;
  accounts: number;
};

export type RiskAccount = {
  companyName: string;
  arr: number;
  riskScore: number;
  riskLevel: string;
  daysToRenewal: number;
  primaryRiskDriver: string;
  recommendedAction: string;
};

export type CustomerRiskData = {
  kpis: {
    priorityArrAtRisk: number;
    criticalAccounts: number;
    highRiskAccounts: number;
    renewalsNext30Days: number;
  };

  riskDistribution: RiskLevelData[];
  riskDrivers: RiskDriverData[];
  renewalUrgency: RenewalUrgencyData[];
  accounts: RiskAccount[];
};

function RiskPage() {
  const [data, setData] = useState<CustomerRiskData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("http://localhost:3000/api/customer-risk")
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            "Unable to retrieve customer risk data"
          );
        }

        return response.json();
      })
      .then((result: CustomerRiskData) => {
        setData(result);
      })
      .catch((error) => {
        console.error("Customer risk error:", error);
        setError(true);
      });
  }, []);

  if (error) {
    return (
      <div>
        <div className="app-header">
          <h1>Customer Risk</h1>
          <p>
            Identify and prioritize accounts with elevated
            churn risk.
          </p>
        </div>

        <p>Unable to load customer risk data.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="app-header">
        <h1>Customer Risk</h1>

        <p>
          Identify and prioritize accounts with elevated
          churn risk.
        </p>
      </div>

      {/* KPI CARDS */}

      <div className="risk-kpi-grid">
        <KpiCard
          title="Priority ARR at Risk"
          value={
            data
              ? `$${(
                  data.kpis.priorityArrAtRisk / 1000
                ).toFixed(2)}K`
              : "Loading..."
          }
          accent="orange"
        />

        <KpiCard
          title="Critical Risk Accounts"
          value={
            data
              ? data.kpis.criticalAccounts.toLocaleString()
              : "Loading..."
          }
          accent="orange"
        />

        <KpiCard
          title="High Risk Accounts"
          value={
            data
              ? data.kpis.highRiskAccounts.toLocaleString()
              : "Loading..."
          }
          accent="purple"
        />

        <KpiCard
          title="Renewals in Next 30 Days"
          value={
            data
              ? data.kpis.renewalsNext30Days.toLocaleString()
              : "Loading..."
          }
          accent="blue"
        />
      </div>

      {/* RISK CHARTS */}

      <div className="risk-charts-grid">
        <ChartCard
          title="Risk Distribution"
          description="Customer accounts by risk level"
        >
          <RiskDistributionChart
            data={data?.riskDistribution ?? []}
          />
        </ChartCard>

        <ChartCard
          title="ARR by Risk Level"
          description="Annual recurring revenue distributed across customer risk levels"
        >
          <ArrByRiskChart
            data={data?.riskDistribution ?? []}
          />
        </ChartCard>

        <ChartCard
          title="Risk Score Contribution"
          description="Contribution of each signal to total customer risk"
        >
          <RiskDriversChart
            data={data?.riskDrivers ?? []}
          />
        </ChartCard>

        <ChartCard
          title="Renewal Urgency"
          description="Customer accounts grouped by time remaining until renewal"
        >
          <RenewalUrgencyChart
            data={data?.renewalUrgency ?? []}
          />
        </ChartCard>
      </div>

      {/* PRIORITY ACCOUNTS */}

      <ChartCard
        title="Accounts Requiring Attention"
        description="Highest priority customer accounts based on current risk signals"
      >
        <RiskAccountsTable
          accounts={data?.accounts ?? []}
        />
      </ChartCard>
    </div>
  );
}

export default RiskPage;