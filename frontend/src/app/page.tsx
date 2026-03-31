"use client";
import { useEffect, useState, useCallback } from "react";
import { getAllMarkets, CONTRACT_ADDRESS, DEMO_FALLBACK_ENABLED } from "@/lib/genlayer";
import { useWallet } from "@/lib/useWallet";
import MarketFeed from "@/components/MarketFeed";
import MarketDetail from "@/components/MarketDetail";
import CreateMarketModal from "@/components/CreateMarketModal";

export default function Home() {
  const { address, state, error, connect, disconnect, switchNetwork } = useWallet();
  const [markets, setMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [tick, setTick] = useState(0);
  const [contractMissing] = useState(
    CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000" && !DEMO_FALLBACK_ENABLED
  );

  const load = useCallback(() => {
    if (contractMissing) { setLoading(false); return; }
    setLoading(true);
    getAllMarkets()
      .then((list) => {
        setMarkets(list);
        if (list.length === 0) {
          setSelected(null);
          return;
        }

        if (!selected) {
          setSelected(list[0]);
          return;
        }

        const refreshedSelected = list.find((market) => market.id === selected.id);
        setSelected(refreshedSelected ?? list[0]);
      })
      .catch(() => {
        setMarkets([]);
        setSelected(null);
      })
      .finally(() => setLoading(false));
  }, [contractMissing, selected]);

  useEffect(() => { load(); }, [tick]);

  const refresh = () => setTick((t) => t + 1);

  const totalVol = markets.reduce(
    (s, m) => s + (Number(m.total_yes) + Number(m.total_no)) / 1e18,
    0
  );

  const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);

  const mono: React.CSSProperties = { fontFamily: "var(--mono)" };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>

      {/* CONTRACT NOT SET warning */}
      {contractMissing && (
        <div style={{
          background: "#1a1200", borderBottom: "1px solid #3a2a00",
          padding: "10px 24px", display: "flex", alignItems: "center", gap: "12px",
        }}>
          <span style={{ ...mono, fontSize: "12px", color: "#f0cc7a" }}>
            ⚠ CONTRACT_ADDRESS not set.
          </span>
          <span style={{ ...mono, fontSize: "12px", color: "#d0be96" }}>
            Deploy the contract first, then set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env.local (locally) or in Vercel project settings.
          </span>
        </div>
      )}

      {/* WRONG NETWORK banner */}
      {state === "wrong_network" && (
        <div style={{
          background: "#1a0f0f", borderBottom: "1px solid #3a1a1a",
          padding: "8px 24px", display: "flex", alignItems: "center", gap: "12px",
        }}>
          <span style={{ ...mono, fontSize: "12px", color: "#ff9a9a" }}>
            Wrong network.
          </span>
          <span style={{ ...mono, fontSize: "12px", color: "#d8b0b0" }}>
            Switch to GenLayer Testnet Bradbury to use this app.
          </span>
          <button
            onClick={switchNetwork}
            style={{
              ...mono, fontSize: "12px", color: "#ff9a9a",
              background: "none", border: "1px solid #3a1a1a",
              padding: "5px 12px", borderRadius: "3px", cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            switch network →
          </button>
        </div>
      )}

      {DEMO_FALLBACK_ENABLED && (
        <div style={{
          background: "#1a1200", borderBottom: "1px solid #3a2a00",
          padding: "8px 24px", display: "flex", alignItems: "center", gap: "12px",
        }}>
          <span style={{ ...mono, fontSize: "12px", color: "#f0cc7a" }}>
            Demo fallback enabled.
          </span>
          <span style={{ ...mono, fontSize: "12px", color: "#d0be96" }}>
            Reads stay on-chain when available. If Bradbury stalls, this browser can create local demo markets and complete the interaction flow end to end.
          </span>
        </div>
      )}

      {/* NAV */}
      <nav style={{
        borderBottom: "1px solid var(--border)", padding: "0 24px", height: "60px",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div style={{ fontFamily: "var(--serif)", fontSize: "24px", color: "#f4eee3", letterSpacing: "0.01em" }}>
            Foresight <em style={{ color: "var(--text3)", fontStyle: "italic" }}>markets</em>
          </div>
          <div style={{
            ...mono, fontSize: "11px", color: "var(--text4)", letterSpacing: "0.06em",
            border: "1px solid var(--border2)", padding: "5px 10px", borderRadius: "3px",
          }}>
            TESTNET BRADBURY
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Network status dot */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", ...mono, fontSize: "12px", color: "var(--green)" }}>
            <span style={{ width: "5px", height: "5px", background: "var(--green)", borderRadius: "50%", display: "inline-block", animation: "pulse 2s infinite" }} />
            live
          </div>

          {state === "disconnected" && (
            <button
              onClick={connect}
              style={{
                ...mono, fontSize: "12px", color: "var(--text2)",
                background: "var(--bg2)", border: "1px solid var(--border2)",
                padding: "8px 16px", borderRadius: "3px", cursor: "pointer", letterSpacing: "0.04em",
              }}
            >
              connect wallet
            </button>
          )}
          {state === "connecting" && (
            <span style={{ ...mono, fontSize: "12px", color: "var(--text4)" }}>connecting…</span>
          )}
          {state === "wrong_network" && (
            <>
              <span style={{ ...mono, fontSize: "12px", color: "#ff9a9a" }}>wrong network</span>
              <button
                onClick={switchNetwork}
                style={{
                  ...mono, fontSize: "12px", color: "var(--amber)",
                  background: "var(--amber-bg)", border: "1px solid var(--amber-br)",
                  padding: "6px 12px", borderRadius: "3px", cursor: "pointer",
                }}
              >
                switch →
              </button>
            </>
          )}
          {state === "connected" && address && (
            <>
              <div style={{
                ...mono, fontSize: "12px", color: "var(--text2)",
                border: "1px solid var(--border)", padding: "6px 10px", borderRadius: "3px",
              }}>
                {short(address)}
              </div>
              <button
                onClick={disconnect}
                style={{ ...mono, fontSize: "12px", color: "var(--text4)", background: "none", border: "none", cursor: "pointer" }}
              >
                disconnect
              </button>
            </>
          )}

          {error && (
            <span style={{ ...mono, fontSize: "11px", color: "var(--red)", maxWidth: "240px" }}>
              {error}
            </span>
          )}
        </div>
      </nav>

      {/* TICKER */}
      <div style={{
        borderBottom: "1px solid var(--border)", padding: "0 24px", minHeight: "40px",
        display: "flex", alignItems: "center", gap: "20px", flexShrink: 0, overflow: "hidden",
      }}>
        {[
          ["VOL 24H", `${totalVol.toFixed(2)} GEN`],
          ["MARKETS", `${markets.length} open`],
          ["RESOLVED", `${markets.filter((m) => m.resolved).length}`],
          ["ACCURACY", "LLM consensus"],
          ["ORACLE", "none — gl.get_webpage()"],
          ["FAUCET", "testnet-faucet.genlayer.foundation"],
        ].map(([k, v], i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "18px", whiteSpace: "nowrap" }}>
            {i > 0 && <span style={{ width: "1px", height: "14px", background: "var(--border)" }} />}
            <span style={{ ...mono, fontSize: "11px", color: "var(--text5)", letterSpacing: "0.06em" }}>{k}</span>
            <span style={{ ...mono, fontSize: "11px", color: "var(--text3)" }}>{v}</span>
          </div>
        ))}
      </div>

      {/* MAIN SPLIT LAYOUT */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", flex: 1, minHeight: 0 }}>

        {/* LEFT: FEED */}
        <div style={{ borderRight: "1px solid var(--border)", overflowY: "auto" }}>
          <div style={{
            padding: "14px 20px 12px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ ...mono, fontSize: "11px", color: "var(--text4)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Active markets
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                onClick={refresh}
                style={{ ...mono, fontSize: "11px", color: "var(--text4)", background: "none", border: "none", cursor: "pointer" }}
              >
                ↻ refresh
              </button>
              {state === "connected" && !contractMissing && (
                <button
                  onClick={() => setShowCreate(true)}
                  style={{
                    ...mono, fontSize: "11px", color: "var(--text2)",
                    background: "none", border: "1px solid var(--border2)",
                    padding: "6px 10px", borderRadius: "3px", cursor: "pointer", letterSpacing: "0.04em",
                  }}
                >
                  + new market
                </button>
              )}
            </div>
          </div>

          {contractMissing ? (
            <div style={{ padding: "32px 20px" }}>
              <p style={{ ...mono, fontSize: "13px", color: "var(--text3)", lineHeight: 1.8 }}>
                Contract not deployed yet.<br />
                Run <span style={{ color: "var(--green)" }}>npm run deploy</span> from the project root,<br />
                then set <span style={{ color: "var(--green)" }}>NEXT_PUBLIC_CONTRACT_ADDRESS</span> and restart.
              </p>
            </div>
          ) : loading ? (
            <div style={{ padding: "32px 20px", ...mono, fontSize: "13px", color: "var(--text3)" }}>
              loading…
            </div>
          ) : markets.length === 0 ? (
            <div style={{ padding: "32px 20px", ...mono, fontSize: "13px", color: "var(--text3)", lineHeight: 1.9 }}>
              no markets yet.{" "}
              {state === "connected" ? (
                <span
                  style={{ color: "var(--text2)", cursor: "pointer", borderBottom: "1px solid var(--border2)" }}
                  onClick={() => setShowCreate(true)}
                >
                  create the first one →
                </span>
              ) : "connect wallet to create one."}
            </div>
          ) : (
            <MarketFeed markets={markets} selected={selected} onSelect={setSelected} />
          )}
        </div>

        {/* RIGHT: DETAIL */}
        <div style={{ overflowY: "auto" }}>
          {selected ? (
            <MarketDetail
              market={selected}
              userAddress={state === "connected" ? address : null}
              onUpdate={refresh}
            />
          ) : (
            <div style={{ padding: "32px 20px", ...mono, fontSize: "13px", color: "var(--text3)" }}>
              select a market
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div style={{
        borderTop: "1px solid var(--border)", padding: "10px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <span style={{ ...mono, fontSize: "11px", color: "var(--text4)", letterSpacing: "0.04em" }}>
          gl.get_webpage() · optimistic democracy · no oracle · trustless resolution
        </span>
        <div style={{ display: "flex", gap: "16px" }}>
          <a href="https://testnet-faucet.genlayer.foundation" target="_blank" rel="noopener"
            style={{ ...mono, fontSize: "11px", color: "var(--text4)", textDecoration: "none" }}>
            faucet →
          </a>
          <a href="https://zksync-os-testnet-genlayer.explorer.zksync.dev" target="_blank" rel="noopener"
            style={{ ...mono, fontSize: "11px", color: "var(--text4)", textDecoration: "none" }}>
            explorer →
          </a>
          <a href="https://docs.genlayer.com" target="_blank" rel="noopener"
            style={{ ...mono, fontSize: "11px", color: "var(--text4)", textDecoration: "none" }}>
            docs →
          </a>
        </div>
      </div>

      {showCreate && state === "connected" && address && (
        <CreateMarketModal
          userAddress={address}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refresh(); }}
        />
      )}
    </div>
  );
}
