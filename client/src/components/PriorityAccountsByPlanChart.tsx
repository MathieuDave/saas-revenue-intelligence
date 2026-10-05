import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ExpansionPlanData } from "../pages/ExpansionPage";

type Props = {
  data: ExpansionPlanData[];
};

function PriorityAccountsByPlanChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        margin={{
          top: 10,
          right: 20,
          bottom: 5,
          left: 10,
        }}
      >
        <CartesianGrid
          strokeDasharray="4 4"
          vertical={false}
          stroke="#e2e8f0"
        />

        <XAxis
          dataKey="plan"
          axisLine={false}
          tickLine={false}
          tick={{
            fontSize: 12,
            fill: "#64748b",
          }}
        />

        <YAxis
          allowDecimals={false}
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
            "Priority Accounts",
          ]}
          cursor={{
            fill: "rgba(148, 163, 184, 0.08)",
          }}
        />

        <Bar
          dataKey="accounts"
          name="Priority Accounts"
          fill="#3b82f6"
          maxBarSize={90}
          radius={[6, 6, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default PriorityAccountsByPlanChart;