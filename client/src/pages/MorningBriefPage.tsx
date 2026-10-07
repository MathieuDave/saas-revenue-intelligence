import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { BriefResponse, QuarterGoal } from "../brief/types";
import {
  countWord,
  formatDay,
  formatLongDay,
  formatMoney,
  shortQuarter,
} from "../brief/briefText";
import DecisionDesk from "../brief/DecisionDesk";
import CalmSections from "../brief/CalmSections";
import NightPanel from "../brief/NightPanel";
import { fetchDecisions } from "../brief/decisionsApi";
import ReplayOutcomes from "../brief/ReplayOutcomes";
import {
  buildDesk,
  liveTeamLoad,
  type Decision,
} from "../brief/deskItems";
import "./MorningBriefPage.css";

const API_URL = "http://localhost:3000/api";

// Les deux matins de la démo
type Mode = "today" | "replay";

const MONTHS: Record<Mode, string> = {
  today: "2026-08", // le brief du 31 août 2026
  replay: "2025-10", // un vrai matin passé, rejoué : 31 octobre 2025
};

// =========================================================
// LE TEXTE DU BRIEF (écrit à partir des données)
// Plus tard, l'agent Briefing Writer pourra le rédiger.
// =========================================================

function buildReplayHeadline(brief: BriefResponse, deskCount: number): [string, string] {
  const waiting =
    deskCount === 1
      ? "One decision is waiting."
      : `${countWord(deskCount)} decisions are waiting.`;
  return [`${formatLongDay(brief.asOf)}.`, waiting];
}

function buildReplayLede(brief: BriefResponse): string {
  const flagged =
    brief.today.length + brief.team.filter((s) => s.leadingRisks > 0).length;
  return (
    `This is a replay of a real morning. Your agents flagged ${flagged} accounts ` +
    `that month and kept ${brief.today.length} for you. Decide as you would have ` +
    `that day, then see what actually happened over the next three months.`
  );
}

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

// =========================================================
// LA PISTE DE L'OBJECTIF
// =========================================================

function GoalTrack({ goal }: { goal: QuarterGoal }) {
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
          <strong>{formatMoney(goalArr)}</strong>
        </span>
      </div>

      <div className="goal-track__rail" aria-hidden="true">
        <div className="goal-track__forecast" style={{ width: pct(forecast) }} />
        <div className="goal-track__booked" style={{ width: pct(booked) }} />
        <div className="goal-track__goal" style={{ left: pct(goalArr) }} />
      </div>

      <div className="goal-track__legend" aria-hidden="true">
        <span className="goal-track__label" style={{ left: 0 }}>
          Booked
          <strong>{formatMoney(booked)}</strong>
        </span>
        <span
          className="goal-track__label goal-track__label--forecast"
          style={{ left: pct(forecast) }}
        >
          Forecast
          <strong>{formatMoney(forecast)}</strong>
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
  const [mode, setMode] = useState<Mode>("today");
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const month = MONTHS[mode];
  const replay = mode === "replay";

  // Les décisions du VP vivent ici, dans la page, parce que plusieurs
  // sections en ont besoin (la pile, l'équipe, le panneau des agents)
  const [decisions, setDecisions] = useState<Decision[]>([]);

  // Changer de matin : on repart d'une page vide
  function switchMode(next: Mode) {
    if (next === mode) return;
    setBrief(null);
    setError(null);
    setDecisions([]);
    setMode(next);
  }

  useEffect(() => {
    const controller = new AbortController();

    // Le brief et les décisions déjà prises arrivent en même temps.
    // En Replay, rien n'est enregistré : on repart toujours de zéro.
    const loadBrief = fetch(`${API_URL}/brief?month=${month}`, {
      signal: controller.signal,
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`API error ${response.status}`);
      }
      return response.json() as Promise<BriefResponse>;
    });

    const loadDecisions = replay
      ? Promise.resolve([])
      : fetchDecisions(month, controller.signal);

    Promise.all([loadBrief, loadDecisions])
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

    // Nettoyage : si on quitte la page ou change de matin, on annule la requête
    return () => controller.abort();
  }, [month, replay]);

  // Ce qui arrive sur le bureau du VP (risques, arbitrage, T4, croissance)
  const desk = brief ? buildDesk(brief) : [];
  const team = brief ? liveTeamLoad(brief.teamLoad, desk, decisions) : [];
  const growthSent = decisions.some((d) => d.id === "grow" && d.action === "send");

  return (
    <div className="brief">
      <div className="brief__inner">
        <header className="brief__topbar">
          <span className="brief__brand">RevenueAI</span>
          <div className="brief__modes" role="group" aria-label="Which morning">
            <button
              type="button"
              aria-pressed={!replay}
              className={replay ? "brief__mode" : "brief__mode brief__mode--on"}
              onClick={() => switchMode("today")}
            >
              Today
            </button>
            <button
              type="button"
              aria-pressed={replay}
              className={replay ? "brief__mode brief__mode--on" : "brief__mode"}
              onClick={() => switchMode("replay")}
            >
              Replay, Oct 2025
            </button>
          </div>
          {brief && <span className="brief__date">{formatDay(brief.asOf)}</span>}
          <Link to="/" className="brief__explore">
            Explore the data
          </Link>
        </header>

        {error && <p className="brief__status">{error}</p>}

        {!error && !brief && (
          <p className="brief__status">Your agents are preparing the brief…</p>
        )}

        {brief && (
          <div className="brief__cols">
            <main className="brief__main">
              <section className="brief__opening">
                <h1 className="brief__headline">
                  {(replay
                    ? buildReplayHeadline(brief, desk.length)
                    : buildHeadline(brief)
                  ).map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </h1>

                <p className="brief__lede">
                  {replay ? buildReplayLede(brief) : buildLede(brief, desk.length)}
                </p>

                <GoalTrack goal={brief.goal} />
              </section>

              <DecisionDesk
                month={brief.month}
                replay={replay}
                items={desk}
                teamLoad={brief.teamLoad}
                asOf={brief.asOf}
                decisions={decisions}
                setDecisions={setDecisions}
              />

              {replay && (
                <ReplayOutcomes
                  month={brief.month}
                  decisions={decisions}
                  onRestart={() => setDecisions([])}
                />
              )}

              <CalmSections brief={brief} team={team} growthSent={growthSent} />
            </main>

            <NightPanel
              brief={brief}
              deskCount={desk.length}
              decided={decisions.length}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default MorningBriefPage;