import "./SignalFeed.css";

import type { SignalEvent } from "./SignalFeed";

export type Situation = {
  customerId: string;
  companyName: string;
  industry: string;
  companySize: string;
  tier: 1 | 2 | 3;
  tierLabel: string;
  mrrAtStake: number;
  signals: SignalEvent[];
};

type SituationFeedProps = {
  situations: Situation[];
  limit?: number;
};

function formatMoney(value: number) {
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value}`;
}

// Couleur d'un signal individuel (pastille)
function signalVariant(signal: SignalEvent) {
  return signal.direction === "Opportunity"
    ? "opportunity"
    : signal.severity.toLowerCase();
}

// Couleur de la carte entière, selon le rang
function situationVariant(situation: Situation) {
  if (situation.tier === 1) return "critical";
  if (situation.tier === 3) return "info";

  const onlyOpportunities = situation.signals.every(
    (s) => s.direction === "Opportunity"
  );
  return onlyOpportunities ? "opportunity" : "high";
}

function SituationFeed({ situations, limit = 10 }: SituationFeedProps) {
  if (situations.length === 0) {
    return <p className="signal-feed-empty">No signals this month.</p>;
  }

  const visible = situations.slice(0, limit);
  const hiddenCount = situations.length - visible.length;

  return (
    <div className="signal-feed">
      {visible.map((situation) => {
        const variant = situationVariant(situation);

        return (
          <div
            key={situation.customerId}
            className={`signal-card signal-card--${variant}`}
          >
            {/* En-tête : client + rang */}
            <div className="signal-card-header">
              <div>
                <span className="signal-card-company">
                  {situation.companyName}
                </span>
                <div className="situation-meta">
                  {situation.industry} · {situation.companySize}
                </div>
              </div>

              <span className={`signal-badge signal-badge--${variant}`}>
                {situation.tierLabel}
              </span>
            </div>

            {/* Tous les signaux du client */}
            <ul className="situation-signals">
              {situation.signals.map((signal) => (
                <li key={signal.eventId} className="situation-signal">
                  <span
                    className={`signal-badge signal-badge--${signalVariant(signal)}`}
                  >
                    {signal.signalType}
                  </span>
                  <span>{signal.description}</span>
                </li>
              ))}
            </ul>

            {/* Pied : nombre de signaux + argent en jeu */}
            <div className="signal-card-footer">
              <span>
                {situation.signals.length} signal
                {situation.signals.length > 1 ? "s" : ""}
              </span>
              <span className="signal-card-mrr">
                {formatMoney(situation.mrrAtStake)} MRR at stake
              </span>
            </div>
          </div>
        );
      })}

      {hiddenCount > 0 && (
        <p className="signal-feed-more">
          + {hiddenCount} more situations this month
        </p>
      )}
    </div>
  );
}

export default SituationFeed;