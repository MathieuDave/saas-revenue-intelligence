import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

import type { TeamMemberLoad } from "./types";
import {
  addDays,
  dueOptions,
  formatDate,
  formatMoney,
  ifNothingHappens,
  playbook,
  renewalLabel,
  shortDay,
  shortQuarter,
  whyOnDesk,
} from "./briefText";
import {
  coverage,
  firstName,
  HEAVY_LOAD,
  liveTeamLoad,
  type Action,
  type Decision,
  type DeskItem,
} from "./deskItems";
import { deleteDecision, saveDecision } from "./decisionsApi";
import AnalystPanel, { cleanItem, type AccountReport } from "./AnalystPanel";
import "./DecisionDesk.css";

// =========================================================
// LA PILE DE DÉCISIONS DU VP
// Une carte à la fois. Les décisions sont enregistrées
// dans Databricks (table vp_decisions), sauf en mode Replay.
// =========================================================

type OnDecide = (action: Action, person: string | null, due: string | null) => void;

function itemName(item: DeskItem): string {
  if (item.kind === "risk") return item.situation.companyName;
  if (item.kind === "tradeoff") return "The team split";
  if (item.kind === "q4") return `The ${shortQuarter(item.quarter)} renewals`;
  return "The growth accounts";
}

function summarize(decision: Decision, item: DeskItem): string {
  const name = itemName(item);
  const by = decision.due ? `, due ${shortDay(decision.due)}` : "";

  switch (decision.action) {
    case "delegate":
      return `${name} is with ${firstName(decision.person ?? "")}${by}.`;
    case "take":
      return `You took ${name.charAt(0).toLowerCase() + name.slice(1)}${by}.`;
    case "rebalance":
      return item.kind === "tradeoff"
        ? `Moved ${item.move} of ${firstName(item.from.name)}’s accounts to ${firstName(item.to.name)}.`
        : "";
    case "keep":
      return "Kept the team split as it is.";
    case "route":
      return `${name} went to their account owners${by}.`;
    case "send":
      return item.kind === "grow"
        ? `${name} went to ${firstName(item.owner)}.`
        : "";
    default:
      return `${name} moved to tomorrow.`;
  }
}

export default function DecisionDesk({
  month,
  replay,
  items,
  teamLoad,
  asOf,
  decisions,
  setDecisions,
}: {
  month: string;
  // Mode Replay : rien n'est enregistré, et pas d'enquête (l'agent connaîtrait le futur)
  replay: boolean;
  items: DeskItem[];
  teamLoad: TeamMemberLoad[];
  asOf: string;
  // L'état vit dans la page : d'autres sections ont besoin des décisions
  decisions: Decision[];
  setDecisions: Dispatch<SetStateAction<Decision[]>>;
}) {
  // Tout le reste se calcule à partir de la liste des décisions
  const decidedIds = new Set(decisions.map((d) => d.id));
  const pending = items.filter((i) => !decidedIds.has(i.id));
  const current = pending[0];
  const total = items.length;

  const team = liveTeamLoad(teamLoad, items, decisions);
  const { atRisk, covered, upside } = coverage(items, decisions);
  const coveredPct = atRisk > 0 ? (100 * covered) / atRisk : 0;

  const last = decisions.at(-1);
  const lastItem = last ? items.find((i) => i.id === last.id) : undefined;

  const [syncError, setSyncError] = useState<string | null>(null);

  // Interface « optimiste » : l'écran change tout de suite,
  // puis on enregistre dans Databricks en arrière-plan.
  const decide: OnDecide = (action, person, due) => {
    if (!current) return;
    const decision: Decision = { decisionId: null, id: current.id, action, person, due };

    setSyncError(null);

    // En Replay, la décision reste dans le navigateur (simulation)
    if (replay) {
      setDecisions((previous) => [
        ...previous,
        { ...decision, decisionId: `replay-${previous.length}` },
      ]);
      return;
    }

    setDecisions((previous) => [...previous, decision]);

    saveDecision(month, current, decision)
      .then((decisionId) =>
        // On retrouve la décision (même objet) et on lui donne son identifiant
        setDecisions((previous) =>
          previous.map((d) => (d === decision ? { ...d, decisionId } : d))
        )
      )
      .catch(() => {
        // Échec : on retire la décision de l'écran et on le dit
        setDecisions((previous) => previous.filter((d) => d !== decision));
        setSyncError("That decision could not be saved. Check the backend and try again.");
      });
  };

  function undo() {
    const lastDecision = decisions.at(-1);
    if (!lastDecision?.decisionId) return; // pas encore enregistrée
    const decisionId = lastDecision.decisionId;

    setSyncError(null);
    setDecisions((previous) => previous.slice(0, -1));

    if (replay) return; // rien à effacer côté serveur

    deleteDecision(decisionId).catch(() => {
      // Échec : on remet la décision et on le dit
      setDecisions((previous) => [...previous, lastDecision]);
      setSyncError("Undo could not be saved. Check the backend and try again.");
    });
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

      <div className="gauge">
        <p className="gauge__text">
          <span>
            <strong>{formatMoney(covered)}</strong> of {formatMoney(atRisk)} at
            risk now has an owner and a deadline
          </span>
          {upside > 0 && <span>{formatMoney(upside)} of growth handed off</span>}
        </p>
        <div className="gauge__rail" aria-hidden="true">
          <div className="gauge__fill" style={{ width: `${coveredPct}%` }} />
        </div>
      </div>

      {current ? (
        <div className="desk__stack">
          {pending.length > 1 && (
            <div className="desk__edge desk__edge--1" aria-hidden="true" />
          )}
          {pending.length > 2 && (
            <div className="desk__edge desk__edge--2" aria-hidden="true" />
          )}
          {/* key : React recrée la carte à chaque élément → l'animation rejoue
              et l'état de la carte (échéance, sélecteur) repart à zéro */}
          <DeskCard
            key={current.id}
            item={current}
            team={team}
            asOf={asOf}
            canInvestigate={!replay}
            onDecide={decide}
          />
        </div>
      ) : (
        <div className="desk__clear">
          <h3 className="desk__clear-title">Your desk is clear.</h3>
          <p className="desk__clear-text">
            {formatMoney(covered)} of the {formatMoney(atRisk)} at risk now has
            an owner and a deadline. Your agents will follow up and tell you
            what changed.
          </p>
        </div>
      )}

      <div className="desk__after" aria-live="polite">
        <span>
          {last && lastItem
            ? summarize(last, lastItem)
            : "Each decision gets an owner and a deadline, and updates your team."}
        </span>
        {last && last.decisionId === null && <span>Saving…</span>}
        {last && last.decisionId !== null && (
          <button type="button" className="desk__undo" onClick={undo}>
            Undo
          </button>
        )}
      </div>

      {syncError && (
        <p className="desk__error" role="alert">
          {syncError}
        </p>
      )}
    </section>
  );
}

// =========================================================
// CHOISIR LA BONNE CARTE SELON LE TYPE D'ÉLÉMENT
// =========================================================

function DeskCard({
  item,
  team,
  asOf,
  canInvestigate,
  onDecide,
}: {
  item: DeskItem;
  team: TeamMemberLoad[];
  asOf: string;
  canInvestigate: boolean;
  onDecide: OnDecide;
}) {
  switch (item.kind) {
    case "risk":
      return (
        <RiskCard
          item={item}
          team={team}
          asOf={asOf}
          canInvestigate={canInvestigate}
          onDecide={onDecide}
        />
      );
    case "tradeoff":
      return <TradeoffCard item={item} onDecide={onDecide} />;
    case "q4":
      return <RenewalsCard item={item} asOf={asOf} onDecide={onDecide} />;
    case "grow":
      return <GrowthCard item={item} onDecide={onDecide} />;
  }
}

// =========================================================
// LE GABARIT COMMUN À TOUTES LES CARTES
// =========================================================

function CardShell(props: {
  kind: string;
  calm?: boolean;
  title: string;
  meta: string;
  stake?: string;
  stakeSub?: string;
  renewal?: string;
  urgent?: boolean;
  why: string;
  ifNothing: string;
  evidence: string[];
  recWho: string;
  rec: string;
  children: ReactNode;
}) {
  return (
    <article className="dcard">
      <span className="dcard__kind">
        <span
          className={props.calm ? "dcard__dot dcard__dot--calm" : "dcard__dot"}
          aria-hidden="true"
        />
        {props.kind}
      </span>

      <div className="dcard__top">
        <div>
          <h3 className="dcard__name">{props.title}</h3>
          <p className="dcard__meta">{props.meta}</p>
        </div>
        {props.stake && (
          <div className="dcard__stake">
            <div className="dcard__num">{props.stake}</div>
            <div className="dcard__sub">{props.stakeSub}</div>
            {props.renewal && (
              <div
                className={
                  props.urgent ? "dcard__renew dcard__renew--urgent" : "dcard__renew"
                }
              >
                {props.renewal}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="dcard__why">{props.why}</p>
      <p className={props.calm ? "dcard__ifnot dcard__ifnot--calm" : "dcard__ifnot"}>
        {props.ifNothing}
      </p>

      <ul className="dcard__evidence">
        {props.evidence.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <div className="dcard__rec">
        <span className="dcard__rec-who">{props.recWho}</span>
        <span className="dcard__rec-text">{props.rec}</span>
      </div>

      {props.children}
    </article>
  );
}

// =========================================================
// 1. UN RISQUE DU JOUR
// =========================================================

function RiskCard({
  item,
  team,
  asOf,
  canInvestigate,
  onDecide,
}: {
  item: Extract<DeskItem, { kind: "risk" }>;
  team: TeamMemberLoad[];
  asOf: string;
  canInvestigate: boolean;
  onDecide: OnDecide;
}) {
  const s = item.situation;
  const dues = dueOptions(s, asOf);
  const [dueIndex, setDueIndex] = useState(0);
  const [picking, setPicking] = useState(false);
  const [investigating, setInvestigating] = useState(false);
  const [report, setReport] = useState<AccountReport | null>(null);

  const due = dues[dueIndex] ?? null;

  // Après l'enquête, c'est l'agent qui parle (et plus le playbook)
  const firstStep = report?.plan[0];
  const recWho = firstStep ? "Account Analyst suggests" : "Playbook suggests";
  const rec = firstStep ? cleanItem(firstStep) : playbook(s);

  const agentOwner = team.find((m) => m.name === report?.suggestedOwner)?.name;
  const suggestedOwner = agentOwner ?? s.suggestedOwner;
  const suggestedReason = s.suggestedReason?.toLowerCase();

  return (
    <CardShell
      kind="Retention risk"
      title={s.companyName}
      meta={`${s.industry}, ${s.companySize}`}
      stake={formatMoney(s.arrAtStake)}
      stakeSub="ARR at stake"
      renewal={renewalLabel(s)}
      urgent={s.daysToRenewal !== null && s.daysToRenewal <= 30}
      why={whyOnDesk(s)}
      ifNothing={ifNothingHappens(s)}
      evidence={s.evidence}
      recWho={recWho}
      rec={rec}
    >
      {investigating && (
        <AnalystPanel customerId={s.customerId} onReport={setReport} />
      )}

      {/* L'échéance : un responsable + une date = un plan */}
      <div className="dcard__due">
        <div className="dcard__label" id={`due-${s.customerId}`}>
          Deadline for whoever owns it
        </div>
        <div className="dcard__chips" role="group" aria-labelledby={`due-${s.customerId}`}>
          {dues.map((option, index) => (
            <button
              key={option.date}
              type="button"
              aria-pressed={index === dueIndex}
              className={index === dueIndex ? "dchip dchip--on" : "dchip"}
              onClick={() => setDueIndex(index)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {due?.afterRenewal && (
          <p className="dcard__warn">This deadline falls after the renewal date.</p>
        )}
      </div>

      {/* Le choix de la personne, avec sa charge au moment de choisir */}
      {picking && (
        <div className="dcard__picker">
          {team.map((member) => {
            const heavy = member.situations >= HEAVY_LOAD;
            const suggested = member.name === suggestedOwner;
            const classes = [
              "dperson",
              heavy ? "dperson--heavy" : "",
              suggested ? "dperson--suggested" : "",
            ].join(" ");

            return (
              <button
                key={member.name}
                type="button"
                className={classes}
                onClick={() => onDecide("delegate", member.name, due?.date ?? null)}
              >
                <span className="dperson__name">{member.name}</span>
                <span className="dperson__role">{member.role}</span>
                <span className="dperson__load">
                  {member.situations} situations
                  {heavy ? ", already heavy" : ""}
                  {suggested
                    ? agentOwner
                      ? ". Picked by the Account Analyst"
                      : `. Suggested: ${suggestedReason}`
                    : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="dcard__actions">
        {canInvestigate && (
          <button
            type="button"
            className="dbtn"
            aria-expanded={investigating}
            onClick={() => setInvestigating(!investigating)}
          >
            {investigating ? "Close investigation" : "Investigate"}
          </button>
        )}
        <button
          type="button"
          className="dbtn dbtn--primary"
          aria-expanded={picking}
          onClick={() => setPicking(!picking)}
        >
          {picking ? "Choose who owns it" : "Delegate"}
        </button>
        <button
          type="button"
          className="dbtn"
          onClick={() => onDecide("take", null, due?.date ?? null)}
        >
          I’ll take it
        </button>
        <button
          type="button"
          className="dbtn dbtn--quiet"
          onClick={() => onDecide("later", null, null)}
        >
          Not today
        </button>
      </div>
    </CardShell>
  );
}

// =========================================================
// 2. L'ARBITRAGE D'ÉQUIPE
// =========================================================

function TradeoffCard({
  item,
  onDecide,
}: {
  item: Extract<DeskItem, { kind: "tradeoff" }>;
  onDecide: OnDecide;
}) {
  const heavy = firstName(item.from.name);
  const light = firstName(item.to.name);
  const ratio = Math.round(item.from.situations / Math.max(1, item.to.situations));

  return (
    <CardShell
      kind="Trade-off"
      title={`${heavy} is carrying most of the team`}
      meta="Team workload this month"
      why={`${heavy} has ${item.from.situations} situations and ${light} has ${item.to.situations}. At this pace, some of ${heavy}’s accounts will wait weeks for a call.`}
      ifNothing={`If nothing changes: ${heavy} keeps ${item.from.situations} situations, about ${ratio} times ${light}’s load.`}
      evidence={[
        `${item.from.name}: ${item.from.situations} situations, ${formatMoney(item.from.arrAtStake)} at stake`,
        `${item.to.name}: ${item.to.situations} situations, ${formatMoney(item.to.arrAtStake)} at stake`,
      ]}
      recWho="Your agents recommend"
      rec={`Rebalance now. ${light} has room to take on more accounts.`}
    >
      <div className="dcard__options">
        <div className="doption doption--recommended">
          <div className="doption__title">
            Move {item.move} of {heavy}’s accounts to {light}
          </div>
          <p className="doption__impact">
            {heavy} goes to {item.from.situations - item.move}, {light} to{" "}
            {item.to.situations + item.move}.
          </p>
        </div>
        <div className="doption">
          <div className="doption__title">Keep the split as it is</div>
          <p className="doption__impact">
            No change for customers this month. {heavy} stays the bottleneck.
          </p>
        </div>
      </div>

      <div className="dcard__actions">
        <button type="button" className="dbtn dbtn--primary" onClick={() => onDecide("rebalance", null, null)}>
          Rebalance
        </button>
        <button type="button" className="dbtn" onClick={() => onDecide("keep", null, null)}>
          Keep as is
        </button>
        <button type="button" className="dbtn dbtn--quiet" onClick={() => onDecide("later", null, null)}>
          Not today
        </button>
      </div>
    </CardShell>
  );
}

// =========================================================
// 3. LES RENOUVELLEMENTS CLÉS DU TRIMESTRE SUIVANT
// =========================================================

function RenewalsCard({
  item,
  asOf,
  onDecide,
}: {
  item: Extract<DeskItem, { kind: "q4" }>;
  asOf: string;
  onDecide: OnDecide;
}) {
  const quarter = shortQuarter(item.quarter);
  const byDate = [...item.accounts].sort((a, b) => a.daysToRenewal - b.daysToRenewal);
  const first = byDate[0];
  const planDue = addDays(asOf, 14);
  const n = item.accounts.length;

  const evidence = byDate
    .slice(0, 3)
    .map((r) => `${r.companyName}, ${formatMoney(r.arr)}, renews ${formatDate(r.nextRenewal)}`);
  if (n > 3) evidence.push(`and ${n - 3} more, listed under Protect ${quarter}`);

  return (
    <CardShell
      kind="Next quarter"
      title={`${n} ${quarter} renewals have no plan yet`}
      meta={`Renewing ${formatDate(item.from)} to ${formatDate(item.to)}`}
      stake={formatMoney(item.arr)}
      stakeSub="ARR at stake"
      renewal={first ? `First one: ${first.companyName}, in ${first.daysToRenewal} days` : ""}
      why={`${n} accounts worth ${formatMoney(item.arr)} renew next quarter and showed a warning sign recently.`}
      ifNothing={
        first
          ? `If nothing happens: ${first.companyName} renews in ${first.daysToRenewal} days without a plan.`
          : "If nothing happens: these renewals arrive without a plan."
      }
      evidence={evidence}
      recWho="Trend Scout suggests"
      rec="Send each one to its account owner with a renewal plan due in two weeks."
    >
      <div className="dcard__actions">
        <button type="button" className="dbtn dbtn--primary" onClick={() => onDecide("route", null, planDue)}>
          Send to owners, plans due {shortDay(planDue)}
        </button>
        <button type="button" className="dbtn" onClick={() => onDecide("take", null, planDue)}>
          I’ll review them
        </button>
        <button type="button" className="dbtn dbtn--quiet" onClick={() => onDecide("later", null, null)}>
          Not today
        </button>
      </div>
    </CardShell>
  );
}

// =========================================================
// 4. LA CROISSANCE
// =========================================================

function GrowthCard({
  item,
  onDecide,
}: {
  item: Extract<DeskItem, { kind: "grow" }>;
  onDecide: OnDecide;
}) {
  const n = item.accounts.length;
  const owner = firstName(item.owner);

  return (
    <CardShell
      kind="Growth"
      calm
      title={`${n} ${n === 1 ? "account is" : "accounts are"} ready to grow`}
      meta={item.accounts.map((s) => s.companyName).join(", ")}
      stake={formatMoney(item.arr)}
      stakeSub="ARR, ready to expand"
      why={`${n === 1 ? "This account has" : "These accounts have"} outgrown their licenses with no warning sign.`}
      ifNothing="If nothing happens: no loss today. These accounts simply stay at their current price."
      evidence={["License use above 90% for two months in a row", "No risk signal this month"]}
      recWho="Your agents suggest"
      rec={`Send them to ${owner}. Upsell talks go best while the customer is still growing into the product.`}
    >
      <div className="dcard__actions">
        <button type="button" className="dbtn dbtn--primary" onClick={() => onDecide("send", item.owner, null)}>
          Send to {owner}
        </button>
        <button type="button" className="dbtn dbtn--quiet" onClick={() => onDecide("later", null, null)}>
          Not today
        </button>
      </div>
    </CardShell>
  );
}