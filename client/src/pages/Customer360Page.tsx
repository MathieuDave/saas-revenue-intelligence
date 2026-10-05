import { useEffect, useMemo, useState } from "react"; 

import KpiCard from "../components/KpiCard";
import ChartCard from "../components/ChartCard";
import CustomerRevenueChart from "../components/CustomerRevenueChart";
import CustomerUsageChart from "../components/CustomerUsageChart";
import CustomerProfile from "../components/CustomerProfile";
import RecommendedAction from "../components/RecommendedAction";

// =========================================================
// TYPES
// =========================================================

export type CustomerRevenueData = {
  month: string;
  mrr: number;
};

export type CustomerUsageData = {
  month: string;
  licenseUtilization: number;
};

export type CustomerProfileData = {
  customerId: string;
  companyName: string;
  country: string;
  industry: string;
  companySize: string;
  employeeCount: number;
  plan: string;
  seatsPurchased: number;
  renewalDate: string;
  customerSince: string;
  customerStatus: string;
};

export type CustomerActionData = {
  priorityCategory: string;
  recommendedAction: string;
  riskLevel: string;
  opportunityLevel: string;
};

type CustomerOption = {
  customerId: string;
  companyName: string;
};

type Customer360Data = {
  customer: {
    customerId: string;
    companyName: string;
  };

  kpis: {
    arr: number;
    riskScore: number;
    opportunityScore: number;
    daysToRenewal: number;
    licenseUtilization: number;
  };

  supportFeedback: {
    ticketsLast90Days: number;
    criticalTicketsLast90Days: number;
    negativeFeedbackLast90Days: number;
    avgFeedbackScoreLast90Days: number;
  };

  revenueHistory: CustomerRevenueData[];

  usageHistory: CustomerUsageData[];

  profile: CustomerProfileData;

  action: CustomerActionData;
};

// =========================================================
// FORMATTERS
// =========================================================

function formatMoney(value: number) {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }

  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }

  return `$${value.toLocaleString()}`;
}

// =========================================================
// PAGE
// =========================================================

function Customer360Page() {
  const [customers, setCustomers] = useState<CustomerOption[]>([
    {
      customerId: "C0235",
      companyName: "Orion Insights 0235",
    },
  ]);

  const [selectedCustomerId, setSelectedCustomerId] =
    useState("C0235");

    const [customerSearch, setCustomerSearch] =
  useState("");

const [isCustomerMenuOpen, setIsCustomerMenuOpen] =
  useState(false);  

  const [data, setData] =
    useState<Customer360Data | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] =
    useState<string | null>(null);

  // =======================================================
  // LOAD CUSTOMER LIST
  // =======================================================

const filteredCustomers = useMemo(() => {
  const normalizedSearch =
    customerSearch.trim().toLowerCase();

  if (normalizedSearch === "") {
    return customers;
  }

  return customers.filter((customer) =>
    customer.companyName
      .toLowerCase()
      .includes(normalizedSearch)
  );
}, [customers, customerSearch]);

  useEffect(() => {
    async function loadCustomers() {
      try {
        const response = await fetch(
          "http://localhost:3000/api/customers"
        );

        if (!response.ok) {
          throw new Error(
            "Unable to retrieve customer list."
          );
        }

        const customerList: CustomerOption[] =
          await response.json();

        setCustomers(customerList);
      } catch (error) {
        console.warn(
          "Customer list fetch error:",
          error
        );
      }
    }

    loadCustomers();
  }, []);

  // =======================================================
  // LOAD SELECTED CUSTOMER
  // =======================================================

  useEffect(() => {
    async function loadCustomer() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `http://localhost:3000/api/customers/${selectedCustomerId}`
        );

        if (!response.ok) {
          throw new Error(
            "Unable to retrieve customer data."
          );
        }

        const customerData: Customer360Data =
          await response.json();

        setData(customerData);
      } catch (error) {
        console.error(
          "Customer 360 fetch error:",
          error
        );

        setError(
          "Unable to load customer information."
        );
      } finally {
        setLoading(false);
      }
    }

    loadCustomer();
  }, [selectedCustomerId]);

  // =======================================================
  // PAGE STATES
  // =======================================================

  if (loading && !data) {
    return <p>Loading customer...</p>;
  }

  if (error || !data) {
    return (
      <p>
        {error ?? "Customer data unavailable."}
      </p>
    );
  }

  // =======================================================
  // UI
  // =======================================================

  return (
    <div>
      <div className="app-header">
        <h1>Customer 360</h1>

        <p>
          Complete customer profile, health signals and
          recommended actions.
        </p>
      </div>
<div className="customer-header">
  <div>
    <h2>{data.customer.companyName}</h2>

    <p>
      Customer ID: {data.customer.customerId}
    </p>
  </div>

  <div className="customer-selector">
    <label htmlFor="customer-search">
      Customer
    </label>

    <div className="customer-combobox">
      <input
        id="customer-search"
        type="text"
        placeholder="Search or select customer..."
        value={customerSearch}
        onFocus={() =>
          setIsCustomerMenuOpen(true)
        }
        onChange={(event) => {
          setCustomerSearch(
            event.target.value
          );

          setIsCustomerMenuOpen(true);
        }}
      />

      {isCustomerMenuOpen && (
  <div className="customer-combobox-menu">
    {filteredCustomers.length === 0 && (
      <div className="customer-combobox-empty">
        No customer found
      </div>
    )}

    {filteredCustomers.map((customer) => (
        <button
          key={customer.customerId}
          type="button"
          className="customer-combobox-option"
          onClick={() => {
            setSelectedCustomerId(
              customer.customerId
            );

            setCustomerSearch(
              customer.companyName
            );

            setIsCustomerMenuOpen(false);
          }}
        >
          <span>
            {customer.companyName}
          </span>

          <small>
            {customer.customerId}
          </small>
        </button>
      ))}
  </div>
)}
    </div>
  </div>
</div>
      <div className="kpi-grid">
        <KpiCard
          title="Annual Recurring Revenue"
          value={formatMoney(data.kpis.arr)}
          accent="green"
        />

        <KpiCard
          title="Risk Score"
          value={data.kpis.riskScore.toString()}
          accent="orange"
        />

        <KpiCard
          title="Opportunity Score"
          value={data.kpis.opportunityScore.toString()}
          accent="purple"
        />

        <KpiCard
          title="Days to Renewal"
          value={data.kpis.daysToRenewal.toString()}
          accent="orange"
        />

        <KpiCard
          title="License Utilization"
          value={`${data.kpis.licenseUtilization.toFixed(
            1
          )}%`}
          accent="blue"
        />
      </div>

      <div className="customer-charts-grid">
        <ChartCard
          title="Revenue History"
          description="Monthly recurring revenue evolution"
        >
          <CustomerRevenueChart
            data={data.revenueHistory}
          />
        </ChartCard>

        <ChartCard
          title="Product Usage"
          description="License utilization over time"
        >
          <CustomerUsageChart
            data={data.usageHistory}
          />
        </ChartCard>
      </div>

      <div className="customer-signals-section">
        <h2>Support & Feedback</h2>

        <div className="kpi-grid">
          <KpiCard
            title="Tickets - Last 90 Days"
            value={data.supportFeedback.ticketsLast90Days.toString()}
            accent="blue"
          />

          <KpiCard
            title="Critical Tickets - 90D"
            value={data.supportFeedback.criticalTicketsLast90Days.toString()}
            accent="orange"
          />

          <KpiCard
            title="Negative Feedback - 90D"
            value={data.supportFeedback.negativeFeedbackLast90Days.toString()}
            accent="orange"
          />

          <KpiCard
            title="Avg Feedback Score"
            value={`${data.supportFeedback.avgFeedbackScoreLast90Days.toFixed(
              1
            )} / 5`}
            accent="purple"
          />
        </div>
      </div>

      <div className="customer-details-grid">
        <ChartCard
          title="Account Profile"
          description="Customer account and subscription information"
        >
          <CustomerProfile
            data={data.profile}
          />
        </ChartCard>

        <ChartCard
          title="Recommended Action"
          description="Next best action based on current customer signals"
        >
          <RecommendedAction
            data={data.action}
          />
        </ChartCard>
      </div>
    </div>
  );
}

export default Customer360Page;