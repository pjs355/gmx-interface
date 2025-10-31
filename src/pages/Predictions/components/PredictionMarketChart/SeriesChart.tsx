import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import type { ChartDataPoint } from './types';

export function SeriesChart({ data, yesTeamColor, noTeamColor, isVsSingleMarket, tooltip, height = 300 }: {
  data: ChartDataPoint[];
  yesTeamColor: string;
  noTeamColor: string;
  isVsSingleMarket: boolean;
  tooltip: React.ReactElement | any;
  height?: number; // allow parent to control height for responsiveness
}) {
  return (
    <div style={{ width: '100%' }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 12, right: 12, left: 8, bottom: 48 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" horizontal vertical={false} />
          <XAxis 
            dataKey="displayTime" 
            allowDataOverflow 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#ffffff', fontSize: 10 }} 
            interval={data.length > 10 ? Math.floor(data.length / 5) : 0} 
            height={40} 
            angle={0} 
            textAnchor="middle"
            padding={{ left: 10, right: 10 }}
          />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#ffffff', fontSize: 11 }} tickFormatter={(value) => `${value}%`} width={40} />
          <Tooltip content={tooltip} />
          <ReferenceLine yAxisId="right" y={50} stroke="rgba(255, 255, 255, 0.3)" strokeDasharray="2 2" />
          <ReferenceLine yAxisId="right" y={25} stroke="rgba(255, 255, 255, 0.1)" strokeDasharray="1 1" />
          <ReferenceLine yAxisId="right" y={75} stroke="rgba(255, 255, 255, 0.1)" strokeDasharray="1 1" />
          <Line 
            yAxisId="right" 
            type="monotone" 
            dataKey="percentage" 
            stroke={isVsSingleMarket ? yesTeamColor : '#8b5cf6'} 
            strokeWidth={2}
            dot={false} 
            connectNulls 
            animationDuration={2000}
            animationEasing="ease-in-out"
            activeDot={{ r: 4, fill: isVsSingleMarket ? yesTeamColor : '#8b5cf6', stroke: '#ffffff', strokeWidth: 2 }} 
          />
          <Line 
            yAxisId="right" 
            type="monotone" 
            dataKey="secondPercentage" 
            stroke={isVsSingleMarket ? noTeamColor : '#3b82f6'} 
            strokeWidth={2}
            dot={false} 
            connectNulls 
            animationDuration={2000}
            animationEasing="ease-in-out"
            activeDot={{ r: 4, fill: isVsSingleMarket ? noTeamColor : '#3b82f6', stroke: '#ffffff', strokeWidth: 2 }} 
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}


