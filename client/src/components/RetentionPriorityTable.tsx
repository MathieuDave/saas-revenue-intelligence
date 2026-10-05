import { useEffect, useMemo, useState } from "react";
import "./RetentionPriorityTable.css";

type RetentionPriority = {
  companyName: string;
  arr: number;
  daysToRenewal: number;
  riskScore: number;
  riskLevel: string;
  priorityCategory: string;
  recommendedAction: string;
};

type SortField =
  | "companyName"
  | "arr"
  | "riskScore"
  | "daysToRenewal";

type SortDirection = "asc" | "desc";

function RetentionPriorityTable() {
  const [accounts, setAccounts] = useState<RetentionPriority[]>([]);

  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("All");
  const [renewalFilter, setRenewalFilter] = useState("All");
  const [actionFilter, setActionFilter] = useState("All");

  const [sortField, setSortField] =
    useState<SortField>("riskScore");

  const [sortDirection, setSortDirection] =
    useState<SortDirection>("desc");

  useEffect(() => {
    fetch("http://localhost:3000/api/retention-priorities")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to fetch retention priorities");
        }

        return response.json();
      })
      .then((data: RetentionPriority[]) => {
        setAccounts(data);
      })
      .catch((error) => {
        console.error("Retention priorities error:", error);
      });
  }, []);

  const actions = useMemo(() => {
    return Array.from(
      new Set(accounts.map((account) => account.recommendedAction))
    );
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    const filtered = accounts.filter((account) => {
      const matchesSearch = account.companyName
        .toLowerCase()
        .includes(search.toLowerCase());

      const matchesRisk =
        riskFilter === "All" ||
        account.riskLevel === riskFilter;

      let matchesRenewal = true;

      if (renewalFilter === "15") {
        matchesRenewal = account.daysToRenewal <= 15;
      }

      if (renewalFilter === "30") {
        matchesRenewal = account.daysToRenewal <= 30;
      }

      if (renewalFilter === "60") {
        matchesRenewal = account.daysToRenewal <= 60;
      }

      if (renewalFilter === "60+") {
        matchesRenewal = account.daysToRenewal > 60;
      }

      const matchesAction =
        actionFilter === "All" ||
        account.recommendedAction === actionFilter;

      return (
        matchesSearch &&
        matchesRisk &&
        matchesRenewal &&
        matchesAction
      );
    });

    return [...filtered].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortDirection === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return sortDirection === "asc"
        ? Number(aValue) - Number(bValue)
        : Number(bValue) - Number(aValue);
    });
  }, [
    accounts,
    search,
    riskFilter,
    renewalFilter,
    actionFilter,
    sortField,
    sortDirection,
  ]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((current) =>
        current === "asc" ? "desc" : "asc"
      );
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) {
      return "↕";
    }

    return sortDirection === "asc" ? "↑" : "↓";
  };

  const resetFilters = () => {
    setSearch("");
    setRiskFilter("All");
    setRenewalFilter("All");
    setActionFilter("All");
    setSortField("riskScore");
    setSortDirection("desc");
  };

  const formatCurrency = (value: number) =>
    `$${value.toLocaleString("en-US")}`;

  return (
    <div className="retention-table-container">
      <div className="retention-filters">
        <div className="filter-group search-filter">
          <label>Customer</label>

          <input
            type="text"
            placeholder="Search customer..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Risk Level</label>

          <select
            value={riskFilter}
            onChange={(event) => setRiskFilter(event.target.value)}
          >
            <option value="All">All levels</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Moderate">Moderate</option>
            <option value="Low">Low</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Renewal</label>

          <select
            value={renewalFilter}
            onChange={(event) =>
              setRenewalFilter(event.target.value)
            }
          >
            <option value="All">All renewals</option>
            <option value="15">≤ 15 days</option>
            <option value="30">≤ 30 days</option>
            <option value="60">≤ 60 days</option>
            <option value="60+">&gt; 60 days</option>
          </select>
        </div>

        <div className="filter-group action-filter">
          <label>Recommended Action</label>

          <select
            value={actionFilter}
            onChange={(event) =>
              setActionFilter(event.target.value)
            }
          >
            <option value="All">All actions</option>

            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>

        <button
          className="reset-filters-button"
          onClick={resetFilters}
        >
          Reset
        </button>
      </div>

      <div className="retention-results-count">
        Showing {filteredAccounts.length} of {accounts.length} accounts
      </div>

      <div className="retention-table-wrapper">
        <table className="retention-table">
          <thead>
            <tr>
              <th>
                <button
                  className="sort-button"
                  onClick={() => handleSort("companyName")}
                >
                  Customer
                  <span>{sortIcon("companyName")}</span>
                </button>
              </th>

              <th>
                <button
                  className="sort-button"
                  onClick={() => handleSort("arr")}
                >
                  ARR
                  <span>{sortIcon("arr")}</span>
                </button>
              </th>

              <th>
                <button
                  className="sort-button"
                  onClick={() => handleSort("riskScore")}
                >
                  Risk Score
                  <span>{sortIcon("riskScore")}</span>
                </button>
              </th>

              <th>Risk Level</th>

              <th>
                <button
                  className="sort-button"
                  onClick={() => handleSort("daysToRenewal")}
                >
                  Renewal
                  <span>{sortIcon("daysToRenewal")}</span>
                </button>
              </th>

              <th>Recommended Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredAccounts.map((account) => (
              <tr key={account.companyName}>
                <td className="customer-name">
                  {account.companyName}
                </td>

                <td>{formatCurrency(account.arr)}</td>

                <td>
                  <strong>{account.riskScore}</strong>
                  <span className="score-max"> / 100</span>
                </td>

                <td>
                  <span
                    className={`risk-badge ${account.riskLevel.toLowerCase()}`}
                  >
                    {account.riskLevel}
                  </span>
                </td>

                <td>
                  <span
                    className={
                      account.daysToRenewal <= 15
                        ? "renewal-urgent"
                        : ""
                    }
                  >
                    {account.daysToRenewal} days
                  </span>
                </td>

                <td>{account.recommendedAction}</td>
              </tr>
            ))}

            {filteredAccounts.length === 0 && (
              <tr>
                <td colSpan={6} className="no-results">
                  No accounts match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RetentionPriorityTable;