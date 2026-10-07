import { useEffect, useState } from "react";

import PageLoadingState from "../components/PageLoadingState";
import SituationFeed from "../components/SituationFeed";
import type { Situation } from "../components/SituationFeed";
import type { SignalEvent } from "../components/SignalFeed";

import "./TimeMachinePage.css";

// =========================================================
// TYPES
// =========================================================

type TimelineData = {
  month: string;
  kpis: {
    activeCustomers: number;
    mrr: number;
    newMrr: number;
    expansionMrr: number;
    contractionMrr: number;
    churnMrr: number;
    avgLicenseUtilization: number;
    ticketsOpened: number;
    criticalTickets: number;
    negativeFeedback: number;
  };
};

type SignalsData = {
  month: string;
  summary: {
    total: number;
    risk: number;
    opportunity: number;
    critical: number;
    situations: number;
    compoundingRisk: number;
    mrrAtRisk: number;
  };
  events: SignalEvent[];
  situations: Situation[];
};

// L'état de l'horloge, tel que le serveur l'annonce
type SimulationState = {
  month: string | null;
  index: number;
  total: number;
  isPlaying: boolean;
};

const API_URL = "http://localhost:3000/api";

// =========================================================
// FORMATAGE
// =========================================================

// "2026-03" → "Mar 2026"
function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-");

  return new Date(
    Number(year),
    Number(monthNumber) - 1,
    1
  ).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

// 1191393 → "$1.19M"
function formatMoney(value: number) {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);

  if (absolute >= 1_000_000) {
    return `${sign}$${(absolute / 1_000_000).toFixed(2)}M`;
  }

  if (absolute >= 1_000) {
    return `${sign}$${(absolute / 1_000).toFixed(1)}K`;
  }

  return `${sign}$${absolute}`;
}

// =========================================================
// TÉLÉCOMMANDE : envoyer des commandes à l'horloge du serveur
// =========================================================

function sendCommand(command: "play" | "pause" | "reset") {
  fetch(`${API_URL}/simulation/${command}`, { method: "POST" }).catch(
    (err) => console.error(`Simulation ${command} error:`, err)
  );
}

function seekTo(month: string) {
  fetch(`${API_URL}/simulation/seek`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month }),
  }).catch((err) => console.error("Simulation seek error:", err));
}

// =========================================================
// PAGE
// =========================================================

function TimeMachinePage() {
  const [months, setMonths] = useState<string[]>([]);
  const [clock, setClock] = useState<SimulationState | null>(null);
  const [signals, setSignals] = useState<SignalsData | null>(null);
  const [data, setData] = useState<TimelineData | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState(false);

  const currentMonth = clock?.month ?? null;

  // ---------------------------------------------------------
  // 1. La liste des mois (pour le curseur)
  // ---------------------------------------------------------
  useEffect(() => {
    fetch(`${API_URL}/timeline/months`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to retrieve timeline months");
        }
        return response.json();
      })
      .then((result: string[]) => setMonths(result))
      .catch((err) => {
        console.error("Timeline months error:", err);
        setError(true);
      });
  }, []);

  // ---------------------------------------------------------
  // 2. Le flux en direct : le serveur POUSSE l'état et les situations
  // ---------------------------------------------------------
  useEffect(() => {
    const source = new EventSource(`${API_URL}/live`);

    source.onopen = () => setIsLive(true);

    // En cas de coupure, EventSource se reconnecte tout seul
    source.onerror = () => setIsLive(false);

    source.addEventListener("state", (event) => {
      setClock(JSON.parse(event.data) as SimulationState);
    });

    source.addEventListener("signals", (event) => {
      setSignals(JSON.parse(event.data) as SignalsData);
    });

    // Fermer la connexion quand on quitte la page
    return () => source.close();
  }, []);

  // ---------------------------------------------------------
  // 3. Les chiffres de la ligne discrète (MRR, clients, Net new)
  // ---------------------------------------------------------
  useEffect(() => {
    if (!currentMonth) return;

    let ignore = false;

    fetch(`${API_URL}/timeline?month=${currentMonth}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to retrieve timeline data");
        }
        return response.json();
      })
      .then((result: TimelineData) => {
        if (!ignore) setData(result);
      })
      .catch((err) => console.error("Timeline error:", err));

    return () => {
      ignore = true;
    };
  }, [currentMonth]);

  // ---------------------------------------------------------
  // Affichage
  // ---------------------------------------------------------
  if (error) {
    return (
      <div>
        <div className="app-header">
          <h1>Command Center</h1>
          <p>Situations that need your attention, as they happen.</p>
        </div>
        <p>Unable to load the Command Center.</p>
      </div>
    );
  }

  if (!clock || !currentMonth || !data) {
    return (
      <PageLoadingState
        title="Command Center"
        description="Situations that need your attention, as they happen."
        message="Connecting to the live feed..."
        kpiCount={0}
      />
    );
  }

  const { kpis } = data;
  const netNewMrr =
    kpis.newMrr +
    kpis.expansionMrr -
    kpis.contractionMrr -
    kpis.churnMrr;

  return (
    <div>
      <div className="app-header">
        <h1>Command Center</h1>
        <p>Situations that need your attention, as they happen.</p>
      </div>

      <div className="time-machine-bar">
        <button
          className="time-machine-button"
          onClick={() => sendCommand("reset")}
          title="Back to first month"
        >
          ⏮
        </button>

        <button
          className="time-machine-button time-machine-button--primary"
          onClick={() => sendCommand(clock.isPlaying ? "pause" : "play")}
        >
          {clock.isPlaying ? "⏸ Pause" : "▶ Play"}
        </button>

        <input
          className="time-machine-slider"
          type="range"
          min={0}
          max={Math.max(clock.total - 1, 0)}
          value={clock.index}
          onChange={(event) => {
            const month = months[Number(event.target.value)];
            if (month) seekTo(month);
          }}
        />

        <span
          className={`live-indicator ${isLive ? "live-indicator--on" : ""}`}
        >
          {isLive ? "● Live" : "○ Reconnecting…"}
        </span>

        <div className="time-machine-clock">
          <div className="time-machine-month">
            {formatMonth(currentMonth)}
          </div>
          <div className="time-machine-pulse">
            MRR {formatMoney(kpis.mrr)} ·{" "}
            {kpis.activeCustomers.toLocaleString("en-US")} customers · Net new{" "}
            {netNewMrr >= 0 ? "+" : ""}
            {formatMoney(netNewMrr)}
          </div>
        </div>
      </div>

      {signals && signals.month === currentMonth ? (
        <div style={{ marginTop: 24 }}>
          <p className="time-machine-note">
            🔔 {signals.summary.situations} accounts need attention ·{" "}
            {signals.summary.compoundingRisk} compounding risk ·{" "}
            {signals.summary.total} signals
          </p>

          <SituationFeed situations={signals.situations} limit={10} />
        </div>
      ) : (
        <p className="time-machine-note">🔔 Loading signals…</p>
      )}

      <p className="time-machine-note">
        Data snapshot · {formatMonth(currentMonth)} · Month {clock.index + 1} of{" "}
        {clock.total}
      </p>
    </div>
  );
}

export default TimeMachinePage;