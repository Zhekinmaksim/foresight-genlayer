"use client";
import { useState, useEffect, useCallback } from "react";
import { testnetBradbury } from "genlayer-js/chains";
import { addGenLayerNetwork } from "./genlayer";

const REQUIRED_CHAIN_ID = "0x" + (testnetBradbury.id).toString(16);

export type WalletState = "disconnected" | "connecting" | "wrong_network" | "connected";

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [state, setState] = useState<WalletState>("disconnected");
  const [error, setError] = useState<string | null>(null);

  // Check chain on load if already connected
  useEffect(() => {
    const saved = localStorage.getItem("gl_wallet");
    if (saved && window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" }).then((accounts: string[]) => {
        if (accounts[0]) {
          setAddress(accounts[0]);
          checkChain();
        }
      }).catch(() => {});
    }
  }, []);

  // Listen for chain / account changes
  useEffect(() => {
    if (!window.ethereum) return;
    const onChain = () => checkChain();
    const onAccounts = (accounts: string[]) => {
      if (accounts.length === 0) disconnect();
      else { setAddress(accounts[0]); checkChain(); }
    };
    window.ethereum.on("chainChanged", onChain);
    window.ethereum.on("accountsChanged", onAccounts);
    return () => {
      window.ethereum.removeListener("chainChanged", onChain);
      window.ethereum.removeListener("accountsChanged", onAccounts);
    };
  }, []);

  const checkChain = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      if (chainId !== REQUIRED_CHAIN_ID) {
        setState("wrong_network");
      } else {
        setState("connected");
      }
    } catch {}
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("MetaMask not found — please install it.");
      return;
    }
    setState("connecting");
    setError(null);
    try {
      const accounts: string[] = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      if (!accounts[0]) throw new Error("No account returned");
      setAddress(accounts[0]);
      localStorage.setItem("gl_wallet", accounts[0]);

      // Check chain
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      if (chainId !== REQUIRED_CHAIN_ID) {
        setState("wrong_network");
      } else {
        setState("connected");
      }
    } catch (e: any) {
      setError(e.message || "Connection failed");
      setState("disconnected");
    }
  }, []);

  const switchNetwork = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      // Try switching first
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: REQUIRED_CHAIN_ID }],
      });
      setState("connected");
    } catch (switchError: any) {
      // 4902 = chain not added yet
      if (switchError.code === 4902) {
        try {
          await addGenLayerNetwork();
          setState("connected");
        } catch (addError: any) {
          setError(addError.message || "Failed to add network");
        }
      } else {
        setError(switchError.message || "Failed to switch network");
      }
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setState("disconnected");
    localStorage.removeItem("gl_wallet");
  }, []);

  return {
    address,
    state,
    error,
    connect,
    disconnect,
    switchNetwork,
    isConnected: state === "connected",
    isWrongNetwork: state === "wrong_network",
  };
}

declare global {
  interface Window { ethereum?: any; }
}
