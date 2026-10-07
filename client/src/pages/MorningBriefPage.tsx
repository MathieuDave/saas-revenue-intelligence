import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MotionConfig, motion } from "motion/react";

import type { BriefResponse, QuarterGoal } from "../brief/types";
import {
  countWord,
  formatDay,
  formatMoney,
  shortQuarter,
} from "../brief/briefText";
import DecisionDesk from "../brief/DecisionDesk";
import CalmSections from "../brief/CalmSections";
import NightPanel from "../brief/NightPanel";
import { fetchDecisions } from "../brief/decisionsApi";
import TrustLine from "../brief/TrustLine";
import BootSequence, { BriefSkeleton } from "../brief/BootSequence";
import { CountUp, EASE, Reveal } from "../brief/motionKit";
import { markIntroPlayed, shouldPlayIntro, todayKey } from "../brief/intro";
import {
  buildDesk,
  liveTeamLoad,
  type Decision,
} from "../brief/deskItems";
import "./MorningBriefPage.css";

const API_URL = "http://localhost:3000/api";

// Les matins disponibles : les données vont de 2025 au 31 août 2026.
// Le brief s'ouvre sur le dernier matin, ou sur celui demandé dans l'adresse :
// /brief?month=2026-07 → le matin du 31 juillet 2026
const LATEST_MONTH = "2026-08";
const EARLIEST_MONTH = "2025-04";

// "2026-08", -1 → "2026-07"
function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2026, (m ?? 1) - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

// "2026-07" → "July 31" (le dernier jour du mois : le matin du brief)
function morningLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year ?? 2026, m ?? 1, 0)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Le mois demandé dans l'adresse, s'il est valide ; sinon le dernier matin
function readMonth(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return LATEST_MONTH;
  if (value > LATEST_MONTH || value < EARLIEST_MONTH) return LATEST_MONTH;
  return value;
}

// =========================================================
// LE TEXTE DU BRIEF (écrit à partir des données)
// Plus tard, l'agent Briefing Writer pourra le rédiger.
// =========================================================

function buildHeadline(brief: BriefResponse): [string, string] {
  const { goal, nextQuarterRenewals: next } = brief;
  const thisQ = shortQuarter(goal.quarter);
  const nextQ = shortQuarter(next.quarter);
  const protect = `${nextQ} starts with ${formatMoney(next.arrAtRisk)} to protect.`;

  if (!goal.available) {
    return ["Good morning.", protect];
  }
  if ((goal.pctForecast ?? 0) >= 100) {
    return [`${thisQ} is on track.`, protect];
  }
  const gap = (goal.goalArr ?? 0) - (goal.forecastArr ?? 0);
  return [`${thisQ} is ${formatMoney(gap)} short.`, protect];
}

function buildLede(brief: BriefResponse, deskCount: number): string {
  const { goal } = brief;
  const decisions =
    deskCount === 0
      ? "Nothing needs your decision today."
      : deskCount === 1
        ? "One decision is waiting for you this morning."
        : `${countWord(deskCount)} decisions are waiting for you this morning.`;

  if (!goal.available) {
    return `There is not enough history yet to set a quarterly goal. ${decisions}`;
  }

  return (
    `You have booked ${goal.pctBooked}% of the ${formatMoney(goal.goalArr ?? 0)} goal ` +
    `with ${goal.daysLeft} days left. At a typical pace, the quarter closes ` +
    `at ${goal.pctForecast}%. ${decisions}`
  );
}

// Les étapes de l'ouverture : ce que le système vient vraiment de faire
function buildBootLines(brief: BriefResponse, deskCount: number): string[] {
  const month = new Date(`${brief.asOf}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  return [
    "Reading your accounts…",
    `${brief.counts.total} accounts changed in ${month}`,
    `${brief.counts.team} routed to your team`,
    deskCount === 1 ? "1 decision ready" : `${deskCount} decisions ready`,
  ];
}

// =========================================================
// LA PISTE DE L'OBJECTIF
// =========================================================

function GoalTrack({ goal, play }: { goal: QuarterGoal; play: boolean }) {
  if (!goal.available) return null;

  const goalArr = goal.goalArr ?? 0;
  const booked = goal.bookedArr ?? 0;
  const forecast = goal.forecastArr ?? 0;

  // L'échelle laisse un peu d'air après la valeur la plus haute
  const scale = Math.max(goalArr, forecast) * 1.04;
  const pct = (value: number) => `${(100 * value) / scale}%`;

  return (
    <figure
      className="goal-track"
      aria-label={`Booked ${formatMoney(booked)}, forecast ${formatMoney(
        forecast
      )}, goal ${formatMoney(goalArr)}`}
    >
      <div className="goal-track__above" aria-hidden="true">
        <span
          className="goal-track__label goal-track__label--goal"
          style={{ left: pct(goalArr) }}
        >
          Goal
          <strong>
            <CountUp value={goalArr} play={play} delay={0.5} format={formatMoney} />
          </strong>
        </span>
      </div>

      {/* Les barres se remplissent pendant l'ouverture */}
      <div className="goal-track__rail" aria-hidden="true">
        <motion.div
          className="goal-track__forecast"
          initial={{ width: play ? "0%" : pct(forecast) }}
          animate={{ width: pct(forecast) }}
          transition={{ duration: 1, delay: play ? 0.7 : 0, ease: EASE }}
        />
        <motion.div
          className="goal-track__booked"
          initial={{ width: play ? "0%" : pct(booked) }}
          animate={{ width: pct(booked) }}
          transition={{ duration: 0.9, delay: play ? 0.5 : 0, ease: EASE }}
        />
        <div className="goal-track__goal" style={{ left: pct(goalArr) }} />
      </div>

      <div className="goal-track__legend" aria-hidden="true">
        <span className="goal-track__label" style={{ left: 0 }}>
          Booked
          <strong>
            <CountUp value={booked} play={play} delay={0.5} format={formatMoney} />
          </strong>
        </span>
        <span
          className="goal-track__label goal-track__label--forecast"
          style={{ left: pct(forecast) }}
        >
          Forecast
          <strong>
            <CountUp value={forecast} play={play} delay={0.7} format={formatMoney} />
          </strong>
        </span>
      </div>

      <figcaption className="goal-track__method">
        How the goal is set: {goal.method}.
      </figcaption>
    </figure>
  );
}

// =========================================================
// LA PAGE
// =========================================================

function MorningBriefPage() {
  // Le matin affiché vient de l'adresse (?month=2026-07)
  const [searchParams] = useSearchParams();
  const month = readMonth(searchParams.get("month"));
  const isLatest = month === LATEST_MONTH;

  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Les décisions du VP vivent ici, dans la page, parce que plusieurs
  // sections en ont besoin (la pile, l'équipe, le panneau des agents)
  const [decisions, setDecisions] = useState<Decision[]>([]);

  // L'ouverture complète : une fois par jour, sauf « réduire les animations »
  const [today] = useState(todayKey);
  const [play] = useState(() => shouldPlayIntro(today));
  const [booting, setBooting] = useState(play);

  // useCallback : la même fonction d'un rendu à l'autre (BootSequence l'attend)
  const endBoot = useCallback(() => {
    markIntroPlayed(today);
    setBooting(false);
  }, [today]);

  // Échap passe l'ouverture
  useEffect(() => {
    if (!booting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") endBoot();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [booting, endBoot]);

  useEffect(() => {
    const controller = new AbortController();

    // Nouveau matin : on repart d'une page vide (le squelette s'affiche)
    setBrief(null);
    setError(null);
    setDecisions([]);

    // Le brief et les décisions déjà prises arrivent en même temps
    const loadBrief = fetch(`${API_URL}/brief?month=${month}`, {
      signal: controller.signal,
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`API error ${response.status}`);
      }
      return response.json() as Promise<BriefResponse>;
    });

    Promise.all([loadBrief, fetchDecisions(month, controller.signal)])
      .then(([loadedBrief, savedDecisions]) => {
        setBrief(loadedBrief);
        setDecisions(savedDecisions);
      })
      .catch((err: unknown) => {
        // Annulation volontaire (on a quitté la page) → pas une erreur
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          "The brief could not load. Check that the backend is running on port 3000, then refresh."
        );
        console.error(err);
      });

    // Nettoyage : si on quitte la page (ou change de matin), on annule la requête
    return () => controller.abort();
  }, [month]);

  // Ce qui arrive sur le bureau du VP (risques, arbitrage, T4, croissance)
  const desk = brief ? buildDesk(brief) : [];
  const team = brief ? liveTeamLoad(brief.teamLoad, desk, decisions) : [];
  const growthSent = decisions.some((d) => d.id === "grow" && d.action === "send");

  const ready = brief !== null && !booting;

  return (
    // reducedMotion="user" : Motion coupe les déplacements si l'utilisateur le demande
    <MotionConfig reducedMotion="user">
    <div className="brief">
      <div className="brief__inner">
        <header className="brief__topbar">
          <span className="brief__brand">RevenueAI</span>
          {brief && <span className="brief__date">{formatDay(brief.asOf)}</span>}

          {/* Naviguer d'un matin à l'autre */}
          <nav className="brief__mornings" aria-label="Other mornings">
            {month > EARLIEST_MONTH && (
              <Link to={`/brief?month=${shiftMonth(month, -1)}`} className="brief__morning">
                ← {morningLabel(shiftMonth(month, -1))}
              </Link>
            )}
            {!isLatest && (
              <Link to={`/brief?month=${shiftMonth(month, 1)}`} className="brief__morning">
                {morningLabel(shiftMonth(month, 1))} →
              </Link>
            )}
          </nav>

          <Link to="/" className="brief__explore">
            Explore the data
          </Link>
        </header>

        {/* Un matin passé : on le dit clairement */}
        {!isLatest && (
          <p className="brief__past">
            You are looking at a past morning, {morningLabel(month)}. Your agents only knew what had
            happened by then.{" "}
            <Link to="/brief">Back to the latest morning</Link>
          </p>
        )}

        {error && <p className="brief__status">{error}</p>}

        {/* Avant les données (ou pendant l'ouverture) : le squelette */}
        {!error && !ready && <BriefSkeleton />}

        {!error && booting && (
          <BootSequence
            lines={brief ? buildBootLines(brief, desk.length) : null}
            onDone={endBoot}
          />
        )}

        {ready && (
          // key : changer de matin recrée toute la page (pile, cartes, sections)
          <div className="brief__cols" key={brief.month}>
            <main className="brief__main">
              <section className="brief__opening">
                <h1 className="brief__headline">
                  {buildHeadline(brief).map((line, index) => (
                    <motion.span
                      key={line}
                      initial={{ opacity: 0, y: play ? 24 : 0 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: play ? index * 0.15 : 0, ease: EASE }}
                    >
                      {line}
                    </motion.span>
                  ))}
                </h1>

                <Reveal play={play} delay={0.3}>
                  <p className="brief__lede">{buildLede(brief, desk.length)}</p>
                </Reveal>

                <Reveal play={play} delay={0.45}>
                  <GoalTrack goal={brief.goal} play={play} />
                </Reveal>
              </section>

              <Reveal play={play} delay={0.9}>
                <DecisionDesk
                  month={brief.month}
                  items={desk}
                  teamLoad={brief.teamLoad}
                  asOf={brief.asOf}
                  decisions={decisions}
                  setDecisions={setDecisions}
                  trust={<TrustLine month={brief.month} />}
                />
              </Reveal>

              <Reveal play={play} delay={1.1}>
                <CalmSections brief={brief} team={team} growthSent={growthSent} />
              </Reveal>
            </main>

            <Reveal play={play} delay={0.6} className="brief__aside">
              <NightPanel
                brief={brief}
                deskCount={desk.length}
                decided={decisions.length}
              />
            </Reveal>
          </div>
        )}
      </div>
    </div>
    </MotionConfig>
  );
}

export default MorningBriefPage;