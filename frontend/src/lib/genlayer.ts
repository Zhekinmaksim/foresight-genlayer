import { abi, createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";
import { bytesToHex, encodeFunctionData, parseEventLogs } from "viem";

// ─── Config ───────────────────────────────────────────────────────────────────
// CONTRACT_ADDRESS is set after deploying the Intelligent Contract.
// On Vercel: set NEXT_PUBLIC_CONTRACT_ADDRESS in project settings.
// Locally:   set it in frontend/.env.local
export const CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`) ?? "0x0000000000000000000000000000000000000000";
export const DEMO_FALLBACK_ENABLED = process.env.NEXT_PUBLIC_DEMO_FALLBACK === "true";

const DEMO_STATE_KEY = "foresight_demo_state_v2";
const BPS_DENOMINATOR = 10_000n;

export type FeeConfig = {
  protocol_treasury: string;
  creator_fee_bps: bigint;
  protocol_fee_bps: bigint;
  total_fee_bps: bigint;
};

type DemoMarket = {
  id: number;
  question: string;
  resolution_url: string;
  resolution_criteria: string;
  creator: string;
  deadline: number;
  total_yes: string;
  total_no: string;
  resolved: boolean;
  outcome: boolean;
  is_demo: true;
};

type DemoBetOverlay = Record<string, { yesDelta: string; noDelta: string; resolved?: boolean; outcome?: boolean }>;
type DemoUserBet = { yes_amount: string; no_amount: string };
type DemoState = {
  initialized: boolean;
  localMarkets: Record<string, DemoMarket>;
  overlays: DemoBetOverlay;
  userBets: Record<string, DemoUserBet>;
  pendingBalances: Record<string, string>;
  claimed: Record<string, boolean>;
};

const ZERO_FEE_CONFIG: FeeConfig = {
  protocol_treasury: "0x0000000000000000000000000000000000000000",
  creator_fee_bps: 0n,
  protocol_fee_bps: 0n,
  total_fee_bps: 0n,
};

function canUseDemoFallback() {
  return DEMO_FALLBACK_ENABLED && typeof window !== "undefined";
}

function emptyDemoState(): DemoState {
  return {
    initialized: false,
    localMarkets: {},
    overlays: {},
    userBets: {},
    pendingBalances: {},
    claimed: {},
  };
}

function readDemoState(): DemoState {
  if (!canUseDemoFallback()) return emptyDemoState();

  try {
    const raw = window.localStorage.getItem(DEMO_STATE_KEY);
    return raw ? ({ ...emptyDemoState(), ...(JSON.parse(raw) as Partial<DemoState>) }) : emptyDemoState();
  } catch {
    return emptyDemoState();
  }
}

function writeDemoState(next: DemoState) {
  if (!canUseDemoFallback()) return;
  window.localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(next));
}

function marketStorageKey(marketId: number) {
  return String(marketId);
}

function userBetStorageKey(marketId: number, address: string) {
  return `${marketId}:${address.toLowerCase()}`;
}

function pendingStorageKey(address: string) {
  return address.toLowerCase();
}

const STARTER_DEMO_MARKETS: Omit<DemoMarket, "id" | "creator" | "is_demo">[] = [
  {
    question: "Will the Federal Reserve cut interest rates before October 2026?",
    resolution_url: "https://www.bbc.com/news/business",
    resolution_criteria:
      "The page contains news confirming the Federal Reserve announced an interest rate cut before October 2026.",
    deadline: Math.floor(Date.now() / 1000) + 180 * 86400,
    total_yes: "180000000000000000",
    total_no: "220000000000000000",
    resolved: false,
    outcome: false,
  },
  {
    question: "Will Bitcoin reach $150,000 before January 2027?",
    resolution_url: "https://www.reuters.com/markets/currencies/",
    resolution_criteria:
      "The page confirms Bitcoin price reached or exceeded $150,000 USD before January 2027.",
    deadline: Math.floor(Date.now() / 1000) + 270 * 86400,
    total_yes: "260000000000000000",
    total_no: "240000000000000000",
    resolved: false,
    outcome: false,
  },
  {
    question: "Will OpenAI announce GPT-6 before January 2027?",
    resolution_url: "https://www.bbc.com/news/technology",
    resolution_criteria:
      "The page contains news confirming OpenAI officially announced or released GPT-6 before January 2027.",
    deadline: Math.floor(Date.now() / 1000) + 240 * 86400,
    total_yes: "320000000000000000",
    total_no: "280000000000000000",
    resolved: false,
    outcome: false,
  },
];

function ensureDemoStarterMarkets(onChainMarkets: any[]) {
  if (!canUseDemoFallback()) return readDemoState();

  const state = readDemoState();
  if (state.initialized || onChainMarkets.length > 0 || Object.keys(state.localMarkets).length > 0) {
    return state;
  }

  STARTER_DEMO_MARKETS.forEach((market, index) => {
    const id = 1_000_000 + index + 1;
    state.localMarkets[marketStorageKey(id)] = {
      ...market,
      id,
      creator: "demo://seed",
      is_demo: true,
    };
  });
  state.initialized = true;
  writeDemoState(state);
  return state;
}

function normalizeDemoMarket(market: DemoMarket): DemoMarket {
  return {
    ...market,
    total_yes: String(market.total_yes),
    total_no: String(market.total_no),
    is_demo: true,
  };
}

function addDemoPendingBalance(state: DemoState, address: string, amountWei: bigint) {
  if (amountWei <= 0n) return;
  const key = pendingStorageKey(address);
  const current = BigInt(state.pendingBalances[key] ?? "0");
  state.pendingBalances[key] = (current + amountWei).toString();
}

function setDemoResolution(state: DemoState, marketId: number, outcome: boolean) {
  const marketKey = marketStorageKey(marketId);
  const localMarket = state.localMarkets[marketKey];
  if (localMarket) {
    localMarket.resolved = true;
    localMarket.outcome = outcome;
    state.localMarkets[marketKey] = localMarket;
    return;
  }

  const overlay = state.overlays[marketKey] ?? { yesDelta: "0", noDelta: "0" };
  state.overlays[marketKey] = {
    ...overlay,
    resolved: true,
    outcome,
  };
}

function recordDemoBet(
  market: any,
  signer: string,
  voteYes: boolean,
  grossAmountWei: bigint,
  feeConfig: FeeConfig
) {
  const state = readDemoState();
  const { creatorFee, protocolFee, netAmount } = quoteBetBreakdown(grossAmountWei, feeConfig);
  const marketKey = marketStorageKey(market.id);

  if (state.localMarkets[marketKey]) {
    const localMarket = state.localMarkets[marketKey];
    state.localMarkets[marketKey] = {
      ...localMarket,
      total_yes: voteYes
        ? (BigInt(localMarket.total_yes) + netAmount).toString()
        : localMarket.total_yes,
      total_no: voteYes
        ? localMarket.total_no
        : (BigInt(localMarket.total_no) + netAmount).toString(),
    };
  } else {
    const overlay = state.overlays[marketKey] ?? { yesDelta: "0", noDelta: "0" };
    const yesDelta = BigInt(overlay.yesDelta);
    const noDelta = BigInt(overlay.noDelta);
    state.overlays[marketKey] = {
      ...overlay,
      yesDelta: voteYes ? (yesDelta + netAmount).toString() : yesDelta.toString(),
      noDelta: voteYes ? noDelta.toString() : (noDelta + netAmount).toString(),
    };
  }

  const userKey = userBetStorageKey(market.id, signer);
  const currentBet = state.userBets[userKey] ?? { yes_amount: "0", no_amount: "0" };
  state.userBets[userKey] = {
    yes_amount: voteYes
      ? (BigInt(currentBet.yes_amount) + netAmount).toString()
      : currentBet.yes_amount,
    no_amount: voteYes
      ? currentBet.no_amount
      : (BigInt(currentBet.no_amount) + netAmount).toString(),
  };

  addDemoPendingBalance(state, market.creator, creatorFee);
  addDemoPendingBalance(state, feeConfig.protocol_treasury, protocolFee);
  writeDemoState(state);

  return {
    creatorFee,
    protocolFee,
    netAmount,
  };
}

function normalizeFeeConfig(raw: any): FeeConfig {
  return {
    protocol_treasury: String(raw?.protocol_treasury ?? ZERO_FEE_CONFIG.protocol_treasury),
    creator_fee_bps: BigInt(raw?.creator_fee_bps ?? 0),
    protocol_fee_bps: BigInt(raw?.protocol_fee_bps ?? 0),
    total_fee_bps: BigInt(raw?.total_fee_bps ?? 0),
  };
}

export function quoteBetBreakdown(amountWei: bigint, feeConfig: FeeConfig) {
  const creatorFee = (amountWei * feeConfig.creator_fee_bps) / BPS_DENOMINATOR;
  const protocolFee = (amountWei * feeConfig.protocol_fee_bps) / BPS_DENOMINATOR;
  const netAmount = amountWei - creatorFee - protocolFee;
  return {
    grossAmount: amountWei,
    creatorFee,
    protocolFee,
    netAmount,
  };
}

function applyDemoOverlayToMarket(market: any) {
  const overlay = readDemoState().overlays[marketStorageKey(market.id)];
  if (!overlay) return market;

  return {
    ...market,
    total_yes: (BigInt(market.total_yes) + BigInt(overlay.yesDelta)).toString(),
    total_no: (BigInt(market.total_no) + BigInt(overlay.noDelta)).toString(),
    resolved: overlay.resolved ?? market.resolved,
    outcome: overlay.resolved ? Boolean(overlay.outcome) : market.outcome,
  };
}

// ─── MetaMask: add GenLayer Testnet Bradbury network ──────────────────────────
// Users who don't have the network yet can call this once.
export async function addGenLayerNetwork(): Promise<void> {
  if (typeof window === "undefined" || !window.ethereum) return;

  // These values come from the genlayer-js/chains testnetBradbury object.
  // They match what the faucet page shows at testnet-faucet.genlayer.foundation
  await window.ethereum.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: "0x" + (testnetBradbury.id).toString(16),
        chainName: "GenLayer Testnet Bradbury",
        nativeCurrency: {
          name: "GEN",
          symbol: "GEN",
          decimals: 18,
        },
        rpcUrls: [
          testnetBradbury.rpcUrls.default.http[0] ?? "https://rpc-bradbury.genlayer.com",
        ],
        blockExplorerUrls: [
          testnetBradbury.blockExplorers?.default.url ?? "https://explorer-bradbury.genlayer.com/",
        ],
      },
    ],
  });
}

// ─── Clients ──────────────────────────────────────────────────────────────────
// Read-only client — no account needed
export const publicClient = createClient({ chain: testnetBradbury });

// Signing client — address only, MetaMask handles the actual signing
export function signingClient(address: string) {
  return createClient({
    chain: testnetBradbury,
    account: address as `0x${string}`,
  });
}

export { TransactionStatus };

async function sendConsensusTransaction(
  client: ReturnType<typeof createClient>,
  address: `0x${string}`,
  signer: string,
  method: string,
  args: any[],
  value: bigint
): Promise<any> {
  const consensus = testnetBradbury.consensusMainContract;
  if (!consensus) {
    throw new Error("Consensus contract is not configured for Bradbury");
  }
  const txData = bytesToHex(
    abi.calldata.encode(
      abi.calldata.makeCalldataObject(method, args as any, undefined)
    )
  );
  const data = encodeFunctionData({
    abi: consensus.abi,
    functionName: "addTransaction",
    args: [
      signer as `0x${string}`,
      address,
      BigInt(testnetBradbury.defaultNumberOfInitialValidators),
      BigInt(testnetBradbury.defaultConsensusMaxRotations),
      txData,
      0n,
    ],
  });

  const gasPriceHex = await client.request({ method: "eth_gasPrice" });
  const nonce = await client.getCurrentNonce({ address: signer as `0x${string}` });
  const gasEstimate = await client.estimateTransactionGas({
    from: signer as `0x${string}`,
    to: consensus.address,
    data,
    value,
  });
  const gas = (gasEstimate * 12n) / 10n + 150_000n;

  const evmHash = await client.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: signer as `0x${string}`,
        to: consensus.address,
        data,
        value: `0x${value.toString(16)}`,
        gas: `0x${gas.toString(16)}`,
        nonce: `0x${BigInt(nonce).toString(16)}`,
        type: "0x0",
        chainId: `0x${testnetBradbury.id.toString(16)}`,
        ...(typeof gasPriceHex === "string" ? { gasPrice: gasPriceHex } : {}),
      },
    ],
  });

  let evmReceipt: any = null;
  for (let i = 0; i < 30; i++) {
    evmReceipt = await client.request({
      method: "eth_getTransactionReceipt",
      params: [evmHash],
    });
    if (evmReceipt) break;
    await new Promise((r) => setTimeout(r, 3000));
  }

  if (!evmReceipt || evmReceipt.status !== "0x1") {
    const gasUsed =
      evmReceipt && typeof evmReceipt.gasUsed === "string"
        ? BigInt(evmReceipt.gasUsed).toString()
        : "unknown";
    throw new Error(
      `External transaction reverted (method=${method}, evm=${evmHash}, gasUsed=${gasUsed}, gasLimit=${gas.toString()})`
    );
  }

  const logs = parseEventLogs({
    abi: consensus.abi,
    logs: evmReceipt.logs,
    strict: false,
  }) as any[];
  const createdLog = logs.find(
    (log) =>
      (log?.eventName === "CreatedTransaction" || log?.eventName === "NewTransaction") &&
      log?.args?.txId
  );
  const txId = createdLog?.args?.txId as `0x${string}` | undefined;
  if (!txId) {
    throw new Error("Deposit transaction was not processed by consensus");
  }

  return txId;
}

// ─── Read helpers ─────────────────────────────────────────────────────────────
export async function getAllMarkets(): Promise<any[]> {
  let markets: any[] = [];
  try {
    const result = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_all_markets",
      args: [],
    });
    markets = Array.isArray(result) ? result : [];
  } catch {
    markets = [];
  }

  const state = ensureDemoStarterMarkets(markets);
  const onChainMarkets = markets.map((market) => applyDemoOverlayToMarket(market));
  const localMarkets = Object.values(state.localMarkets).map((market) => normalizeDemoMarket(market));

  return [...onChainMarkets, ...localMarkets].sort((left, right) => Number(left.id) - Number(right.id));
}

export async function getMarket(id: number): Promise<any> {
  const state = readDemoState();
  const localMarket = state.localMarkets[marketStorageKey(id)];
  if (localMarket) {
    return normalizeDemoMarket(localMarket);
  }

  const market = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_market",
    args: [id],
  });
  return applyDemoOverlayToMarket(market);
}

async function getRawUserBet(
  marketId: number,
  address: string
): Promise<{ yes_amount: bigint; no_amount: bigint }> {
  try {
    const result = (await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_bet",
      args: [marketId, address],
    })) as any;

    return {
      yes_amount: BigInt(result?.yes_amount ?? 0),
      no_amount: BigInt(result?.no_amount ?? 0),
    };
  } catch {
    return { yes_amount: 0n, no_amount: 0n };
  }
}

export async function getUserBet(
  marketId: number,
  address: string
): Promise<{ yes_amount: number; no_amount: number }> {
  const onChainBet = await getRawUserBet(marketId, address);

  const demoBet = readDemoState().userBets[userBetStorageKey(marketId, address)] ?? {
    yes_amount: "0",
    no_amount: "0",
  };

  return {
    yes_amount: Number(onChainBet.yes_amount + BigInt(demoBet.yes_amount)),
    no_amount: Number(onChainBet.no_amount + BigInt(demoBet.no_amount)),
  };
}

export async function getPendingBalance(address: string): Promise<bigint> {
  let onChainPending = 0n;
  try {
    const result = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_pending_balance",
      args: [address],
    });
    onChainPending = BigInt(result as string | number | bigint);
  } catch {
    onChainPending = 0n;
  }

  const demoPending = BigInt(
    readDemoState().pendingBalances[pendingStorageKey(address)] ?? "0"
  );

  return onChainPending + demoPending;
}

export async function getFeeConfig(): Promise<FeeConfig> {
  try {
    const result = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_fee_config",
      args: [],
    });
    return normalizeFeeConfig(result);
  } catch {
    return ZERO_FEE_CONFIG;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForState<T>(
  label: string,
  load: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 240_000,
  intervalMs = 5_000
): Promise<T> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = await load();
    if (predicate(value)) {
      return value;
    }
    await sleep(intervalMs);
  }

  throw new Error(`${label} did not reach expected on-chain state`);
}

async function waitAccepted(client: ReturnType<typeof createClient>, hash: any) {
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    retries: 60,
    interval: 5000,
  });

  if (
    receipt.statusName &&
    receipt.statusName !== TransactionStatus.ACCEPTED &&
    receipt.statusName !== TransactionStatus.FINALIZED
  ) {
    throw new Error(`Transaction ended as ${receipt.statusName}`);
  }
  if (receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_ERROR) {
    throw new Error("Transaction reverted");
  }

  return receipt;
}

// ─── Write helpers ────────────────────────────────────────────────────────────
export async function createMarket(
  signer: string,
  question: string,
  resolutionUrl: string,
  resolutionCriteria: string,
  deadlineTimestamp: number
) {
  try {
    const client = signingClient(signer);
    const beforeMarkets = await getAllMarkets();
    const hash = await sendConsensusTransaction(
      client,
      CONTRACT_ADDRESS,
      signer,
      "create_market",
      [question, resolutionUrl, resolutionCriteria, deadlineTimestamp],
      0n
    );
    await waitAccepted(client, hash);
    return waitForState(
      "Market creation",
      () => getAllMarkets(),
      (markets) =>
        markets.length > beforeMarkets.length &&
        markets.some((market: any) => market.question === question)
    );
  } catch (error) {
    if (!canUseDemoFallback()) {
      throw error;
    }

    const state = ensureDemoStarterMarkets([]);
    const nextId = Date.now();
    state.localMarkets[marketStorageKey(nextId)] = {
      id: nextId,
      question,
      resolution_url: resolutionUrl,
      resolution_criteria: resolutionCriteria,
      creator: signer,
      deadline: deadlineTimestamp,
      total_yes: "0",
      total_no: "0",
      resolved: false,
      outcome: false,
      is_demo: true,
    };
    writeDemoState(state);
    return {
      demoFallback: true,
      id: nextId,
      reason: error instanceof Error ? error.message : "Bradbury write path is unstable",
    };
  }
}

export async function placeBet(
  signer: string,
  marketId: number,
  voteYes: boolean,
  amountWei: bigint
) {
  try {
    const client = signingClient(signer);
    const feeConfig = await getFeeConfig();
    const { netAmount } = quoteBetBreakdown(amountWei, feeConfig);
    if (netAmount <= 0n) {
      throw new Error("Bet amount is too small after fees");
    }
    const beforePending = await getPendingBalance(signer);
    const missingDeposit = beforePending >= amountWei ? 0n : amountWei - beforePending;

    if (missingDeposit > 0n) {
      const depositHash = await sendConsensusTransaction(
        client,
        CONTRACT_ADDRESS,
        signer,
        "deposit",
        [],
        missingDeposit
      );
      await waitAccepted(client, depositHash);
      await waitForState(
        "Deposit",
        () => getPendingBalance(signer),
        (pending) => pending >= beforePending + missingDeposit
      );
    }

    const beforeMarket = await getMarket(marketId);
    const beforeTotal = BigInt(voteYes ? beforeMarket.total_yes : beforeMarket.total_no);
    const betHash = await sendConsensusTransaction(
      client,
      CONTRACT_ADDRESS,
      signer,
      "place_bet",
      [marketId, voteYes, amountWei],
      0n
    );
    await waitAccepted(client, betHash);
    return waitForState(
      "Bet placement",
      () => getMarket(marketId),
      (market: any) =>
        BigInt(voteYes ? market.total_yes : market.total_no) >= beforeTotal + netAmount
    );
  } catch (error) {
    if (!canUseDemoFallback()) {
      throw error;
    }

    const feeConfig = await getFeeConfig();
    const market = await getMarket(marketId);
    const { netAmount } = recordDemoBet(market, signer, voteYes, amountWei, feeConfig);
    return {
      demoFallback: true,
      netAmount,
      reason: error instanceof Error ? error.message : "Bradbury write path is unstable",
    };
  }
}

export async function resolveMarket(signer: string, marketId: number) {
  try {
    const client = signingClient(signer);
    // resolve_market runs gl.get_webpage() + LLM consensus — can take 30–120s
    const hash = await sendConsensusTransaction(
      client,
      CONTRACT_ADDRESS,
      signer,
      "resolve_market",
      [marketId],
      0n
    );
    return client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.FINALIZED,
      retries: 120,
      interval: 5000,
    });
  } catch (error) {
    if (!canUseDemoFallback()) {
      throw error;
    }

    const market = await getMarket(marketId);
    const outcome = BigInt(market.total_yes) >= BigInt(market.total_no);
    const state = readDemoState();
    setDemoResolution(state, marketId, outcome);
    writeDemoState(state);
    return {
      demoFallback: true,
      outcome,
      reason: error instanceof Error ? error.message : "Bradbury write path is unstable",
    };
  }
}

export async function claimWinnings(signer: string, marketId: number) {
  try {
    const client = signingClient(signer);
    const hash = await sendConsensusTransaction(
      client,
      CONTRACT_ADDRESS,
      signer,
      "claim_winnings",
      [marketId],
      0n
    );
    return waitAccepted(client, hash);
  } catch (error) {
    if (!canUseDemoFallback()) {
      throw error;
    }

    const state = readDemoState();
    const claimKey = userBetStorageKey(marketId, signer);
    if (state.claimed[claimKey]) {
      throw new Error("Already claimed");
    }

    const market = await getMarket(marketId);
    if (!market.resolved) {
      throw new Error("Market not yet resolved");
    }

    const onChainBet = await getRawUserBet(marketId, signer);
    const demoBet = state.userBets[claimKey] ?? { yes_amount: "0", no_amount: "0" };
    const totalYesBet = onChainBet.yes_amount + BigInt(demoBet.yes_amount);
    const totalNoBet = onChainBet.no_amount + BigInt(demoBet.no_amount);
    const winnerStake = market.outcome ? totalYesBet : totalNoBet;
    if (winnerStake <= 0n) {
      throw new Error("No winning stake");
    }

    const totalPool = BigInt(market.total_yes) + BigInt(market.total_no);
    const winningPool = market.outcome ? BigInt(market.total_yes) : BigInt(market.total_no);
    const payout = (winnerStake * totalPool) / winningPool;

    state.claimed[claimKey] = true;
    addDemoPendingBalance(state, signer, payout);
    writeDemoState(state);

    return {
      demoFallback: true,
      payout,
      reason: error instanceof Error ? error.message : "Bradbury write path is unstable",
    };
  }
}

export async function withdrawPending(signer: string, amountWei: bigint) {
  const state = readDemoState();
  const key = pendingStorageKey(signer);
  const demoPending = BigInt(state.pendingBalances[key] ?? "0");
  const demoWithdrawal = demoPending >= amountWei ? amountWei : demoPending;

  if (demoWithdrawal > 0n) {
    state.pendingBalances[key] = (demoPending - demoWithdrawal).toString();
    writeDemoState(state);
    if (demoWithdrawal === amountWei) {
      return { demoFallback: true, withdrawn: demoWithdrawal };
    }
  }

  const remainder = amountWei - demoWithdrawal;
  try {
    const client = signingClient(signer);
    const hash = await sendConsensusTransaction(
      client,
      CONTRACT_ADDRESS,
      signer,
      "withdraw_pending",
      [remainder],
      0n
    );
    return waitAccepted(client, hash);
  } catch (error) {
    if (demoWithdrawal > 0n) {
      state.pendingBalances[key] = demoPending.toString();
      writeDemoState(state);
    }
    throw error;
  }
}

// ─── Utils ────────────────────────────────────────────────────────────────────
export function formatDeadline(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export function isExpired(deadline: number): boolean {
  return Date.now() / 1000 >= deadline;
}
