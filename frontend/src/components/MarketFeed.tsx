"use client";
import { isExpired } from "@/lib/genlayer";

interface Props {
  markets: any[];
  selected: any | null;
  onSelect: (m: any) => void;
}

export default function MarketFeed({ markets, selected, onSelect }: Props) {
  return (
    <div>
      {markets.map((m) => {
        const totalPool = (Number(m.total_yes) + Number(m.total_no)) / 1e18;
        const yesPool   = Number(m.total_yes) / 1e18;
        const yesPct    = totalPool > 0 ? Math.round((yesPool / totalPool) * 100) : 50;
        const expired   = isExpired(m.deadline);
        const isActive  = selected?.id === m.id;

        const statusLabel = m.resolved ? "DONE" : expired ? "RESOLVE" : "OPEN";
        const statusColor = m.resolved
          ? "var(--indigo)"
          : expired
          ? "var(--amber)"
          : "var(--green)";
        const statusBg = m.resolved
          ? "var(--indigo-bg)"
          : expired
          ? "var(--amber-bg)"
          : "var(--green-bg)";
        const statusBr = m.resolved
          ? "var(--indigo-br)"
          : expired
          ? "var(--amber-br)"
          : "var(--green-br)";

        const barColor = m.resolved
          ? "var(--indigo)"
          : expired
          ? "var(--amber)"
          : "var(--green)";

        // Extract bare domain for display
        let domain = m.resolution_url || "";
        try { domain = new URL(m.resolution_url).hostname.replace("www.", ""); } catch {}

        return (
          <div
            key={m.id}
            onClick={() => onSelect(m)}
            style={{
              borderBottom: "1px solid var(--border)",
              padding: "14px 20px",
              cursor: "pointer",
              background: isActive ? "var(--bg2)" : "transparent",
              borderLeft: isActive ? "2px solid var(--green)" : "2px solid transparent",
              transition: "background 0.1s",
            }}
          >
            {/* Top row */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "8px" }}>
              <div style={{ fontSize: "12px", color: "var(--text)", lineHeight: "1.4", flex: 1, fontWeight: 400 }}>
                {m.question}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{
                  fontFamily: "var(--mono)",
                  fontSize: m.resolved ? "12px" : "18px",
                  fontWeight: 300,
                  color: m.resolved ? "var(--indigo)" : "var(--green)",
                  lineHeight: 1,
                }}>
                  {m.resolved ? (m.outcome ? "YES" : "NO") : `${yesPct}%`}
                </div>
                {!m.resolved && (
                  <div style={{ fontFamily: "var(--mono)", fontSize: "9px", color: "var(--text5)", marginTop: "2px" }}>
                    YES
                  </div>
                )}
              </div>
            </div>

            {/* Meta row */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {m.is_demo && (
                <span style={{
                  fontFamily: "var(--mono)", fontSize: "8px",
                  letterSpacing: "0.06em",
                  color: "var(--amber)",
                  background: "var(--amber-bg)",
                  border: "1px solid var(--amber-br)",
                  padding: "2px 6px",
                  borderRadius: "2px",
                }}>
                  DEMO
                </span>
              )}
              <span style={{
                fontFamily: "var(--mono)", fontSize: "8px",
                letterSpacing: "0.06em",
                color: statusColor,
                background: statusBg,
                border: `1px solid ${statusBr}`,
                padding: "2px 6px",
                borderRadius: "2px",
              }}>
                {statusLabel}
              </span>
              <span style={{
                fontFamily: "var(--mono)", fontSize: "9px",
                color: "var(--text5)",
                display: "flex", alignItems: "center", gap: "4px",
              }}>
                <span style={{ width: "3px", height: "3px", background: "var(--text5)", borderRadius: "50%", display: "inline-block" }} />
                {domain}
              </span>
              <span style={{ fontFamily: "var(--mono)", fontSize: "9px", color: "var(--text5)", marginLeft: "auto" }}>
                {totalPool.toFixed(3)} GEN
              </span>
            </div>

            {/* Bar */}
            <div style={{ height: "1px", background: "var(--border)", marginTop: "10px", position: "relative" }}>
              <div style={{ position: "absolute", top: 0, left: 0, width: `${yesPct}%`, height: "1px", background: barColor }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
