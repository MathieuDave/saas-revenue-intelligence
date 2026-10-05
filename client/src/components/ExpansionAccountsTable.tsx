import { useEffect, useMemo, useState } from "react";

import "./ExpansionAccountsTable.css";

import type { ExpansionAccount } from "../pages/ExpansionPage";

type Props = {
  accounts: ExpansionAccount[];
};

type SortKey =
  | "companyName"
  | "arr"
  | "licenseUtilization"
  | "featureAdoption"
  | "opportunityScore";

type SortDirection = "asc" | "desc";

function formatCurrency(value: number) {
  return `$${value.toLocaleString("en-US")}`;
}

function ExpansionAccountsTable({ accounts }: Props) {
  const ITEMS_PER_PAGE = 25;

  const [currentPage, setCurrentPage] = useState(1);

  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("All");
  const [levelFilter, setLevelFilter] = useState("All");

  const [sortKey, setSortKey] =
    useState<SortKey>("opportunityScore");

  const [sortDirection, setSortDirection] =
    useState<SortDirection>("desc");

  // =========================================================
  // FILTER OPTIONS
  // =========================================================

  const plans = useMemo(
    () =>
      Array.from(
        new Set(accounts.map((account) => account.plan))
      ).sort(),
    [accounts]
  );

  const levels = useMemo(
    () =>
      Array.from(
        new Set(
          accounts.map(
            (account) => account.opportunityLevel
          )
        )
      ),
    [accounts]
  );

  // =========================================================
  // FILTER + SORT
  // =========================================================

  const filteredAccounts = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    const filtered = accounts.filter((account) => {
      const matchesSearch =
        normalizedSearch === "" ||
        account.companyName
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesPlan =
        planFilter === "All" ||
        account.plan === planFilter;

      const matchesLevel =
        levelFilter === "All" ||
        account.opportunityLevel === levelFilter;

      return (
        matchesSearch &&
        matchesPlan &&
        matchesLevel
      );
    });

    return [...filtered].sort((a, b) => {
      const first = a[sortKey];
      const second = b[sortKey];

      if (
        typeof first === "string" &&
        typeof second === "string"
      ) {
        const comparison =
          first.localeCompare(second);

        return sortDirection === "asc"
          ? comparison
          : -comparison;
      }

      const comparison =
        Number(first) - Number(second);

      return sortDirection === "asc"
        ? comparison
        : -comparison;
    });
  }, [
    accounts,
    search,
    planFilter,
    levelFilter,
    sortKey,
    sortDirection,
  ]);

  // =========================================================
  // PAGINATION
  // =========================================================

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredAccounts.length / ITEMS_PER_PAGE
    )
  );

  const startIndex =
    (currentPage - 1) * ITEMS_PER_PAGE;

  const paginatedAccounts =
    filteredAccounts.slice(
      startIndex,
      startIndex + ITEMS_PER_PAGE
    );

  const firstDisplayedAccount =
    filteredAccounts.length === 0
      ? 0
      : startIndex + 1;

  const lastDisplayedAccount = Math.min(
    startIndex + ITEMS_PER_PAGE,
    filteredAccounts.length
  );

  // Retour page 1 lorsqu'un filtre ou tri change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    search,
    planFilter,
    levelFilter,
    sortKey,
    sortDirection,
  ]);

  // Sécurité si le nombre de pages diminue
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // =========================================================
  // SORT
  // =========================================================

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) =>
        current === "asc" ? "desc" : "asc"
      );

      return;
    }

    setSortKey(key);

    setSortDirection(
      key === "companyName" ? "asc" : "desc"
    );
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) {
      return "";
    }

    return sortDirection === "asc"
      ? " ↑"
      : " ↓";
  }

  // =========================================================
  // FILTER RESET
  // =========================================================

  function resetFilters() {
    setSearch("");
    setPlanFilter("All");
    setLevelFilter("All");
    setSortKey("opportunityScore");
    setSortDirection("desc");
    setCurrentPage(1);
  }

  // =========================================================
  // BADGE CLASS
  // =========================================================

  function levelClass(level: string) {
    return level
      .toLowerCase()
      .replaceAll(" ", "-");
  }

  // =========================================================
  // UI
  // =========================================================

  return (
    <div className="expansion-accounts">
      <div className="expansion-table-filters">
        <div className="expansion-filter-group">
          <label htmlFor="expansion-search">
            Customer
          </label>

          <input
            id="expansion-search"
            type="text"
            placeholder="Search customer..."
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />
        </div>

        <div className="expansion-filter-group">
          <label htmlFor="expansion-plan">
            Plan
          </label>

          <select
            id="expansion-plan"
            value={planFilter}
            onChange={(event) =>
              setPlanFilter(event.target.value)
            }
          >
            <option value="All">
              All plans
            </option>

            {plans.map((plan) => (
              <option
                key={plan}
                value={plan}
              >
                {plan}
              </option>
            ))}
          </select>
        </div>

        <div className="expansion-filter-group">
          <label htmlFor="expansion-level">
            Opportunity Level
          </label>

          <select
            id="expansion-level"
            value={levelFilter}
            onChange={(event) =>
              setLevelFilter(event.target.value)
            }
          >
            <option value="All">
              All levels
            </option>

            {levels.map((level) => (
              <option
                key={level}
                value={level}
              >
                {level}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="expansion-reset-button"
          onClick={resetFilters}
        >
          Reset
        </button>
      </div>

      <div className="expansion-results-count">
        {filteredAccounts.length > 0 ? (
          <>
            Showing {firstDisplayedAccount}–
            {lastDisplayedAccount} of{" "}
            {filteredAccounts.length} accounts
          </>
        ) : (
          <>Showing 0 accounts</>
        )}
      </div>

      <div className="expansion-table-wrapper">
        <table className="expansion-accounts-table">
          <thead>
            <tr>
              <th>
                <button
                  type="button"
                  className="expansion-sort-button"
                  onClick={() =>
                    handleSort("companyName")
                  }
                >
                  Customer
                  {sortIndicator("companyName")}
                </button>
              </th>

              <th>
                <button
                  type="button"
                  className="expansion-sort-button"
                  onClick={() =>
                    handleSort("arr")
                  }
                >
                  ARR
                  {sortIndicator("arr")}
                </button>
              </th>

              <th>Plan</th>

              <th>
                <button
                  type="button"
                  className="expansion-sort-button"
                  onClick={() =>
                    handleSort(
                      "licenseUtilization"
                    )
                  }
                >
                  License Utilization
                  {sortIndicator(
                    "licenseUtilization"
                  )}
                </button>
              </th>

              <th>
                <button
                  type="button"
                  className="expansion-sort-button"
                  onClick={() =>
                    handleSort(
                      "featureAdoption"
                    )
                  }
                >
                  Feature Adoption
                  {sortIndicator(
                    "featureAdoption"
                  )}
                </button>
              </th>

              <th>
                <button
                  type="button"
                  className="expansion-sort-button"
                  onClick={() =>
                    handleSort(
                      "opportunityScore"
                    )
                  }
                >
                  Opportunity Score
                  {sortIndicator(
                    "opportunityScore"
                  )}
                </button>
              </th>

              <th>
                Opportunity Level
              </th>

              <th>
                Recommended Action
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredAccounts.length > 0 ? (
              paginatedAccounts.map(
                (account) => (
                  <tr key={account.companyName}>
                    <td className="expansion-customer-name">
                      {account.companyName}
                    </td>

                    <td>
                      {formatCurrency(
                        account.arr
                      )}
                    </td>

                    <td>
                      {account.plan}
                    </td>

                    <td>
                      {account.licenseUtilization.toFixed(
                        1
                      )}
                      %
                    </td>

                    <td>
                      {account.featureAdoption.toFixed(
                        1
                      )}
                      %
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
                        className={`opportunity-level-badge ${levelClass(
                          account.opportunityLevel
                        )}`}
                      >
                        {account.opportunityLevel}
                      </span>
                    </td>

                    <td>
                      {account.recommendedAction}
                    </td>
                  </tr>
                )
              )
            ) : (
              <tr>
                <td
                  colSpan={8}
                  className="expansion-no-results"
                >
                  No accounts match the
                  selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filteredAccounts.length > 0 && (
        <div className="expansion-pagination">
          <button
            type="button"
            onClick={() =>
              setCurrentPage((page) =>
                Math.max(1, page - 1)
              )
            }
            disabled={currentPage === 1}
          >
            Previous
          </button>

          <span>
            Page {currentPage} of {totalPages}
          </span>

          <button
            type="button"
            onClick={() =>
              setCurrentPage((page) =>
                Math.min(
                  totalPages,
                  page + 1
                )
              )
            }
            disabled={
              currentPage === totalPages
            }
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default ExpansionAccountsTable;