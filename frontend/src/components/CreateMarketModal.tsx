"use client";
import { useEffect, useState } from "react";
import { createMarket, getFeeConfig } from "@/lib/genlayer";

interface Props {
  userAddress: string;
  onClose: () => void;
  onCreated: () => void;
}

const PRESETS = [
  {
    question: "Will the Federal Reserve cut interest rates before October 2026?",
    resolution_url: "https://www.bbc.com/news/business",
    resolution_criteria: "The page confirms the Federal Reserve announced an interest rate cut before October 2026.",
    days: 180,
  },
  {
    question: "Will Bitcoin reach $150,000 before January 2027?",
    resolution_url: "https://www.reuters.com/markets/currencies/",
    resolution_criteria: "The page confirms Bitcoin price reached or exceeded $150,000 USD at any point before January 2027.",
    days: 270,
  },
  {
    question: "Will OpenAI announce GPT-6 before January 2027?",
    resolution_url: "https://www.bbc.com/news/technology",
    resolution_criteria: "The page confirms OpenAI officially announced or released GPT-6 before January 2027.",
    days: 240,
  },
];

export default function CreateMarketModal({ userAddress, onClose, onCreated }: Props) {
  const [question, setQuestion] = useState("");
  const [url, setUrl] = useState("https://www.bbc.com/news");
  const [criteria, setCriteria] = useState("");
  const [days, setDays] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [feeConfig, setFeeConfig] = useState({
    protocol_treasury: "",
    creator_fee_bps: 0n,
    protocol_fee_bps: 0n,
    total_fee_bps: 0n,
  });

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
  }, []);

  const apply = (p: (typeof PRESETS)[0]) => {
    setQuestion(p.question);
    setUrl(p.resolution_url);
    setCriteria(p.resolution_criteria);
    setDays(p.days);
  };

  const submit = async () => {
    if (!question.trim() || !url.trim() || !criteria.trim()) {
      setError("all fields required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const deadline = Math.floor(Date.now() / 1000) + days * 86400;
      await createMarket(userAddress, question, url, criteria, deadline);
      onCreated();
    } catch (e: any) {
      setError(e.message?.slice(0, 100) || "tx failed");
      setSubmitting(false);
    }
  };

  const mono: React.CSSProperties = { fontFamily: "var(--mono)" };
  const lbl: React.CSSProperties = {
    ...mono, fontSize: "11px", color: "var(--text4)",
    letterSpacing: "0.08em", textTransform: "uppercase",
    display: "block", marginBottom: "5px",
  };
  const inp: React.CSSProperties = {
    ...mono, fontSize: "14px", color: "var(--text2)",
    background: "var(--bg2)", border: "1px solid var(--border2)",
    borderRadius: "3px", padding: "10px 12px", width: "100%",
    outline: "none",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px",
    }}>
      <div style={{
        background: "var(--bg1)",
        border: "1px solid var(--border2)",
        borderRadius: "4px",
        width: "100%", maxWidth: "560px",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderBottom: "1px solid var(--border)",
        }}>
          <span style={{ ...mono, fontSize: "14px", color: "var(--text2)", letterSpacing: "0.04em" }}>
            new prediction market
          </span>
          <button
            onClick={onClose}
            style={{ ...mono, fontSize: "14px", color: "var(--text4)", background: "none", border: "none", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "16px 18px" }}>

          {/* Presets */}
          <div style={{ marginBottom: "16px" }}>
            <label style={lbl}>quick presets</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {PRESETS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => apply(p)}
                  style={{
                    ...mono, fontSize: "12px", color: "var(--text2)",
                    background: "var(--bg2)", border: "1px solid var(--border)",
                    borderRadius: "3px", padding: "9px 11px", cursor: "pointer",
                    textAlign: "left", lineHeight: 1.4,
                    transition: "border-color 0.1s",
                  }}
                >
                  {p.question}
                </button>
              ))}
            </div>
          </div>

          <div style={{ height: "1px", background: "var(--border)", marginBottom: "16px" }} />

          {/* Question */}
          <div style={{ marginBottom: "12px" }}>
            <label style={lbl}>question (yes / no)</label>
            <textarea
              rows={2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Will X happen before date Y?"
              style={{ ...inp, resize: "none", lineHeight: 1.5 }}
            />
          </div>

          {/* URL */}
          <div style={{ marginBottom: "12px" }}>
            <label style={lbl}>
              resolution url
              <span style={{ color: "var(--green)", marginLeft: "6px", textTransform: "none" }}>
                ← contract reads this page on-chain
              </span>
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.bbc.com/news/business"
              style={{ ...inp, color: "var(--green)" }}
            />
            <div style={{ ...mono, fontSize: "11px", color: "var(--text4)", marginTop: "6px" }}>
              use public news pages — bbc.com, reuters.com, apnews.com
            </div>
          </div>

          {/* Criteria */}
          <div style={{ marginBottom: "12px" }}>
            <label style={lbl}>resolution criteria — llm evaluates this text</label>
            <textarea
              rows={3}
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              placeholder="The page confirms that X has happened..."
              style={{ ...inp, resize: "none", lineHeight: 1.5 }}
            />
          </div>

          {/* Days */}
          <div style={{ marginBottom: "16px" }}>
            <label style={lbl}>
              betting period —
              <span style={{ color: "var(--text3)", marginLeft: "4px" }}>{days} day{days !== 1 ? "s" : ""}</span>
            </label>
            <input
              type="range" min={1} max={365} value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--green)" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", ...mono, fontSize: "11px", color: "var(--text4)", marginTop: "5px" }}>
              <span>1 day</span><span>1 year</span>
            </div>
          </div>

          {/* How it works */}
          <div style={{
            background: "var(--bg2)", border: "1px solid var(--border)",
            borderRadius: "3px", padding: "10px 12px", marginBottom: "14px",
          }}>
            <div style={{ ...mono, fontSize: "11px", color: "var(--green)", letterSpacing: "0.06em", marginBottom: "6px" }}>HOW RESOLUTION WORKS</div>
            <div style={{ ...mono, fontSize: "11px", color: "var(--text3)", lineHeight: 1.8 }}>
              After deadline, anyone calls <span style={{ color: "var(--green)" }}>resolve_market()</span>.
              The Intelligent Contract executes <span style={{ color: "var(--green)" }}>gl.get_webpage(url)</span> on-chain,
              passes content to 5 LLM validators who evaluate your criteria via Optimistic Democracy.
              No oracle. No admin. Fully trustless.
            </div>
          </div>

          {feeConfig.total_fee_bps > 0n && (
            <div style={{
              background: "var(--amber-bg)", border: "1px solid var(--amber-br)",
              borderRadius: "3px", padding: "10px 12px", marginBottom: "14px",
            }}>
              <div style={{ ...mono, fontSize: "11px", color: "var(--amber)", letterSpacing: "0.06em", marginBottom: "6px" }}>
                CREATOR ECONOMICS
              </div>
              <div style={{ ...mono, fontSize: "11px", color: "var(--text3)", lineHeight: 1.8 }}>
                The current contract routes {(Number(feeConfig.creator_fee_bps) / 100).toFixed(2)}% of each incoming bet
                to the market creator and {(Number(feeConfig.protocol_fee_bps) / 100).toFixed(2)}% to protocol.
              </div>
            </div>
          )}

          <div style={{
            background: "var(--bg2)", border: "1px solid var(--border)",
            borderRadius: "3px", padding: "10px 12px", marginBottom: "14px",
          }}>
            <div style={{ ...mono, fontSize: "11px", color: "var(--text3)", lineHeight: 1.8 }}>
              If Bradbury stalls during the hackathon demo, market creation falls back locally in this browser so the full product flow remains usable.
            </div>
          </div>

          {error && (
            <div style={{
              ...mono, fontSize: "11px", color: "var(--red)",
              background: "var(--red-bg)", border: "1px solid var(--red-br)",
              borderRadius: "3px", padding: "9px 10px", marginBottom: "12px",
            }}>
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={submitting}
            style={{
              width: "100%", background: submitting ? "var(--bg3)" : "var(--green-bg)",
              border: `1px solid ${submitting ? "var(--border2)" : "var(--green-br)"}`,
              color: submitting ? "var(--text5)" : "var(--green)",
              fontFamily: "var(--mono)", fontSize: "13px", letterSpacing: "0.06em",
              padding: "13px", borderRadius: "3px", cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "deploying market on-chain…" : "CREATE MARKET →"}
          </button>
        </div>
      </div>
    </div>
  );
}
