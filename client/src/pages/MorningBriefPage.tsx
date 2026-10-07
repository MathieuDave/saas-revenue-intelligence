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

function buildLede(brief: BriefResponse): string {
  const { goal, counts } = brief;
  const decisions =
    counts.today === 1
      ? "One account needs your decision today."
      : `${countWord(counts.today)} accounts need your decision today.`;

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

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_URL}/brief?month=${BRIEF_MONTH}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`API error ${response.status}`);
        }
        return response.json() as Promise<BriefResponse>;
      })
      .then(setBrief)
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
          <section className="brief__opening">
            <h1 className="brief__headline">
              {buildHeadline(brief).map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h1>

            <p className="brief__lede">{buildLede(brief)}</p>

            <GoalTrack goal={brief.goal} />
          </section>
        )}

        {brief && <DecisionDesk situations={brief.today} />}
      </div>
    </div>
  );
}

export default MorningBriefPage;