import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";

async function deploy() {
  console.log("🚀 Deploying Prediction Market to Testnet Bradbury...\n");

  const [
    { createClient, createAccount },
    { testnetBradbury },
    { TransactionStatus, ExecutionResult },
  ] =
    await Promise.all([
      import("genlayer-js"),
      import("genlayer-js/chains"),
      import("genlayer-js/types"),
    ]);

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Set PRIVATE_KEY in .env");
  }

  const account = createAccount(privateKey as `0x${string}`);
  console.log(`📬 Deploying from: ${account.address}`);

  const client = createClient({
    chain: testnetBradbury,
    account,
  });

  // Initialize consensus contract (required before any deploy)
  console.log("⚙️  Initializing consensus smart contract...");
  await client.initializeConsensusSmartContract();

  const contractPath = resolve(__dirname, "../contracts/prediction_market.py");
  const contractCode = readFileSync(contractPath, "utf-8");

  console.log("📦 Deploying contract...");
  const hash = await client.deployContract({
    code: contractCode,
    args: [],
    leaderOnly: false,
  });

  console.log(`📝 Deploy tx: ${hash}`);
  console.log("⏳ Waiting for confirmation (may take 30–120s on testnet)...");

  type WaitForReceiptArgs = Parameters<typeof client.waitForTransactionReceipt>[0];
  const receipt = await client.waitForTransactionReceipt({
    hash: hash as WaitForReceiptArgs["hash"],
    status: TransactionStatus.ACCEPTED,
    retries: 60,
    interval: 5000,
  });

  const contractAddress =
    (receipt.txDataDecoded as { contractAddress?: `0x${string}` } | undefined)?.contractAddress ??
    receipt.recipient;

  if (receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_ERROR) {
    throw new Error(
      `Deploy transaction ${hash} reached ACCEPTED but execution failed. Check the transaction trace before using ${contractAddress}.`
    );
  }

  console.log(`\n✅ Contract deployed at: ${contractAddress}`);
  console.log(`\n👉 Add to your .env:`);
  console.log(`   CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`   NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`);

  return contractAddress;
}

deploy().catch((error) => {
  console.error(error);
  process.exit(1);
});
