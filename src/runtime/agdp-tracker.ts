import { createACPModuleLogger } from "./shared";
import { getACPService } from "./acp-service";
import { getACPOfferingRegistry } from "./offering-registry";
import type { AGDPMetrics, RevenueEvent } from "./types";

const log = createACPModuleLogger("AGDPTracker");

export interface AGDPTrackerConfig {
  agentId: string;
  storeEvents?: boolean;
}

export interface AGDPSummary {
  agentId: string;
  period: "daily" | "weekly" | "monthly" | "all";
  totalRevenue: string;
  totalJobs: number;
  averageFee: string;
  byOffering: Record<string, { revenue: string; jobs: number }>;
  timestamp: number;
}

export class AGDPTracker {
  private agentId: string;
  private storeEvents: boolean;
  private events: RevenueEvent[] = [];

  constructor(config: AGDPTrackerConfig) {
    this.agentId = config.agentId;
    this.storeEvents = config.storeEvents ?? true;
  }

  async trackRevenueEvent(event: RevenueEvent): Promise<void> {
    if (this.storeEvents) {
      this.events.push(event);
    }

    log.info(`Tracked revenue event: ${event.jobId} - ${event.amount} ${event.token}`);
  }

  async trackJobCompletion(
    jobId: string,
    offeringId: string,
    fee: string,
    token: string = "USDC"
  ): Promise<void> {
    await this.trackRevenueEvent({
      jobId,
      offeringId,
      amount: fee,
      token,
      timestamp: Date.now(),
      type: "fee",
    });
  }

  async calculateAGDP(
    period: "daily" | "weekly" | "monthly" | "all" = "all"
  ): Promise<AGDPSummary> {
    const now = Date.now();
    let cutoff = now;

    switch (period) {
      case "daily":
        cutoff = now - 24 * 60 * 60 * 1000;
        break;
      case "weekly":
        cutoff = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case "monthly":
        cutoff = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case "all":
        cutoff = 0;
        break;
    }

    const filteredEvents = this.events.filter((e) => e.timestamp >= cutoff);
    const offeringMap = new Map<string, { revenue: string; jobs: number }>();

    let totalRevenue = 0;
    let totalJobs = 0;

    for (const event of filteredEvents) {
      if (event.type === "fee" || event.type === "tips") {
        const amount = parseFloat(event.amount);
        totalRevenue += amount;
        totalJobs++;

        const existing = offeringMap.get(event.offeringId) || { revenue: "0", jobs: 0 };
        existing.revenue = (parseFloat(existing.revenue) + amount).toString();
        existing.jobs += 1;
        offeringMap.set(event.offeringId, existing);
      }
    }

    const byOffering: Record<string, { revenue: string; jobs: number }> = {};
    for (const [id, data] of offeringMap) {
      byOffering[id] = data;
    }

    const byOfferingSimple: Record<string, string> = {};
    for (const [id, data] of offeringMap) {
      byOfferingSimple[id] = data.revenue;
    }

    const averageFee = totalJobs > 0 ? (totalRevenue / totalJobs).toFixed(4) : "0";

    return {
      agentId: this.agentId,
      period,
      totalRevenue: totalRevenue.toFixed(4),
      totalJobs,
      averageFee,
      byOffering,
      timestamp: now,
    };
  }

  async getMetrics(): Promise<AGDPMetrics> {
    const summary = await this.calculateAGDP("daily");

    const byOfferingSimple: Record<string, string> = {};
    for (const [id, data] of Object.entries(summary.byOffering)) {
      byOfferingSimple[id] = data.revenue;
    }

    return {
      agentId: this.agentId,
      period: "daily",
      revenue: {
        total: summary.totalRevenue,
        byOffering: byOfferingSimple,
      },
      jobsCompleted: summary.totalJobs,
      averageRating: 0,
      timestamp: Date.now(),
    };
  }

  async getAgentProfile(): Promise<{
    name: string;
    description: string;
    rating?: number;
    jobsCompleted?: number;
    totalRevenue?: string;
  } | null> {
    try {
      const service = getACPService();
      const profile = await service.getAgentProfile();

      return {
        name: profile.name,
        description: profile.description,
        rating: profile.rating,
        jobsCompleted: profile.jobsCompleted,
      };
    } catch (error) {
      log.error("Failed to get agent profile", error);
      return null;
    }
  }

  getEvents(): RevenueEvent[] {
    return [...this.events];
  }

  clearEvents(): void {
    this.events = [];
    log.info("Cleared AGDP events");
  }
}

let _tracker: AGDPTracker | null = null;

export function getAGDPTracker(agentId?: string): AGDPTracker {
  if (!_tracker) {
    _tracker = new AGDPTracker({ agentId: agentId || "default" });
  }
  return _tracker;
}

export function createAGDPTracker(config: AGDPTrackerConfig): AGDPTracker {
  _tracker = new AGDPTracker(config);
  return _tracker;
}
