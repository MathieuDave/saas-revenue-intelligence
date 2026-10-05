import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { OpportunityLevelData } from "../pages/ExpansionPage";

type Props = {
  data: OpportunityLevelData[];
};

const colors: Record<string, string> = {
  "Very High": "#8b5cf6",
  High: "#3b82f6",
  Moderate: "#f59e0b",
  Low: "#10b981",
};

const opportunityOrder = [
  "Very High",
  "High",
  "Moderate",
  "Low",
];

function OpportunityDistributionChart({ data }: Props) {
  const sortedData = [...data].sort(
    (a, b) =>
      opportunityOrder.indexOf(a.opportunityLevel) -
      opportunityOrder.indexOf(b.opportunityLevel)
  );

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={sortedData}
        layout="vertical"
        margin={{
          top: 10,
          right: 20,
          bottom: 10,
          left: 25,
        }}
      >
        <CartesianGrid
          strokeDasharray="4 4"
          horizontal={false}
          stroke="#e2e8f0"
        />

        <XAxis
          type="number"
          axisLine={false}
          tickLine={false}
          tick={{
            fontSize: 12,
            fill: "#64748b",
          }}
        />

        <YAxis
          type="category"
          dataKey="opportunityLevel"
          width={90}
          axisLine={false}
          tickLine={false}
          tick={{
            fontSize: 12,
            fill: "#64748b",
          }}
        />

        <Tooltip
          formatter={(value) => [
            Number(value).toLocaleString(),
            "Accounts",
          ]}
          cursor={{
            fill: "rgba(148, 163, 184, 0.08)",
          }}
        />

        <Bar
          dataKey="accounts"
          name="Accounts"
          barSize={28}
          radius={[0, 6, 6, 0]}
        >
          {sortedData.map((entry) => (
            <Cell
              key={entry.opportunityLevel}
              fill={
                colors[entry.opportunityLevel] ??
                "#64748b"
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default OpportunityDistributionChart;