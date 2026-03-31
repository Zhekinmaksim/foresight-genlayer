# Foresight

Hackathon submission for the **Bradbury Builders Hackathon**.

Foresight is an AI-native prediction market built on **GenLayer**. Users create
YES/NO markets around public events, place bets in GEN, and resolve outcomes
from public web pages directly on-chain. The contract fetches the source page,
validators evaluate the resolution criteria, and winners claim automatically.

No backend. No admin panel. No external oracle server.

## What the product does

- Create a market with a question, resolution URL, criteria, and deadline
- Place GEN-backed bets on YES or NO
- Resolve markets from public web pages through GenLayer validator consensus
- Claim winnings on-chain after resolution
- Route fees from each incoming bet:
  - `7%` to the market creator
  - `3%` to protocol

## Hackathon status

This repo is set up for a real hackathon demo, not just a code sample.

- The fee-enabled contract was deployed to Bradbury testnet:
  - `0xce48ce837B053F1b5c2A7e0cB1070e2d736b3cd7`
- The frontend is already configured to point at that contract in local demo mode
- On-chain reads work
- Bradbury write transactions are currently unstable, so the frontend includes a
  **clearly marked demo fallback**

That fallback matters for the demo:

- if Bradbury accepts writes, the app uses the live contract
- if Bradbury stalls, the browser can still complete the full interaction flow:
  - create market
  - place bet
  - resolve
  - claim
  - withdraw

This makes the app usable end-to-end for a hackathon presentation while keeping
the core architecture honest: contract reads, fee config, and GenLayer
integration are still real.

## Why this fits the hackathon

Foresight sits primarily in the **Prediction Markets** track, with a second
angle in **Intelligent Oracles**.

The core idea is simple:

- markets are created around recurring public events
- betting creates repeated transaction flow
- resolution comes from public URLs, not a manual oracle operator
- creators earn a share of usage through fee split

That makes it a stronger hackathon story than a one-off toy market. The product
is built around recurring transactions: create, bet, resolve, claim.

## How resolution works

After the market deadline, anyone can call `resolve_market()`.

The Intelligent Contract:

1. fetches the configured public page with `gl.get_webpage(...)`
2. evaluates the resolution criteria
3. reaches consensus through GenLayer validators
4. stores the final YES/NO outcome on-chain

The frontend then reads the resolved state and lets winners claim.

## Project structure

```text
prediction-market/
├── contracts/
│   └── prediction_market.py
├── deploy/
│   ├── deployScript.ts
│   └── seedMarkets.ts
├── frontend/
│   ├── src/app/page.tsx
│   ├── src/components/
│   └── src/lib/
├── DEMO_VIDEO.md
├── DEMO_VIDEO.srt
├── README.md
└── vercel.json
```

## Local demo run

The current repo is easiest to show locally.

### 1. Install dependencies

```bash
npm install
cd frontend
npm install
```

### 2. Start the frontend

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`.

### 3. Connect MetaMask

Use **GenLayer Testnet Bradbury**. The app can prompt MetaMask to add or switch
the network.

## Environment variables

Root `.env` is only needed for deploy or seed scripts:

```bash
PRIVATE_KEY=0x...
CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
```

Frontend local env:

```bash
NEXT_PUBLIC_CONTRACT_ADDRESS=0xce48ce837B053F1b5c2A7e0cB1070e2d736b3cd7
NEXT_PUBLIC_DEMO_FALLBACK=true
```

## Deploying a new contract

If you want to redeploy instead of using the current demo setup:

```bash
npm install -g genlayer
genlayer network set testnet-bradbury
npm install
cp .env.example .env
# set PRIVATE_KEY=0x...
npm run deploy
```

The deploy script prints the contract address. Then update:

- `CONTRACT_ADDRESS`
- `NEXT_PUBLIC_CONTRACT_ADDRESS`

If Bradbury behaves well enough for initial liquidity, you can try:

```bash
npm run seed
```

## What is already implemented

- Intelligent Contract in Python for GenLayer
- fee split on bet entry
- creator earnings tracked in pending balances
- protocol earnings tracked in pending balances
- frontend wallet connect and network switch flow
- market feed, market detail, create modal
- demo-safe fallback for unstable write transactions
- demo video script and subtitles

## Known limitation

The main limitation is not the app code anymore. It is Bradbury testnet write
stability.

Because of that, this repo intentionally ships with a demo fallback path. It is
there to make the product presentable and testable during the hackathon without
pretending the network is more stable than it currently is.

## Verification

The frontend was verified with:

```bash
cd frontend
npm run build
npx tsc -p tsconfig.json --noEmit
```

## Useful links

- GenLayer docs: [https://docs.genlayer.com](https://docs.genlayer.com)
- Faucet: [https://testnet-faucet.genlayer.foundation](https://testnet-faucet.genlayer.foundation)
- GenLayer Studio: [https://studio.genlayer.com](https://studio.genlayer.com)
- Bradbury explorer: [https://zksync-os-testnet-genlayer.explorer.zksync.dev](https://zksync-os-testnet-genlayer.explorer.zksync.dev)
