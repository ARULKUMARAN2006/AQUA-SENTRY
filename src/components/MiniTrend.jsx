import React from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

export default function MiniTrend({ data, color = '#06b6d4' }) {
  if (!data || data.length < 2) return <div className="mini-trend-placeholder" />;
  const d = data.slice(-20).map((p, i) => ({ i, v: p.value ?? p.v }));
  return (
    <div className="mini-trend">
      <ResponsiveContainer width="100%" height={40}>
        <LineChart data={d}>
          <YAxis hide domain={['auto', 'auto']} />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
