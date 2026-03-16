/**
 * @module sdk-client
 * ACP SDK Client Wrapper - integrates @virtuals-protocol/acp-node SDK
 */

import { createACPModuleLogger, fetchWithTimeout } from "./shared";
import type { ACPNetwork } from "./types";

const log = createACPModuleLogger("ACPSDKClient");

let sdkClientInstance: ACPSDKClient | null = null;

export interface ACPSDKConfig {
  apiKey: string;
  network: ACPNetwork;
  sessionEntityKeyId?: string;
  agentWalletAddress?: string;
  privateKey?: string;
  rpcUrl?: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  wallet: string;
  profilePic?: string;
  rating?: number;
  jobsCompleted?: number;
  graduationStatus?: string;
  onlineStatus?: string;
  createdAt?: number;
}

export interface WalletInfo {
  address: string;
  network: string;
  balances: Array<{
    token: string;
    symbol: string;
    balance: string;
    decimals: number;
  }>;
}

export interface MarketplaceAgent {
  id: string;
  name: string;
  description: string;
  wallet: string;
  profilePic?: string;
  rating: number;
  successRate: number;
  jobsCompleted: number;
  graduationStatus: string;
  onlineStatus: string;
  offerings: Array<{
    id: string;
    name: string;
    description: string;
    jobFee: string;
  }>;
}

export interface JobListing {
  id: string;
  offeringId: string;
  offeringName: string;
  buyerWallet: string;
  buyerAgentId?: string;
  sellerWallet: string;
  sellerAgentId?: string;
  status: string;
  jobFee: string;
  requirements: Record<string, unknown>;
  deliverable?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
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

export class ACPSDKClient {
  private apiKey: string;
  private network: ACPNetwork;
  private baseUrl: string;
  private sdk: any = null;
  private contractClient: any = null;
  private privateKey?: string;
  private sessionEntityKeyId?: string;
  private agentWalletAddress?: string;
  private rpcUrl?: string;

  constructor(config: ACPSDKConfig) {
    this.apiKey = config.apiKey;
    this.network = config.network;
    this.privateKey = config.privateKey;
    this.sessionEntityKeyId = config.sessionEntityKeyId;
    this.agentWalletAddress = config.agentWalletAddress;
    this.rpcUrl = config.rpcUrl;
    this.baseUrl =
      config.network === "base-mainnet"
        ? "https://api.virtuals.io/api"
        : "https://api-sandbox.virtuals.io/api";
  }

  async init(): Promise<void> {
    try {
      const sdkModule = await import("@virtuals-protocol/acp-node");
      const AcpClient = sdkModule.default;
      const { baseSepoliaAcpConfigV2, baseAcpConfigV2 } = sdkModule;

      log.info("Initializing ACP SDK client", { network: this.network });

      const config = this.network === "base-mainnet"
        ? baseAcpConfigV2
        : baseSepoliaAcpConfigV2;

      const contractConfig = this.privateKey
        ? await this.buildContractClient(config)
        : config;

      this.sdk = new AcpClient({
        acpContractClient: contractConfig as any,
        onNewTask: (job: any) => {
          log.info("New ACP job received", { jobId: job.id });
        },
        onEvaluate: (job: any) => {
          log.info("Job evaluation requested", { jobId: job.id });
        },
      });

      await this.sdk.init();
      log.info("ACP SDK client initialized successfully");
    } catch (error) {
      log.error("Failed to initialize ACP SDK", error);
      throw error;
    }
  }

  private async buildContractClient(config: any): Promise<any> {
    const { AcpContractClientV2 } = await import("@virtuals-protocol/acp-node");
    return (AcpContractClientV2.build as any)(
      this.privateKey,
      this.sessionEntityKeyId || "0x0000000000000000000000000000000000000000",
      this.agentWalletAddress || "0x0000000000000000000000000000000000000000",
      this.rpcUrl || config
    );
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
      log.error(`ACP API error: ${response.status}`, { endpoint, error });
      throw new Error(`ACP API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async getAgentProfile(agentId?: string): Promise<AgentProfile> {
    const endpoint = agentId ? `/agents/${agentId}` : "/agents/me";
    return this.request(endpoint);
  }

  async updateProfile(data: {
    name?: string;
    description?: string;
    profilePic?: string;
  }): Promise<{ success: boolean }> {
    return this.request("/agents/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async getWalletInfo(): Promise<WalletInfo> {
    const profile = await this.getAgentProfile();
    const balances = await this.request<Array<{
      token: string;
      symbol: string;
      balance: string;
      decimals: number;
    }>>(`/wallet/${profile.wallet}/balances`);

    return {
      address: profile.wallet,
      network: this.network,
      balances: balances || [],
    };
  }

  async browseAgents(
    query: string,
    options?: {
      cluster?: string;
      sortBy?: string;
      topK?: number;
      filters?: {
        graduationStatus?: string;
        onlineStatus?: string;
      };
    }
  ): Promise<MarketplaceAgent[]> {
    const params = new URLSearchParams({ q: query });
    if (options?.cluster) params.set("cluster", options.cluster);
    if (options?.sortBy) params.set("sortBy", options.sortBy);
    if (options?.topK) params.set("limit", options.topK.toString());
    if (options?.filters?.graduationStatus)
      params.set("graduationStatus", options.filters.graduationStatus);
    if (options?.filters?.onlineStatus)
      params.set("onlineStatus", options.filters.onlineStatus);

    return this.request(`/agents?${params.toString()}`);
  }

  async initiateJob(
    offeringId: string,
    requirements: Record<string, unknown>
  ): Promise<{ jobId: string }> {
    return this.request("/jobs", {
      method: "POST",
      body: JSON.stringify({
        offeringId,
        requirements,
      }),
    });
  }

  async getJob(jobId: string): Promise<JobListing> {
    return this.request(`/jobs/${jobId}`);
  }

  async getActiveJobs(page = 1, pageSize = 20): Promise<JobListing[]> {
    return this.request(
      `/jobs/active?page=${page}&pageSize=${pageSize}`
    );
  }

  async getCompletedJobs(page = 1, pageSize = 20): Promise<JobListing[]> {
    return this.request(
      `/jobs/completed?page=${page}&pageSize=${pageSize}`
    );
  }

  async acceptJob(jobId: string, reason?: string): Promise<{ success: boolean }> {
    return this.request(`/jobs/${jobId}/accept`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  async rejectJob(jobId: string, reason: string): Promise<{ success: boolean }> {
    return this.request(`/jobs/${jobId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  async payAndAccept(jobId: string): Promise<{ success: boolean }> {
    return this.request(`/jobs/${jobId}/pay`, {
      method: "POST",
    });
  }

  async deliverJob(
    jobId: string,
    deliverable: string
  ): Promise<{ success: boolean }> {
    return this.request(`/jobs/${jobId}/deliver`, {
      method: "POST",
      body: JSON.stringify({ deliverable }),
    });
  }

  async evaluateJob(
    jobId: string,
    result: "approved" | "rejected",
    reason: string
  ): Promise<{ success: boolean }> {
    return this.request(`/jobs/${jobId}/evaluate`, {
      method: "POST",
      body: JSON.stringify({ result, reason }),
    });
  }

  async launchToken(
    symbol: string,
    name: string,
    description: string,
    imageUrl?: string
  ): Promise<{ tokenAddress: string; transactionHash: string }> {
    return this.request("/tokens/launch", {
      method: "POST",
      body: JSON.stringify({
        symbol,
        name,
        description,
        imageUrl,
      }),
    });
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    return this.request(`/tokens/${tokenAddress}`);
  }

  async getMyToken(): Promise<TokenInfo | null> {
    try {
      return await this.request("/tokens/me");
    } catch {
      return null;
    }
  }

  async getOfferings(offeringId?: string): Promise<any[]> {
    const endpoint = offeringId
      ? `/offerings/${offeringId}`
      : "/offerings";
    return this.request(endpoint);
  }

  async getMyOfferings(): Promise<any[]> {
    return this.request("/offerings/me");
  }

  async registerOffering(offering: {
    name: string;
    description: string;
    jobFee: string;
    jobFeeType: "fixed" | "percentage";
    requirements: Record<string, unknown>;
  }): Promise<{ offeringId: string }> {
    return this.request("/offerings", {
      method: "POST",
      body: JSON.stringify(offering),
    });
  }

  async updateOffering(
    offeringId: string,
    updates: Partial<{
      name: string;
      description: string;
      jobFee: string;
      jobFeeType: string;
      status: string;
    }>
  ): Promise<{ success: boolean }> {
    return this.request(`/offerings/${offeringId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }

  async deleteOffering(offeringId: string): Promise<{ success: boolean }> {
    return this.request(`/offerings/${offeringId}`, {
      method: "DELETE",
    });
  }

  async registerResource(resource: {
    name: string;
    description: string;
    url: string;
    parameters?: Record<string, unknown>;
  }): Promise<{ resourceId: string }> {
    return this.request("/resources", {
      method: "POST",
      body: JSON.stringify(resource),
    });
  }

  async getMyResources(): Promise<any[]> {
    return this.request("/resources/me");
  }

  async deleteResource(resourceId: string): Promise<{ success: boolean }> {
    return this.request(`/resources/${resourceId}`, {
      method: "DELETE",
    });
  }

  getNetwork(): ACPNetwork {
    return this.network;
  }

  isInitialized(): boolean {
    return this.sdk !== null;
  }

  getSDK(): any {
    return this.sdk;
  }
}

export function getACPSDKClient(config?: ACPSDKConfig): ACPSDKClient {
  if (!sdkClientInstance && config) {
    sdkClientInstance = new ACPSDKClient(config);
  }
  return sdkClientInstance!;
}

export function createACPSDKClient(config: ACPSDKConfig): ACPSDKClient {
  return new ACPSDKClient(config);
}

export function resetACPSDKClient(): void {
  sdkClientInstance = null;
}
