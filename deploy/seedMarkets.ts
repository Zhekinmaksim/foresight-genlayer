/**
 * seedMarkets.ts
 *
 * Run AFTER deploying the contract:
 *   npm run seed
 *
 * Creates initial markets and places opening bets on both sides so the app
 * doesn't look empty when the first user arrives.
 *
 * Uses your PRIVATE_KEY from .env — all seed bets come from your wallet.
 */

import "dotenv/config";

// ─── Seed data ────────────────────────────────────────────────────────────────
// Each market gets opening bets on YES and NO so the odds bar is visible.
// Adjust bet sizes (in GEN) to match how much you want to seed.

const MARKETS: {
  question: string;
  resolution_url: string;
  resolution_criteria: string;
  deadline_days: number;          // days from now until betting closes
  seed_yes_gen: number;           // GEN to put on YES
  seed_no_gen: number;            // GEN to put on NO
}[] = [
  {
    question: "Will the Federal Reserve cut interest rates before October 2026?",
    resolution_url: "https://www.bbc.com/news/business",
    resolution_criteria:
      "The page contains news confirming the Federal Reserve announced an interest rate cut before October 2026.",
    deadline_days: 180,
    seed_yes_gen: 0.2,
    seed_no_gen: 0.3,
  },
  {
    question: "Will Bitcoin reach $150,000 before January 2027?",
    resolution_url: "https://www.reuters.com/markets/currencies/",
    resolution_criteria:
      "The page confirms Bitcoin price reached or exceeded $150,000 USD before January 2027.",
    deadline_days: 270,
    seed_yes_gen: 0.3,
    seed_no_gen: 0.3,
  },
  {
    question: "Will OpenAI announce GPT-6 before January 2027?",
    resolution_url: "https://www.bbc.com/news/technology",
    resolution_criteria:
      "The page contains news confirming OpenAI officially announced or released GPT-6 before January 2027.",
    deadline_days: 240,
    seed_yes_gen: 0.4,
    seed_no_gen: 0.3,
  },
  {
    question: "Will Ethereum ETF net inflows exceed $2B in a single month during 2026?",
    resolution_url: "https://www.reuters.com/markets/",
    resolution_criteria:
      "The page reports that Ethereum ETFs recorded net inflows exceeding $2 billion in a single calendar month at any point in 2026.",
    deadline_days: 220,
    seed_yes_gen: 0.2,
    seed_no_gen: 0.2,
  },
  {
    question: "Will Apple release smart glasses before January 2027?",
    resolution_url: "https://www.bbc.com/news/technology",
    resolution_criteria:
      "The page confirms Apple officially announced or released smart glasses before January 2027.",
    deadline_days: 300,
    seed_yes_gen: 0.3,
    seed_no_gen: 0.3,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toWei(gen: number): bigint {
  return BigInt(Math.round(gen * 1e18));
}

function deadlineTimestamp(days: number): number {
  return Math.floor(Date.now() / 1000) + days * 86400;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatGen(amountWei: bigint): string {
  const whole = amountWei / 10n ** 18n;
  const fraction = amountWei % 10n ** 18n;
  if (fraction === 0n) return whole.toString();
  const fractionStr = fraction.toString().padStart(18, "0").replace(/0+$/, "").slice(0, 4);
  return `${whole}.${fractionStr}`;
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

function grossUpForNetTarget(netAmount: bigint, totalFeeBps: bigint): bigint {
  if (netAmount <= 0n || totalFeeBps <= 0n) {
    return netAmount;
  }

  const denominator = 10_000n - totalFeeBps;
  if (denominator <= 0n) {
    throw new Error("Invalid fee configuration: total fee must be below 100%");
  }

  return ceilDiv(netAmount * 10_000n, denominator);
}

async function sendConsensusTransaction(
  client: any,
  chain: any,
  account: any,
  address: `0x${string}`,
  method: string,
  args: any[],
  value: bigint
) {
  const [{ bytesToHex, encodeFunctionData, parseEventLogs }, { abi: genlayerAbi }] =
    await Promise.all([import("viem"), import("genlayer-js")]);

  const consensus = chain.consensusMainContract;
  const txData = bytesToHex(
    genlayerAbi.calldata.encode(
      genlayerAbi.calldata.makeCalldataObject(method, args as any, undefined)
    )
  );
  const data = encodeFunctionData({
    abi: consensus.abi,
    functionName: "addTransaction",
    args: [
      account.address,
      address,
      BigInt(chain.defaultNumberOfInitialValidators),
      BigInt(chain.defaultConsensusMaxRotations),
      txData,
      0n,
    ],
  });

  const gasPriceHex = await client.request({ method: "eth_gasPrice" });
  const gasEstimate = await client.estimateTransactionGas({
    from: account.address,
    to: consensus.address,
    data,
    value,
  });
  // Bradbury can underestimate gas for addTransaction; pad it to avoid
  // EVM-level reverts before the GenLayer tx is even created.
  const gas = (gasEstimate * 12n) / 10n + 150_000n;
  const nonce = await client.getCurrentNonce({ address: account.address });
  const serialized = await account.signTransaction({
    to: consensus.address,
    data,
    type: "legacy",
    nonce: Number(nonce),
    value,
    gas,
    gasPrice: BigInt(gasPriceHex),
    chainId: chain.id,
  });

  const evmHash = await client.sendRawTransaction({ serializedTransaction: serialized });
  let evmReceipt = null;
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
      `External transaction reverted (${method}, evm=${evmHash}, gasUsed=${gasUsed}, gasLimit=${gas.toString()})`
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
    throw new Error("Transaction not processed by consensus");
  }

  return txId;
}

async function wait(
  client: any,
  hash: any,
  label: string,
  acceptedStatus: unknown,
  finishedWithError: unknown
) {
  const displayHash = String(hash);
  process.stdout.write(`  ⏳ ${label} [${displayHash}]…`);
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: acceptedStatus,
    retries: 60,
    interval: 5000,
  });
  if (receipt.txExecutionResultName === finishedWithError) {
    throw new Error(`Transaction reverted (${label})`);
  }

  if (receipt.statusName && receipt.statusName !== acceptedStatus && receipt.statusName !== "FINALIZED") {
    throw new Error(`Transaction ended as ${receipt.statusName} (${label})`);
  }

  if (!receipt.statusName) {
    console.log(" ? receipt incomplete, checking on-chain state");
    return receipt;
  }

  console.log(" ✓");
  return receipt;
}

async function readState(client: any, address: `0x${string}`, owner: `0x${string}`) {
  const marketCount = Number(
    await client.readContract({
      address,
      functionName: "get_market_count",
      args: [],
    })
  );

  const markets = [];
  for (let i = 0; i < marketCount; i++) {
    markets.push(
      await client.readContract({
        address,
        functionName: "get_market",
        args: [i],
      })
    );
  }

  const pending = BigInt(
    await client.readContract({
      address,
      functionName: "get_pending_balance",
      args: [owner],
    })
  );

  const balanceInfoRaw = await client.readContract({
    address,
    functionName: "get_contract_balance_info",
    args: [],
  });

  let feeConfig = {
    creator_fee_bps: 0n,
    protocol_fee_bps: 0n,
    total_fee_bps: 0n,
    protocol_treasury: "" as string,
  };
  try {
    const feeConfigRaw = await client.readContract({
      address,
      functionName: "get_fee_config",
      args: [],
    });
    feeConfig = {
      creator_fee_bps: BigInt(feeConfigRaw.creator_fee_bps),
      protocol_fee_bps: BigInt(feeConfigRaw.protocol_fee_bps),
      total_fee_bps: BigInt(feeConfigRaw.total_fee_bps),
      protocol_treasury: String(feeConfigRaw.protocol_treasury ?? ""),
    };
  } catch {
    // Older contracts do not expose fee config; treat them as zero-fee.
  }

  return {
    marketCount,
    markets,
    pending,
    feeConfig,
    balanceInfo: {
      balance: BigInt(balanceInfoRaw.balance),
      accounted_balance: BigInt(balanceInfoRaw.accounted_balance),
    },
  };
}

function findMarketIndexByQuestion(state: any, question: string): number {
  return state.markets.findIndex((market: any) => market.question === question);
}

async function waitForState(
  label: string,
  refresh: () => Promise<any>,
  predicate: (state: any) => boolean,
  timeoutMs = 240_000,
  intervalMs = 5_000
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const state = await refresh();
    if (predicate(state)) {
      return state;
    }
    await sleep(intervalMs);
  }

  throw new Error(`${label} did not appear on-chain in time`);
}

async function waitForCleanAccounting(
  client: any,
  address: `0x${string}`,
  owner: `0x${string}`,
) {
  let state = await readState(client, address, owner);
  const delta = state.balanceInfo.balance - state.balanceInfo.accounted_balance;

  if (delta <= 0n) {
    return state;
  }

  console.log(`  ↪ Waiting for ${formatGen(delta)} GEN already in flight to settle`);

  state = await waitForState(
    "clean accounting",
    () => readState(client, address, owner),
    (nextState) => nextState.balanceInfo.balance === nextState.balanceInfo.accounted_balance
  );

  return state;
}

async function ensurePendingBalance(
  client: any,
  chain: any,
  account: any,
  address: `0x${string}`,
  owner: `0x${string}`,
  requiredAmount: bigint,
  TransactionStatus: any,
  ExecutionResult: any
) {
  let state = await readState(client, address, owner);

  if (state.pending >= requiredAmount) {
    return state;
  }

  if (state.balanceInfo.balance > state.balanceInfo.accounted_balance) {
    state = await waitForCleanAccounting(client, address, owner);
  }

  if (state.pending >= requiredAmount) {
    return state;
  }

  const missingAmount = requiredAmount - state.pending;
  const beforePending = state.pending;

  const depositHash = await sendConsensusTransaction(
    client,
    chain,
    account,
    address,
    "deposit",
    [],
    missingAmount
  );
  await wait(
    client,
    depositHash,
    `depositing ${formatGen(missingAmount)} GEN`,
    TransactionStatus.ACCEPTED,
    ExecutionResult.FINISHED_WITH_ERROR
  );

  return waitForState(
    "deposited balance",
    () => readState(client, address, owner),
    (nextState) => nextState.pending >= beforePending + missingAmount
  );
}

async function ensureMarketSeeded(
  client: any,
  chain: any,
  account: any,
  address: `0x${string}`,
  owner: `0x${string}`,
  marketId: number,
  voteYes: boolean,
  targetTotal: bigint,
  TransactionStatus: any,
  ExecutionResult: any
) {
  let state = await readState(client, address, owner);
  const market = state.markets[marketId];
  const currentTotal = BigInt(voteYes ? market.total_yes : market.total_no);

  if (currentTotal >= targetTotal) {
    return state;
  }

  const missingNetAmount = targetTotal - currentTotal;
  const grossAmount = grossUpForNetTarget(missingNetAmount, state.feeConfig.total_fee_bps);
  const side = voteYes ? "YES" : "NO";
  const betHash = await sendConsensusTransaction(
    client,
    chain,
    account,
    address,
    "place_bet_now",
    [marketId, voteYes],
    grossAmount
  );
  await wait(
    client,
    betHash,
    state.feeConfig.total_fee_bps > 0n
      ? `recording ${formatGen(missingNetAmount)} GEN net on ${side} (${formatGen(grossAmount)} gross)`
      : `recording ${formatGen(missingNetAmount)} GEN on ${side}`,
    TransactionStatus.ACCEPTED,
    ExecutionResult.FINISHED_WITH_ERROR
  );

  return waitForState(
    `${side} liquidity`,
    () => readState(client, address, owner),
    (nextState) => {
      const nextMarket = nextState.markets[marketId];
      const nextTotal = BigInt(voteYes ? nextMarket.total_yes : nextMarket.total_no);
      return nextTotal >= currentTotal + missingNetAmount;
    }
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [{ createClient, createAccount }, { testnetBradbury }, { TransactionStatus, ExecutionResult }] =
    await Promise.all([
      import("genlayer-js"),
      import("genlayer-js/chains"),
      import("genlayer-js/types"),
    ]);

  const privateKey = process.env.PRIVATE_KEY;
  const contractAddress = process.env.CONTRACT_ADDRESS as `0x${string}`;

  if (!privateKey) throw new Error("PRIVATE_KEY missing in .env");
  if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error(
      "CONTRACT_ADDRESS missing in .env — deploy the contract first with `npm run deploy`"
    );
  }

  const account = createAccount(privateKey as `0x${string}`);
  const client = createClient({ chain: testnetBradbury, account });

  console.log(`\n🌱 Seeding up to ${MARKETS.length} markets on Testnet Bradbury`);
  console.log(`   From: ${account.address}`);
  console.log(`   Contract: ${contractAddress}\n`);

  let state = await readState(client, contractAddress, account.address);
  if (state.feeConfig.total_fee_bps > 0n) {
    console.log(
      `   Fees: ${(Number(state.feeConfig.creator_fee_bps) / 100).toFixed(2)}% creator + ${(Number(state.feeConfig.protocol_fee_bps) / 100).toFixed(2)}% protocol`
    );
    console.log("   Seed targets below refer to net pool liquidity after fees\n");
  }

  for (let i = 0; i < MARKETS.length; i++) {
    const m = MARKETS[i];
    console.log(`\n[${i + 1}/${MARKETS.length}] ${m.question.slice(0, 60)}…`);

    state = await readState(client, contractAddress, account.address);
    let marketId = findMarketIndexByQuestion(state, m.question);

    if (marketId === -1) {
      const beforeCount = state.marketCount;
      const createHash = await sendConsensusTransaction(
        client,
        testnetBradbury,
        account,
        contractAddress,
        "create_market",
        [
          m.question,
          m.resolution_url,
          m.resolution_criteria,
          deadlineTimestamp(m.deadline_days),
        ],
        0n
      );
      await wait(
        client,
        createHash,
        "creating market",
        TransactionStatus.ACCEPTED,
        ExecutionResult.FINISHED_WITH_ERROR
      );

      state = await waitForState(
        "new market",
        () => readState(client, contractAddress, account.address),
        (nextState) =>
          nextState.marketCount > beforeCount &&
          findMarketIndexByQuestion(nextState, m.question) !== -1
      );
      marketId = findMarketIndexByQuestion(state, m.question);
    }

    state = await ensureMarketSeeded(
      client,
      testnetBradbury,
      account,
      contractAddress,
      account.address,
      marketId,
      true,
      toWei(m.seed_yes_gen),
      TransactionStatus,
      ExecutionResult
    );

    state = await ensureMarketSeeded(
      client,
      testnetBradbury,
      account,
      contractAddress,
      account.address,
      marketId,
      false,
      toWei(m.seed_no_gen),
      TransactionStatus,
      ExecutionResult
    );
  }

  const totalSeedGEN = MARKETS.reduce(
    (s, m) => s + m.seed_yes_gen + m.seed_no_gen,
    0
  );

  console.log(`\n✅ Seeding complete!`);
  console.log(`   ${MARKETS.length} markets created`);
  console.log(`   ${totalSeedGEN.toFixed(1)} GEN seeded across all pools`);
  console.log(`\n👉 Set in Vercel / .env.local:`);
  console.log(`   NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}\n`);
}

main().catch((e) => {
  console.error("\n❌", e.message);
  process.exit(1);
});
