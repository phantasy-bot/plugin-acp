/**
 * @module wallet-service
 * ACP Wallet Service - manages native wallet for ACP transactions
 */

import { createACPModuleLogger } from "./shared";
import type { ACPNetwork } from "./types";

const log = createACPModuleLogger("ACPWalletService");

let walletServiceInstance: ACPWalletService | null = null;

export interface WalletConfig {
  privateKey?: string;
  address?: string;
  network: ACPNetwork;
  rpcUrl?: string;
}

export interface Balance {
  token: string;
  symbol: string;
  balance: string;
  decimals: number;
  usdValue?: string;
}

export class ACPWalletService {
  private privateKey?: string;
  private address?: string;
  private network: ACPNetwork;
  private rpcUrl?: string;
  private viemWallet: any = null;
  private viemPublicClient: any = null;

  constructor(config: WalletConfig) {
    this.privateKey = config.privateKey;
    this.address = config.address;
    this.network = config.network;
    this.rpcUrl = config.rpcUrl;
  }

  async init(): Promise<void> {
    if (!this.privateKey) {
      log.warn("No private key provided, wallet operations will be limited");
      return;
    }

    try {
      const { createWalletClient, createPublicClient, http, parseEther, formatEther } =
        await import("viem");
      const { privateKeyToAccount } = await import("viem/accounts");

      const chain = this.network === "base-mainnet"
        ? {
            id: 8453,
            name: "Base",
            nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
            rpcUrls: {
              default: {
                http: [this.rpcUrl || "https://base-mainnet.public.blastapi.io"],
              },
            },
          }
        : {
            id: 84532,
            name: "Base Sepolia",
            nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
            rpcUrls: {
              default: {
                http: [this.rpcUrl || "https://base-sepolia.public.blastapi.io"],
              },
            },
          };

      const account = privateKeyToAccount(this.privateKey as `0x${string}`);
      this.address = account.address;

      this.viemPublicClient = createPublicClient({
        chain,
        transport: http(),
      });

      this.viemWallet = createWalletClient({
        chain,
        transport: http(),
        account,
      });

      log.info("ACP Wallet initialized", {
        address: this.address,
        network: this.network,
      });
    } catch (error) {
      log.error("Failed to initialize wallet", error);
      throw error;
    }
  }

  getAddress(): string | undefined {
    return this.address;
  }

  async getBalance(tokenAddress?: string): Promise<Balance> {
    if (!this.address) {
      throw new Error("Wallet not initialized");
    }

    if (!tokenAddress) {
      const balance = await this.viemPublicClient.getBalance({
        address: this.address as `0x${string}`,
      });
      return {
        token: "0x0000000000000000000000000000000000000000",
        symbol: "ETH",
        balance: balance.toString(),
        decimals: 18,
      };
    }

    const { abi } = await import("./erc20-abi");
    const balance = await this.viemPublicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi,
      functionName: "balanceOf",
      args: [this.address as `0x${string}`],
    });

    const decimals = await this.viemPublicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi,
      functionName: "decimals",
    });

    const symbol = await this.viemPublicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi,
      functionName: "symbol",
    });

    return {
      token: tokenAddress,
      symbol: symbol as string,
      balance: (balance as bigint).toString(),
      decimals: decimals as number,
    };
  }

  async getAllBalances(): Promise<Balance[]> {
    const balances: Balance[] = [];

    try {
      const ethBalance = await this.getBalance();
      balances.push(ethBalance);
    } catch (error) {
      log.error("Failed to get ETH balance", error);
    }

    const commonTokens = this.network === "base-mainnet"
      ? [
          { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC" },
          { address: "0xE0b52e49357Fd4DAf2c15e02058DCE6BC0057db4", symbol: "RALLY" },
        ]
      : [];

    for (const token of commonTokens) {
      try {
        const balance = await this.getBalance(token.address);
        balances.push(balance);
      } catch {
        // Token might not exist or have no balance
      }
    }

    return balances;
  }

  async sendTransaction(to: string, amount: string, tokenAddress?: string): Promise<string> {
    if (!this.viemWallet) {
      throw new Error("Wallet not initialized with private key");
    }

    try {
      if (!tokenAddress) {
        const { parseEther } = await import("viem");
        const hash = await this.viemWallet.sendTransaction({
          to: to as `0x${string}`,
          value: parseEther(amount),
        });
        return hash;
      }

      const { abi } = await import("./erc20-abi");
      const { parseUnits } = await import("viem");

      const decimals = await this.viemPublicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi,
        functionName: "decimals",
      });

      const hash = await this.viemWallet.writeContract({
        address: tokenAddress as `0x${string}`,
        abi,
        functionName: "transfer",
        args: [to as `0x${string}`, parseUnits(amount, decimals as number)],
      });

      return hash;
    } catch (error) {
      log.error("Transaction failed", error);
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.viemWallet !== null;
  }

  hasPrivateKey(): boolean {
    return !!this.privateKey;
  }

  getNetwork(): ACPNetwork {
    return this.network;
  }
}

export function getACPWalletService(config?: WalletConfig): ACPWalletService {
  if (!walletServiceInstance && config) {
    walletServiceInstance = new ACPWalletService(config);
  }
  return walletServiceInstance!;
}

export function createACPWalletService(config: WalletConfig): ACPWalletService {
  return new ACPWalletService(config);
}

export function resetACPWalletService(): void {
  walletServiceInstance = null;
}
