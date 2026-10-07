import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";

import EvidenceDrawer from "./EvidenceDrawer";
import "./FollowUps.css";

// =========================================================
// « DID YOUR DECISIONS WORK? »
// Les décisions du brief précédent, et ce que chaque compte a fait depuis.
// Le miroir de GET /api/followups?month= (server/src/routes/followups.ts)
// =========================================================

const API_URL = "http://localhost:3000/api";

type FollowUpStatus = "lost" | "shrank" | "worse" | "same" | "better";

type FollowUp = {
  customerId: string;
  companyName: string;
  action: string;
  person: string | null;
  due: string | null;
  status: FollowUpStatus;
  utilizationBefore: number | null;
  utilizationAfter: number | null;
  usersBefore: number | null;
  usersAfter: number | null;
  revenueBefore: number | null;
  revenueAfter: number | null;
  newSignals: string[];
  newTickets: number;
  reading: string;
};

type FollowUpsResponse = {
  month: string;
  sinceMonth: string;
  sinceAsOf: string;
  asOf: string;
  tally: Record<FollowUpStatus, number>;
  items: FollowUp[];
};

const STATUS_LABELS: Record<FollowUpStatus, string> = {
  lost: "Lost",
  shrank: "Shrank",
  worse: "Worse",
  same: "Same",
  better: "Better",
};

// Le décompte affiché : les trois statuts courants, plus Lost / Shrank s'il y en a
const TALLY_ORDER: FollowUpStatus[] = ["lost", "shrank", "worse", "same", "better"];

// "2026-08-02" → "Aug 2" ; "2026-07-31" → "July 31" ; "2026-08" → "August"
function shortDay(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
function longDay(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
function monthName(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
}

// Ce que le VP avait décidé, en mots simples
function decisionLine(f: FollowUp): { lead: string; who: string | null } {
  if (f.action === "delegate" && f.person) return { lead: "You gave it to", who: f.person };
  if (f.action === "take") return { lead: "You took it yourself", who: null };
  if (f.action === "later") return { lead: "You postponed it", who: null };
  return { lead: "You decided", who: null };
}

function change(before: number | null, after: number | null, unit = ""): string {
  if (before === null || after === null) return "no data";
  return `${before}${unit} → ${after}${unit}`;
}

export default function FollowUps({ month }: { month: string }) {
  const [data, setData] = useState<FollowUpsResponse | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<FollowUp | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(false);

    fetch(`${API_URL}/followups?month=${month}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API error ${response.status}`);
        return response.json() as Promise<FollowUpsResponse>;
      })
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error(err);
        setError(true);
      });

    return () => controller.abort();
  }, [month]);

  if (error) {
    return (
      <section className="followups">
        <p className="followups__error">Your past decisions could not load. Refresh to try again.</p>
      </section>
    );
  }

  // Rien à suivre (aucune décision le mois précédent) : la section ne s'affiche pas
  if (!data || data.items.length === 0) return null;

  const tally = TALLY_ORDER.filter(
    (s) => data.tally[s] > 0 || s === "worse" || s === "same" || s === "better"
  );

  function closeDrawer() {
    setOpen(null);
    openerRef.current?.focus();
  }

  return (
    <section className="followups" aria-labelledby="followups-title">
      <div className="followups__head">
        <h2 className="followups__title" id="followups-title">
          Did your decisions work?
        </h2>
        <span className="followups__since">Since your decisions on {longDay(data.sinceAsOf)}</span>
      </div>

      <div className="followups__tally">
        {tally.map((status) => (
          <span key={status} className="followups__count">
            <span className={`followups__dot followups__dot--${status}`} aria-hidden="true" />
            <strong>{data.tally[status]}</strong> {STATUS_LABELS[status].toLowerCase()}
          </span>
        ))}
      </div>

      <div className="followups__list">
        {data.items.map((f) => {
          const decided = decisionLine(f);
          const usageDown =
            f.utilizationBefore !== null &&
            f.utilizationAfter !== null &&
            f.utilizationAfter < f.utilizationBefore;
          const usersDown =
            f.usersBefore !== null && f.usersAfter !== null && f.usersAfter < f.usersBefore;

          return (
            <article key={f.customerId} className="fcard">
              <div className="fcard__top">
                <span className={`fcard__status fcard__status--${f.status}`}>
                  {STATUS_LABELS[f.status]}
                </span>
                <h3 className="fcard__name">{f.companyName}</h3>
              </div>

              <p className="fcard__decided">
                {decided.lead} {decided.who && <strong>{decided.who}</strong>}
                {f.due && ` · due ${shortDay(f.due)}`}
              </p>

              <div className="fcard__changes">
                <span className={usageDown ? "fchip fchip--down" : "fchip"}>
                  Usage <b>{change(f.utilizationBefore, f.utilizationAfter, "%")}</b>
                </span>
                <span className={usersDown ? "fchip fchip--down" : "fchip"}>
                  Active users <b>{change(f.usersBefore, f.usersAfter)}</b>
                </span>
                <span className={f.newSignals.length > 0 ? "fchip fchip--signal" : "fchip"}>
                  New signal <b>{f.newSignals.length > 0 ? f.newSignals.join(", ") : "none"}</b>
                </span>
                <span className="fchip">
                  Tickets in {monthName(data.month)} <b>{f.newTickets}</b>
                </span>
              </div>

              <div className="fcard__foot">
                <p className="fcard__reading">{f.reading}</p>
                <button
                  type="button"
                  className="fcard__see"
                  aria-haspopup="dialog"
                  onClick={(event) => {
                    openerRef.current = event.currentTarget;
                    setOpen(f);
                  }}
                >
                  See the data
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14" />
                    <path d="m13 6 6 6-6 6" />
                  </svg>
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <p className="followups__honest">
        <strong>Since, not because.</strong> This compares each account on {longDay(data.sinceAsOf)}{" "}
        and {longDay(data.asOf)}. It shows what the account did after your decision, not the effect
        of the decision itself.
      </p>

      {/* Le même tiroir que sur les cartes, à la date de CE brief */}
      <AnimatePresence>
        {open && (
          <EvidenceDrawer
            key={open.customerId}
            customerId={open.customerId}
            companyName={open.companyName}
            asOf={data.asOf}
            onClose={closeDrawer}
          />
        )}
      </AnimatePresence>
    </section>
  );
}