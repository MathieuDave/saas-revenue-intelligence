import "./RecommendedAction.css";

import type { CustomerActionData } from "../pages/Customer360Page";

type Props = {
  data: CustomerActionData;
};

function RecommendedAction({ data }: Props) {
  return (
    <div className="recommended-action">
      <span className="recommended-action-label">
        Recommended Action
      </span>

      <h3>{data.recommendedAction}</h3>

      <p>
        Priority category: <strong>{data.priorityCategory}</strong>
      </p>

      <p>
        Risk level: <strong>{data.riskLevel}</strong>
      </p>

      <p>
        Opportunity level:{" "}
        <strong>{data.opportunityLevel}</strong>
      </p>
    </div>
  );
}

export default RecommendedAction;