# Foresight

Submission for the **Bradbury Builders Hackathon**.

Foresight is a prediction market on **GenLayer**. Each market has a yes/no
question, a public source URL, resolution criteria, and a deadline. Users bet
in GEN, anyone can resolve the market after expiry, and winners can claim from
the contract.

There is no backend and no separate oracle service. Resolution comes from the
Intelligent Contract itself.

## What is in the repo

- GenLayer contract for market creation, betting, resolution, claims, and fees
- fee split on each bet:
  - `7%` to the market creator
  - `3%` to protocol
- Next.js frontend with wallet connect and network switch flow
- deploy and seed scripts
- demo video script and subtitles

## Current status

- Fee-enabled contract deployed on Bradbury:
  - `0xce48ce837B053F1b5c2A7e0cB1070e2d736b3cd7`
- Frontend is configured to read from that contract
- On-chain reads work
- Bradbury write transactions are still inconsistent

Because of that last point, the frontend includes a marked demo fallback. If a
write transaction stalls, the browser can still complete the full demo flow:

- create market
- place bet
- resolve
- claim
- withdraw

That keeps the demo usable without pretending the network is more stable than
it is.

## Why this fits the hackathon

The project fits **Prediction Markets** first, and **Intelligent Oracles**
second.

Markets are tied to public events and resolved from public pages. That gives a
simple recurring loop:

- create market
- bet
- resolve
- claim

The fee split also gives market creators a reason to create markets that people
actually use.

## How resolution works

After the deadline, anyone can call `resolve_market()`.

The contract:

1. fetches the configured page with `gl.get_webpage(...)`
2. evaluates the resolution criteria
3. reaches validator consensus on the result
4. stores the final outcome on-chain

## Local demo

```bash
npm install
cd frontend
npm install
npm run dev
```

Then open `http://localhost:3000` and connect MetaMask on **GenLayer Testnet
Bradbury**.

## Environment variables

Root `.env` is only needed for deploy and seed scripts:

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

## Redeploy

If you want to deploy a fresh contract:

```bash
npm install -g genlayer
genlayer network set testnet-bradbury
npm install
cp .env.example .env
# set PRIVATE_KEY=0x...
npm run deploy
```

If Bradbury is behaving well enough, you can then try:

```bash
npm run seed
```

## Verification

```bash
cd frontend
npm run build
npx tsc -p tsconfig.json --noEmit
```

## Structure

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

## Links

- GenLayer docs: [https://docs.genlayer.com](https://docs.genlayer.com)
- Faucet: [https://testnet-faucet.genlayer.foundation](https://testnet-faucet.genlayer.foundation)
- GenLayer Studio: [https://studio.genlayer.com](https://studio.genlayer.com)
- Bradbury explorer: [https://zksync-os-testnet-genlayer.explorer.zksync.dev](https://zksync-os-testnet-genlayer.explorer.zksync.dev)
