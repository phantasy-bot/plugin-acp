import { createACPModuleLogger } from "./shared";
import { getACPService } from "./acp-service";
import type { ACPJob } from "./types";

const log = createACPModuleLogger("ACPEscrow");

export interface EscrowStatus {
  jobId: string;
  status: "locked" | "released" | "refunded" | "pending";
  amount: string;
  token: string;
}

export class ACPEscrow {
  async getStatus(jobId: string): Promise<EscrowStatus | null> {
    try {
      const service = getACPService();
      const job = await service.getJob(jobId);

      if (!job) {
        return null;
      }

      return {
        jobId,
        status: this.mapJobStatusToEscrowStatus(job.status),
        amount: job.jobFee,
        token: "USDC",
      };
    } catch (error) {
      log.error("Failed to get escrow status", error);
      return null;
    }
  }

  async release(jobId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const service = getACPService();
      const job = await service.submitDeliverable(jobId, "Job completed");

      log.info(`Released escrow for job: ${jobId}`);

      return { success: true };
    } catch (error) {
      log.error("Failed to release escrow", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async releaseWithDeliverable(
    jobId: string,
    deliverable: string,
    payableDetail?: { tokenAddress: string; amount: string }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const service = getACPService();
      await service.submitDeliverable(jobId, deliverable, payableDetail);

      log.info(`Released escrow with deliverable for job: ${jobId}`);

      return { success: true };
    } catch (error) {
      log.error("Failed to release escrow with deliverable", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async refund(jobId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const service = getACPService();
      await service.cancelJob(jobId);

      log.info(`Refunded escrow for job: ${jobId}, reason: ${reason}`);

      return { success: true };
    } catch (error) {
      log.error("Failed to refund escrow", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private mapJobStatusToEscrowStatus(
    jobStatus: string
  ): "locked" | "released" | "refunded" | "pending" {
    switch (jobStatus) {
      case "pending":
      case "payment_requested":
      case "paid":
      case "executing":
        return "locked";
      case "completed":
        return "released";
      case "disputed":
      case "cancelled":
        return "refunded";
      default:
        return "pending";
    }
  }
}

let _escrow: ACPEscrow | null = null;

export function getACPEscrow(): ACPEscrow {
  if (!_escrow) {
    _escrow = new ACPEscrow();
  }
  return _escrow;
}
