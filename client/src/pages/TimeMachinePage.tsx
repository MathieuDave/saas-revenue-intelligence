import { useEffect, useState } from "react";

import KpiCard from "../components/KpiCard";
import PageLoadingState from "../components/PageLoadingState";

import "./TimeMachinePage.css";

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
    mrrAtRisk: number;
  };
};

const API_URL = "http://localhost:3000/api";
const PLAY_SPEED_MS = 1500; // 1,5 seconde par mois

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

function TimeMachinePage() {
  const [months, setMonths] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [data, setData] = useState<TimelineData | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(false);
  const [signals, setSignals] = useState<SignalsData | null>(null);

  const currentMonth = months[currentIndex];
  const lastIndex = months.length - 1;

  // ---------------------------------------------------------
  // 1. Charger la liste des mois (une seule fois)
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
  // 2. Charger les KPIs à chaque changement de mois
  // ---------------------------------------------------------
  useEffect(() => {
    if (!currentMonth) return;

    // Si le mois change avant que la réponse arrive,
    // on ignore l'ancienne réponse (évite d'afficher le mauvais mois).
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
      .catch((err) => {
        console.error("Timeline error:", err);
        if (!ignore) setError(true);
      });

    return () => {
      ignore = true;
    };
  }, [currentMonth]);

    // ---------------------------------------------------------
  // 2b. Charger les signaux à chaque changement de mois
  // ---------------------------------------------------------
  useEffect(() => {
    if (!currentMonth) return;

    let ignore = false;

    fetch(`${API_URL}/signals?month=${currentMonth}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to retrieve signals");
        }
        return response.json();
      })
      .then((result: SignalsData) => {
        if (!ignore) setSignals(result);
      })
      .catch((err) => {
        console.error("Signals error:", err);
      });

    return () => {
      ignore = true;
    };
  }, [currentMonth]);

  // ---------------------------------------------------------
  // 3. Le moteur du bouton Play
  // ---------------------------------------------------------
  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(() => {
      setCurrentIndex((index) => Math.min(index + 1, lastIndex));
    }, PLAY_SPEED_MS);

    return () => clearInterval(timer);
  }, [isPlaying, lastIndex]);

  // Arrêt automatique au dernier mois
  useEffect(() => {
    if (isPlaying && currentIndex >= lastIndex) {
      setIsPlaying(false);
    }
  }, [isPlaying, currentIndex, lastIndex]);

  function handlePlayPause() {
    // Si on est à la fin, Play recommence depuis le début
    if (!isPlaying && currentIndex >= lastIndex) {
      setCurrentIndex(0);
    }
    setIsPlaying((playing) => !playing);
  }

  function handleReset() {
    setIsPlaying(false);
    setCurrentIndex(0);
  }

  // ---------------------------------------------------------
  // Affichage
  // ---------------------------------------------------------
  if (error) {
    return (
      <div>
        <div className="app-header">
          <h1>Time Machine</h1>
          <p>Replay the business month by month.</p>
        </div>
        <p>Unable to load timeline data.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <PageLoadingState
        title="Time Machine"
        description="Replay the business month by month."
        message="Loading timeline..."
        kpiCount={5}
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
        <h1>Time Machine</h1>
        <p>Replay the business month by month.</p>
      </div>

      <div className="time-machine-bar">
        <button
          className="time-machine-button"
          onClick={handleReset}
          title="Back to first month"
        >
          ⏮
        </button>

        <button
          className="time-machine-button time-machine-button--primary"
          onClick={handlePlayPause}
        >
          {isPlaying ? "⏸ Pause" : "▶ Play"}
        </button>

        <input
          className="time-machine-slider"
          type="range"
          min={0}
          max={lastIndex}
          value={currentIndex}
          onChange={(event) => {
            setIsPlaying(false);
            setCurrentIndex(Number(event.target.value));
          }}
        />

        <div className="time-machine-month">
          {formatMonth(data.month)}
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard title="MRR" value={formatMoney(kpis.mrr)} accent="green" />
        <KpiCard
          title="Active Customers"
          value={kpis.activeCustomers.toLocaleString("en-US")}
          accent="blue"
        />
        <KpiCard title="Net New MRR" value={formatMoney(netNewMrr)} accent="green" />
        <KpiCard
          title="Avg License Utilization"
          value={`${kpis.avgLicenseUtilization.toFixed(1)}%`}
          accent="purple"
        />
        <KpiCard
          title="Critical Tickets"
          value={String(kpis.criticalTickets)}
          accent="orange"
        />
      </div>
            {signals && signals.month === currentMonth ? (
        <p className="time-machine-note">
          🔔 {signals.summary.total} signals this month ·{" "}
          {signals.summary.risk} risk · {signals.summary.opportunity} opportunity
        </p>
      ) : (
        <p className="time-machine-note">🔔 Loading signals…</p>
      )}
      

      <p className="time-machine-note">
        Data snapshot · {formatMonth(data.month)} · Month {currentIndex + 1} of{" "}
        {months.length}
      </p>
    </div>
  );
}

export default TimeMachinePage;