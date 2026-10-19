import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import type { CustomerUsageData } from "../pages/Customer360Page";
import { useChartHeight } from "./useChartHeight";

type Props = {
  data: CustomerUsageData[];
};

function formatMonth(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function CustomerUsageChart({ data }: Props) {
  const chartHeight = useChartHeight(300, 200);
  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
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
          domain={[0, 100]}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: "#64748b" }}
          tickFormatter={(value) => `${value}%`}
        />

        <Tooltip
          labelFormatter={(value) =>
            formatMonth(String(value))
          }
          formatter={(value) => [
            `${Number(value).toFixed(1)}%`,
            "License Utilization",
          ]}
        />

        <Line
          type="monotone"
          dataKey="licenseUtilization"
          stroke="#f97316"
          strokeWidth={3}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default CustomerUsageChart;