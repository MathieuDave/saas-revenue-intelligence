import { useEffect, useMemo, useState } from "react";

import type { RiskAccount } from "../pages/RiskPage";

import "./RiskAccountsTable.css";

type Props = {
  accounts: RiskAccount[];
};

type SortField =
  | "companyName"
  | "arr"
  | "riskScore"
  | "daysToRenewal";

type SortDirection = "asc" | "desc";
const ITEMS_PER_PAGE = 15;

function RiskAccountsTable({ accounts }: Props) {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("All");
  const [driverFilter, setDriverFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  
  const [sortField, setSortField] =
    useState<SortField>("riskScore");

  const [sortDirection, setSortDirection] =
    useState<SortDirection>("desc");

  const drivers = useMemo(() => {
    return Array.from(
      new Set(
        accounts.map(
          (account) => account.primaryRiskDriver
        )
      )
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

      const matchesDriver =
        driverFilter === "All" ||
        account.primaryRiskDriver === driverFilter;

      return (
        matchesSearch &&
        matchesRisk &&
        matchesDriver
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
    riskFilter,
    driverFilter,
    sortField,
    sortDirection,
  ]);

  const totalPages = Math.max(
  1,
  Math.ceil(filteredAccounts.length / ITEMS_PER_PAGE)
);

const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;

const paginatedAccounts = filteredAccounts.slice(
  startIndex,
  startIndex + ITEMS_PER_PAGE
);

useEffect(() => {
  setCurrentPage(1);
}, [search, riskFilter, driverFilter, sortField, sortDirection]);

useEffect(() => {
  if (currentPage > totalPages) {
    setCurrentPage(totalPages);
  }
}, [currentPage, totalPages]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((current) =>
        current === "asc" ? "desc" : "asc"
      );

      return;
    }

    setSortField(field);
    setSortDirection("desc");
  }

  function sortIcon(field: SortField) {
    if (sortField !== field) {
      return "↕";
    }

    return sortDirection === "asc" ? "↑" : "↓";
  }

  function resetFilters() {
    setSearch("");
    setRiskFilter("All");
    setDriverFilter("All");
    setSortField("riskScore");
    setSortDirection("desc");
  }

  return (
    <div className="risk-accounts">
      {/* FILTERS */}

      <div className="risk-table-filters">
        <div className="risk-filter-group">
          <label>Customer</label>

          <input
            type="text"
            value={search}
            placeholder="Search customer..."
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />
        </div>

        <div className="risk-filter-group">
          <label>Risk Level</label>

          <select
            value={riskFilter}
            onChange={(event) =>
              setRiskFilter(event.target.value)
            }
          >
            <option value="All">All levels</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Moderate">Moderate</option>
            <option value="Low">Low</option>
          </select>
        </div>

        <div className="risk-filter-group">
          <label>Primary Risk Driver</label>

          <select
            value={driverFilter}
            onChange={(event) =>
              setDriverFilter(event.target.value)
            }
          >
            <option value="All">All drivers</option>

            {drivers.map((driver) => (
              <option
                key={driver}
                value={driver}
              >
                {driver}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="risk-reset-button"
          onClick={resetFilters}
        >
          Reset
        </button>
      </div>

      {/* RESULTS COUNT */}

      <div className="risk-results-count">
  Showing{" "}
  {filteredAccounts.length === 0 ? 0 : startIndex + 1}
  –
  {Math.min(
    startIndex + ITEMS_PER_PAGE,
    filteredAccounts.length
  )}{" "}
  of {filteredAccounts.length} accounts
</div>

      {/* TABLE */}

      <div className="risk-table-wrapper">
        <table className="risk-accounts-table">
          <thead>
            <tr>
              <th>
                <button
                  className="risk-sort-button"
                  onClick={() =>
                    handleSort("companyName")
                  }
                >
                  Customer {sortIcon("companyName")}
                </button>
              </th>

              <th>
                <button
                  className="risk-sort-button"
                  onClick={() =>
                    handleSort("arr")
                  }
                >
                  ARR {sortIcon("arr")}
                </button>
              </th>

              <th>
                <button
                  className="risk-sort-button"
                  onClick={() =>
                    handleSort("riskScore")
                  }
                >
                  Risk Score {sortIcon("riskScore")}
                </button>
              </th>

              <th>Risk Level</th>

              <th>
                <button
                  className="risk-sort-button"
                  onClick={() =>
                    handleSort("daysToRenewal")
                  }
                >
                  Renewal {sortIcon("daysToRenewal")}
                </button>
              </th>

              <th>Primary Risk Driver</th>

              <th>Recommended Action</th>
            </tr>
          </thead>

          <tbody>
            {paginatedAccounts.map((account) => (
              <tr key={account.companyName}>
                <td className="risk-customer-name">
                  {account.companyName}
                </td>

                <td>
                  $
                  {account.arr.toLocaleString(
                    "en-US"
                  )}
                </td>

                <td>
                  <strong>
                    {account.riskScore}
                  </strong>

                  <span className="risk-score-max">
                    {" "}
                    / 100
                  </span>
                </td>

                <td>
                  <span
                    className={`risk-level-badge ${account.riskLevel.toLowerCase()}`}
                  >
                    {account.riskLevel}
                  </span>
                </td>

                <td>
                  {account.daysToRenewal} days
                </td>

                <td>
                  {account.primaryRiskDriver}
                </td>

                <td>
                  {account.recommendedAction}
                </td>
              </tr>
            ))}

            {filteredAccounts.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="risk-no-results"
                >
                  No accounts match the selected
                  filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="risk-pagination">
  <button
    onClick={() => setCurrentPage((page) => page - 1)}
    disabled={currentPage === 1}
  >
    Previous
  </button>

  <span>
    Page {currentPage} of {totalPages}
  </span>

  <button
    onClick={() => setCurrentPage((page) => page + 1)}
    disabled={currentPage === totalPages}
  >
    Next
  </button>
</div>
    </div>
  );
}

export default RiskAccountsTable;