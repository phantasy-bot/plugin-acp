import { describe, expect, it, vi } from "vitest";

const {
  mockGetAgentProfile,
  mockGetWalletInfo,
  mockGetActiveJobs,
  mockGetCompletedJobs,
  mockListOfferings,
  mockSearchMarketplace,
  mockGetJob,
  mockCalculateAGDP,
  mockGetMetrics,
  mockListPublishedOfferings,
} = vi.hoisted(() => ({
  mockGetAgentProfile: vi.fn(),
  mockGetWalletInfo: vi.fn(),
  mockGetActiveJobs: vi.fn(),
  mockGetCompletedJobs: vi.fn(),
  mockListOfferings: vi.fn(),
  mockSearchMarketplace: vi.fn(),
  mockGetJob: vi.fn(),
  mockCalculateAGDP: vi.fn(),
  mockGetMetrics: vi.fn(),
  mockListPublishedOfferings: vi.fn(),
}));

vi.mock("@phantasy/agent/plugin-runtime", () => ({
  createPluginModuleLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  })),
  getActiveAgentId: vi.fn(() => "rally"),
  getSkillLoader: vi.fn(() => ({
    getAllSkills: vi.fn(() => [
      {
        frontmatter: {
          name: "Cloudflare",
          description: "Deploy to Cloudflare",
        },
        source: "skills/cloudflare",
      },
    ]),
  })),
}));

vi.mock("./runtime/acp-service", () => ({
  getACPService: vi.fn(() => ({
    getAgentProfile: mockGetAgentProfile,
    getWalletInfo: mockGetWalletInfo,
    getActiveJobs: mockGetActiveJobs,
    getCompletedJobs: mockGetCompletedJobs,
    listOfferings: mockListOfferings,
    searchMarketplace: mockSearchMarketplace,
    getJob: mockGetJob,
  })),
}));

vi.mock("./runtime/offering-registry", () => ({
  getACPOfferingRegistry: vi.fn(() => ({
    getAllOfferings: vi.fn(() => [
      {
        id: "offering-local",
        config: {
          name: "Local Offering",
          description: "Local test offering",
          jobFee: "10",
          jobFeeType: "fixed",
          skillName: "skill-cloudflare",
        },
      },
    ]),
  })),
}));

vi.mock("./runtime/agdp-tracker", () => ({
  getAGDPTracker: vi.fn(() => ({
    calculateAGDP: mockCalculateAGDP,
    getMetrics: mockGetMetrics,
  })),
}));

vi.mock("./runtime/clawhub-publisher", () => ({
  getClawHubPublisher: vi.fn(() => ({
    listPublishedOfferings: mockListPublishedOfferings,
  })),
}));

import ACPPlugin from "./acp-plugin";

describe("ACPPlugin", () => {
  it("serves plugin-owned ACP dashboard data", async () => {
    mockGetAgentProfile.mockResolvedValue({ id: "rally", name: "Rally" });
    mockGetWalletInfo.mockResolvedValue({ address: "0xabc" });
    mockGetActiveJobs.mockResolvedValue([{ id: "job-active" }]);
    mockGetCompletedJobs.mockResolvedValue([{ id: "job-complete" }]);
    mockSearchMarketplace.mockResolvedValue({
      listings: [{ id: "listing-1" }],
      total: 1,
    });
    mockCalculateAGDP.mockResolvedValue({ totalRevenue: "42.00" });
    const plugin = new ACPPlugin();

    const response = await plugin.handleCustomEndpoint(
      new Request(
        "http://localhost/plugins/acp/dashboard?period=monthly&query=design",
        {
          method: "GET",
        },
      ),
      "/dashboard",
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      profile: { id: "rally", name: "Rally" },
      wallet: { address: "0xabc" },
      activeJobs: [{ id: "job-active" }],
      completedJobs: [{ id: "job-complete" }],
      marketplace: { listings: [{ id: "listing-1" }], total: 1 },
      metrics: { totalRevenue: "42.00" },
      errors: [],
    });
  });

  it("serves summary and job detail directly from the plugin", async () => {
    mockCalculateAGDP.mockResolvedValue({ totalRevenue: "12.50" });
    mockGetJob.mockResolvedValue({ id: "job-42", status: "active" });
    const plugin = new ACPPlugin();

    const summaryResponse = await plugin.handleCustomEndpoint(
      new Request(
        "http://localhost/plugins/acp/agdp-summary?period=weekly",
        {
          method: "GET",
        },
      ),
      "/agdp-summary",
    );
    const jobResponse = await plugin.handleCustomEndpoint(
      new Request("http://localhost/plugins/acp/jobs/job-42", {
        method: "GET",
      }),
      "/jobs/job-42",
    );

    await expect(summaryResponse?.json()).resolves.toEqual({
      totalRevenue: "12.50",
    });
    await expect(jobResponse?.json()).resolves.toEqual({
      id: "job-42",
      status: "active",
    });
  });
});
