"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";

type Point = { date: string; weightKg: number };

export default function WeightChart({ data }: { data: Point[] }) {
  if (!data.length) return <p className="text-sm text-neutral-600">No weight entries yet.</p>;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <LineChart data={data}>
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line dataKey="weightKg" type="monotone" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
