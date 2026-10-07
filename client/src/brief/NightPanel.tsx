import type { BriefResponse } from "./types";
import { shortQuarter } from "./briefText";
import { firstName } from "./deskItems";
import "./NightPanel.css";

// =========================================================
// LE PANNEAU DES AGENTS : « leur nuit »
// Le seul endroit sombre de la page. Chaque phrase vient
// des données du brief.
// =========================================================

export default function NightPanel({
  brief,
  deskCount,
  decided,
}: {
  brief: BriefResponse;
  deskCount: number;
  decided: number;
}) {
  const month = new Date(`${brief.asOf}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  const next = brief.nextQuarterRenewals;

  const agents = [
    {
      name: "Signal Watcher",
      did: `Read every account and found ${brief.counts.total} that changed in ${month}.`,
    },
    {
      name: "Trend Scout",
      did: `Found ${next.accounts} ${shortQuarter(next.quarter)} renewals with a recent warning sign.`,
    },
    {
      name: "Briefing Writer",
      did: `Wrote this brief and put ${deskCount} decisions on your desk.`,
    },
    {
      name: "Account Analyst",
      did: "Ready to investigate any account on your desk.",
    },
    {
      name: "Follow-up Tracker",
      did:
        decided > 0
          ? `Will check in on your ${decided} ${decided === 1 ? "decision" : "decisions"} tomorrow morning.`
          : "Nothing to follow up yet.",
    },
  ];

  const routed = [...brief.teamLoad]
    .sort((a, b) => b.situations - a.situations)
    .map((m) => `${firstName(m.name)} ${m.situations}`)
    .join(", ");

  return (
    <aside className="night" aria-labelledby="night-title">
      <h2 id="night-title" className="night__title">While you were away</h2>
      <p className="night__sub">
        Your agents read every account overnight and kept only what needs you.
      </p>

      <ul className="night__agents">
        {agents.map((agent) => (
          <li key={agent.name} className="night__agent">
            <span className="night__dot" aria-hidden="true" />
            <div>
              <div className="night__name">{agent.name}</div>
              <div className="night__did">{agent.did}</div>
            </div>
          </li>
        ))}
      </ul>

      <p className="night__log">
        <strong>Routed without you:</strong> {brief.counts.team} smaller
        situations went to your team ({routed}). {brief.counts.info} accounts
        that already churned or downgraded are kept for information.
      </p>
    </aside>
  );
}