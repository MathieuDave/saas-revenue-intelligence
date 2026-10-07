import "./SignalFeed.css";

export type SignalEvent = {
  eventId: string;
  customerId: string;
  companyName: string;
  industry: string;
  companySize: string;
  signalType: string;
  direction: string;
  timing: string;
  severity: string;
  description: string;
  mrrAtStake: number;
};

type SignalFeedProps = {
  events: SignalEvent[];
  limit?: number; // nombre maximum de cartes affichées
};

function formatMoney(value: number) {
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value}`;
}

function SignalFeed({ events, limit = 10 }: SignalFeedProps) {
  if (events.length === 0) {
    return (
      <p className="signal-feed-empty">
        No signals this month.
      </p>
    );
  }

  const visibleEvents = events.slice(0, limit);
  const hiddenCount = events.length - visibleEvents.length;

  return (
    <div className="signal-feed">
      {visibleEvents.map((event) => {
        // Couleur de la carte : vert pour une opportunité,
        // sinon selon la sévérité (critical / high / medium)
        const variant =
          event.direction === "Opportunity"
            ? "opportunity"
            : event.severity.toLowerCase();

        return (
          <div
            key={event.eventId}
            className={`signal-card signal-card--${variant}`}
          >
            <div className="signal-card-header">
              <span className="signal-card-company">
                {event.companyName}
              </span>

              <span className={`signal-badge signal-badge--${variant}`}>
                {event.signalType}
              </span>
            </div>

            <p className="signal-card-description">
              {event.description}
            </p>

            <div className="signal-card-footer">
              <span>
                {event.severity} · {event.timing} signal
              </span>
              <span className="signal-card-mrr">
                {formatMoney(event.mrrAtStake)} MRR at stake
              </span>
            </div>
          </div>
        );
      })}

      {hiddenCount > 0 && (
        <p className="signal-feed-more">
          + {hiddenCount} more signals this month
        </p>
      )}
    </div>
  );
}

export default SignalFeed;