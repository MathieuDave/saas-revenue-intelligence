import { useState } from "react";

import type { BriefResponse } from "./types";
import { shortQuarter } from "./briefText";
import "./AgentsStrip.css";

// =========================================================
// LA BANDE DES AGENTS : ce qu'ils ont fait pendant la nuit, en une ligne.
// Une fois lue, le VP la ferme : elle reste fermée pour ce matin-là
// et revient seulement avec un nouveau brief (de nouvelles données).
// =========================================================

// Ce que la section « Did your decisions work? » a trouvé (remonté par la page)
export type FollowUpSummary = {
  sinceAsOf: string; // "2026-07-31"
  total: number;
  worse: number;
  better: number;
};

type AgentItem = { agent: string; label: string; detail: string };

// La mémoire « déjà vu » : une clé par matin
function storageKey(month: string): string {
  return `revenueai:agents-strip:${month}`;
}

function wasDismissed(month: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(month)) === "hidden";
  } catch {
    return false; // navigation privée : on l'affiche, tout simplement
  }
}

function remember(month: string, hidden: boolean): void {
  try {
    if (hidden) window.localStorage.setItem(storageKey(month), "hidden");
    else window.localStorage.removeItem(storageKey(month));
  } catch {
    // Rien de grave : la bande réapparaîtra au prochain chargement
  }
}

// "2026-07-31" → "July 31"
function longDay(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function AgentsStrip({
  brief,
  deskCount,
  followUps,
}: {
  brief: BriefResponse;
  deskCount: number;
  followUps: FollowUpSummary | null;
}) {
  const [hidden, setHidden] = useState(() => wasDismissed(brief.month));
  const [open, setOpen] = useState<number | null>(null);

  const month = new Date(`${brief.asOf}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  const next = brief.nextQuarterRenewals;

  // Chaque élément vient des données du brief
  const items: AgentItem[] = [
    {
      agent: "Signal Watcher",
      label: `found ${brief.counts.total} changes`,
      detail: `Read every account and found ${brief.counts.total} that changed in ${month}.`,
    },
    {
      agent: "Briefing Writer",
      label: `routed ${brief.counts.team} to your team`,
      detail: `Kept ${deskCount} decisions for you and wrote this brief. ${brief.counts.info} accounts that already churned or downgraded are kept for information.`,
    },
    {
      agent: "Trend Scout",
      label: `found ${next.accounts} ${shortQuarter(next.quarter)} renewals at risk`,
      detail: `Renewals of the next quarter with a recent warning sign: ${next.accounts} accounts.`,
    },
  ];
  if (followUps && followUps.total > 0) {
    items.push({
      agent: "Follow-up Tracker",
      label: `checked ${followUps.total} past ${followUps.total === 1 ? "decision" : "decisions"}`,
      detail: `Your ${longDay(followUps.sinceAsOf)} decisions: ${followUps.worse} worse, ${followUps.better} better. See below.`,
    });
  }

  function hide() {
    remember(brief.month, true);
    setHidden(true);
    setOpen(null);
  }

  function show() {
    remember(brief.month, false);
    setHidden(false);
  }

  if (hidden) {
    return (
      <button type="button" className="agents-min" onClick={show}>
        Your agents worked overnight · show
      </button>
    );
  }

  return (
    <div className="agents" role="group" aria-label="What your agents did overnight">
      <span className="agents__lead">
        <span className="agents__pulse" aria-hidden="true" />
        Overnight, your agents
      </span>

      {items.map((item, index) => (
        <button
          key={item.agent}
          type="button"
          className="agents__item"
          aria-describedby={open === index ? `agents-tip-${index}` : undefined}
          onMouseEnter={() => setOpen(index)}
          onMouseLeave={() => setOpen(null)}
          onFocus={() => setOpen(index)}
          onBlur={() => setOpen(null)}
        >
          {item.label}
          {open === index && (
            <span className="agents__tip" role="tooltip" id={`agents-tip-${index}`}>
              <strong>{item.agent}</strong>
              {item.detail}
            </span>
          )}
        </button>
      ))}

      <button
        type="button"
        className="agents__close"
        onClick={hide}
        aria-label="Hide until the next brief"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12" />
          <path d="M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}
