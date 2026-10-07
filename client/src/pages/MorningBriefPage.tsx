import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

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
import {
  buildDesk,
  liveTeamLoad,
  type Decision,
} from "../brief/deskItems";
import "./MorningBriefPage.css";

const API_URL = "http://localhost:3000/api";

// Le « matin » de la démo : le brief du 31 août 2026
const BRIEF_MONTH = "2026-08";

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
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Les décisions du VP vivent ici, dans la page, parce que plusieurs
  // sections en ont besoin (la pile, l'équipe, le panneau des agents)
  const [decisions, setDecisions] = useState<Decision[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    // Le brief et les décisions déjà prises arrivent en même temps
    const loadBrief = fetch(`${API_URL}/brief?month=${BRIEF_MONTH}`, {
      signal: controller.signal,
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`API error ${response.status}`);
      }
      return response.json() as Promise<BriefResponse>;
    });

    Promise.all([loadBrief, fetchDecisions(BRIEF_MONTH, controller.signal)])
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

    // Nettoyage : si on quitte la page, on annule la requête
    return () => controller.abort();
  }, []);

  // Ce qui arrive sur le bureau du VP (risques, arbitrage, T4, croissance)
  const desk = brief ? buildDesk(brief) : [];
  const team = brief ? liveTeamLoad(brief.teamLoad, desk, decisions) : [];
  const growthSent = decisions.some((d) => d.id === "grow" && d.action === "send");

  return (
    <div className="brief">
      <div className="brief__inner">
        <header className="brief__topbar">
          <span className="brief__brand">RevenueAI</span>
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
                  {buildHeadline(brief).map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </h1>

                <p className="brief__lede">{buildLede(brief, desk.length)}</p>

                <GoalTrack goal={brief.goal} />
              </section>

              <DecisionDesk
                month={brief.month}
                items={desk}
                teamLoad={brief.teamLoad}
                asOf={brief.asOf}
                decisions={decisions}
                setDecisions={setDecisions}
                trust={<TrustLine month={brief.month} />}
              />

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