import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";

import AccountChat from "./AccountChat";
import { formatDate } from "./briefText";
import { fetchEvidence, type AccountEvidence, type MonthPoint } from "./evidenceApi";
import { EASE } from "./motionKit";
import "./EvidenceDrawer.css";

// =========================================================
// « SEE THE DATA » : LE TIROIR
// Les preuves d'un compte, sans rien après la date du brief.
// Rendu dans <body> (portail) : la carte qui l'ouvre est animée,
// et un élément « fixed » à l'intérieur d'un parent animé se décale.
// =========================================================

// 31920 → "$31,920"
function dollars(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

// "2026-08" → "Aug" ; "2026-08" → "August 2026"
function shortMonth(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}
function longMonth(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// "2026-08" → "August"
function monthOnly(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
}

// "2026-08-20" → "Aug 20"
function shortDate(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// La ligne d'info-bulle d'un mois de la courbe
function monthDetail(m: MonthPoint): string {
  if (m.signals.length > 0) return `Signals: ${m.signals.join(", ")}`;
  const parts: string[] = [];
  if (m.tickets > 0) parts.push(`${m.tickets} ${m.tickets === 1 ? "ticket" : "tickets"}`);
  if (m.feedback > 0) parts.push(`${m.feedback} feedback`);
  return parts.length > 0 ? parts.join(", ") : "No ticket, feedback or signal";
}

// Le revenu sur la période, constaté sans interprétation
function revenueLine(history: MonthPoint[]): { text: string; note: string | null } | null {
  const first = history[0];
  const last = history[history.length - 1];
  if (!first || !last) return null;

  if (first.monthlyRevenue === last.monthlyRevenue) {
    return {
      text: `${dollars(last.monthlyRevenue)} a month, unchanged since ${longMonth(first.month)}.`,
      note: null,
    };
  }

  const wentUp = last.monthlyRevenue > first.monthlyRevenue;
  const usageFell = first.utilizationPct - last.utilizationPct >= 10;
  return {
    text: `${dollars(first.monthlyRevenue)} a month in ${longMonth(first.month)}, ${dollars(
      last.monthlyRevenue
    )} in ${longMonth(last.month)}.`,
    note: wentUp && usageFell ? "Revenue went up while seat usage went down." : null,
  };
}

export default function EvidenceDrawer({
  customerId,
  companyName,
  asOf,
  onClose,
}: {
  customerId: string;
  companyName: string;
  asOf: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<AccountEvidence | null>(null);
  const [error, setError] = useState(false);
  const [hot, setHot] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // La dernière version de onClose, sans relancer l'effet du clavier à chaque rendu
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Les données du compte
  useEffect(() => {
    const controller = new AbortController();
    fetchEvidence(customerId, asOf, controller.signal)
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error(err);
        setError(true);
      });
    return () => controller.abort();
  }, [customerId, asOf]);

  // Accessibilité : le focus va sur « Close », Échap ferme, la page derrière ne défile plus
  useEffect(() => {
    closeRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const history = data?.history ?? [];
  const lastIndex = history.length - 1;
  const hotMonth = hot === null ? null : history[hot] ?? null;
  const revenue = data ? revenueLine(data.history) : null;
  const titleId = `evidence-${customerId}`;

  // Une colonne par mois (6 en général, moins pour un client récent)
  const columns = { gridTemplateColumns: `repeat(${Math.max(1, history.length)}, minmax(0, 1fr))` };

  return createPortal(
    <div className="edrawer-root">
      <motion.div
        className="edrawer__scrim"
        aria-hidden="true"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      />

      <motion.aside
        className="edrawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ x: "104%" }}
        animate={{ x: 0 }}
        exit={{ x: "104%" }}
        transition={{ duration: 0.38, ease: EASE }}
      >
        <header className="edrawer__head">
          <div>
            <div className="edrawer__kicker">See the data</div>
            <h2 className="edrawer__name" id={titleId}>
              {companyName}
            </h2>
            <div className="edrawer__meta">
              {data ? `${customerId} · ${data.industry} · ` : `${customerId} · `}
              Data up to {formatDate(asOf)}
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="edrawer__close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12" />
              <path d="M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="edrawer__body">
          {error && (
            <p className="edrawer__status">
              The account data could not load. Check that the backend is running, then try again.
            </p>
          )}

          {!error && !data && (
            <div className="edrawer__loading" aria-label="Loading">
              <div className="edrawer__sk edrawer__sk--facts" />
              <div className="edrawer__sk edrawer__sk--chart" />
              <div className="edrawer__sk edrawer__sk--line" />
              <div className="edrawer__sk edrawer__sk--line" />
            </div>
          )}

          {data && (
            <>
              {/* Les trois chiffres clés */}
              <div className="edrawer__facts">
                <div className="efact">
                  <strong>{dollars(data.arr)}</strong>
                  <span>a year, {dollars(data.monthlyRevenue)} a month</span>
                </div>
                <div className="efact">
                  <strong>
                    {data.activeUsers} of {data.licensedSeats}
                  </strong>
                  <span>seats in use in {monthOnly(asOf.slice(0, 7))}</span>
                </div>
                {/* Sous 30 jours, le renouvellement passe en ambre (même règle que les cartes) */}
                <div
                  className={
                    data.daysToRenewal !== null && data.daysToRenewal <= 30
                      ? "efact efact--urgent"
                      : "efact"
                  }
                >
                  <strong>{data.nextRenewal ? formatDate(data.nextRenewal) : "None"}</strong>
                  <span>
                    {data.daysToRenewal !== null
                      ? `renewal, in ${data.daysToRenewal} days`
                      : "no renewal on file"}
                  </span>
                </div>
              </div>

              {/* La courbe : une seule série, donc pas de légende de couleurs */}
              <section>
                <h3 className="edrawer__h">Seats in use, last {history.length} months</h3>
                <p className="edrawer__sub">License utilization each month. Hover or tab to a month for details.</p>

                <div className="echart">
                  <div className="echart__plot" style={columns}>
                    <div className="echart__grid" style={{ bottom: "50%" }}>
                      <span>50%</span>
                    </div>
                    <div className="echart__grid" style={{ bottom: "100%" }}>
                      <span>100%</span>
                    </div>

                    {history.map((m, index) => (
                      <button
                        key={m.month}
                        type="button"
                        className={hot === index ? "echart__col echart__col--hot" : "echart__col"}
                        aria-label={`${longMonth(m.month)}: ${m.utilizationPct}% of seats in use, ${m.activeUsers} of ${m.licensedSeats} active. ${monthDetail(m)}.`}
                        onMouseEnter={() => setHot(index)}
                        onMouseLeave={() => setHot(null)}
                        onFocus={() => setHot(index)}
                        onBlur={() => setHot(null)}
                      >
                        {(index === 0 || index === lastIndex) && (
                          <span
                            className="echart__value"
                            style={{ bottom: `calc(${m.utilizationPct}% + 6px)` }}
                          >
                            {m.utilizationPct}%
                          </span>
                        )}
                        <motion.span
                          className={index === lastIndex ? "echart__bar echart__bar--now" : "echart__bar"}
                          initial={{ height: "0%" }}
                          animate={{ height: `${m.utilizationPct}%` }}
                          transition={{ duration: 0.6, delay: 0.25 + index * 0.05, ease: EASE }}
                        />
                      </button>
                    ))}
                  </div>

                  <div className="echart__months" style={columns} aria-hidden="true">
                    {history.map((m) => (
                      <span key={m.month}>{shortMonth(m.month)}</span>
                    ))}
                  </div>

                  <div className="echart__marks" style={columns} aria-hidden="true">
                    {history.map((m) => (
                      <div key={m.month} className="echart__mk">
                        {m.tickets > 0 && <span className="epin epin--ticket">{m.tickets}</span>}
                        {m.feedback > 0 && <span className="epin epin--feedback">{m.feedback}</span>}
                        {m.signals.length > 0 && <span className="epin epin--signal">!</span>}
                      </div>
                    ))}
                  </div>

                  <div className="echart__key">
                    <span><span className="epin epin--ticket">n</span>support tickets</span>
                    <span><span className="epin epin--feedback">n</span>feedback</span>
                    <span><span className="epin epin--signal">!</span>an agent signal fired</span>
                  </div>

                  {hotMonth && (
                    <div className="echart__tip" role="status">
                      <strong>
                        {longMonth(hotMonth.month)} · {hotMonth.utilizationPct}% of seats in use
                      </strong>
                      <br />
                      {hotMonth.activeUsers} of {hotMonth.licensedSeats} seats active
                      <br />
                      {monthDetail(hotMonth)}
                    </div>
                  )}
                </div>

                {data.reading && <p className="edrawer__reading">{data.reading}</p>}
              </section>

              {/* Ce que les agents ont vu : chaque signal, avec sa propre phrase */}
              {data.signals.length > 0 && (
                <section>
                  <h3 className="edrawer__h">What your agents saw</h3>
                  <p className="edrawer__sub">The signals behind this card, most recent first.</p>
                  <ul className="esignals">
                    {data.signals.map((sig) => (
                      <li key={`${sig.month}-${sig.type}`}>
                        <div className="esignals__top">
                          <span
                            className={
                              sig.direction === "Opportunity"
                                ? "esignals__type esignals__type--growth"
                                : "esignals__type"
                            }
                          >
                            {sig.type}
                          </span>
                          <span className="esignals__month">{longMonth(sig.month)}</span>
                        </div>
                        <p className="esignals__text">{sig.description}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* La chronologie */}
              <section>
                <h3 className="edrawer__h">What happened</h3>
                <p className="edrawer__sub">
                  Tickets and feedback since {history[0] ? longMonth(history[0].month) : "the start"}, most recent first.
                </p>

                {data.events.length === 0 ? (
                  <p className="edrawer__empty">No ticket or feedback in this period.</p>
                ) : (
                  <ul className="etimeline">
                    {data.events.map((e, index) => {
                      const open = e.kind === "ticket" && e.detail.toLowerCase() !== "closed";
                      return (
                        <li key={`${e.date}-${index}`}>
                          <div className="etimeline__date">{shortDate(e.date)}</div>
                          <div>
                            <span
                              className={
                                e.kind === "feedback"
                                  ? "etimeline__kind etimeline__kind--feedback"
                                  : "etimeline__kind"
                              }
                            >
                              {e.kind === "feedback" ? "Feedback" : "Ticket"}
                            </span>
                            <span className="etimeline__title">{e.title}</span>
                            <span
                              className={
                                open ? "etimeline__status etimeline__status--open" : "etimeline__status"
                              }
                            >
                              {open
                                ? e.ageDays !== null
                                  ? `${e.detail} for ${e.ageDays} ${e.ageDays === 1 ? "day" : "days"}`
                                  : `Still ${e.detail.toLowerCase()}`
                                : e.detail}
                            </span>
                            {e.comment && <p className="etimeline__quote">“{e.comment}”</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* Le revenu */}
              {revenue && (
                <section>
                  <h3 className="edrawer__h">Revenue</h3>
                  <p className="edrawer__money">{revenue.text}</p>
                  {revenue.note && <p className="edrawer__sub">{revenue.note}</p>}
                </section>
              )}

              <p className="edrawer__source">
                Source: Databricks, monthly account health, support tickets and customer feedback.
                Nothing after {formatDate(asOf)} is shown, so this matches what your agents knew that
                morning.
              </p>

              {/* La conversation avec l'agent, sur ce compte seulement */}
              <AccountChat customerId={customerId} companyName={companyName} />
            </>
          )}
        </div>
      </motion.aside>
    </div>,
    document.body
  );
}