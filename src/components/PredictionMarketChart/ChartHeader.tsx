import React from 'react';

export function ChartHeader({
  primaryTitle,
  secondaryTitle,
  currentPrimary,
  currentSecondary,
  showPrimaryLive,
  showSecondaryLive,
  yesTeamColor,
  noTeamColor,
  isVsSingleMarket,
}: {
  primaryTitle: string;
  secondaryTitle: string | null;
  currentPrimary: number;
  currentSecondary: number;
  showPrimaryLive: boolean;
  showSecondaryLive: boolean;
  yesTeamColor: string;
  noTeamColor: string;
  isVsSingleMarket: boolean;
}) {
  return (
    <div className="chart-header">
      <div className="chart-titles">
        <div className="market-info primary-market">
          <h3>{primaryTitle}</h3>
          <div className="current-price">
            <span className="price-value primary-price" style={isVsSingleMarket ? { color: yesTeamColor } : undefined}>{Math.round(currentPrimary)}%</span>
            {showPrimaryLive && (
              <span className="live-indicator primary-indicator" style={isVsSingleMarket ? { color: yesTeamColor } : undefined}>●</span>
            )}
          </div>
        </div>

        {secondaryTitle && (
          <div className="market-info second-market">
            <h3>{secondaryTitle}</h3>
            <div className="current-price">
              <span className="price-value second-price" style={isVsSingleMarket ? { color: noTeamColor } : undefined}>{Math.round(currentSecondary)}%</span>
              {showSecondaryLive && (
                <span className="live-indicator second-indicator" style={isVsSingleMarket ? { color: noTeamColor } : undefined}>●</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
