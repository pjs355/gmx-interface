import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import type { ChartDataPoint } from './types';

export function SeriesChart({ data, yesTeamColor, noTeamColor, isVsSingleMarket, tooltip, height = 300, timeRangeSeconds }: {
  data: ChartDataPoint[];
  yesTeamColor: string;
  noTeamColor: string;
  isVsSingleMarket: boolean;
  tooltip: React.ReactElement | any;
  height?: number;
  timeRangeSeconds?: number; // Time range in seconds for fixed domain
}) {
  // Calculate fixed time domain
  const now = Math.floor(Date.now() / 1000);
  const domainStart = timeRangeSeconds ? now - timeRangeSeconds : undefined;
  const domainEnd = now;
  
  // Generate tick positions for fixed intervals
  const ticks = timeRangeSeconds && domainStart ? [
    domainStart,
    domainStart + Math.floor(timeRangeSeconds / 2),
    domainEnd
  ] : undefined;
  
  return (
    <div style={{ width: '100%' }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 12, right: 12, left: 30, bottom: 48 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" horizontal vertical={false} />
          <XAxis 
            dataKey="timestamp"
            type="number"
            domain={timeRangeSeconds ? [domainStart, domainEnd] : ['auto', 'auto']}
            ticks={ticks}
            scale="time"
            allowDataOverflow
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#ffffff', fontSize: 10 }} 
            tickFormatter={(timestamp) => {
              const date = new Date(timestamp * 1000);
              if (timeRangeSeconds && timeRangeSeconds <= 3600) {
                // 1H - show time only
                return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
              } else if (timeRangeSeconds && timeRangeSeconds <= 86400) {
                // 1D - show date and time (compact format)
                const month = date.getMonth() + 1;
                const day = date.getDate();
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                return `${month}/${day} ${hours}:${minutes}`;
              } else {
                // 1W, 1M - show date only
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              }
            }}
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


