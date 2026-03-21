/**
 * @module token-service
 * ACP Token Service - for launching and managing agent tokens
 */

import { createACPModuleLogger, fetchWithTimeout } from "./shared";
import type { ACPNetwork } from "./types";

const log = createACPModuleLogger("ACPTokenService");

let tokenServiceInstance: ACPTokenService | null = null;

export interface TokenLaunchParams {
  symbol: string;
  name: string;
  description: string;
  imageUrl?: string;
}

export interface TokenInfo {
  symbol: string;
  name: string;
  address: string;
  totalSupply: string;
  circulatingSupply: string;
  holderCount: number;
  marketCap?: string;
  price?: string;
}

export interface TokenLaunchResult {
  tokenAddress: string;
  transactionHash: string;
  symbol: string;
  name: string;
}

export class ACPTokenService {
  private apiKey: string;
  private network: ACPNetwork;
  private baseUrl: string;

  constructor(apiKey: string, network: ACPNetwork) {
    this.apiKey = apiKey;
    this.network = network;
    this.baseUrl =
      network === "base-mainnet"
        ? "https://api.virtuals.io/api"
        : "https://api-sandbox.virtuals.io/api";
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetchWithTimeout(url, {
      timeout: 30000,
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      log.error(`Token API error: ${response.status}`, { endpoint, error });
      throw new Error(`Token API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async launchToken(params: TokenLaunchParams): Promise<TokenLaunchResult> {
    log.info("Launching agent token", params);

    const result = await this.request<{
      tokenAddress: string;
      transactionHash: string;
    }>("/tokens/launch", {
      method: "POST",
      body: JSON.stringify({
        symbol: params.symbol.toUpperCase(),
        name: params.name,
        description: params.description,
        imageUrl: params.imageUrl,
      }),
    });

    log.info("Token launched successfully", {
      address: result.tokenAddress,
      tx: result.transactionHash,
    });

    return {
      ...result,
      symbol: params.symbol.toUpperCase(),
      name: params.name,
    };
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    return this.request<TokenInfo>(`/tokens/${tokenAddress}`);
  }

  async getMyToken(): Promise<TokenInfo | null> {
    try {
      return await this.request<TokenInfo>("/tokens/me");
    } catch {
      return null;
    }
  }

  async getTokenHolders(tokenAddress: string, page = 1, pageSize = 20): Promise<Array<{
    address: string;
    balance: string;
  }>> {
    return this.request(`/tokens/${tokenAddress}/holders?page=${page}&pageSize=${pageSize}`);
  }

  async getTokenTransfers(
    tokenAddress: string,
    page = 1,
    pageSize = 20
  ): Promise<Array<{
    from: string;
    to: string;
    value: string;
    timestamp: number;
  }>> {
    return this.request(
      `/tokens/${tokenAddress}/transfers?page=${page}&pageSize=${pageSize}`
    );
  }

  async getTokenPrice(tokenAddress: string): Promise<{ price: string; change24h: string }> {
    return this.request(`/tokens/${tokenAddress}/price`);
  }

  isMainnet(): boolean {
    return this.network === "base-mainnet";
  }
}

export function getACPTokenService(
  apiKey: string,
  network: ACPNetwork
): ACPTokenService {
  if (!tokenServiceInstance) {
    tokenServiceInstance = new ACPTokenService(apiKey, network);
  }
  return tokenServiceInstance;
}

export function createACPTokenService(
  apiKey: string,
  network: ACPNetwork
): ACPTokenService {
  return new ACPTokenService(apiKey, network);
}

export function resetACPTokenService(): void {
  tokenServiceInstance = null;
}
