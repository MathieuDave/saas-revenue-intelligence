import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import type { CustomerRevenueData } from "../pages/Customer360Page";

type Props = {
  data: CustomerRevenueData[];
};

function formatMonth(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function CustomerRevenueChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="#e2e8f0"
        />

        <XAxis
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: "#64748b" }}
          tickFormatter={formatMonth}
        />

        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: "#64748b" }}
          tickFormatter={(value) =>
            `$${(value / 1000).toFixed(1)}K`
          }
        />

        <Tooltip
          labelFormatter={(value) =>
            formatMonth(String(value))
          }
          formatter={(value) => [
            `$${Number(value).toLocaleString()}`,
            "MRR",
          ]}
        />

        <Line
          type="monotone"
          dataKey="mrr"
          stroke="#3b82f6"
          strokeWidth={3}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default CustomerRevenueChart;