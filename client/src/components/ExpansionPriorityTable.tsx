import { useEffect, useMemo, useState } from "react";
import "./ExpansionPriorityTable.css";

type ExpansionPriority = {
  companyName: string;
  arr: number;
  plan: string;
  licenseUtilization: number;
  featureAdoption: number;
  opportunityScore: number;
  opportunityLevel: string;
  recommendedAction: string;
};

type SortField =
  | "companyName"
  | "arr"
  | "licenseUtilization"
  | "featureAdoption"
  | "opportunityScore";

type SortDirection = "asc" | "desc";

function ExpansionPriorityTable() {
  const [accounts, setAccounts] = useState<ExpansionPriority[]>([]);

  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("All");
  const [levelFilter, setLevelFilter] = useState("All");
  const [actionFilter, setActionFilter] = useState("All");

  const [sortField, setSortField] =
    useState<SortField>("opportunityScore");

  const [sortDirection, setSortDirection] =
    useState<SortDirection>("desc");

  useEffect(() => {
    fetch("http://localhost:3000/api/expansion-priorities")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to fetch expansion priorities");
        }

        return response.json();
      })
      .then((data: ExpansionPriority[]) => {
        setAccounts(data);
      })
      .catch((error) => {
        console.error("Expansion priorities error:", error);
      });
  }, []);

  const plans = useMemo(() => {
    return Array.from(
      new Set(accounts.map((account) => account.plan))
    );
  }, [accounts]);

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

      const matchesPlan =
        planFilter === "All" ||
        account.plan === planFilter;

      const matchesLevel =
        levelFilter === "All" ||
        account.opportunityLevel === levelFilter;

      const matchesAction =
        actionFilter === "All" ||
        account.recommendedAction === actionFilter;

      return (
        matchesSearch &&
        matchesPlan &&
        matchesLevel &&
        matchesAction
      );
    });

    return [...filtered].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      if (
        typeof aValue === "string" &&
        typeof bValue === "string"
      ) {
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
    planFilter,
    levelFilter,
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
    setPlanFilter("All");
    setLevelFilter("All");
    setActionFilter("All");
    setSortField("opportunityScore");
    setSortDirection("desc");
  };

  const formatCurrency = (value: number) =>
    `$${value.toLocaleString("en-US")}`;

  return (
    <div className="expansion-table-container">
      <div className="expansion-filters">
        <div className="expansion-filter-group">
          <label>Customer</label>

          <input
            type="text"
            placeholder="Search customer..."
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />
        </div>

        <div className="expansion-filter-group">
          <label>Plan</label>

          <select
            value={planFilter}
            onChange={(event) =>
              setPlanFilter(event.target.value)
            }
          >
            <option value="All">All plans</option>

            {plans.map((plan) => (
              <option key={plan} value={plan}>
                {plan}
              </option>
            ))}
          </select>
        </div>

        <div className="expansion-filter-group">
          <label>Opportunity Level</label>

          <select
            value={levelFilter}
            onChange={(event) =>
              setLevelFilter(event.target.value)
            }
          >
            <option value="All">All levels</option>
            <option value="Very High">Very High</option>
            <option value="High">High</option>
            <option value="Moderate">Moderate</option>
            <option value="Low">Low</option>
          </select>
        </div>

        <div className="expansion-filter-group">
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
          className="expansion-reset-button"
          onClick={resetFilters}
        >
          Reset
        </button>
      </div>

      <div className="expansion-results-count">
        Showing {filteredAccounts.length} of {accounts.length} accounts
      </div>

      <div className="expansion-table-wrapper">
        <table className="expansion-table">
          <thead>
            <tr>
              <th>
                <button
                  className="expansion-sort-button"
                  onClick={() => handleSort("companyName")}
                >
                  Customer
                  <span>{sortIcon("companyName")}</span>
                </button>
              </th>

              <th>
                <button
                  className="expansion-sort-button"
                  onClick={() => handleSort("arr")}
                >
                  ARR
                  <span>{sortIcon("arr")}</span>
                </button>
              </th>

              <th>Plan</th>

              <th>
                <button
                  className="expansion-sort-button"
                  onClick={() =>
                    handleSort("licenseUtilization")
                  }
                >
                  License Util.
                  <span>
                    {sortIcon("licenseUtilization")}
                  </span>
                </button>
              </th>

              <th>
                <button
                  className="expansion-sort-button"
                  onClick={() =>
                    handleSort("featureAdoption")
                  }
                >
                  Feature Adoption
                  <span>
                    {sortIcon("featureAdoption")}
                  </span>
                </button>
              </th>

              <th>
                <button
                  className="expansion-sort-button"
                  onClick={() =>
                    handleSort("opportunityScore")
                  }
                >
                  Opportunity Score
                  <span>
                    {sortIcon("opportunityScore")}
                  </span>
                </button>
              </th>

              <th>Opportunity Level</th>
              <th>Recommended Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredAccounts.map((account) => (
              <tr key={account.companyName}>
                <td className="expansion-customer-name">
                  {account.companyName}
                </td>

                <td>{formatCurrency(account.arr)}</td>

                <td>
                  <span className="plan-badge">
                    {account.plan}
                  </span>
                </td>

                <td>
                  {account.licenseUtilization.toFixed(1)}%
                </td>

                <td>
                  {account.featureAdoption.toFixed(1)}%
                </td>

                <td>
                  <strong>
                    {account.opportunityScore}
                  </strong>

                  <span className="expansion-score-max">
                    {" "}
                    / 100
                  </span>
                </td>

                <td>
                  <span
                    className={`opportunity-badge ${account.opportunityLevel
                      .toLowerCase()
                      .replace(" ", "-")}`}
                  >
                    {account.opportunityLevel}
                  </span>
                </td>

                <td>
                  {account.recommendedAction}
                </td>
              </tr>
            ))}

            {filteredAccounts.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="expansion-no-results"
                >
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

export default ExpansionPriorityTable;