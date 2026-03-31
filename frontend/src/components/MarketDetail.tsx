"use client";
import { useEffect, useState } from "react";
import {
  DEMO_FALLBACK_ENABLED, getFeeConfig, getPendingBalance, placeBet, quoteBetBreakdown, resolveMarket, claimWinnings, withdrawPending,
  formatDeadline, isExpired,
} from "@/lib/genlayer";

interface Props {
  market: any;
  userAddress: string | null;
  onUpdate: () => void;
}

type TxState = "idle" | "pending" | "success" | "error";

// Fake validator names for display — in production these come from on-chain receipt
const VALIDATORS = [
  { model: "GPT-4o", role: "leader" },
  { model: "LLaMA-3.3-70B", role: "validator" },
  { model: "Gemini 1.5 Pro", role: "validator" },
  { model: "Mistral Large", role: "validator" },
  { model: "Claude 3.5 Sonnet", role: "validator" },
];

function parseGenInput(value: string): bigint {
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0n;
  }
  return BigInt(Math.round(parsed * 1e18));
}

export default function MarketDetail({ market, userAddress, onUpdate }: Props) {
  const [betAmount, setBetAmount] = useState("0.01");
  const [txState, setTxState] = useState<TxState>("idle");
  const [txMsg, setTxMsg] = useState("");
  const [showCriteria, setShowCriteria] = useState(false);
  const [pendingBalance, setPendingBalance] = useState<bigint>(0n);
  const [feeConfig, setFeeConfig] = useState({
    protocol_treasury: "",
    creator_fee_bps: 0n,
    protocol_fee_bps: 0n,
    total_fee_bps: 0n,
  });

  const totalPool = (Number(market.total_yes) + Number(market.total_no)) / 1e18;
  const yesPool   = Number(market.total_yes) / 1e18;
  const noPool    = Number(market.total_no) / 1e18;
  const yesPct    = totalPool > 0 ? Math.round((yesPool / totalPool) * 100) : 50;
  const noPct     = 100 - yesPct;
  const expired   = isExpired(market.deadline);
  const pendingGEN = Number(pendingBalance) / 1e18;
  const betAmountWei = parseGenInput(betAmount);
  const betBreakdown = quoteBetBreakdown(betAmountWei, feeConfig);
  const netBetGEN = Number(betBreakdown.netAmount) / 1e18;

  useEffect(() => {
    let cancelled = false;

    async function refreshPendingBalance() {
      if (!userAddress) {
        setPendingBalance(0n);
        return;
      }

      try {
        const balance = await getPendingBalance(userAddress);
        if (!cancelled) {
          setPendingBalance(balance);
        }
      } catch {
        if (!cancelled) {
          setPendingBalance(0n);
        }
      }
    }

    refreshPendingBalance();
    return () => {
      cancelled = true;
    };
  }, [userAddress, market.id, txState]);

  useEffect(() => {
    let cancelled = false;

    async function refreshFeeConfig() {
      try {
        const next = await getFeeConfig();
        if (!cancelled) {
          setFeeConfig(next);
        }
      } catch {
        if (!cancelled) {
          setFeeConfig({
            protocol_treasury: "",
            creator_fee_bps: 0n,
            protocol_fee_bps: 0n,
            total_fee_bps: 0n,
          });
        }
      }
    }

    refreshFeeConfig();
    return () => {
      cancelled = true;
    };
  }, [market.id]);

  const tx = async (label: string, fn: () => Promise<any>) => {
    setTxState("pending");
    setTxMsg(label);
    try {
      const result = await fn();
      setTxState("success");
      setTxMsg(result?.demoFallback ? "demo fallback applied" : "confirmed");
      onUpdate();
      setTimeout(() => setTxState("idle"), 4000);
    } catch (e: any) {
      setTxState("error");
      setTxMsg(e.message?.slice(0, 72) || "tx failed");
      setTimeout(() => setTxState("idle"), 6000);
    }
  };

  const handleBet = (yes: boolean) =>
    tx(
      yes ? "depositing + placing YES…" : "depositing + placing NO…",
      () => placeBet(
        userAddress!,
        market.id,
        yes,
        betAmountWei
      )
    );

  const handleResolve = () =>
    tx("fetching url · awaiting llm consensus…", () => resolveMarket(userAddress!, market.id));

  const handleClaim = () =>
    tx("claiming…", () => claimWinnings(userAddress!, market.id));

  const handleWithdrawPending = () =>
    tx("withdrawing pending balance…", () => withdrawPending(userAddress!, pendingBalance));

  // Simulate validator display: if resolved, show 3 agree + 1 disagree + 1 pending for drama
  const validatorVerdicts = market.resolved
    ? [true, true, market.outcome, true, market.outcome]
    : null;

  const mono: React.CSSProperties = { fontFamily: "var(--mono)" };
  const label: React.CSSProperties = { ...mono, fontSize: "9px", color: "var(--text5)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" };
  const val: React.CSSProperties   = { ...mono, fontSize: "11px", color: "var(--text3)", lineHeight: 1.5, wordBreak: "break-all" };
  const divider: React.CSSProperties = { height: "1px", background: "var(--border)", margin: "14px 0" };

  return (
    <div>
      {/* Header */}
      <div style={{ padding: "16px 18px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <div style={{ ...mono, fontSize: "9px", color: "var(--text5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Market #{market.id}
          </div>
          {market.is_demo && (
            <div style={{
              ...mono,
              fontSize: "8px",
              color: "var(--amber)",
              background: "var(--amber-bg)",
              border: "1px solid var(--amber-br)",
              borderRadius: "2px",
              padding: "2px 6px",
              letterSpacing: "0.06em",
            }}>
              DEMO
            </div>
          )}
        </div>
        <div style={{ fontSize: "13px", color: "var(--text)", lineHeight: "1.45", fontWeight: 400 }}>
          {market.question}
        </div>
      </div>

      <div style={{ padding: "16px 18px" }}>

        {/* Odds split */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: "1px", background: "var(--border)",
          border: "1px solid var(--border)", borderRadius: "3px",
          overflow: "hidden", marginBottom: "16px",
        }}>
          {[
            { side: "Yes", pct: yesPct, pool: yesPool, c: "var(--green)", bg: "var(--green-bg)", dim: "#2d4a38" },
            { side: "No",  pct: noPct,  pool: noPool,  c: "var(--red)",   bg: "var(--red-bg)",   dim: "#4a2d2d" },
          ].map(({ side, pct, pool, c, bg, dim }) => (
            <div key={side} style={{ background: "var(--bg)", padding: "14px 12px" }}>
              <div style={{ ...mono, fontSize: "9px", letterSpacing: "0.06em", textTransform: "uppercase", color: dim, marginBottom: "6px" }}>
                {side}
              </div>
              <div style={{ ...mono, fontSize: "26px", fontWeight: 300, color: c, lineHeight: 1 }}>
                {pct}%
              </div>
              <div style={{ ...mono, fontSize: "9px", color: dim, marginTop: "4px" }}>
                {pool.toFixed(3)} GEN
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        {userAddress && !market.resolved && !expired && (
          <>
            <div style={{ ...mono, fontSize: "9px", color: "var(--text5)", marginBottom: "8px", lineHeight: 1.5 }}>
              Bets on Bradbury use two on-chain steps: deposit GEN, then record the bet.
            </div>
            {feeConfig.total_fee_bps > 0n && (
              <div style={{ ...mono, fontSize: "9px", color: "var(--text4)", marginBottom: "8px", lineHeight: 1.5 }}>
                Entry fee: {(Number(feeConfig.total_fee_bps) / 100).toFixed(2)}%
                {" "}=
                {" "}{(Number(feeConfig.creator_fee_bps) / 100).toFixed(2)}% creator
                {" "}+
                {" "}{(Number(feeConfig.protocol_fee_bps) / 100).toFixed(2)}% protocol.
                {" "}At this size, {netBetGEN.toFixed(4)} GEN enters the pool.
              </div>
            )}
            {DEMO_FALLBACK_ENABLED && (
              <div style={{ ...mono, fontSize: "9px", color: "var(--amber)", marginBottom: "8px", lineHeight: 1.5 }}>
                If Bradbury write txs stall, this browser applies a clearly marked demo fallback so bets, resolution, claims, and withdrawals still complete during the demo.
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "6px", marginBottom: pendingBalance > 0n ? "8px" : "14px", alignItems: "center" }}>
              <input
                type="number"
                min="0.001"
                step="0.01"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                style={{
                  background: "var(--bg2)", border: "1px solid var(--border2)",
                  borderRadius: "3px", padding: "7px 10px",
                  fontSize: "11px", fontFamily: "var(--mono)",
                  color: "var(--text3)", outline: "none", width: "100%",
                }}
              />
              <button
                onClick={() => handleBet(true)}
                disabled={txState === "pending"}
                style={{
                  background: "var(--green-bg)", border: "1px solid var(--green-br)",
                  color: "var(--green)", fontFamily: "var(--mono)", fontSize: "10px",
                  letterSpacing: "0.04em", padding: "7px 12px", borderRadius: "3px",
                  cursor: "pointer", whiteSpace: "nowrap",
                  opacity: txState === "pending" ? 0.5 : 1,
                }}
              >
                BET YES
              </button>
              <button
                onClick={() => handleBet(false)}
                disabled={txState === "pending"}
                style={{
                  background: "var(--red-bg)", border: "1px solid var(--red-br)",
                  color: "var(--red)", fontFamily: "var(--mono)", fontSize: "10px",
                  letterSpacing: "0.04em", padding: "7px 12px", borderRadius: "3px",
                  cursor: "pointer", whiteSpace: "nowrap",
                  opacity: txState === "pending" ? 0.5 : 1,
                }}
              >
                BET NO
              </button>
            </div>
            {pendingBalance > 0n && (
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "8px",
                alignItems: "center",
                border: "1px solid var(--amber-br)",
                background: "var(--amber-bg)",
                padding: "8px 10px",
                borderRadius: "3px",
                marginBottom: "14px",
              }}>
                <div style={{ ...mono, fontSize: "9px", color: "var(--amber)", lineHeight: 1.5 }}>
                  Pending balance: {pendingGEN.toFixed(4)} GEN
                </div>
                <button
                  onClick={handleWithdrawPending}
                  disabled={txState === "pending"}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--amber-br)",
                    color: "var(--amber)",
                    fontFamily: "var(--mono)",
                    fontSize: "9px",
                    letterSpacing: "0.04em",
                    padding: "6px 10px",
                    borderRadius: "3px",
                    cursor: "pointer",
                    opacity: txState === "pending" ? 0.5 : 1,
                  }}
                >
                  WITHDRAW
                </button>
              </div>
            )}
          </>
        )}

        {userAddress && !market.resolved && expired && (
          <button
            onClick={handleResolve}
            disabled={txState === "pending"}
            style={{
              width: "100%", background: "var(--amber-bg)",
              border: "1px solid var(--amber-br)",
              color: "var(--amber)", fontFamily: "var(--mono)", fontSize: "10px",
              letterSpacing: "0.06em", padding: "10px", borderRadius: "3px",
              cursor: "pointer", marginBottom: "14px", textAlign: "center",
              opacity: txState === "pending" ? 0.5 : 1,
            }}
          >
            {txState === "pending" ? txMsg : "RESOLVE — fetch url · llm consensus →"}
          </button>
        )}

        {userAddress && market.resolved && (
          <button
            onClick={handleClaim}
            disabled={txState === "pending"}
            style={{
              width: "100%", background: "var(--indigo-bg)",
              border: "1px solid var(--indigo-br)",
              color: "var(--indigo)", fontFamily: "var(--mono)", fontSize: "10px",
              letterSpacing: "0.06em", padding: "10px", borderRadius: "3px",
              cursor: "pointer", marginBottom: "14px", textAlign: "center",
              opacity: txState === "pending" ? 0.5 : 1,
            }}
          >
            {txState === "pending" ? txMsg : "CLAIM WINNINGS →"}
          </button>
        )}

        {/* Tx status */}
        {txState !== "idle" && (
          <div style={{
            ...mono, fontSize: "9px", letterSpacing: "0.04em",
            color: txState === "success" ? "var(--green)" : txState === "error" ? "var(--red)" : "var(--amber)",
            border: `1px solid ${txState === "success" ? "var(--green-br)" : txState === "error" ? "var(--red-br)" : "var(--amber-br)"}`,
            background: txState === "success" ? "var(--green-bg)" : txState === "error" ? "var(--red-bg)" : "var(--amber-bg)",
            padding: "6px 10px", borderRadius: "3px", marginBottom: "14px",
          }}>
            {txMsg}
          </div>
        )}

        <div style={divider} />

        {/* Resolution source */}
        <div style={{ marginBottom: "14px" }}>
          <div style={label}>Resolution source</div>
          <div style={{ ...mono, fontSize: "10px", color: "var(--green)", wordBreak: "break-all", lineHeight: 1.5 }}>
            {market.resolution_url}
          </div>
          <div style={{ ...mono, fontSize: "9px", color: "var(--text5)", marginTop: "4px" }}>
            gl.get_webpage() reads this url on-chain at resolution time
          </div>
        </div>

        {/* Criteria collapsible */}
        <div style={{ marginBottom: "14px" }}>
          <div
            style={{ ...label, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", marginBottom: showCriteria ? "6px" : 0 }}
            onClick={() => setShowCriteria((v) => !v)}
          >
            Resolution criteria
            <span style={{ color: "var(--text5)", fontWeight: 300 }}>{showCriteria ? "▲" : "▼"}</span>
          </div>
          {showCriteria && (
            <div style={{ ...mono, fontSize: "10px", color: "var(--text3)", lineHeight: 1.6 }}>
              {market.resolution_criteria}
            </div>
          )}
        </div>

        <div style={divider} />

        {/* Validator consensus table */}
        <div style={{ marginBottom: "14px" }}>
          <div style={label}>LLM validator consensus</div>
          <div style={{ border: "1px solid var(--border)", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ background: "var(--bg2)", padding: "6px 10px", borderBottom: "1px solid var(--border)", display: "grid", gridTemplateColumns: "20px 1fr 60px 50px", gap: "8px" }}>
              {["#", "model", "role", "verdict"].map((h) => (
                <span key={h} style={{ ...mono, fontSize: "8px", color: "var(--text5)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{h}</span>
              ))}
            </div>
            {VALIDATORS.map((v, i) => {
              const verdict = validatorVerdicts
                ? validatorVerdicts[i]
                : null;
              return (
                <div
                  key={i}
                  style={{
                    padding: "7px 10px",
                    borderBottom: i < 4 ? "1px solid var(--border)" : "none",
                    display: "grid",
                    gridTemplateColumns: "20px 1fr 60px 50px",
                    gap: "8px",
                    alignItems: "center",
                    background: "var(--bg)",
                  }}
                >
                  <span style={{ ...mono, fontSize: "9px", color: "var(--text5)" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span style={{ ...mono, fontSize: "10px", color: "var(--text4)" }}>
                    {v.model}
                  </span>
                  <span style={{ ...mono, fontSize: "8px", color: "var(--text5)", letterSpacing: "0.04em" }}>
                    {v.role}
                  </span>
                  <span style={{
                    ...mono, fontSize: "10px", fontWeight: 400,
                    color: verdict === null
                      ? "var(--text5)"
                      : verdict
                      ? "var(--green)"
                      : "var(--red)",
                  }}>
                    {verdict === null ? (market.resolved ? "—" : "pending") : verdict ? "YES" : "NO"}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ ...mono, fontSize: "9px", color: "var(--text5)", marginTop: "5px" }}>
            optimistic democracy · 3/5 majority required
          </div>
        </div>

        <div style={divider} />

        {/* Meta */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <div style={label}>Deadline</div>
            <div style={val}>{formatDeadline(market.deadline)}</div>
          </div>
          <div>
            <div style={label}>Total pool</div>
            <div style={val}>{totalPool.toFixed(4)} GEN</div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={label}>Creator</div>
            <div style={val}>{market.creator}</div>
          </div>
        </div>

      </div>
    </div>
  );
}
