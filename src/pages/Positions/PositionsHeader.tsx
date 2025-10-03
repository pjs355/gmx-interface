// React import not required with automatic JSX runtime

export default function PositionsHeader({
  portfolioTotal,
  positionsTotalValue,
  usdcBalance,
  softLoading = false,
}: {
  portfolioTotal: number;
  positionsTotalValue: number;
  usdcBalance: number;
  softLoading?: boolean;
}) {
  return (
    <div className="flex items-end justify-start mb-36">
      <div className="flex items-end gap-32">
        <div>
          <div style={{ color: "#9CA3AF", fontSize: 14, textTransform: "uppercase", letterSpacing: 0.6 }}>Portfolio</div>
          <div style={{ color: "#fff", fontSize: 36, fontWeight: 900 }}>
            {softLoading ? (
              <span className="skeleton-box" style={{ display: 'inline-block', width: 160, height: 28, borderRadius: 6 }} />
            ) : (
              <>${portfolioTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
            )}
          </div>
        </div>
        <div>
          <div style={{ color: "#9CA3AF", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>Positions</div>
          <div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>
            {softLoading ? (
              <span className="skeleton-box" style={{ display: 'inline-block', width: 120, height: 18, borderRadius: 4 }} />
            ) : (
              <>${positionsTotalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
            )}
          </div>
        </div>
        <div>
          <div style={{ color: "#9CA3AF", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>Cash Balance</div>
          <div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>
            {softLoading ? (
              <span className="skeleton-box" style={{ display: 'inline-block', width: 100, height: 18, borderRadius: 4 }} />
            ) : (
              <>${Number(usdcBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


