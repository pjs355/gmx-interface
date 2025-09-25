import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import type { ChartDataPoint } from './types';

export function SeriesChart({ data, yesTeamColor, noTeamColor, isVsSingleMarket, tooltip }: {
  data: ChartDataPoint[];
  yesTeamColor: string;
  noTeamColor: string;
  isVsSingleMarket: boolean;
  tooltip: React.ReactElement | any;
}) {
  return (
    <div style={{ width: '100%' }}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 20, right: 20, left: 10, bottom: 55 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" horizontal vertical={false} />
          <XAxis dataKey="displayTime" axisLine={false} tickLine={false} tick={{ fill: '#ffffff', fontSize: 11 }} interval={data.length > 10 ? Math.floor(data.length / 6) : 0} height={50} angle={0} textAnchor="middle" />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#ffffff', fontSize: 12 }} tickFormatter={(value) => `${value}%`} width={45} />
          <Tooltip content={tooltip} />
          <ReferenceLine yAxisId="right" y={50} stroke="rgba(255, 255, 255, 0.3)" strokeDasharray="2 2" />
          <ReferenceLine yAxisId="right" y={25} stroke="rgba(255, 255, 255, 0.1)" strokeDasharray="1 1" />
          <ReferenceLine yAxisId="right" y={75} stroke="rgba(255, 255, 255, 0.1)" strokeDasharray="1 1" />
          <Line yAxisId="right" type="monotone" dataKey="percentage" stroke={isVsSingleMarket ? yesTeamColor : '#8b5cf6'} strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, fill: isVsSingleMarket ? yesTeamColor : '#8b5cf6', stroke: '#ffffff', strokeWidth: 2 }} />
          <Line yAxisId="right" type="monotone" dataKey="secondPercentage" stroke={isVsSingleMarket ? noTeamColor : '#3b82f6'} strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, fill: isVsSingleMarket ? noTeamColor : '#3b82f6', stroke: '#ffffff', strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}


