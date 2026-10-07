import { useState } from "react";

import type { Situation } from "./types";
import {
  formatMoney,
  ifNothingHappens,
  playbook,
  renewalLabel,
  whyOnDesk,
} from "./briefText";
import "./DecisionDesk.css";

// =========================================================
// LA PILE DE DÉCISIONS DU VP
// Une carte à la fois. Pour l'instant, les décisions vivent
// dans le navigateur ; l'étape 7 les enverra à Databricks.
// =========================================================

type Action = "take" | "later";

type Decision = {
  customerId: string;
  action: Action;
};

function summarize(decision: Decision, situation: Situation): string {
  if (decision.action === "take") return `You took ${situation.companyName}.`;
  return `${situation.companyName} moved to tomorrow.`;
}

export default function DecisionDesk({
  situations,
}: {
  situations: Situation[];
}) {
  const [decisions, setDecisions] = useState<Decision[]>([]);

  // Tout le reste se calcule à partir de la liste des décisions
  const decidedIds = new Set(decisions.map((d) => d.customerId));
  const pending = situations.filter((s) => !decidedIds.has(s.customerId));
  const current = pending[0];
  const total = situations.length;

  const last = decisions.at(-1);
  const lastSituation = last
    ? situations.find((s) => s.customerId === last.customerId)
    : undefined;

  function decide(action: Action) {
    if (!current) return;
    setDecisions((previous) => [
      ...previous,
      { customerId: current.customerId, action },
    ]);
  }

  function undo() {
    setDecisions((previous) => previous.slice(0, -1));
  }

  // Un matin calme est aussi une bonne nouvelle
  if (total === 0) {
    return (
      <section className="desk">
        <h2 className="desk__title">Nothing needs you today.</h2>
        <p className="desk__calm">
          Your agents routed every situation to your team.
        </p>
      </section>
    );
  }

  const taken = decisions.filter((d) => d.action === "take").length;
  const later = decisions.filter((d) => d.action === "later").length;

  return (
    <section className="desk" aria-labelledby="desk-title">
      <div className="desk__head">
        <h2 id="desk-title" className="desk__title">
          Your decisions today
        </h2>
        <span className="desk__progress">
          {current
            ? `Decision ${total - pending.length + 1} of ${total}`
            : `All ${total} decided`}
        </span>
      </div>

      {current ? (
        <div className="desk__stack">
          {pending.length > 1 && (
            <div className="desk__edge desk__edge--1" aria-hidden="true" />
          )}
          {pending.length > 2 && (
            <div className="desk__edge desk__edge--2" aria-hidden="true" />
          )}
          {/* key : React recrée la carte à chaque client → l'animation rejoue */}
          <DecisionCard
            key={current.customerId}
            situation={current}
            onDecide={decide}
          />
        </div>
      ) : (
        <div className="desk__clear">
          <h3 className="desk__clear-title">Your desk is clear.</h3>
          <p className="desk__clear-text">
            You kept {taken} for yourself and moved {later} to tomorrow. Your
            agents will follow up and tell you what changed.
          </p>
        </div>
      )}

      <div className="desk__after" aria-live="polite">
        <span>
          {last && lastSituation
            ? summarize(last, lastSituation)
            : "Each decision updates your desk and your team."}
        </span>
        {last && (
          <button type="button" className="desk__undo" onClick={undo}>
            Undo
          </button>
        )}
      </div>
    </section>
  );
}

// =========================================================
// UNE CARTE DE DÉCISION
// =========================================================

function DecisionCard({
  situation: s,
  onDecide,
}: {
  situation: Situation;
  onDecide: (action: Action) => void;
}) {
  const urgent = s.daysToRenewal !== null && s.daysToRenewal <= 30;

  return (
    <article className="dcard">
      <span className="dcard__kind">
        <span className="dcard__dot" aria-hidden="true" />
        Retention risk
      </span>

      <div className="dcard__top">
        <div>
          <h3 className="dcard__name">{s.companyName}</h3>
          <p className="dcard__meta">
            {s.industry}, {s.companySize}
          </p>
        </div>
        <div className="dcard__stake">
          <div className="dcard__num">{formatMoney(s.arrAtStake)}</div>
          <div className="dcard__sub">ARR at stake</div>
          <div
            className={
              urgent ? "dcard__renew dcard__renew--urgent" : "dcard__renew"
            }
          >
            {renewalLabel(s)}
          </div>
        </div>
      </div>

      <p className="dcard__why">{whyOnDesk(s)}</p>
      <p className="dcard__ifnot">{ifNothingHappens(s)}</p>

      <ul className="dcard__evidence">
        {s.evidence.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <div className="dcard__rec">
        <span className="dcard__rec-who">Playbook suggests</span>
        <span className="dcard__rec-text">{playbook(s)}</span>
      </div>

      <div className="dcard__actions">
        <button
          type="button"
          className="dbtn dbtn--primary"
          onClick={() => onDecide("take")}
        >
          I’ll take it
        </button>
        <button
          type="button"
          className="dbtn dbtn--quiet"
          onClick={() => onDecide("later")}
        >
          Not today
        </button>
      </div>
    </article>
  );
}