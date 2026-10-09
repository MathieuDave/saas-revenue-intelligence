import { useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { AnimatePresence, motion } from "motion/react";
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
import { AlreadyDecidedError, deleteDecision, saveDecision } from "./decisionsApi";
import AnalystPanel, { cleanItem, type AccountReport } from "./AnalystPanel";
import EvidenceDrawer from "./EvidenceDrawer";
import "./DecisionDesk.css";
import { EASE } from "./motionKit";

// =========================================================
// LA PILE DE DÉCISIONS DU VP
// Une carte à la fois. Les décisions sont enregistrées
// dans Databricks (table vp_decisions).
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
      // « the team split » en minuscule, mais un nom de compte garde sa majuscule
      return `You took ${
        item.kind === "risk" ? name : name.charAt(0).toLowerCase() + name.slice(1)
      }${by}.`;
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
  items,
  teamLoad,
  asOf,
  decisions,
  setDecisions,
  trust,
}: {
  month: string;
  items: DeskItem[];
  teamLoad: TeamMemberLoad[];
  asOf: string;
  // L'état vit dans la page : d'autres sections ont besoin des décisions
  decisions: Decision[];
  setDecisions: Dispatch<SetStateAction<Decision[]>>;
  // Une ligne de confiance affichée sous le titre (facultative)
  trust?: ReactNode;
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

  // Les cartes en cours d'enregistrement. Un ref (et non un state) : il est lu
  // tout de suite, même par la carte qui s'efface encore pendant son animation.
  const savingIds = useRef(new Set<string>());

  // Interface « optimiste » : l'écran change tout de suite,
  // puis on enregistre dans Databricks en arrière-plan.
  const decide: OnDecide = (action, person, due) => {
    if (!current) return;
    // Garde-fou : un 2e clic sur la même carte (double-clic, carte qui s'efface) est ignoré
    if (decidedIds.has(current.id) || savingIds.current.has(current.id)) return;
    savingIds.current.add(current.id);
    const itemId = current.id;
    const decision: Decision = { decisionId: null, id: current.id, action, person, due };

    setSyncError(null);
    setDecisions((previous) => [...previous, decision]);

    saveDecision(month, current, decision)
      .then((decisionId) =>
        // On retrouve la décision (même objet) et on lui donne son identifiant
        setDecisions((previous) =>
          previous.map((d) => (d === decision ? { ...d, decisionId } : d))
        )
      )
      .catch((error: unknown) => {
        // Échec : on retire la décision de l'écran et on le dit
        setDecisions((previous) => previous.filter((d) => d !== decision));
        setSyncError(
          error instanceof AlreadyDecidedError
            ? "This card was already decided, maybe in another tab. Refresh the page to see it."
            : "That decision could not be saved. Check the backend and try again."
        );
      })
      .finally(() => savingIds.current.delete(itemId));
  };

  function undo() {
    const lastDecision = decisions.at(-1);
    if (!lastDecision?.decisionId) return; // pas encore enregistrée
    const decisionId = lastDecision.decisionId;

    setSyncError(null);
    setDecisions((previous) => previous.slice(0, -1));

    deleteDecision(decisionId).catch(() => {
      // Échec : on remet la décision et on le dit
      setDecisions((previous) => [...previous, lastDecision]);
      setSyncError("Undo could not be saved. Check the backend and try again.");
    });
  }

  // Un matin calme est aussi une bonne nouvelle
  if (total === 0) {
    return (
      <section className="desk desk--calm">
        {/* Un soleil qui se lève : le matin calme est une bonne nouvelle */}
        <motion.div
          className="calm__sun"
          aria-hidden="true"
          initial={{ opacity: 0, y: 24, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, ease: EASE }}
        />
        <h2 className="desk__title">Nothing needs you this morning.</h2>
        <p className="calm__text">
          Your agents read every account and routed each situation to your team. No decision is
          waiting for you.
        </p>
        {trust}
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

      {trust}

      <div className="gauge">
        <p className="gauge__text">
          {/* « on your desk » : ce montant n'est ni le risque du trimestre ni celui du T4 entier */}
          {covered === 0 ? (
            <span>
              <strong>{formatMoney(atRisk)}</strong> at risk on your desk, none of it has an
              owner yet
            </span>
          ) : (
            <span>
              <strong>{formatMoney(covered)}</strong> of the {formatMoney(atRisk)} at risk on
              your desk now has an owner and a deadline
            </span>
          )}
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
                   {/* AnimatePresence : la carte décidée glisse vers le haut et s'efface,
              PUIS la suivante arrive (mode="wait"). La key change à chaque
              élément : l'état de la carte (échéance, sélecteur) repart à zéro. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={current.id}
              className="desk__current"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -28 }}
              transition={{ duration: 0.28, ease: EASE }}
            >
              <DeskCard item={current} team={team} asOf={asOf} onDecide={decide} />
            </motion.div>
          </AnimatePresence>
        </div>
      ) : (
        // Toutes les cartes sont décidées : le bilan du matin
        <MorningRecap
          asOf={asOf}
          decisions={decisions}
          covered={covered}
          atRisk={atRisk}
          upside={upside}
        />
      )}

      <div className="desk__after" aria-live="polite">
        <span>
          {last && lastItem ? summarize(last, lastItem) : ""}
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
// LE BILAN DU MATIN : ce que le VP a fait, en quatre chiffres
// Tout vient de la liste des décisions (rien n'est inventé).
// =========================================================

// "2026-08-31" → "September 30" : le dernier jour du mois suivant
function nextBriefLabel(asOf: string): string {
  const [year, month] = asOf.split("-").map(Number);
  return new Date(Date.UTC(year ?? 2026, (month ?? 1) + 1, 0)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function MorningRecap({
  asOf,
  decisions,
  covered,
  atRisk,
  upside,
}: {
  asOf: string;
  decisions: Decision[];
  covered: number;
  atRisk: number;
  upside: number;
}) {
  // On compte chaque type de décision
  const count = (...actions: Action[]) =>
    decisions.filter((d) => actions.includes(d.action)).length;
  const toTeam = count("delegate", "route", "send");
  const mine = count("take");
  const later = count("later");

  // Les tuiles du bilan : on n'affiche que celles qui ont quelque chose à dire
  const stats: { value: string; label: string }[] = [];
  if (atRisk > 0) {
    stats.push({ value: formatMoney(covered), label: `of ${formatMoney(atRisk)} at risk now has an owner` });
  }
  if (toTeam > 0) stats.push({ value: String(toTeam), label: toTeam === 1 ? "decision handed to your team" : "decisions handed to your team" });
  if (mine > 0) stats.push({ value: String(mine), label: mine === 1 ? "account you kept for yourself" : "accounts you kept for yourself" });
  if (upside > 0) stats.push({ value: formatMoney(upside), label: "of growth sent to an account executive" });
  if (later > 0) stats.push({ value: String(later), label: later === 1 ? "card back on your desk tomorrow" : "cards back on your desk tomorrow" });

  return (
    <motion.div
      className="recap"
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <h3 className="recap__title">Your morning is done.</h3>
      <p className="recap__text">
        {plural(decisions.length, "decision", "decisions")}, every card has an answer. Your agents
        will check on them in the {nextBriefLabel(asOf)} brief.
      </p>

      <ul className="recap__stats">
        {stats.map((stat, index) => (
          <motion.li
            key={stat.label}
            className="recap__stat"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.15 + index * 0.08, ease: EASE }}
          >
            <span className="recap__value">{stat.value}</span>
            <span className="recap__label">{stat.label}</span>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}

// =========================================================
// CHOISIR LA BONNE CARTE SELON LE TYPE D'ÉLÉMENT
// =========================================================

function DeskCard({
  item,
  team,
  asOf,
  onDecide,
}: {
  item: DeskItem;
  team: TeamMemberLoad[];
  asOf: string;
  onDecide: OnDecide;
}) {
  switch (item.kind) {
    case "risk":
      return (
        <RiskCard
          item={item}
          team={team}
          asOf={asOf}
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
  evidenceAction?: ReactNode; // ex. le bouton « See the data »
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
      {props.evidenceAction}

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
  onDecide,
}: {
  item: Extract<DeskItem, { kind: "risk" }>;
  team: TeamMemberLoad[];
  asOf: string;
  onDecide: OnDecide;
}) {
  const s = item.situation;
  const dues = dueOptions(s, asOf);
  const [dueIndex, setDueIndex] = useState(0);
  const [picking, setPicking] = useState(false);
  const [investigating, setInvestigating] = useState(false);
  const [report, setReport] = useState<AccountReport | null>(null);
  const [showData, setShowData] = useState(false);
  const seeRef = useRef<HTMLButtonElement>(null);

  // En fermant le tiroir, le focus revient sur le bouton qui l'a ouvert
  const closeData = () => {
    setShowData(false);
    seeRef.current?.focus();
  };

  const due = dues[dueIndex] ?? null;

  // Après l'enquête, c'est l'agent qui parle (et plus le playbook)
  const firstStep = report?.plan[0];
  const recWho = firstStep ? "Account Analyst suggests" : "Playbook suggests";
  const rec = firstStep ? cleanItem(firstStep) : playbook(s);

  // Un compte revenu du suivi : on rappelle la décision du mois dernier et ce qui a changé
  const back = item.returned;
  const lastTime = back
    ? back.previousAction === "delegate" && back.previousPerson
      ? `you gave it to ${firstName(back.previousPerson)}`
      : back.previousAction === "take"
        ? "you took it yourself"
        : "you postponed it"
    : "";

  const agentOwner = team.find((m) => m.name === report?.suggestedOwner)?.name;
  const suggestedOwner = agentOwner ?? s.suggestedOwner;
  const suggestedReason = s.suggestedReason?.toLowerCase();

  return (
    <CardShell
      kind={back ? "Back on your desk" : "Retention risk"}
      title={s.companyName}
      meta={
        s.industry
          ? `${s.industry}, ${s.companySize}`
          : `You put it back on your desk this morning`
      }
      stake={formatMoney(s.arrAtStake)}
      stakeSub="ARR at stake"
      renewal={renewalLabel(s)}
      urgent={s.daysToRenewal !== null && s.daysToRenewal <= 30}
      why={back ? `Last month ${lastTime}. Since then: ${back.reading}` : whyOnDesk(s)}
      ifNothing={
        back
          ? "If nothing happens: the account keeps sliding with no new plan."
          : ifNothingHappens(s)
      }
      evidence={s.evidence}
      evidenceAction={
        <button
          ref={seeRef}
          type="button"
          className="dcard__see"
          aria-haspopup="dialog"
          onClick={() => setShowData(true)}
        >
          See the data
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </button>
      }
      recWho={recWho}
      rec={rec}
    >
      {/* Le tiroir « See the data » : AnimatePresence joue sa sortie avant de le retirer */}
      <AnimatePresence>
        {showData && (
          <EvidenceDrawer
            key="evidence"
            customerId={s.customerId}
            companyName={s.companyName}
            asOf={asOf}
            onClose={closeData}
          />
        )}
      </AnimatePresence>

      {investigating && (
        <AnalystPanel customerId={s.customerId} asOf={asOf} onReport={setReport} />
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
        <button
          type="button"
          className="dbtn"
          aria-expanded={investigating}
          onClick={() => setInvestigating(!investigating)}
        >
          {investigating ? "Close investigation" : "Investigate"}
        </button>
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