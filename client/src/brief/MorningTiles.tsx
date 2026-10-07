import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { BriefResponse, TeamMemberLoad } from "./types";
import { formatDate, formatMoney, shortQuarter } from "./briefText";
import { firstName, HEAVY_LOAD, type Decision, type DeskItem } from "./deskItems";
import type { FollowUpSummary } from "./AgentsStrip";
import EvidenceDrawer from "./EvidenceDrawer";
import { EASE } from "./motionKit";
import "./MorningTiles.css";

// =========================================================
// « THE REST OF YOUR MORNING »
// Quatre tuiles sous la pile, une question chacune. On en ouvre
// une à la fois ; tout reflète les décisions du jour, et chaque
// compte ouvre le tiroir « See the data ».
// =========================================================

const API_URL = "http://localhost:3000/api";

type TileKey = "since" | "next" | "growth" | "team";

// ---------- Le suivi (miroir de GET /api/followups) ----------

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
  newSignals: string[];
  reading: string;
};

type FollowUpsResponse = {
  month: string;
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

// ---------- Petits formats ----------

// "2026-07-31" → "July 31" ; "2026-08-02" → "Aug 2"
function longDay(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
function shortDay(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function decidedLine(f: FollowUp): string {
  const due = f.due ? ` · due ${shortDay(f.due)}` : "";
  if (f.action === "delegate" && f.person) return `You gave it to ${f.person}${due}`;
  if (f.action === "take") return `You took it yourself${due}`;
  if (f.action === "later") return "You postponed it";
  return "You decided";
}

// L'état d'un ensemble de comptes après la décision du jour (T4, croissance)
function decisionState(decision: Decision | undefined, owner: string | null): string {
  if (!decision) return "Waiting for your call";
  const due = decision.due ? `, plan due ${shortDay(decision.due)}` : "";
  if (decision.action === "route") return `Sent to each owner${due}`;
  if (decision.action === "send") return owner ? `With ${firstName(owner)}` : "Sent";
  if (decision.action === "take") return `With you${due}`;
  if (decision.action === "later") return "Postponed to tomorrow";
  return "Decided";
}

// Le compte ouvert dans le tiroir
type OpenAccount = { customerId: string; companyName: string };

// Une ligne de compte cliquable (ouvre le tiroir). Déclarée HORS du composant :
// sinon React la recréerait à chaque rendu, et le focus serait perdu.
function AccountRow({
  customerId,
  companyName,
  onOpen,
  children,
}: {
  customerId: string;
  companyName: string;
  onOpen: (opener: HTMLElement, account: OpenAccount) => void;
  children: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        className="mrow"
        aria-haspopup="dialog"
        onClick={(event) => onOpen(event.currentTarget, { customerId, companyName })}
      >
        {children}
        <svg className="mrow__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      </button>
    </li>
  );
}

export default function MorningTiles({
  brief,
  desk,
  decisions,
  team,
  onFollowUps,
}: {
  brief: BriefResponse;
  desk: DeskItem[];
  decisions: Decision[];
  team: TeamMemberLoad[]; // la charge mise à jour par les décisions du jour
  onFollowUps?: (summary: FollowUpSummary) => void;
}) {
  const [open, setOpen] = useState<TileKey | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpsResponse | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [account, setAccount] = useState<OpenAccount | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // ---------- Le suivi des décisions du mois précédent ----------
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/followups?month=${brief.month}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API error ${response.status}`);
        return response.json() as Promise<FollowUpsResponse>;
      })
      .then((loaded) => {
        setFollowUps(loaded);
        onFollowUps?.({
          sinceAsOf: loaded.sinceAsOf,
          total: loaded.items.length,
          worse: loaded.tally.worse + loaded.tally.shrank + loaded.tally.lost,
          better: loaded.tally.better,
        });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error(err);
      });
    return () => controller.abort();
    // onFollowUps vient de la page : on ne recharge que si le matin change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief.month]);

  // ---------- Les chiffres de chaque tuile ----------
  const next = brief.nextQuarterRenewals;
  const q4Decision = decisions.find((d) => d.id === "q4");
  const growDecision = decisions.find((d) => d.id === "grow");
  const growItem = desk.find((i) => i.kind === "grow");
  const growOwner = growItem && growItem.kind === "grow" ? growItem.owner : null;
  const growthArr = brief.readyToGrow.reduce((sum, s) => sum + s.arrAtStake, 0);

  const followTotal = followUps?.items.length ?? 0;
  const followWorse = followUps
    ? followUps.tally.worse + followUps.tally.shrank + followUps.tally.lost
    : 0;
  const followBetter = followUps?.tally.better ?? 0;

  const heaviest = [...team].sort((a, b) => b.situations - a.situations)[0];
  const morningOf = (name: string) =>
    brief.teamLoad.find((m) => m.name === name)?.situations ?? 0;

  type Tile = { key: TileKey; label: string; value: string; sub: string; alert: boolean; disabled: boolean };
  const tiles: Tile[] = [
    {
      key: "since",
      label: "Since last month",
      value:
        followTotal === 0
          ? "None"
          : followWorse > 0
            ? `${followWorse} worse`
            : followBetter > 0
              ? `${followBetter} better`
              : `${followTotal} steady`,
      sub:
        followTotal === 0
          ? "No decisions to follow up"
          : `of your ${followTotal} decisions on ${longDay(followUps?.sinceAsOf ?? brief.asOf)}`,
      alert: followWorse > 0,
      disabled: followTotal === 0,
    },
    {
      key: "next",
      label: "Coming next",
      value: formatMoney(next.arrAtRisk),
      sub: `${next.accounts} ${shortQuarter(next.quarter)} renewals at risk · ${
        q4Decision ? decisionState(q4Decision, null).toLowerCase() : "no plan yet"
      }`,
      alert: !q4Decision && next.accounts > 0,
      disabled: next.accounts === 0,
    },
    {
      key: "growth",
      label: "Extra revenue",
      value: formatMoney(growthArr),
      sub: `${brief.readyToGrow.length} accounts ready to grow · ${decisionState(
        growDecision,
        growOwner
      ).toLowerCase()}`,
      alert: false,
      disabled: brief.readyToGrow.length === 0,
    },
    {
      key: "team",
      label: "Your team",
      value: heaviest ? `${firstName(heaviest.name)} ${heaviest.situations}` : "—",
      sub: heaviest
        ? heaviest.situations !== morningOf(heaviest.name)
          ? `the heaviest load · ${morningOf(heaviest.name)} → ${heaviest.situations} today`
          : "the heaviest load on the team"
        : "",
      alert: !!heaviest && heaviest.situations >= HEAVY_LOAD,
      disabled: team.length === 0,
    },
  ];

  function openAccount(opener: HTMLElement, chosen: OpenAccount) {
    openerRef.current = opener;
    setAccount(chosen);
  }

  function closeAccount() {
    setAccount(null);
    openerRef.current?.focus();
  }

  // ---------- Le contenu de chaque panneau ----------
  function panel(key: TileKey): ReactNode {
    if (key === "since" && followUps) {
      return (
        <>
          <p className="mpanel__intro">
            What each account did between {longDay(followUps.sinceAsOf)} and {longDay(followUps.asOf)}.
          </p>
          <ul className="mpanel__list">
            {followUps.items.map((f) => (
              <AccountRow onOpen={openAccount} key={f.customerId} customerId={f.customerId} companyName={f.companyName}>
                <span className={`mtag mtag--${f.status}`}>{STATUS_LABELS[f.status]}</span>
                <span className="mrow__main">
                  <span className="mrow__name">{f.companyName}</span>
                  <span className="mrow__meta">{decidedLine(f)}</span>
                  <span className="mrow__reading">{f.reading}</span>
                </span>
              </AccountRow>
            ))}
          </ul>
          <p className="mpanel__note">
            <strong>Since, not because.</strong> It shows what each account did after your decision,
            not the effect of the decision itself.
          </p>
        </>
      );
    }

    if (key === "next") {
      const rows = [...next.keyAccounts].sort((a, b) => a.daysToRenewal - b.daysToRenewal);
      return (
        <>
          <p className="mpanel__intro">
            Renewing between {formatDate(next.from)} and {formatDate(next.to)} with a recent warning
            sign. {q4Decision ? decisionState(q4Decision, null) + "." : "No plan yet: the card is on your desk."}
          </p>
          <ul className="mpanel__list">
            {rows.map((r) => (
              <AccountRow onOpen={openAccount} key={r.customerId} customerId={r.customerId} companyName={r.companyName}>
                <span className="mrow__num">{formatMoney(r.arr)}</span>
                <span className="mrow__main">
                  <span className="mrow__name">{r.companyName}</span>
                  <span className="mrow__meta">
                    Renews {shortDay(r.nextRenewal)}, in {r.daysToRenewal} days · {r.signalTypes.join(", ")}
                  </span>
                </span>
              </AccountRow>
            ))}
          </ul>
          {next.smallerAccounts.accounts > 0 && (
            <p className="mpanel__note">
              The {next.smallerAccounts.accounts} smaller accounts ({formatMoney(next.smallerAccounts.arr)})
              stay with your team.
            </p>
          )}
        </>
      );
    }

    if (key === "growth") {
      return (
        <>
          <p className="mpanel__intro">
            Each account has used more than 90% of its licenses for two months in a row, with no
            warning sign. {decisionState(growDecision, growOwner)}.
          </p>
          <ul className="mpanel__list">
            {brief.readyToGrow.map((s) => (
              <AccountRow onOpen={openAccount} key={s.customerId} customerId={s.customerId} companyName={s.companyName}>
                <span className="mrow__num">{formatMoney(s.arrAtStake)}</span>
                <span className="mrow__main">
                  <span className="mrow__name">{s.companyName}</span>
                  <span className="mrow__meta">{s.evidence[0] ?? s.signalTypes.join(", ")}</span>
                </span>
              </AccountRow>
            ))}
          </ul>
        </>
      );
    }

    if (key === "team") {
      const maxLoad = Math.max(...team.map((m) => m.situations), 1) * 1.1;
      // Les comptes de la personne choisie : ceux routés par les agents + ceux délégués aujourd'hui
      const routed = person ? brief.team.filter((s) => s.owner === person) : [];
      const delegated = person
        ? decisions
            .filter((d) => d.action === "delegate" && d.person === person)
            .map((d) => desk.find((i) => i.id === d.id))
            .filter((i): i is Extract<DeskItem, { kind: "risk" }> => i?.kind === "risk")
        : [];

      return (
        <>
          <p className="mpanel__intro">
            Situations your agents routed to each person this month, updated with your decisions.
            Choose a person to see their accounts.
          </p>
          <div className="mteam">
            {team.map((m) => {
              const morning = morningOf(m.name);
              const heavy = m.situations >= HEAVY_LOAD;
              const chosen = person === m.name;
              return (
                <button
                  key={m.name}
                  type="button"
                  className={chosen ? "mteam__person mteam__person--on" : "mteam__person"}
                  aria-pressed={chosen}
                  onClick={() => setPerson(chosen ? null : m.name)}
                >
                  <span className="mteam__top">
                    <span>
                      <span className="mteam__name">{m.name}</span>
                      <span className="mteam__role">{m.role}</span>
                    </span>
                    <span className={heavy ? "mteam__load mteam__load--heavy" : "mteam__load"}>
                      {morning !== m.situations ? `${morning} → ${m.situations}` : m.situations}
                    </span>
                  </span>
                  <span className="mteam__bar" aria-hidden="true">
                    <motion.span
                      className={heavy ? "mteam__fill mteam__fill--heavy" : "mteam__fill"}
                      initial={false}
                      animate={{ width: `${(100 * m.situations) / maxLoad}%` }}
                      transition={{ duration: 0.5, ease: EASE }}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          {person && (
            <div className="mteam__accounts">
              <h4 className="mteam__title">{firstName(person)}'s accounts</h4>
              <ul className="mpanel__list">
                {delegated.map((i) => (
                  <AccountRow onOpen={openAccount} key={i.id} customerId={i.situation.customerId} companyName={i.situation.companyName}>
                    <span className="mrow__num">{formatMoney(i.arr)}</span>
                    <span className="mrow__main">
                      <span className="mrow__name">{i.situation.companyName}</span>
                      <span className="mrow__meta">From your desk today</span>
                    </span>
                  </AccountRow>
                ))}
                {[...routed]
                  .sort((a, b) => b.arrAtStake - a.arrAtStake)
                  .slice(0, 8)
                  .map((s) => (
                    <AccountRow onOpen={openAccount} key={s.customerId} customerId={s.customerId} companyName={s.companyName}>
                      <span className="mrow__num">{formatMoney(s.arrAtStake)}</span>
                      <span className="mrow__main">
                        <span className="mrow__name">{s.companyName}</span>
                        <span className="mrow__meta">{s.signalTypes.join(", ")}</span>
                      </span>
                    </AccountRow>
                  ))}
              </ul>
              {routed.length > 8 && (
                <p className="mpanel__note">
                  The 8 largest of {routed.length} situations routed to {firstName(person)}.
                </p>
              )}
              {routed.length === 0 && delegated.length === 0 && (
                <p className="mpanel__note">Nothing routed to {firstName(person)} this month.</p>
              )}
            </div>
          )}
        </>
      );
    }

    return null;
  }

  return (
    <section className="mtiles" aria-labelledby="mtiles-title">
      <h2 className="mtiles__title" id="mtiles-title">
        The rest of your morning
      </h2>

      <div className="mtiles__grid">
        {tiles.map((t) => {
          const isOpen = open === t.key;
          const classes = [
            "mtile",
            isOpen ? "mtile--open" : "",
            t.alert ? "mtile--alert" : "",
          ].join(" ");
          return (
            <button
              key={t.key}
              type="button"
              className={classes}
              disabled={t.disabled}
              aria-expanded={isOpen}
              aria-controls="mtiles-panel"
              onClick={() => setOpen(isOpen ? null : t.key)}
            >
              <span className="mtile__label">{t.label}</span>
              <span className="mtile__value">{t.value}</span>
              <span className="mtile__sub">{t.sub}</span>
              <svg className="mtile__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          );
        })}
      </div>

      {/* Le panneau de la tuile ouverte : un seul à la fois */}
      <AnimatePresence mode="wait" initial={false}>
        {open && (
          <motion.div
            key={open}
            id="mtiles-panel"
            className="mpanel"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            {panel(open)}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Le même tiroir que sur les cartes */}
      <AnimatePresence>
        {account && (
          <EvidenceDrawer
            key={account.customerId}
            customerId={account.customerId}
            companyName={account.companyName}
            asOf={brief.asOf}
            onClose={closeAccount}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
