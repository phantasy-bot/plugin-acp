import { createACPModuleLogger, fetchWithTimeout } from "./shared";
import type {
  ACPNetwork,
  ACPOffering,
  ACPJob,
  ACPOfferingRegistration,
  ACPSearchOptions,
  ACPMarketplaceListing,
  ACPJobRequest,
  ExecuteJobResult,
  ValidationResult,
  FundsRequest,
} from "./types";

const log = createACPModuleLogger("ACPService");

export class ACPService {
  private apiKey: string;
  private network: ACPNetwork;
  private baseUrl: string;

  constructor(apiKey: string, network: ACPNetwork = "base-sepolia") {
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
      log.error(`ACP API error: ${response.status}`, { endpoint, error });
      throw new Error(`ACP API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async getAgentProfile(agentId?: string): Promise<{
    id: string;
    name: string;
    description: string;
    wallet: string;
    offerings: ACPOffering[];
    rating?: number;
    jobsCompleted?: number;
  }> {
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

  async registerOffering(
    offering: ACPOfferingRegistration
  ): Promise<ACPOffering> {
    return this.request("/offerings", {
      method: "POST",
      body: JSON.stringify(offering),
    });
  }

  async updateOffering(
    offeringId: string,
    data: Partial<ACPOfferingRegistration>
  ): Promise<ACPOffering> {
    return this.request(`/offerings/${offeringId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async getOffering(offeringId: string): Promise<ACPOffering> {
    return this.request(`/offerings/${offeringId}`);
  }

  async listOfferings(): Promise<ACPOffering[]> {
    return this.request("/offerings");
  }

  async deleteOffering(offeringId: string): Promise<{ success: boolean }> {
    return this.request(`/offerings/${offeringId}`, {
      method: "DELETE",
    });
  }

  async searchMarketplace(
    options: ACPSearchOptions = {}
  ): Promise<{ listings: ACPMarketplaceListing[]; total: number }> {
    const params = new URLSearchParams();
    if (options.query) params.set("q", options.query);
    if (options.category) params.set("category", options.category);
    if (options.minRating) params.set("minRating", String(options.minRating));
    if (options.limit) params.set("limit", String(options.limit));
    if (options.offset) params.set("offset", String(options.offset));

    return this.request(`/marketplace/search?${params.toString()}`);
  }

  async getJob(jobId: string): Promise<ACPJob> {
    return this.request(`/jobs/${jobId}`);
  }

  async getActiveJobs(page = 1, pageSize = 20): Promise<ACPJob[]> {
    return this.request(`/jobs/active?page=${page}&pageSize=${pageSize}`);
  }

  async getCompletedJobs(page = 1, pageSize = 20): Promise<ACPJob[]> {
    return this.request(`/jobs/completed?page=${page}&pageSize=${pageSize}`);
  }

  async createJob(data: {
    offeringId: string;
    requirements: Record<string, unknown>;
  }): Promise<ACPJob> {
    return this.request("/jobs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async acceptJob(jobId: string): Promise<ACPJob> {
    return this.request(`/jobs/${jobId}/accept`, {
      method: "POST",
    });
  }

  async rejectJob(jobId: string, reason?: string): Promise<ACPJob> {
    return this.request(`/jobs/${jobId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  async requestPayment(
    jobId: string,
    data?: {
      message?: string;
      additionalFunds?: FundsRequest;
    }
  ): Promise<ACPJob> {
    return this.request(`/jobs/${jobId}/request-payment`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    });
  }

  async submitPayment(jobId: string): Promise<ACPJob> {
    return this.request(`/jobs/${jobId}/pay`, {
      method: "POST",
    });
  }

  async submitDeliverable(
    jobId: string,
    deliverable: string,
    payableDetail?: { tokenAddress: string; amount: string }
  ): Promise<ACPJob> {
    return this.request(`/jobs/${jobId}/deliver`, {
      method: "POST",
      body: JSON.stringify({ deliverable, payableDetail }),
    });
  }

  async evaluateJob(
    jobId: string,
    data: {
      quality: "satisfactory" | "unsatisfactory";
      score: number;
      feedback: string;
    }
  ): Promise<ACPJob> {
    return this.request(`/jobs/${jobId}/evaluate`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async cancelJob(jobId: string): Promise<ACPJob> {
    return this.request(`/jobs/${jobId}/cancel`, {
      method: "POST",
    });
  }

  async getWalletInfo(): Promise<{
    address: string;
    network: string;
    balance: string;
    tokens: Array<{ address: string; symbol: string; balance: string }>;
  }> {
    return this.request("/wallet");
  }

  async registerResource(data: {
    name: string;
    description: string;
    url: string;
    params?: Record<string, unknown>;
  }): Promise<{ id: string }> {
    return this.request("/resources", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async deleteResource(resourceId: string): Promise<{ success: boolean }> {
    return this.request(`/resources/${resourceId}`, {
      method: "DELETE",
    });
  }

  async listResources(): Promise<
    Array<{ id: string; name: string; description: string; url: string }>
  > {
    return this.request("/resources");
  }
}

let _instance: ACPService | null = null;

export function getACPService(
  apiKey?: string,
  network?: ACPNetwork
): ACPService {
  if (!_instance) {
    const key = apiKey || process.env.VIRTUALS_API_KEY;
    if (!key) {
      throw new Error("Virtuals API key not configured");
    }
    const net = network || (process.env.ACP_NETWORK as ACPNetwork) || "base-sepolia";
    _instance = new ACPService(key, net);
  }
  return _instance;
}

export function createACPService(apiKey: string, network?: ACPNetwork): ACPService {
  return new ACPService(apiKey, network);
}
