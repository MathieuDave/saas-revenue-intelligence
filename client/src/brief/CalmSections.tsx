import type { BriefResponse, TeamMemberLoad } from "./types";
import { formatDate, formatMoney, shortQuarter } from "./briefText";
import { firstName, HEAVY_LOAD } from "./deskItems";
import "./CalmSections.css";

// =========================================================
// LES SECTIONS CALMES, SOUS LA PILE DE DÉCISIONS
// Pas d'action urgente ici : le VP lit, il ne tranche pas.
// =========================================================

export default function CalmSections({
  brief,
  team,
  growthSent,
}: {
  brief: BriefResponse;
  team: TeamMemberLoad[];
  growthSent: boolean;
}) {
  const next = brief.nextQuarterRenewals;
  const quarter = shortQuarter(next.quarter);
  const keyByDate = [...next.keyAccounts].sort(
    (a, b) => a.daysToRenewal - b.daysToRenewal
  );

  const growthArr = brief.readyToGrow.reduce((sum, s) => sum + s.arrAtStake, 0);
  const executive = team.find((m) => m.role.includes("Account Executive"));

  // L'échelle des barres : la charge la plus haute, plus un peu d'air
  const maxLoad = Math.max(...team.map((m) => m.situations), 1) * 1.1;
  const teamTotal = team.reduce((sum, m) => sum + m.situations, 0);

  return (
    <div className="calm">
      {/* ---------- Le trimestre suivant ---------- */}
      {next.accounts > 0 && (
        <section className="calm__section" aria-labelledby="calm-q4">
          <div className="calm__head">
            <h2 id="calm-q4" className="calm__title">Protect {quarter}</h2>
            <span className="calm__count">
              {next.accounts} renewals, {formatMoney(next.arrAtRisk)}
            </span>
          </div>
          <p className="calm__sub">
            These accounts renew between {formatDate(next.from)} and{" "}
            {formatDate(next.to)} and showed at least one warning sign recently.
            {next.smallerAccounts.accounts > 0 &&
              ` The ${next.smallerAccounts.accounts} smaller accounts (${formatMoney(
                next.smallerAccounts.arr
              )}) stay with your team.`}
          </p>
          <div className="calm__scroll">
            <table className="calm__table">
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col" className="calm__num">ARR</th>
                  <th scope="col">Renews</th>
                  <th scope="col">Warning signs</th>
                </tr>
              </thead>
              <tbody>
                {keyByDate.map((r) => (
                  <tr key={r.customerId}>
                    <td className="calm__name">{r.companyName}</td>
                    <td className="calm__num">{formatMoney(r.arr)}</td>
                    <td className="calm__soft">
                      {formatDate(r.nextRenewal)}, in {r.daysToRenewal} days
                    </td>
                    <td className="calm__soft">{r.signalTypes.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------- La croissance ---------- */}
      {brief.readyToGrow.length > 0 && (
        <section className="calm__section" aria-labelledby="calm-grow">
          <div className="calm__head">
            <h2 id="calm-grow" className="calm__title">Ready to grow</h2>
            <span className="calm__count">
              {brief.readyToGrow.length} accounts, {formatMoney(growthArr)}
            </span>
          </div>
          <p className="calm__sub">
            Each of these accounts has used more than 90% of its licenses for two
            months in a row, with no warning sign.
          </p>
          <table className="calm__table">
            <tbody>
              {brief.readyToGrow.map((s) => (
                <tr key={s.customerId}>
                  <td className="calm__name">{s.companyName}</td>
                  <td className="calm__num">{formatMoney(s.arrAtStake)}</td>
                  <td className="calm__soft">
                    {growthSent && executive
                      ? `With ${firstName(executive.name)}`
                      : "Waiting for your call"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ---------- L'équipe ---------- */}
      <section className="calm__section" aria-labelledby="calm-team">
        <div className="calm__head">
          <h2 id="calm-team" className="calm__title">Your team</h2>
          <span className="calm__count">{teamTotal} situations</span>
        </div>
        <p className="calm__sub">
          Situations your agents routed to each person this month, updated with
          your decisions.
        </p>
        <div className="calm__team">
          {team.map((m) => {
            const heavy = m.situations >= HEAVY_LOAD;
            return (
              <div key={m.name}>
                <div className="calm__member">
                  <div>
                    <div className="calm__member-name">{m.name}</div>
                    <div className="calm__member-role">{m.role}</div>
                  </div>
                  <div className={heavy ? "calm__load calm__load--heavy" : "calm__load"}>
                    {m.situations}
                  </div>
                </div>
                <div className="calm__bar" aria-hidden="true">
                  <div
                    className={heavy ? "calm__fill calm__fill--heavy" : "calm__fill"}
                    style={{ width: `${(100 * m.situations) / maxLoad}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}