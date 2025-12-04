import React, { useMemo, useRef } from 'react';
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

  // Calculate dynamic Y-axis domain based on data
  // "Hanging reload" - keep previous domain until new data is ready
  const prevYDomainRef = useRef<{ min: number; max: number; ticks: number[] }>({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] });
  
  const yAxisConfig = useMemo(() => {
    if (!data || data.length === 0) {
      // Return previous values while loading (hanging reload)
      return prevYDomainRef.current;
    }

    // Find min and max values from both percentage and secondPercentage
    let maxValue = 0;
    let minValue = 100;
    for (const point of data) {
      if (point.percentage !== null) {
        if (point.percentage > maxValue) maxValue = point.percentage;
        if (point.percentage < minValue) minValue = point.percentage;
      }
      if (point.secondPercentage !== null) {
        if (point.secondPercentage > maxValue) maxValue = point.secondPercentage;
        if (point.secondPercentage < minValue) minValue = point.secondPercentage;
      }
    }

    // Calculate the range and add buffer
    const range = maxValue - minValue;
    const buffer = Math.max(range * 0.1, 2); // At least 2% buffer or 10% of range
    
    // Round up max to nearest multiple of 5, with buffer
    const bufferedMax = maxValue + buffer;
    const roundedMax = Math.ceil(bufferedMax / 5) * 5;
    
    // Round down min to nearest multiple of 5, with buffer
    const bufferedMin = minValue - buffer;
    const roundedMin = Math.floor(bufferedMin / 5) * 5;
    
    // Clamp to valid percentage range (0-100)
    const finalMax = Math.min(100, roundedMax);
    const finalMin = Math.max(0, roundedMin);
    
    // Ensure we have at least a 10% range for readability
    const finalRange = finalMax - finalMin;
    let adjustedMin = finalMin;
    let adjustedMax = finalMax;
    if (finalRange < 10) {
      const midpoint = (finalMin + finalMax) / 2;
      adjustedMin = Math.max(0, Math.floor((midpoint - 5) / 5) * 5);
      adjustedMax = Math.min(100, Math.ceil((midpoint + 5) / 5) * 5);
    }

    // Generate ticks in increments of 5
    const yTicks: number[] = [];
    for (let i = adjustedMin; i <= adjustedMax; i += 5) {
      yTicks.push(i);
    }

    const result = { min: adjustedMin, max: adjustedMax, ticks: yTicks };
    prevYDomainRef.current = result;
    return result;
  }, [data]);

  // Generate reference lines at useful positions within the current range
  const referenceLines = useMemo(() => {
    const lines: { y: number; opacity: number }[] = [];
    const { min, max } = yAxisConfig;
    
    // Add reference line at 50% if it's within range
    if (min <= 50 && max >= 50) {
      lines.push({ y: 50, opacity: 0.3 });
    }
    
    // Add reference lines at 25% and 75% if within range
    if (min <= 25 && max >= 25) {
      lines.push({ y: 25, opacity: 0.1 });
    }
    if (min <= 75 && max >= 75) {
      lines.push({ y: 75, opacity: 0.1 });
    }
    
    // If range is narrow and doesn't include standard lines, add midpoint reference
    if (lines.length === 0) {
      const midpoint = Math.round((min + max) / 2 / 5) * 5;
      if (midpoint > min && midpoint < max) {
        lines.push({ y: midpoint, opacity: 0.2 });
      }
    }
    
    return lines;
  }, [yAxisConfig]);
  
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
                // 1W, All - show date only
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              }
            }}
            height={40} 
            angle={0} 
            textAnchor="middle"
            padding={{ left: 10, right: 10 }}
          />
          <YAxis 
            yAxisId="right" 
            orientation="right" 
            domain={[yAxisConfig.min, yAxisConfig.max]} 
            ticks={yAxisConfig.ticks}
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#ffffff', fontSize: 11 }} 
            tickFormatter={(value) => `${value}%`} 
            width={40} 
          />
          <Tooltip content={tooltip} />
          {referenceLines.map((line, idx) => (
            <ReferenceLine 
              key={idx}
              yAxisId="right" 
              y={line.y} 
              stroke={`rgba(255, 255, 255, ${line.opacity})`} 
              strokeDasharray={line.opacity >= 0.3 ? "2 2" : "1 1"} 
            />
          ))}
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


