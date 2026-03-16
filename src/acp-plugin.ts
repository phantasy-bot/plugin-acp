import { BasePlugin, type PluginTool } from "@phantasy/agent/plugins";
import {
  createPluginModuleLogger,
  getACPService,
  getACPOfferingRegistry,
  getAGDPTracker,
  getActiveAgentId,
  getClawHubPublisher,
  getSkillLoader,
} from "@phantasy/agent/plugin-runtime";

const log = createPluginModuleLogger("ACPPlugin");
const DEFAULT_MARKETPLACE_LIMIT = 20;

type ACPPeriod = "daily" | "weekly" | "monthly" | "all";

type ACPSectionResult<T> =
  | {
      data: T;
      error?: undefined;
    }
  | {
      data: T;
      error: string;
    };

function jsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getAgentId(url: URL): string {
  return url.searchParams.get("agentId") || getActiveAgentId();
}

function getMarketplaceSearchOptions(url: URL) {
  return {
    query: url.searchParams.get("query") || undefined,
    category: url.searchParams.get("category") || undefined,
    minRating: url.searchParams.get("minRating")
      ? Number.parseFloat(url.searchParams.get("minRating") || "")
      : undefined,
    limit: url.searchParams.get("limit")
      ? Number.parseInt(url.searchParams.get("limit") || "", 10)
      : DEFAULT_MARKETPLACE_LIMIT,
    offset: url.searchParams.get("offset")
      ? Number.parseInt(url.searchParams.get("offset") || "", 10)
      : 0,
  };
}

function getDashboardPeriod(url: URL): ACPPeriod {
  return (url.searchParams.get("period") as ACPPeriod) || "all";
}

function getLocalOfferings() {
  return getACPOfferingRegistry()
    .getAllOfferings()
    .map((offering) => ({
      id: offering.id,
      name: offering.config.name,
      description: offering.config.description,
      jobFee: offering.config.jobFee,
      jobFeeType: offering.config.jobFeeType,
      skillName: offering.config.skillName,
    }));
}

function getAvailableSkills() {
  return getSkillLoader()
    .getAllSkills()
    .map((skill) => ({
      name: skill.frontmatter.name,
      description: skill.frontmatter.description,
      source: skill.source,
    }));
}

async function loadACPSection<T>(
  label: string,
  task: () => Promise<T>,
  fallback: T,
): Promise<ACPSectionResult<T>> {
  try {
    return { data: await task() };
  } catch (error) {
    log.error(`Failed to load ACP ${label.toLowerCase()}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      data: fallback,
      error: label,
    };
  }
}

export class ACPPlugin extends BasePlugin {
  name = "acp";
  version = "0.1.0";
  description = "Autonomous commerce protocol operations for Phantasy.";

  protected displayName = "ACP";
  protected category = "commerce";
  protected tags = ["acp", "commerce", "jobs", "offerings"];
  protected permissions = ["internet"];
  protected workspace = "business" as const;
  protected extensionKind = "capability" as const;
  protected adminSurface = {
    tabId: "acp",
    label: "ACP",
    section: "business",
    workspace: "business",
    kind: "generic",
    advancedModule: "agent-commerce",
    keywords: ["acp", "commerce", "jobs", "offerings"],
  } as const;
  protected configSchema = {
    type: "object",
    properties: {
      enabled: { type: "boolean", default: true },
    },
  };

  getTools(): PluginTool[] {
    return [];
  }

  async handleCustomEndpoint(
    request: Request,
    path: string,
  ): Promise<Response | null> {
    try {
      const url = new URL(request.url);
      const service = getACPService();

      if (path === "/dashboard" && request.method === "GET") {
        const tracker = getAGDPTracker(getAgentId(url));
        const marketplaceOptions = getMarketplaceSearchOptions(url);
        const period = getDashboardPeriod(url);

        const [
          profile,
          wallet,
          activeJobs,
          completedJobs,
          offerings,
          skills,
          marketplace,
          metrics,
        ] = await Promise.all([
          loadACPSection("Profile", () => service.getAgentProfile(), null),
          loadACPSection("Wallet", () => service.getWalletInfo(), null),
          loadACPSection("Active Jobs", () => service.getActiveJobs(), []),
          loadACPSection("Completed Jobs", () => service.getCompletedJobs(), []),
          loadACPSection("Offerings", async () => getLocalOfferings(), []),
          loadACPSection("Skills", async () => getAvailableSkills(), []),
          loadACPSection(
            "Marketplace",
            () => service.searchMarketplace(marketplaceOptions),
            { listings: [], total: 0 },
          ),
          loadACPSection("Revenue", () => tracker.calculateAGDP(period), null),
        ]);

        return jsonResponse({
          profile: profile.data,
          wallet: wallet.data,
          activeJobs: activeJobs.data,
          completedJobs: completedJobs.data,
          offerings: offerings.data,
          skills: skills.data,
          marketplace: marketplace.data,
          metrics: metrics.data,
          errors: [
            profile.error,
            wallet.error,
            activeJobs.error,
            completedJobs.error,
            offerings.error,
            skills.error,
            marketplace.error,
            metrics.error,
          ].filter(Boolean),
        });
      }

      if (path === "/profile" && request.method === "GET") {
        return jsonResponse(await service.getAgentProfile());
      }

      if (path === "/wallet" && request.method === "GET") {
        return jsonResponse(await service.getWalletInfo());
      }

      if (path === "/offerings" && request.method === "GET") {
        return jsonResponse(await service.listOfferings());
      }

      if (path === "/local-offerings" && request.method === "GET") {
        return jsonResponse(getLocalOfferings());
      }

      if (path === "/metrics" && request.method === "GET") {
        return jsonResponse(await getAGDPTracker(getAgentId(url)).getMetrics());
      }

      if (path === "/agdp-summary" && request.method === "GET") {
        return jsonResponse(
          await getAGDPTracker(getAgentId(url)).calculateAGDP(
            getDashboardPeriod(url),
          ),
        );
      }

      if (path === "/marketplace/search" && request.method === "GET") {
        return jsonResponse(
          await service.searchMarketplace(getMarketplaceSearchOptions(url)),
        );
      }

      if (path === "/clawhub/offerings" && request.method === "GET") {
        return jsonResponse(await getClawHubPublisher().listPublishedOfferings());
      }

      if (path === "/skills" && request.method === "GET") {
        return jsonResponse(getAvailableSkills());
      }

      if (path === "/jobs/active" && request.method === "GET") {
        return jsonResponse(await service.getActiveJobs());
      }

      if (path === "/jobs/completed" && request.method === "GET") {
        return jsonResponse(await service.getCompletedJobs());
      }

      const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
      if (jobMatch && request.method === "GET") {
        return jsonResponse(await service.getJob(jobMatch[1]));
      }

      return null;
    } catch (error) {
      log.error("ACP plugin endpoint failed", {
        path,
        error: error instanceof Error ? error.message : String(error),
      });
      return jsonResponse({ error: "ACP plugin request failed" }, 500);
    }
  }
}

export default ACPPlugin;
