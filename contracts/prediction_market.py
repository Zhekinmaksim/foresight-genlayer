# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json
from dataclasses import dataclass


@allow_storage
@dataclass
class Market:
    id: u256
    question: str
    resolution_url: str       # URL contract reads to determine outcome (BBC, Reuters, etc.)
    resolution_criteria: str  # Plain-English criteria for YES verdict
    creator: str
    deadline: u256            # Unix timestamp after which resolution is allowed
    total_yes: u256           # Total GEN staked on YES (in wei)
    total_no: u256            # Total GEN staked on NO  (in wei)
    resolved: bool
    outcome: bool             # True = YES won, False = NO won


@allow_storage
@dataclass
class Bet:
    yes_amount: u256
    no_amount: u256


class PredictionMarket(gl.Contract):
    """
    Self-settling Prediction Market on GenLayer.

    The contract fetches a real URL (BBC, Reuters, AP, etc.) using gl.get_webpage()
    and asks an LLM to determine if the resolution criteria is met.
    No oracles. No admins. Pure Intelligent Contract consensus.
    """

    markets: DynArray[Market]
    next_id: u256

    # bets[market_id][address] = (yes_amount, no_amount)
    bets: TreeMap[u256, TreeMap[str, Bet]]

    # claimed[market_id][address] = True if already claimed
    claimed: TreeMap[u256, TreeMap[str, bool]]

    # pending_balances[address] = unallocated GEN deposited via __receive__
    pending_balances: TreeMap[str, u256]
    # Total GEN currently accounted for by pending balances and market pools
    accounted_balance: u256
    protocol_treasury: str
    creator_fee_bps: u256
    protocol_fee_bps: u256

    def __init__(self) -> None:
        self.protocol_treasury = str(gl.message.sender_address)
        self.creator_fee_bps = u256(700)
        self.protocol_fee_bps = u256(300)
        assert self.creator_fee_bps + self.protocol_fee_bps < u256(10000), "Invalid fee configuration"

    def _credit_pending_balance(self, sender: str, amount: u256) -> u256:
        assert amount > 0, "Must send GEN tokens"
        existing = self.pending_balances.get(sender, u256(0))
        updated = existing + amount
        self.pending_balances[sender] = updated
        return updated

    def _detect_incoming_value(self) -> u256:
        """
        Bradbury does not always surface attached GEN via gl.message.value.
        Fall back to observing the contract balance delta.
        """
        if gl.message.value > 0:
            return gl.message.value

        current_balance = self.balance
        assert current_balance >= self.accounted_balance, "Contract balance invariant broken"
        return current_balance - self.accounted_balance

    @gl.public.write.payable
    def __receive__(self) -> None:
        sender = str(gl.message.sender_address)
        amount = self._detect_incoming_value()
        self.accounted_balance += amount
        self._credit_pending_balance(sender, amount)

    @gl.public.write.payable
    def deposit(self) -> u256:
        """
        Explicit payable entrypoint for Bradbury clients.
        Using a named method is more reliable than relying on bare receive calls.
        """
        sender = str(gl.message.sender_address)
        amount = self._detect_incoming_value()
        self.accounted_balance += amount
        return self._credit_pending_balance(sender, amount)

    @gl.public.write
    def create_market(
        self,
        question: str,
        resolution_url: str,
        resolution_criteria: str,
        deadline: u256,
    ) -> u256:
        """
        Create a new prediction market.
        
        Args:
            question: The yes/no question (e.g. "Will the Fed cut rates in June 2025?")
            resolution_url: URL to fetch for resolution (e.g. "https://www.bbc.com/news/business")
            resolution_criteria: Plain English criteria for YES
                                  (e.g. "Article confirms Federal Reserve cut rates")
            deadline: Unix timestamp after which resolution is allowed
        Returns:
            Market ID
        """
        market = Market(
            id=self.next_id,
            question=question,
            resolution_url=resolution_url,
            resolution_criteria=resolution_criteria,
            creator=str(gl.message.sender_address),
            deadline=deadline,
            total_yes=u256(0),
            total_no=u256(0),
            resolved=False,
            outcome=False,
        )
        self.markets.append(market)
        self.bets[self.next_id] = gl.storage.inmem_allocate(TreeMap[str, Bet])
        self.claimed[self.next_id] = gl.storage.inmem_allocate(TreeMap[str, bool])
        self.next_id += u256(1)
        return self.next_id - u256(1)

    @gl.public.write
    def place_bet(self, market_id: u256, vote_yes: bool, amount: u256) -> None:
        """
        Place a bet using previously deposited GEN.
        vote_yes=True  → betting that the outcome is YES
        vote_yes=False → betting that the outcome is NO
        """
        assert market_id < len(self.markets), "Market does not exist"
        market = self.markets[market_id]
        assert not market.resolved, "Market already resolved"
        assert amount > 0, "Must send GEN tokens to place a bet"

        sender = str(gl.message.sender_address)
        pending_balance = self.pending_balances.get(sender, u256(0))
        assert pending_balance >= amount, "Insufficient deposited balance"
        self.pending_balances[sender] = pending_balance - amount

        creator_fee = (amount * self.creator_fee_bps) // u256(10000)
        protocol_fee = (amount * self.protocol_fee_bps) // u256(10000)
        net_amount = amount - creator_fee - protocol_fee
        assert net_amount > 0, "Bet amount too small after fees"

        if creator_fee > 0:
            self._credit_pending_balance(market.creator, creator_fee)
        if protocol_fee > 0:
            self._credit_pending_balance(self.protocol_treasury, protocol_fee)

        existing = self.bets[market_id].get(sender, Bet(u256(0), u256(0)))

        if vote_yes:
            self.bets[market_id][sender] = Bet(existing.yes_amount + net_amount, existing.no_amount)
            self.markets[market_id].total_yes += net_amount
        else:
            self.bets[market_id][sender] = Bet(existing.yes_amount, existing.no_amount + net_amount)
            self.markets[market_id].total_no += net_amount

    @gl.public.write.payable
    def place_bet_now(self, market_id: u256, vote_yes: bool) -> u256:
        """
        Place a bet in a single transaction using the attached GEN amount.
        This avoids Bradbury's flaky zero-value follow-up transaction path.
        """
        assert market_id < len(self.markets), "Market does not exist"
        market = self.markets[market_id]
        assert not market.resolved, "Market already resolved"

        sender = str(gl.message.sender_address)
        amount = self._detect_incoming_value()
        assert amount > 0, "Must send GEN tokens to place a bet"
        self.accounted_balance += amount

        creator_fee = (amount * self.creator_fee_bps) // u256(10000)
        protocol_fee = (amount * self.protocol_fee_bps) // u256(10000)
        net_amount = amount - creator_fee - protocol_fee
        assert net_amount > 0, "Bet amount too small after fees"

        if creator_fee > 0:
            self._credit_pending_balance(market.creator, creator_fee)
        if protocol_fee > 0:
            self._credit_pending_balance(self.protocol_treasury, protocol_fee)

        existing = self.bets[market_id].get(sender, Bet(u256(0), u256(0)))

        if vote_yes:
            self.bets[market_id][sender] = Bet(existing.yes_amount + net_amount, existing.no_amount)
            self.markets[market_id].total_yes += net_amount
        else:
            self.bets[market_id][sender] = Bet(existing.yes_amount, existing.no_amount + net_amount)
            self.markets[market_id].total_no += net_amount

        return net_amount

    @gl.public.write
    def resolve_market(self, market_id: u256) -> bool:
        """
        Resolve the market by fetching the resolution URL and asking the LLM.
        
        This is the CORE GenLayer feature:
        - gl.get_webpage() fetches the live URL (BBC, Reuters, etc.) ON-CHAIN
        - gl.exec_prompt() asks the LLM to evaluate criteria
        - 5 validators reach consensus via Optimistic Democracy
        - No human intervention, no oracle, no trusted party
        
        Returns: True = YES outcome, False = NO outcome
        """
        assert market_id < len(self.markets), "Market does not exist"
        market = self.markets[market_id]
        assert not market.resolved, "Already resolved"

        # Deadline is enforced in the client for now. Wire the correct chain-time
        # API once it's available in the current GenLayer runtime.

        # ── Step 1: Fetch the resolution URL directly from the web ──────────
        web_content = gl.get_webpage(market.resolution_url, mode="text")

        # ── Step 2: Ask LLM to evaluate the resolution criteria ─────────────
        prompt = f"""You are resolving a prediction market. Your job is to determine
whether the following criteria has been met based on the web page content provided.

MARKET QUESTION:
{market.question}

RESOLUTION CRITERIA (must be TRUE for YES outcome):
{market.resolution_criteria}

WEB PAGE CONTENT (from {market.resolution_url}):
---
{web_content[:8000]}
---

Instructions:
- Carefully read the web page content.
- Determine if the resolution criteria is clearly met.
- Answer ONLY with a JSON object in this exact format:
  {{"outcome": true}} if YES criteria is met
  {{"outcome": false}} if NO criteria is not met or is uncertain
- Do not add any explanation outside the JSON.
"""

        result_raw = gl.exec_prompt(prompt)

        # ── Step 3: Parse the LLM result ─────────────────────────────────────
        try:
            # Clean potential markdown wrapping
            clean = result_raw.strip()
            if clean.startswith("```"):
                clean = clean.split("```")[1]
                if clean.startswith("json"):
                    clean = clean[4:]
            result = json.loads(clean.strip())
            outcome = bool(result.get("outcome", False))
        except Exception:
            # If parsing fails, default to NO (conservative)
            outcome = False

        # ── Step 4: Record outcome on-chain ──────────────────────────────────
        self.markets[market_id].resolved = True
        self.markets[market_id].outcome = outcome

        return outcome

    @gl.public.write
    def claim_winnings(self, market_id: u256) -> u256:
        """
        Claim winnings after market resolution.
        Winners receive their stake + proportional share of losers' pool.
        Returns the amount claimed (in wei).
        """
        assert market_id < len(self.markets), "Market does not exist"
        market = self.markets[market_id]
        assert market.resolved, "Market not yet resolved"

        sender = str(gl.message.sender_address)
        assert not self.claimed[market_id].get(sender, False), "Already claimed"

        bet = self.bets[market_id].get(sender, Bet(u256(0), u256(0)))
        yes_stake, no_stake = bet.yes_amount, bet.no_amount

        winner_stake = yes_stake if market.outcome else no_stake
        assert winner_stake > 0, "No winning stake"

        # Total pool and winning pool
        total_pool = market.total_yes + market.total_no
        winning_pool = market.total_yes if market.outcome else market.total_no

        # Proportional payout
        payout = (winner_stake * total_pool) // winning_pool

        self.claimed[market_id][sender] = True

        # Transfer winnings
        assert self.accounted_balance >= payout, "Contract accounting invariant broken"
        self.accounted_balance -= payout
        gl.message.sender_address.transfer(payout)

        return payout

    @gl.public.view
    def get_market(self, market_id: u256) -> dict:
        """Read market state."""
        assert market_id < len(self.markets), "Market does not exist"
        m = self.markets[market_id]
        return {
            "id": m.id,
            "question": m.question,
            "resolution_url": m.resolution_url,
            "resolution_criteria": m.resolution_criteria,
            "creator": m.creator,
            "deadline": m.deadline,
            "total_yes": m.total_yes,
            "total_no": m.total_no,
            "resolved": m.resolved,
            "outcome": m.outcome,
        }

    @gl.public.view
    def get_all_markets(self) -> list:
        """Return all markets."""
        return [
            {
                "id": m.id,
                "question": m.question,
                "resolution_url": m.resolution_url,
                "resolution_criteria": m.resolution_criteria,
                "creator": m.creator,
                "deadline": m.deadline,
                "total_yes": m.total_yes,
                "total_no": m.total_no,
                "resolved": m.resolved,
                "outcome": m.outcome,
            }
            for m in self.markets
        ]

    @gl.public.view
    def get_bet(self, market_id: u256, user: str) -> dict:
        """Return bet info for a specific user on a market."""
        bet = self.bets[market_id].get(user, Bet(u256(0), u256(0)))
        return {"yes_amount": bet.yes_amount, "no_amount": bet.no_amount}

    @gl.public.view
    def get_pending_balance(self, user: str) -> u256:
        return self.pending_balances.get(user, u256(0))

    @gl.public.view
    def get_contract_balance_info(self) -> dict:
        return {
            "balance": self.balance,
            "accounted_balance": self.accounted_balance,
        }

    @gl.public.view
    def get_fee_config(self) -> dict:
        return {
            "protocol_treasury": self.protocol_treasury,
            "creator_fee_bps": self.creator_fee_bps,
            "protocol_fee_bps": self.protocol_fee_bps,
            "total_fee_bps": self.creator_fee_bps + self.protocol_fee_bps,
        }

    @gl.public.write
    def withdraw_pending(self, amount: u256) -> u256:
        sender = str(gl.message.sender_address)
        pending_balance = self.pending_balances.get(sender, u256(0))
        assert amount > 0, "Amount must be positive"
        assert pending_balance >= amount, "Insufficient pending balance"

        self.pending_balances[sender] = pending_balance - amount
        assert self.accounted_balance >= amount, "Contract accounting invariant broken"
        self.accounted_balance -= amount
        gl.message.sender_address.transfer(amount)
        return amount

    @gl.public.view
    def get_market_count(self) -> u256:
        return u256(len(self.markets))
