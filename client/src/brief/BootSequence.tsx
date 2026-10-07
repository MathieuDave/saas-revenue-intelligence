import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { EASE } from "./motionKit";
import "./BootSequence.css";

// =========================================================
// L'OUVERTURE : LA PAGE S'ASSEMBLE
// Un squelette calme pendant que les données arrivent, et une
// ligne de statut qui dit ce que le système fait vraiment.
// =========================================================

const STEP_MS = 320; // le temps de lecture de chaque étape

export default function BootSequence({
  lines,
  onDone,
}: {
  // null tant que l'API n'a pas répondu
  lines: string[] | null;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);

  // Les étapes défilent une à une, puis l'ouverture se termine
  useEffect(() => {
    if (!lines) return;
    if (step >= lines.length) {
      const done = window.setTimeout(onDone, 350);
      return () => window.clearTimeout(done);
    }
    const next = window.setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => window.clearTimeout(next);
  }, [lines, step, onDone]);

  const current = lines ? lines[Math.min(step, lines.length - 1)] : "Connecting to Databricks…";

  return (
    <div className="boot" aria-live="polite">
      <div className="boot__status">
        <span className="boot__dot" aria-hidden="true" />
        <AnimatePresence mode="wait">
          <motion.span
            key={current}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: EASE }}
          >
            {current}
          </motion.span>
        </AnimatePresence>
      </div>
      <button type="button" className="boot__skip" onClick={onDone}>
        Skip
      </button>
    </div>
  );
}

// Le squelette : la forme de la page, avant les données
export function BriefSkeleton() {
  return (
    <div className="skeleton" aria-hidden="true">
      <div className="skeleton__line skeleton__line--xl" />
      <div className="skeleton__line skeleton__line--xl skeleton__line--short" />
      <div className="skeleton__line skeleton__line--md" />
      <div className="skeleton__line skeleton__line--md skeleton__line--short" />
      <div className="skeleton__rail" />
      <div className="skeleton__card" />
    </div>
  );
}