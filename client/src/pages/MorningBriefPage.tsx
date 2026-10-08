import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { MotionConfig, motion } from "motion/react";

import type { BriefResponse, QuarterGoal } from "../brief/types";
import {
  countWord,
  formatMoney,
  shortQuarter,
} from "../brief/briefText";
import DecisionDesk from "../brief/DecisionDesk";
import AgentsStrip, { type FollowUpSummary } from "../brief/AgentsStrip";
import { fetchDecisions } from "../brief/decisionsApi";
import TrustLine from "../brief/TrustLine";
import MorningTiles from "../brief/MorningTiles";
import MorningPicker from "../brief/MorningPicker";
import GoalMath from "../brief/GoalMath";
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

// La phrase sous le titre : courte. Les chiffres détaillés sont dans les tuiles.
function buildLede(brief: BriefResponse, deskCount: number): string {
  const { goal } = brief;
  const decisions =
    deskCount === 0
      ? "Nothing needs your decision today."
      : deskCount === 1
        ? "One decision is waiting for you."
        : `${countWord(deskCount)} decisions are waiting for you.`;

  if (!goal.available) {
    return `There is not enough history yet to set a quarterly goal. ${decisions}`;
  }

  const booked = `You have booked ${goal.pctBooked}% of the goal, with ${goal.daysLeft} days left.`;
  // Sous l'objectif : on ajoute où la tendance mène le trimestre
  const pace =
    (goal.pctForecast ?? 0) < 100
      ? ` At a typical pace, the quarter closes at ${goal.pctForecast}%.`
      : "";
  return `${booked}${pace} ${decisions}`;
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
// L'OBJECTIF DU TRIMESTRE : trois tuiles lisibles + le rail
// La pastille de chaque tuile a la couleur de sa partie du rail.
// =========================================================

function GoalTrack({ goal, play }: { goal: QuarterGoal; play: boolean }) {
  if (!goal.available) return null;

  const goalArr = goal.goalArr ?? 0;
  const booked = goal.bookedArr ?? 0;
  const forecast = goal.forecastArr ?? 0;
  const reached = (goal.pctForecast ?? 0) >= 100;

  // L'échelle laisse un peu d'air après la valeur la plus haute
  const scale = Math.max(goalArr, forecast) * 1.04;
  const pct = (value: number) => `${(100 * value) / scale}%`;

  return (
    <figure className="goal">
      <div className="goal__tiles">
        <div className="goal__tile">
          <div className="goal__label">
            <span className="goal__swatch goal__swatch--booked" aria-hidden="true" />
            Booked so far
          </div>
          <div className="goal__num">
            <CountUp value={booked} play={play} delay={0.5} format={formatMoney} />
          </div>
          <div className="goal__note">{goal.pctBooked}% of the goal</div>
        </div>

        <div className="goal__tile">
          <div className="goal__label">
            <span className="goal__swatch goal__swatch--goal" aria-hidden="true" />
            {shortQuarter(goal.quarter)} goal
          </div>
          <div className="goal__num">
            <CountUp value={goalArr} play={play} delay={0.5} format={formatMoney} />
          </div>
          <div className="goal__note">
            {goal.daysLeft} {goal.daysLeft === 1 ? "day" : "days"} left in the quarter
          </div>
        </div>

        <div className="goal__tile">
          <div className="goal__label">
            <span className="goal__swatch goal__swatch--forecast" aria-hidden="true" />
            Forecast at a typical pace
          </div>
          <div className="goal__num">
            <CountUp value={forecast} play={play} delay={0.7} format={formatMoney} />
          </div>
          <div className={reached ? "goal__note goal__note--good" : "goal__note goal__note--short"}>
            {reached
              ? `${goal.pctForecast}% of the goal`
              : `${goal.pctForecast}% of the goal, ${formatMoney(goalArr - forecast)} short`}
          </div>
        </div>
      </div>

      {/* Les barres se remplissent pendant l'ouverture */}
      <div className="goal__rail" aria-hidden="true">
        <motion.div
          className="goal__forecast"
          initial={{ width: play ? "0%" : pct(forecast) }}
          animate={{ width: pct(forecast) }}
          transition={{ duration: 1, delay: play ? 0.7 : 0, ease: EASE }}
        />
        <motion.div
          className="goal__booked"
          initial={{ width: play ? "0%" : pct(booked) }}
          animate={{ width: pct(booked) }}
          transition={{ duration: 0.9, delay: play ? 0.5 : 0, ease: EASE }}
        />
        <div className="goal__mark" style={{ left: pct(goalArr) }} />
      </div>

      <figcaption className="goal__method">How the goal is set: {goal.method}.</figcaption>
      <GoalMath goal={goal} />
    </figure>
  );
}

// =========================================================
// LA PAGE
// =========================================================

function MorningBriefPage() {
  // Le matin affiché vient de l'adresse (?month=2026-07)
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const month = readMonth(searchParams.get("month"));
  const isLatest = month === LATEST_MONTH;

  // Le sens du changement de matin : -1 vers le passé, +1 vers le présent.
  // Un ref (et non un state) : il ne doit pas provoquer de nouveau rendu.
  const shownMonth = useRef<string | null>(null);
  const direction = useRef(0);

  // Ce que la section de suivi a trouvé, pour la bande des agents
  const [followUps, setFollowUps] = useState<FollowUpSummary | null>(null);

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

    // Un matin plus récent arrivera par la droite, un plus ancien par la gauche
    if (shownMonth.current !== null && shownMonth.current !== month) {
      direction.current = month > shownMonth.current ? 1 : -1;
    }
    shownMonth.current = month;

    // Nouveau matin : on repart d'une page vide (le squelette s'affiche)
    setBrief(null);
    setError(null);
    setDecisions([]);
    setFollowUps(null);

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

  const ready = brief !== null && !booting;

  return (
    // reducedMotion="user" : Motion coupe les déplacements si l'utilisateur le demande
    <MotionConfig reducedMotion="user">
    <div className="brief">
      <div className="brief__inner">
        <header className="brief__topbar">
          <span className="brief__brand">RevenueAI</span>
          {/* Choisir le matin : la pastille, ses flèches et son calendrier */}
          <MorningPicker
            month={month}
            latest={LATEST_MONTH}
            earliest={EARLIEST_MONTH}
            onChange={(chosen) =>
              navigate(chosen === LATEST_MONTH ? "/brief" : `/brief?month=${chosen}`)
            }
          />

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
          // key : changer de matin recrée toute la page (pile, cartes, sections).
          // La page glisse depuis le côté du matin choisi.
          <motion.main
            className="brief__main"
            key={brief.month}
            initial={{ opacity: 0, x: direction.current * 48 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
          >
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

                {/* Ce que les agents ont fait cette nuit : se ferme une fois lu */}
                <Reveal play={play} delay={0.6}>
                  <AgentsStrip brief={brief} deskCount={desk.length} followUps={followUps} />
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

              {/* Le reste du matin : 4 tuiles, un panneau à la fois */}
              <Reveal play={play} delay={1.0}>
                <MorningTiles
                  brief={brief}
                  desk={desk}
                  decisions={decisions}
                  team={team}
                  onFollowUps={setFollowUps}
                />
              </Reveal>
          </motion.main>
        )}
      </div>
    </div>
    </MotionConfig>
  );
}

export default MorningBriefPage;
