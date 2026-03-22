import { createACPModuleLogger } from "./shared";
import { getACPService } from "./acp-service";
import { getACPOfferingRegistry } from "./offering-registry";
import type {
  ACPJob,
  ACPSearchOptions,
  ACPMarketplaceListing,
  ExecuteJobResult,
} from "./types";

const log = createACPModuleLogger("ACPMarketplace");

export interface JobCreationParams {
  offeringId: string;
  requirements: Record<string, unknown>;
  maxFee?: string;
}

export interface JobResult {
  job: ACPJob;
  success: boolean;
  error?: string;
}

export class ACPMarketplaceClient {
  async search(
    options: ACPSearchOptions = {}
  ): Promise<{ listings: ACPMarketplaceListing[]; total: number }> {
    const service = getACPService();
    return service.searchMarketplace(options);
  }

  async browseAgents(query: string): Promise<ACPMarketplaceListing[]> {
    const result = await this.search({ query, limit: 20 });
    return result.listings;
  }

  async getOfferingDetails(offeringId: string) {
    const service = getACPService();
    return service.getOffering(offeringId);
  }

  async listMyOfferings() {
    const service = getACPService();
    return service.listOfferings();
  }

  async createJob(params: JobCreationParams): Promise<JobResult> {
    try {
      const service = getACPService();
      const job = await service.createJob({
        offeringId: params.offeringId,
        requirements: params.requirements,
      });

      log.info(`Created job: ${job.id} for offering: ${params.offeringId}`);

      return { job, success: true };
    } catch (error) {
      log.error("Failed to create job", error);
      return {
        job: null as unknown as ACPJob,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async acceptJob(jobId: string): Promise<JobResult> {
    try {
      const service = getACPService();
      const job = await service.acceptJob(jobId);
      log.info(`Accepted job: ${jobId}`);
      return { job, success: true };
    } catch (error) {
      log.error("Failed to accept job", error);
      return {
        job: null as unknown as ACPJob,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async rejectJob(jobId: string, reason?: string): Promise<JobResult> {
    try {
      const service = getACPService();
      const job = await service.rejectJob(jobId, reason);
      log.info(`Rejected job: ${jobId}`);
      return { job, success: true };
    } catch (error) {
      log.error("Failed to reject job", error);
      return {
        job: null as unknown as ACPJob,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async submitPayment(jobId: string): Promise<JobResult> {
    try {
      const service = getACPService();
      const job = await service.submitPayment(jobId);
      log.info(`Submitted payment for job: ${jobId}`);
      return { job, success: true };
    } catch (error) {
      log.error("Failed to submit payment", error);
      return {
        job: null as unknown as ACPJob,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async submitDeliverable(
    jobId: string,
    deliverable: string,
    payableDetail?: { tokenAddress: string; amount: string }
  ): Promise<JobResult> {
    try {
      const service = getACPService();
      const job = await service.submitDeliverable(jobId, deliverable, payableDetail);
      log.info(`Submitted deliverable for job: ${jobId}`);
      return { job, success: true };
    } catch (error) {
      log.error("Failed to submit deliverable", error);
      return {
        job: null as unknown as ACPJob,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async evaluateJob(
    jobId: string,
    quality: "satisfactory" | "unsatisfactory",
    score: number,
    feedback?: string
  ): Promise<JobResult> {
    try {
      const service = getACPService();
      const job = await service.evaluateJob(jobId, {
        quality,
        score,
        feedback: feedback || "",
      });
      log.info(`Evaluated job: ${jobId} - ${quality} (${score})`);
      return { job, success: true };
    } catch (error) {
      log.error("Failed to evaluate job", error);
      return {
        job: null as unknown as ACPJob,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async cancelJob(jobId: string): Promise<JobResult> {
    try {
      const service = getACPService();
      const job = await service.cancelJob(jobId);
      log.info(`Cancelled job: ${jobId}`);
      return { job, success: true };
    } catch (error) {
      log.error("Failed to cancel job", error);
      return {
        job: null as unknown as ACPJob,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async getJobStatus(jobId: string): Promise<ACPJob | null> {
    try {
      const service = getACPService();
      return await service.getJob(jobId);
    } catch (error) {
      log.error("Failed to get job status", error);
      return null;
    }
  }

  async getAgentProfile(agentId?: string) {
    const service = getACPService();
    return service.getAgentProfile(agentId);
  }

  async updateProfile(data: { name?: string; description?: string; profilePic?: string }) {
    const service = getACPService();
    return service.updateProfile(data);
  }

  async getWalletInfo() {
    const service = getACPService();
    return service.getWalletInfo();
  }
}

let _client: ACPMarketplaceClient | null = null;

export function getACPMarketplaceClient(): ACPMarketplaceClient {
  if (!_client) {
    _client = new ACPMarketplaceClient();
  }
  return _client;
}
