# Demo Video

## Goal

Record a short hackathon demo that shows:

1. live on-chain prediction markets
2. wallet connection on GenLayer Bradbury
3. betting UX
4. AI-based market resolution concept

Current production-safe setup:

- read data comes from the live contract at `0x9c5fC6d6091e1B30080e37Eb782da1E44F8F14CE`
- Bradbury write transactions are unstable right now
- the frontend has a clearly marked demo fallback for bets if write txs stall

That means the honest pitch is:
"Markets and pools are read on-chain live. If Bradbury stalls during the demo, the app falls back locally so the product flow is still visible on stage."

---

## Best Format

- Length: `75-90 seconds`
- Style: screen recording + your voice
- Ratio: `16:9`
- Pace: fast, concrete, no long intro

Recommended structure:

1. `0:00-0:10` Hook
2. `0:10-0:30` Show live markets and shared pools
3. `0:30-0:50` Connect wallet and place a bet
4. `0:50-1:05` Show resolution logic
5. `1:05-1:20` Close with why this matters

---

## Recording Setup

Open these before recording:

1. `cd frontend && npm run dev`
2. open `http://localhost:3000`
3. have MetaMask unlocked
4. keep one market open in the right panel
5. if possible, preselect market `#0`

Safe recording tip:

- Do one dry run before the real take
- If betting hangs, keep recording and narrate the fallback instead of restarting

---

## Shot List

### Shot 1: Landing screen

Show:

- market feed
- pool balances
- contract-backed UI
- "Demo fallback enabled" banner

Say:

"This is Foresight, a prediction market on GenLayer. The market list and pool balances are being read live from the contract."

### Shot 2: Open one market

Show:

- YES / NO percentages
- GEN pool totals
- resolution URL and criteria area

Say:

"Each market stores the question, the source URL used for resolution, and the liquidity on both sides."

### Shot 3: Connect wallet

Show:

- connect wallet
- Bradbury network

Say:

"A user connects with MetaMask on GenLayer Testnet Bradbury and can immediately interact with the same markets everyone else sees."

### Shot 4: Place a bet

Show:

- enter `0.01`
- click `BET YES` or `BET NO`
- if chain succeeds, show confirmation
- if chain stalls, show the fallback message

Say if tx succeeds:

"Placing a bet is a real contract interaction. The app deposits GEN, waits for the balance on-chain, and records the bet."

Say if fallback appears:

"Bradbury write transactions are unstable right now, so for the demo the app switches to a clearly marked fallback while still reading the market state on-chain."

### Shot 5: Create / explain resolution

Best option:

- open the create market modal briefly

Then say:

"What makes this interesting is resolution. The contract can fetch a live webpage like BBC or Reuters on-chain and ask LLM validators whether the resolution criteria are met."

### Shot 6: Final close

Show:

- market feed again
- selected market
- live look of the app

Say:

"So the product is simple for the user: connect, browse markets, take a side, and let the contract resolve from public information instead of a trusted oracle."

---

## Full 90-Second Script

Use this almost word for word if you want a clean single-take recording:

> This is Foresight, a prediction market built on GenLayer.
>
> What you’re looking at here is a live market feed pulled from the contract. Every market has a yes side, a no side, pool balances, and resolution criteria.
>
> The key idea is that resolution does not depend on a centralized admin or a traditional oracle. Instead, the GenLayer contract can fetch a live webpage, like BBC or Reuters, and LLM validators reach consensus on whether the criteria were met.
>
> On the user side, the flow is simple. You connect MetaMask on GenLayer Bradbury, open a market, and place a bet.
>
> Right now Bradbury write transactions are unstable, so this demo includes a clearly marked fallback for betting. Reads still come from the live contract, and the full product flow is still visible even when the testnet stalls.
>
> The result is a prediction market interface where market state is transparent, resolution logic is explicit, and the user experience stays simple.

---

## Ultra-Short 45-Second Version

If the hackathon asks for a very short clip, use this:

> This is Foresight, a GenLayer prediction market.
>
> Markets and liquidity are read live from the contract, and each market includes a public source URL plus resolution criteria.
>
> Instead of using a traditional oracle, the contract can fetch a webpage and let LLM validators reach consensus on the outcome.
>
> Users connect with MetaMask, place a bet, and follow the market from the same shared interface.
>
> Bradbury is unstable today, so the demo includes a visible fallback for writes while keeping live on-chain reads.

---

## What To Avoid Saying

Do not say:

- "everything is fully stable on testnet"
- "all writes are guaranteed live right now"
- "the fallback is on-chain"

Prefer:

- "reads are live on-chain"
- "writes on Bradbury are unstable today"
- "the demo keeps the product flow usable on stage"

---

## Best Demo Path

If you want the safest take:

1. open the app
2. show the live markets
3. connect wallet
4. place a small bet
5. if fallback appears, keep going and explain it in one sentence
6. close on the resolution idea

This path is better than chasing a perfect live write on Bradbury during recording.

---

## One-Line Submission Summary

Use this under the video link in the hackathon form:

`Foresight is a GenLayer prediction market where contracts read public web sources and use LLM consensus for resolution, with a demo-safe fallback for unstable Bradbury writes.`
