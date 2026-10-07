import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";

import { EASE } from "./motionKit";
import "./MorningPicker.css";

// =========================================================
// CHOISIR LE MATIN : une pastille + un petit calendrier de mois.
// Chaque matin est le dernier jour d'un mois (le brief est mensuel).
// Les mois sont rangés par trimestre : c'est ainsi qu'un VP Revenue pense.
// =========================================================

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-08", -1 → "2026-07"
function shift(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2026, (m ?? 1) - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

// "2026-08" → la date du matin (le dernier jour du mois)
function morningDate(month: string): Date {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year ?? 2026, m ?? 1, 0));
}

// "2026-08" → "Monday, August 31, 2026"
function fullLabel(month: string): string {
  return morningDate(month).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// "2026-08" → "Mon, Aug 31" (la version courte, pour les petits écrans)
function shortLabel(month: string): string {
  return morningDate(month).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function yearOf(month: string): number {
  return Number(month.slice(0, 4));
}

function monthKey(year: number, index: number): string {
  return `${year}-${String(index + 1).padStart(2, "0")}`;
}

export default function MorningPicker({
  month,
  latest,
  earliest,
  onChange,
}: {
  month: string;
  latest: string;
  earliest: string;
  onChange: (month: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => yearOf(month));
  // Le mois qui a le focus clavier dans la grille
  const [focused, setFocused] = useState(month);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const panelId = useId();

  const isLatest = month === latest;
  const available = (m: string) => m >= earliest && m <= latest;

  function openPanel() {
    setYear(yearOf(month));
    setFocused(month);
    setOpen(true);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(m: string) {
    close(true);
    if (m !== month) onChange(m);
  }

  // Clic à l'extérieur : on ferme, sans voler le focus
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Le focus suit le mois actif (à l'ouverture et avec les flèches)
  useEffect(() => {
    if (open) cellRefs.current.get(focused)?.focus();
  }, [open, focused, year]);

  // Flèches : ←→ un mois, ↑↓ un trimestre (une ligne de la grille)
  function onGridKey(event: KeyboardEvent) {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const target = event.key === "Home" ? earliest : latest;
      setYear(yearOf(target));
      setFocused(target);
      return;
    }
    const delta = steps[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const next = shift(focused, delta);
    if (!available(next)) return;
    setYear(yearOf(next));
    setFocused(next);
  }

  // La cellule atteignable au clavier : le mois actif, ou le premier mois
  // disponible de l'année affichée si on a changé d'année
  const tabTarget =
    yearOf(focused) === year
      ? focused
      : ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => monthKey(year, i)).find(available) ?? focused);

  const minYear = yearOf(earliest);
  const maxYear = yearOf(latest);

  return (
    <div className="mpick" ref={rootRef}>
      {/* Le matin d'avant (plus ancien) */}
      <button
        type="button"
        className="mpick__step"
        onClick={() => onChange(shift(month, -1))}
        disabled={month <= earliest}
        aria-label="Previous morning"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>

      <button
        ref={triggerRef}
        type="button"
        className={open ? "mpick__trigger mpick__trigger--open" : "mpick__trigger"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close(false) : openPanel())}
      >
        <svg className="mpick__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        <span className="mpick__label mpick__label--full">{fullLabel(month)}</span>
        <span className="mpick__label mpick__label--short">{shortLabel(month)}</span>
        {isLatest ? (
          <span className="mpick__badge">Latest</span>
        ) : (
          <span className="mpick__badge mpick__badge--past">Past</span>
        )}
        <svg className="mpick__chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Le matin d'après (plus récent) */}
      <button
        type="button"
        className="mpick__step"
        onClick={() => onChange(shift(month, 1))}
        disabled={isLatest}
        aria-label="Next morning"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            className="mpick__panel"
            role="dialog"
            aria-label="Choose a morning"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: EASE }}
          >
            {/* L'année : on la change avec les flèches */}
            <div className="mpick__head">
              <button
                type="button"
                className="mpick__year-step"
                onClick={() => setYear(year - 1)}
                disabled={year <= minYear}
                aria-label="Previous year"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={year}
                  className="mpick__year"
                  aria-live="polite"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  {year}
                </motion.span>
              </AnimatePresence>
              <button
                type="button"
                className="mpick__year-step"
                onClick={() => setYear(year + 1)}
                disabled={year >= maxYear}
                aria-label="Next year"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>

            {/* Une ligne par trimestre, trois matins par ligne */}
            <div className="mpick__grid" role="grid" aria-label={`Mornings of ${year}`} onKeyDown={onGridKey}>
              {[0, 1, 2, 3].map((q) => (
                <div className="mpick__row" role="row" key={q}>
                  <span className="mpick__quarter" role="rowheader">
                    Q{q + 1}
                  </span>
                  {[0, 1, 2].map((i) => {
                    const index = q * 3 + i;
                    const m = monthKey(year, index);
                    const enabled = available(m);
                    const selected = m === month;
                    const classes = ["mpick__cell"];
                    if (selected) classes.push("mpick__cell--on");
                    if (m === latest) classes.push("mpick__cell--latest");
                    return (
                      <button
                        key={m}
                        ref={(el: HTMLButtonElement | null) => {
                          if (el) cellRefs.current.set(m, el);
                          else cellRefs.current.delete(m);
                        }}
                        type="button"
                        role="gridcell"
                        className={classes.join(" ")}
                        disabled={!enabled}
                        aria-selected={selected}
                        aria-label={`${fullLabel(m)}${m === latest ? ", latest morning" : ""}`}
                        tabIndex={m === tabTarget ? 0 : -1}
                        onClick={() => choose(m)}
                        onFocus={() => setFocused(m)}
                      >
                        <span className="mpick__month">{MONTHS[index]}</span>
                        <span className="mpick__day">{morningDate(m).getUTCDate()}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="mpick__foot">
              <span className="mpick__hint">
                <span className="mpick__dot" aria-hidden="true" /> Latest morning
              </span>
              {!isLatest && (
                <button type="button" className="mpick__jump" onClick={() => choose(latest)}>
                  Back to latest
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
