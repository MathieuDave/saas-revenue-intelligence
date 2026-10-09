import { useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { QuarterGoal } from "./types";
import { formatMoney, shortQuarter } from "./briefText";
import { EASE } from "./motionKit";
import "./GoalMath.css";

// =========================================================
// « HOW ARE THESE NUMBERS CALCULATED? »
// Le calcul de l'objectif et de la prévision, étape par étape,
// avec les vrais chiffres du matin. Tout vient de GET /api/brief :
// le serveur envoie déjà les trimestres utilisés et le « mois typique ».
// =========================================================

// "2025-Q3" → "Q3 2025"
function quarterLabel(quarter: string): string {
  const [year, q] = quarter.split("-");
  return `${q} ${year}`;
}

type Line = { label: string; value: string; total?: boolean };

export default function GoalMath({ goal }: { goal: QuarterGoal }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const basedOn = goal.basedOn ?? [];
  if (!goal.available || basedOn.length === 0) return null;

  const thisQ = shortQuarter(goal.quarter);
  const goalArr = goal.goalArr ?? 0;
  const booked = goal.bookedArr ?? 0;
  const forecast = goal.forecastArr ?? 0;
  const typicalMonth = goal.typicalMonthArr ?? 0;
  const monthsLeft = goal.monthsRemaining ?? 0;

  // La moyenne des trimestres, et la croissance ajoutée par-dessus
  const average = basedOn.reduce((sum, q) => sum + q.netNewArr, 0) / basedOn.length;
  const growthPct = average > 0 ? Math.round((100 * goalArr) / average - 100) : 0;

  const goalLines: Line[] = [
    ...basedOn.map((q) => ({ label: quarterLabel(q.quarter), value: formatMoney(q.netNewArr) })),
    { label: `Average of these ${basedOn.length} quarters`, value: formatMoney(average) },
    { label: `Plus ${growthPct}% growth`, value: `× ${(1 + growthPct / 100).toFixed(2)}` },
    { label: `${thisQ} goal`, value: formatMoney(goalArr), total: true },
  ];

  const forecastLines: Line[] = [
    { label: `Booked so far in ${thisQ}`, value: formatMoney(booked) },
    { label: "A typical month (the average quarter ÷ 3)", value: formatMoney(typicalMonth) },
    { label: "Full months left in the quarter", value: `× ${monthsLeft}` },
    { label: "Forecast at a typical pace", value: formatMoney(forecast), total: true },
  ];

  return (
    <div className="gmath">
      <button
        type="button"
        className="gmath__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide the calculation" : "How are these numbers calculated?"}
        <svg
          className="gmath__chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            className="gmath__panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <div className="gmath__inner">
              <div className="gmath__cols">
                <Steps title={`The ${thisQ} goal`} lines={goalLines} />
                <Steps title="The forecast" lines={forecastLines} />
              </div>
              <p className="gmath__note">
                A simple rule you can check by hand, not a predictive model. It assumes the rest of
                the quarter books like an average month of the last {basedOn.length} quarters.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Une colonne de calcul : les lignes apparaissent l'une après l'autre
function Steps({ title, lines }: { title: string; lines: Line[] }) {
  return (
    <div className="gmath__col">
      <h4 className="gmath__title">{title}</h4>
      <ol className="gmath__lines">
        {lines.map((line, index) => (
          <motion.li
            key={line.label}
            className={line.total ? "gmath__line gmath__line--total" : "gmath__line"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.08 + index * 0.06, ease: EASE }}
          >
            <span>{line.label}</span>
            <strong>{line.value}</strong>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
