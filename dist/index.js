// src/acp-plugin.ts
import {
  BasePlugin
} from "@phantasy/agent/plugins";
import {
  createPluginModuleLogger as createPluginModuleLogger2,
  getActiveAgentId,
  getSkillLoader as getSkillLoader2
} from "@phantasy/agent/plugin-runtime";

// src/runtime/shared.ts
import {
  createPluginModuleLogger,
  createRuntimeId,
  fetchWithTimeout,
  getSkillLoader
} from "@phantasy/agent/plugin-runtime";
function createACPModuleLogger(name) {
  return createPluginModuleLogger(name);
}

// src/runtime/acp-service.ts
var log = createACPModuleLogger("ACPService");
var ACPService = class {
  apiKey;
  network;
  baseUrl;
  constructor(apiKey, network = "base-sepolia") {
    this.apiKey = apiKey;
    this.network = network;
    this.baseUrl = network === "base-mainnet" ? "https://api.virtuals.io/api" : "https://api-sandbox.virtuals.io/api";
  }
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetchWithTimeout(url, {
      timeout: 3e4,
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...options.headers
      }
    });
    if (!response.ok) {
      const error = await response.text();
      log.error(`ACP API error: ${response.status}`, { endpoint, error });
      throw new Error(`ACP API error: ${response.status} - ${error}`);
    }
    return response.json();
  }
  async getAgentProfile(agentId) {
    const endpoint = agentId ? `/agents/${agentId}` : "/agents/me";
    return this.request(endpoint);
  }
  async updateProfile(data) {
    return this.request("/agents/me", {
      method: "PATCH",
      body: JSON.stringify(data)
    });
  }
  async registerOffering(offering) {
    return this.request("/offerings", {
      method: "POST",
      body: JSON.stringify(offering)
    });
  }
  async updateOffering(offeringId, data) {
    return this.request(`/offerings/${offeringId}`, {
      method: "PATCH",
      body: JSON.stringify(data)
    });
  }
  async getOffering(offeringId) {
    return this.request(`/offerings/${offeringId}`);
  }
  async listOfferings() {
    return this.request("/offerings");
  }
  async deleteOffering(offeringId) {
    return this.request(`/offerings/${offeringId}`, {
      method: "DELETE"
    });
  }
  async searchMarketplace(options = {}) {
    const params = new URLSearchParams();
    if (options.query) params.set("q", options.query);
    if (options.category) params.set("category", options.category);
    if (options.minRating) params.set("minRating", String(options.minRating));
    if (options.limit) params.set("limit", String(options.limit));
    if (options.offset) params.set("offset", String(options.offset));
    return this.request(`/marketplace/search?${params.toString()}`);
  }
  async getJob(jobId) {
    return this.request(`/jobs/${jobId}`);
  }
  async getActiveJobs(page = 1, pageSize = 20) {
    return this.request(`/jobs/active?page=${page}&pageSize=${pageSize}`);
  }
  async getCompletedJobs(page = 1, pageSize = 20) {
    return this.request(`/jobs/completed?page=${page}&pageSize=${pageSize}`);
  }
  async createJob(data) {
    return this.request("/jobs", {
      method: "POST",
      body: JSON.stringify(data)
    });
  }
  async acceptJob(jobId) {
    return this.request(`/jobs/${jobId}/accept`, {
      method: "POST"
    });
  }
  async rejectJob(jobId, reason) {
    return this.request(`/jobs/${jobId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason })
    });
  }
  async requestPayment(jobId, data) {
    return this.request(`/jobs/${jobId}/request-payment`, {
      method: "POST",
      body: JSON.stringify(data || {})
    });
  }
  async submitPayment(jobId) {
    return this.request(`/jobs/${jobId}/pay`, {
      method: "POST"
    });
  }
  async submitDeliverable(jobId, deliverable, payableDetail) {
    return this.request(`/jobs/${jobId}/deliver`, {
      method: "POST",
      body: JSON.stringify({ deliverable, payableDetail })
    });
  }
  async evaluateJob(jobId, data) {
    return this.request(`/jobs/${jobId}/evaluate`, {
      method: "POST",
      body: JSON.stringify(data)
    });
  }
  async cancelJob(jobId) {
    return this.request(`/jobs/${jobId}/cancel`, {
      method: "POST"
    });
  }
  async getWalletInfo() {
    return this.request("/wallet");
  }
  async registerResource(data) {
    return this.request("/resources", {
      method: "POST",
      body: JSON.stringify(data)
    });
  }
  async deleteResource(resourceId) {
    return this.request(`/resources/${resourceId}`, {
      method: "DELETE"
    });
  }
  async listResources() {
    return this.request("/resources");
  }
};
var _instance = null;
function getACPService(apiKey, network) {
  if (!_instance) {
    const key = apiKey || process.env.VIRTUALS_API_KEY;
    if (!key) {
      throw new Error("Virtuals API key not configured");
    }
    const net = network || process.env.ACP_NETWORK || "base-sepolia";
    _instance = new ACPService(key, net);
  }
  return _instance;
}
function createACPService(apiKey, network) {
  return new ACPService(apiKey, network);
}

// src/runtime/offering-registry.ts
var log2 = createACPModuleLogger("ACPOfferingRegistry");
var ACPOfferingRegistry = class {
  offerings = /* @__PURE__ */ new Map();
  registerOffering(id, config, handlers) {
    if (this.offerings.has(id)) {
      log2.warn(`Overwriting existing offering: ${id}`);
    }
    this.offerings.set(id, {
      id,
      config,
      handlers,
      registeredAt: Date.now()
    });
    log2.info(`Registered offering: ${id}`, {
      name: config.name,
      description: config.description
    });
  }
  unregisterOffering(id) {
    const deleted = this.offerings.delete(id);
    if (deleted) {
      log2.info(`Unregistered offering: ${id}`);
    }
    return deleted;
  }
  getOffering(id) {
    return this.offerings.get(id);
  }
  getAllOfferings() {
    return Array.from(this.offerings.values());
  }
  getOfferingIds() {
    return Array.from(this.offerings.keys());
  }
  hasOffering(id) {
    return this.offerings.has(id);
  }
  executeJob(id, request) {
    const offering = this.offerings.get(id);
    if (!offering) {
      throw new Error(`Offering not found: ${id}`);
    }
    return offering.handlers.executeJob(request);
  }
  validateRequirements(id, request) {
    const offering = this.offerings.get(id);
    if (!offering) {
      throw new Error(`Offering not found: ${id}`);
    }
    if (!offering.handlers.validateRequirements) {
      return { valid: true };
    }
    return offering.handlers.validateRequirements(request);
  }
  requestPayment(id, request) {
    const offering = this.offerings.get(id);
    if (!offering) {
      throw new Error(`Offering not found: ${id}`);
    }
    if (!offering.handlers.requestPayment) {
      return void 0;
    }
    return offering.handlers.requestPayment(request);
  }
  requestAdditionalFunds(id, request) {
    const offering = this.offerings.get(id);
    if (!offering) {
      throw new Error(`Offering not found: ${id}`);
    }
    if (!offering.handlers.requestAdditionalFunds) {
      return void 0;
    }
    return offering.handlers.requestAdditionalFunds(request);
  }
  toRegistrationSchema(id) {
    const offering = this.offerings.get(id);
    if (!offering) {
      return void 0;
    }
    return {
      name: offering.config.name,
      description: offering.config.description,
      jobFee: offering.config.jobFee,
      jobFeeType: offering.config.jobFeeType,
      requiredFunds: offering.config.requiredFunds,
      requirement: offering.config.requirement
    };
  }
  clear() {
    this.offerings.clear();
    log2.info("Cleared all offerings");
  }
  count() {
    return this.offerings.size;
  }
};
var _registry = null;
function getACPOfferingRegistry() {
  if (!_registry) {
    _registry = new ACPOfferingRegistry();
  }
  return _registry;
}
function createACPOfferingRegistry() {
  _registry = new ACPOfferingRegistry();
  return _registry;
}

// src/runtime/agdp-tracker.ts
var log3 = createACPModuleLogger("AGDPTracker");
var AGDPTracker = class {
  agentId;
  storeEvents;
  events = [];
  constructor(config) {
    this.agentId = config.agentId;
    this.storeEvents = config.storeEvents ?? true;
  }
  async trackRevenueEvent(event) {
    if (this.storeEvents) {
      this.events.push(event);
    }
    log3.info(`Tracked revenue event: ${event.jobId} - ${event.amount} ${event.token}`);
  }
  async trackJobCompletion(jobId, offeringId, fee, token = "USDC") {
    await this.trackRevenueEvent({
      jobId,
      offeringId,
      amount: fee,
      token,
      timestamp: Date.now(),
      type: "fee"
    });
  }
  async calculateAGDP(period = "all") {
    const now = Date.now();
    let cutoff = now;
    switch (period) {
      case "daily":
        cutoff = now - 24 * 60 * 60 * 1e3;
        break;
      case "weekly":
        cutoff = now - 7 * 24 * 60 * 60 * 1e3;
        break;
      case "monthly":
        cutoff = now - 30 * 24 * 60 * 60 * 1e3;
        break;
      case "all":
        cutoff = 0;
        break;
    }
    const filteredEvents = this.events.filter((e) => e.timestamp >= cutoff);
    const offeringMap = /* @__PURE__ */ new Map();
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
    const byOffering = {};
    for (const [id, data] of offeringMap) {
      byOffering[id] = data;
    }
    const byOfferingSimple = {};
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
      timestamp: now
    };
  }
  async getMetrics() {
    const summary = await this.calculateAGDP("daily");
    const byOfferingSimple = {};
    for (const [id, data] of Object.entries(summary.byOffering)) {
      byOfferingSimple[id] = data.revenue;
    }
    return {
      agentId: this.agentId,
      period: "daily",
      revenue: {
        total: summary.totalRevenue,
        byOffering: byOfferingSimple
      },
      jobsCompleted: summary.totalJobs,
      averageRating: 0,
      timestamp: Date.now()
    };
  }
  async getAgentProfile() {
    try {
      const service = getACPService();
      const profile = await service.getAgentProfile();
      return {
        name: profile.name,
        description: profile.description,
        rating: profile.rating,
        jobsCompleted: profile.jobsCompleted
      };
    } catch (error) {
      log3.error("Failed to get agent profile", error);
      return null;
    }
  }
  getEvents() {
    return [...this.events];
  }
  clearEvents() {
    this.events = [];
    log3.info("Cleared AGDP events");
  }
};
var _tracker = null;
function getAGDPTracker(agentId) {
  if (!_tracker) {
    _tracker = new AGDPTracker({ agentId: agentId || "default" });
  }
  return _tracker;
}
function createAGDPTracker(config) {
  _tracker = new AGDPTracker(config);
  return _tracker;
}

// src/runtime/clawhub-publisher.ts
var log4 = createACPModuleLogger("ClawHubPublisher");
function skillToOfferingConfig(skill) {
  const frontmatter = skill.frontmatter;
  const metadata = frontmatter.metadata || {};
  const category = metadata.category || frontmatter.tags?.[0] || "utility";
  return {
    name: frontmatter.name,
    description: frontmatter.description,
    category,
    inputs: metadata.inputSchema || {},
    outputs: metadata.outputSchema || {}
  };
}
var ClawHubPublisher = class {
  async publishSkill(skillName, config) {
    try {
      const skillLoader = getSkillLoader();
      const skill = skillLoader.getSkill(skillName);
      if (!skill) {
        return {
          success: false,
          error: `Skill not found: ${skillName}`
        };
      }
      const service = getACPService();
      const offering = {
        name: config.name,
        description: config.description,
        jobFee: config.price,
        jobFeeType: config.feeType,
        requiredFunds: false,
        requirement: {
          type: "object",
          properties: {
            input: {
              type: "string",
              description: "Input for the skill"
            }
          },
          required: ["input"]
        }
      };
      const result = await service.registerOffering(offering);
      log4.info(`Published skill "${skillName}" as offering: ${result.id}`);
      return {
        success: true,
        offeringId: result.id
      };
    } catch (error) {
      log4.error("Failed to publish skill", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  async publishAllSkills(defaultPrice = "0.01", feeType = "fixed") {
    const skillLoader = getSkillLoader();
    const skills = skillLoader.getAllSkills();
    let published = 0;
    let failed = 0;
    const errors = [];
    for (const skill of skills) {
      const config = skillToOfferingConfig(skill);
      const result = await this.publishSkill(skill.frontmatter.name, {
        name: config.name || skill.frontmatter.name,
        description: config.description || skill.frontmatter.description,
        category: config.category,
        price: defaultPrice,
        feeType,
        inputs: config.inputs,
        outputs: config.outputs
      });
      if (result.success) {
        published++;
      } else {
        failed++;
        errors.push(`${skill.frontmatter.name}: ${result.error}`);
      }
    }
    log4.info(`Published ${published}/${skills.length} skills to ClawHub`);
    return { published, failed, errors };
  }
  async unpublishOffering(offeringId) {
    try {
      const service = getACPService();
      await service.deleteOffering(offeringId);
      log4.info(`Unpublished offering: ${offeringId}`);
      return { success: true };
    } catch (error) {
      log4.error("Failed to unpublish offering", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  async listPublishedOfferings() {
    try {
      const service = getACPService();
      const offerings = await service.listOfferings();
      return offerings.map((o) => ({
        id: o.id,
        name: o.name,
        status: o.status
      }));
    } catch (error) {
      log4.error("Failed to list published offerings", error);
      return [];
    }
  }
};
var _publisher = null;
function getClawHubPublisher() {
  if (!_publisher) {
    _publisher = new ClawHubPublisher();
  }
  return _publisher;
}

// src/acp-plugin.ts
var log5 = createPluginModuleLogger2("ACPPlugin");
var DEFAULT_MARKETPLACE_LIMIT = 20;
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
function getAgentId(url) {
  return url.searchParams.get("agentId") || getActiveAgentId();
}
function getMarketplaceSearchOptions(url) {
  return {
    query: url.searchParams.get("query") || void 0,
    category: url.searchParams.get("category") || void 0,
    minRating: url.searchParams.get("minRating") ? Number.parseFloat(url.searchParams.get("minRating") || "") : void 0,
    limit: url.searchParams.get("limit") ? Number.parseInt(url.searchParams.get("limit") || "", 10) : DEFAULT_MARKETPLACE_LIMIT,
    offset: url.searchParams.get("offset") ? Number.parseInt(url.searchParams.get("offset") || "", 10) : 0
  };
}
function getDashboardPeriod(url) {
  return url.searchParams.get("period") || "all";
}
function getLocalOfferings() {
  return getACPOfferingRegistry().getAllOfferings().map((offering) => ({
    id: offering.id,
    name: offering.config.name,
    description: offering.config.description,
    jobFee: offering.config.jobFee,
    jobFeeType: offering.config.jobFeeType,
    skillName: offering.config.skillName
  }));
}
function getAvailableSkills() {
  return getSkillLoader2().getAllSkills().map((skill) => ({
    name: skill.frontmatter.name,
    description: skill.frontmatter.description,
    source: skill.source
  }));
}
async function loadACPSection(label, task, fallback) {
  try {
    return { data: await task() };
  } catch (error) {
    log5.error(`Failed to load ACP ${label.toLowerCase()}`, {
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      data: fallback,
      error: label
    };
  }
}
var ACPPlugin = class extends BasePlugin {
  name = "acp";
  version = "0.1.0-beta";
  description = "Optional ACP commerce operations for Phantasy.";
  displayName = "ACP Commerce";
  category = "commerce";
  tags = ["acp", "commerce", "jobs", "offerings"];
  permissions = ["internet"];
  workspace = "business";
  extensionKind = "capability";
  dataRetention = {
    stores: [
      {
        name: "agent_configs.acpConfig",
        kind: "config",
        description: "ACP profile, offering, and marketplace configuration stored in agent config.",
        erasable: false
      },
      {
        name: "revenue_events",
        kind: "postgres",
        description: "Commerce revenue events written through financial tracking when enabled.",
        erasable: false
      }
    ],
    dataCategories: [
      "agent commerce profile",
      "wallet addresses",
      "job metadata",
      "offering metadata",
      "revenue events"
    ],
    externalServices: ["ACP marketplace", "ClawHub", "Base RPC endpoints"],
    retentionDefault: "persist",
    erasable: false
  };
  adminSurface = {
    tabId: "acp",
    label: "ACP Commerce",
    workspace: "business",
    kind: "generic",
    advancedModule: "agent-commerce",
    keywords: ["acp", "commerce", "jobs", "offerings"]
  };
  configSchema = {
    type: "object",
    properties: {
      enabled: { type: "boolean", default: true }
    }
  };
  getTools() {
    return [];
  }
  async handleCustomEndpoint(request, path) {
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
          metrics
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
            { listings: [], total: 0 }
          ),
          loadACPSection("Revenue", () => tracker.calculateAGDP(period), null)
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
            metrics.error
          ].filter(Boolean)
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
            getDashboardPeriod(url)
          )
        );
      }
      if (path === "/marketplace/search" && request.method === "GET") {
        return jsonResponse(
          await service.searchMarketplace(getMarketplaceSearchOptions(url))
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
      log5.error("ACP plugin endpoint failed", {
        path,
        error: error instanceof Error ? error.message : String(error)
      });
      return jsonResponse({ error: "ACP plugin request failed" }, 500);
    }
  }
};
var acp_plugin_default = ACPPlugin;

// src/runtime/seller-runtime.ts
import { createServer } from "http";
import WebSocket from "ws";
var log6 = createACPModuleLogger("ACPSellerRuntime");
var ACPSellerRuntime = class {
  wss = null;
  port;
  autoAccept;
  offerings = /* @__PURE__ */ new Map();
  activeJobs = /* @__PURE__ */ new Map();
  clients = /* @__PURE__ */ new Map();
  server = null;
  constructor(config) {
    this.port = config.port;
    this.autoAccept = config.autoAccept;
  }
  registerOffering(offeringId, handlers) {
    this.offerings.set(offeringId, handlers);
    log6.info(`Registered offering handler: ${offeringId}`);
  }
  unregisterOffering(offeringId) {
    this.offerings.delete(offeringId);
    log6.info(`Unregistered offering handler: ${offeringId}`);
  }
  start() {
    if (this.wss) {
      log6.warn("Seller runtime already running");
      return;
    }
    this.server = createServer();
    this.wss = new WebSocket.Server({
      server: this.server,
      path: "/acp/sell"
    });
    this.wss.on("connection", (socket) => {
      const clientId = createRuntimeId("client");
      log6.info(`Client connected: ${clientId}`);
      socket.on("message", async (data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleMessage(clientId, socket, message);
        } catch (error) {
          log6.error("Failed to parse message", error);
          socket.send(
            JSON.stringify({ type: "error", message: "Invalid message format" })
          );
        }
      });
      socket.on("close", () => {
        this.clients.delete(clientId);
        log6.info(`Client disconnected: ${clientId}`);
      });
      socket.on("error", (error) => {
        log6.error(`Socket error for ${clientId}`, error);
      });
    });
    this.server.listen(this.port, () => {
      log6.info(`ACP Seller Runtime listening on port ${this.port}`);
    });
  }
  stop() {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      if (this.server) {
        this.server.close();
        this.server = null;
      }
      log6.info("Seller runtime stopped");
    }
  }
  async handleMessage(clientId, socket, message) {
    switch (message.type) {
      case "register": {
        const offeringId = message.payload?.offeringId;
        if (!offeringId) {
          socket.send(JSON.stringify({ type: "error", message: "Missing offeringId" }));
          return;
        }
        this.clients.set(clientId, { id: clientId, offeringId, socket });
        socket.send(JSON.stringify({ type: "registered", success: true }));
        log6.info(`Client ${clientId} registered for offering: ${offeringId}`);
        break;
      }
      case "job": {
        const job = message.payload?.job;
        if (!job) {
          socket.send(JSON.stringify({ type: "error", message: "Missing job" }));
          return;
        }
        await this.handleIncomingJob(clientId, socket, job);
        break;
      }
      default:
        socket.send(JSON.stringify({ type: "error", message: `Unknown message type: ${message.type}` }));
    }
  }
  async handleIncomingJob(clientId, socket, job) {
    log6.info(`Received job: ${job.id} for offering: ${job.offeringId}`);
    const handlers = this.offerings.get(job.offeringId);
    if (!handlers) {
      log6.error(`No handler found for offering: ${job.offeringId}`);
      this.send(clientId, socket, "job:reject", {
        jobId: job.id,
        reason: "Offering not available"
      });
      return;
    }
    this.activeJobs.set(job.id, job);
    const jobRequest = {
      jobId: job.id,
      offeringId: job.offeringId,
      requirements: job.requirements,
      buyerWallet: job.buyerWallet,
      buyerAgentId: job.buyerAgentId
    };
    try {
      if (handlers.validateRequirements) {
        const validation = handlers.validateRequirements(jobRequest);
        const isValid = typeof validation === "boolean" ? validation : validation.valid;
        if (!isValid) {
          const reason = typeof validation === "object" ? validation.reason : "Validation failed";
          this.send(clientId, socket, "job:reject", { jobId: job.id, reason });
          log6.info(`Job ${job.id} rejected: ${reason}`);
          return;
        }
      }
      this.send(clientId, socket, "job:accept", { jobId: job.id });
      if (handlers.requestAdditionalFunds) {
        const additionalFunds = handlers.requestAdditionalFunds(jobRequest);
        this.send(clientId, socket, "payment:request", {
          jobId: job.id,
          ...additionalFunds
        });
      }
      const result = await handlers.executeJob(jobRequest);
      this.send(clientId, socket, "job:result", {
        jobId: job.id,
        deliverable: result.deliverable,
        payableDetail: result.payableDetail
      });
      log6.info(`Job ${job.id} completed`);
    } catch (error) {
      log6.error(`Job ${job.id} failed`, error);
      this.send(clientId, socket, "job:error", {
        jobId: job.id,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    } finally {
      this.activeJobs.delete(job.id);
    }
  }
  send(clientId, socket, type, payload) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, payload }));
    }
  }
  getActiveJobCount() {
    return this.activeJobs.size;
  }
  isRunning() {
    return this.wss !== null && this.wss !== void 0;
  }
};
var _runtime = null;
function getACPSellerRuntime() {
  return _runtime;
}
function createACPSellerRuntime(config) {
  _runtime = new ACPSellerRuntime(config);
  return _runtime;
}

// src/runtime/skill-adapter.ts
var log7 = createACPModuleLogger("ACPSkillAdapter");
function parseAllowedTools(toolsString) {
  if (!toolsString) return [];
  return toolsString.split(/\s+/).filter(Boolean);
}
function generateRequirementSchema(skill) {
  const baseSchema = {
    type: "object",
    properties: {},
    required: []
  };
  const skillBody = skill.body.toLowerCase();
  if (skillBody.includes("input") || skillBody.includes("parameter") || skillBody.includes("argument")) {
    if (baseSchema.properties) {
      baseSchema.properties.input = {
        type: "string",
        description: "Input data or parameters for the skill"
      };
    }
    if (baseSchema.required && !baseSchema.required.includes("input")) {
      baseSchema.required.push("input");
    }
  }
  if (skillBody.includes("query") || skillBody.includes("search")) {
    if (baseSchema.properties) {
      baseSchema.properties.query = {
        type: "string",
        description: "Search query or term"
      };
    }
    if (baseSchema.required && !baseSchema.required.includes("query")) {
      baseSchema.required.push("query");
    }
  }
  if (skillBody.includes("token") || skillBody.includes("address")) {
    if (baseSchema.properties) {
      baseSchema.properties.tokenAddress = {
        type: "string",
        description: "Token contract address"
      };
      baseSchema.properties.chain = {
        type: "string",
        description: "Blockchain network (e.g., base, ethereum)"
      };
    }
  }
  if (skillBody.includes("amount")) {
    if (baseSchema.properties) {
      baseSchema.properties.amount = {
        type: "string",
        description: "Amount value"
      };
    }
  }
  return baseSchema;
}
function skillToOfferingHandlers(skill, allowedTools = []) {
  return {
    executeJob: async (request) => {
      try {
        const skillLoader = getSkillLoader();
        const invocation = skillLoader.invoke(skill.frontmatter.name);
        if (!invocation) {
          return {
            deliverable: `Skill "${skill.frontmatter.name}" could not be invoked`
          };
        }
        const result = `Executed skill: ${skill.frontmatter.name}
Description: ${skill.frontmatter.description}

Note: Full skill execution requires proper integration with agent runtime.`;
        return {
          deliverable: result
        };
      } catch (error) {
        return {
          deliverable: `Error executing skill: ${error instanceof Error ? error.message : "Unknown error"}`
        };
      }
    },
    validateRequirements: (request) => {
      const schema = generateRequirementSchema(skill);
      const required = schema.required || [];
      const requirements = request.requirements;
      for (const field of required) {
        if (!requirements[field]) {
          return {
            valid: false,
            reason: `Missing required field: ${field}`
          };
        }
      }
      return { valid: true };
    },
    requestPayment: (request) => {
      return `Executing skill: ${skill.frontmatter.name}. Please proceed with payment.`;
    }
  };
}
function createOfferingFromSkill(config) {
  const skillLoader = getSkillLoader();
  const skill = skillLoader.getSkill(config.skillName);
  if (!skill) {
    log7.warn(`Skill not found: ${config.skillName}`);
    return null;
  }
  const offeringConfig = {
    name: config.offeringName || skill.frontmatter.name,
    description: config.description || skill.frontmatter.description,
    jobFee: config.jobFee,
    jobFeeType: config.jobFeeType,
    requiredFunds: false,
    requirement: generateRequirementSchema(skill),
    evaluatorType: config.evaluatorType,
    evaluatorAgentId: config.evaluatorAgentId,
    skillName: config.skillName
  };
  const allowedTools = parseAllowedTools(skill.frontmatter["allowed-tools"] || "");
  const handlers = skillToOfferingHandlers(skill, allowedTools);
  return { config: offeringConfig, handlers };
}
function registerSkillAsOffering(config) {
  const result = createOfferingFromSkill(config);
  if (!result) {
    return false;
  }
  const offeringId = config.offeringName || config.skillName;
  const registry = getACPOfferingRegistry();
  registry.registerOffering(offeringId, result.config, result.handlers);
  log7.info(`Registered skill "${config.skillName}" as offering "${offeringId}"`);
  return true;
}
function unregisterSkillOffering(skillName) {
  const registry = getACPOfferingRegistry();
  return registry.unregisterOffering(skillName);
}
function getRegisteredSkillOfferings() {
  const registry = getACPOfferingRegistry();
  const offerings = registry.getAllOfferings();
  return offerings.filter((o) => o.config.skillName).map((o) => ({
    skillName: o.config.skillName,
    offeringId: o.id,
    config: o.config
  }));
}
function syncAllSkillsToOfferings() {
  const skillLoader = getSkillLoader();
  const skills = skillLoader.getAllSkills();
  let synced = 0;
  for (const skill of skills) {
    const result = createOfferingFromSkill({
      skillName: skill.frontmatter.name,
      jobFee: "0.01",
      jobFeeType: "fixed"
    });
    if (result) {
      const registry = getACPOfferingRegistry();
      if (!registry.hasOffering(skill.frontmatter.name)) {
        registry.registerOffering(skill.frontmatter.name, result.config, result.handlers);
        synced++;
      }
    }
  }
  log7.info(`Synced ${synced} skills to ACP offerings`);
  return synced;
}

// src/runtime/marketplace-client.ts
var log8 = createACPModuleLogger("ACPMarketplace");
var ACPMarketplaceClient = class {
  async search(options = {}) {
    const service = getACPService();
    return service.searchMarketplace(options);
  }
  async browseAgents(query) {
    const result = await this.search({ query, limit: 20 });
    return result.listings;
  }
  async getOfferingDetails(offeringId) {
    const service = getACPService();
    return service.getOffering(offeringId);
  }
  async listMyOfferings() {
    const service = getACPService();
    return service.listOfferings();
  }
  async createJob(params) {
    try {
      const service = getACPService();
      const job = await service.createJob({
        offeringId: params.offeringId,
        requirements: params.requirements
      });
      log8.info(`Created job: ${job.id} for offering: ${params.offeringId}`);
      return { job, success: true };
    } catch (error) {
      log8.error("Failed to create job", error);
      return {
        job: null,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  async acceptJob(jobId) {
    try {
      const service = getACPService();
      const job = await service.acceptJob(jobId);
      log8.info(`Accepted job: ${jobId}`);
      return { job, success: true };
    } catch (error) {
      log8.error("Failed to accept job", error);
      return {
        job: null,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  async rejectJob(jobId, reason) {
    try {
      const service = getACPService();
      const job = await service.rejectJob(jobId, reason);
      log8.info(`Rejected job: ${jobId}`);
      return { job, success: true };
    } catch (error) {
      log8.error("Failed to reject job", error);
      return {
        job: null,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  async submitPayment(jobId) {
    try {
      const service = getACPService();
      const job = await service.submitPayment(jobId);
      log8.info(`Submitted payment for job: ${jobId}`);
      return { job, success: true };
    } catch (error) {
      log8.error("Failed to submit payment", error);
      return {
        job: null,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  async submitDeliverable(jobId, deliverable, payableDetail) {
    try {
      const service = getACPService();
      const job = await service.submitDeliverable(jobId, deliverable, payableDetail);
      log8.info(`Submitted deliverable for job: ${jobId}`);
      return { job, success: true };
    } catch (error) {
      log8.error("Failed to submit deliverable", error);
      return {
        job: null,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  async evaluateJob(jobId, quality, score, feedback) {
    try {
      const service = getACPService();
      const job = await service.evaluateJob(jobId, {
        quality,
        score,
        feedback: feedback || ""
      });
      log8.info(`Evaluated job: ${jobId} - ${quality} (${score})`);
      return { job, success: true };
    } catch (error) {
      log8.error("Failed to evaluate job", error);
      return {
        job: null,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  async cancelJob(jobId) {
    try {
      const service = getACPService();
      const job = await service.cancelJob(jobId);
      log8.info(`Cancelled job: ${jobId}`);
      return { job, success: true };
    } catch (error) {
      log8.error("Failed to cancel job", error);
      return {
        job: null,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  async getJobStatus(jobId) {
    try {
      const service = getACPService();
      return await service.getJob(jobId);
    } catch (error) {
      log8.error("Failed to get job status", error);
      return null;
    }
  }
  async getAgentProfile(agentId) {
    const service = getACPService();
    return service.getAgentProfile(agentId);
  }
  async updateProfile(data) {
    const service = getACPService();
    return service.updateProfile(data);
  }
  async getWalletInfo() {
    const service = getACPService();
    return service.getWalletInfo();
  }
};
var _client = null;
function getACPMarketplaceClient() {
  if (!_client) {
    _client = new ACPMarketplaceClient();
  }
  return _client;
}

// src/runtime/evaluator.ts
var log9 = createACPModuleLogger("ACPEvaluator");
var ACPEvaluator = class {
  async evaluate(params) {
    try {
      const service = getACPService();
      const result = await service.evaluateJob(params.jobId, {
        quality: params.quality,
        score: params.score,
        feedback: params.feedback || ""
      });
      log9.info(`Evaluated job ${params.jobId}: ${params.quality} (${params.score})`);
      return {
        success: true,
        evaluation: {
          jobId: params.jobId,
          quality: params.quality,
          score: params.score,
          feedback: params.feedback || "",
          signature: ""
          // Would be populated by on-chain signature
        }
      };
    } catch (error) {
      log9.error("Evaluation failed", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  async batchEvaluate(evaluations) {
    const results = [];
    for (const evalParams of evaluations) {
      const result = await this.evaluate(evalParams);
      results.push(result);
    }
    return results;
  }
  calculateScore(deliverable, requirements) {
    let score = 100;
    if (!deliverable || deliverable.trim().length === 0) {
      score -= 50;
    }
    if (deliverable.toLowerCase().includes("error")) {
      score -= 30;
    }
    if (deliverable.toLowerCase().includes("unknown")) {
      score -= 20;
    }
    return Math.max(0, Math.min(100, score));
  }
  autoEvaluate(jobId, deliverable, requirements, feedback) {
    const score = this.calculateScore(deliverable, requirements);
    const quality = score >= 70 ? "satisfactory" : "unsatisfactory";
    return {
      jobId,
      quality,
      score,
      feedback: feedback || `Auto-evaluated: ${score}/100`
    };
  }
};
var _evaluator = null;
function getACPEvaluator() {
  if (!_evaluator) {
    _evaluator = new ACPEvaluator();
  }
  return _evaluator;
}

// src/runtime/escrow-service.ts
var log10 = createACPModuleLogger("ACPEscrow");
var ACPEscrow = class {
  async getStatus(jobId) {
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
        token: "USDC"
      };
    } catch (error) {
      log10.error("Failed to get escrow status", error);
      return null;
    }
  }
  async release(jobId) {
    try {
      const service = getACPService();
      const job = await service.submitDeliverable(jobId, "Job completed");
      log10.info(`Released escrow for job: ${jobId}`);
      return { success: true };
    } catch (error) {
      log10.error("Failed to release escrow", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  async releaseWithDeliverable(jobId, deliverable, payableDetail) {
    try {
      const service = getACPService();
      await service.submitDeliverable(jobId, deliverable, payableDetail);
      log10.info(`Released escrow with deliverable for job: ${jobId}`);
      return { success: true };
    } catch (error) {
      log10.error("Failed to release escrow with deliverable", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  async refund(jobId, reason) {
    try {
      const service = getACPService();
      await service.cancelJob(jobId);
      log10.info(`Refunded escrow for job: ${jobId}, reason: ${reason}`);
      return { success: true };
    } catch (error) {
      log10.error("Failed to refund escrow", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  mapJobStatusToEscrowStatus(jobStatus) {
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
};
var _escrow = null;
function getACPEscrow() {
  if (!_escrow) {
    _escrow = new ACPEscrow();
  }
  return _escrow;
}
export {
  ACPEscrow,
  ACPEvaluator,
  ACPMarketplaceClient,
  ACPOfferingRegistry,
  ACPPlugin,
  ACPSellerRuntime,
  ACPService,
  AGDPTracker,
  ClawHubPublisher,
  createACPOfferingRegistry,
  createACPSellerRuntime,
  createACPService,
  createAGDPTracker,
  createOfferingFromSkill,
  acp_plugin_default as default,
  getACPEscrow,
  getACPEvaluator,
  getACPMarketplaceClient,
  getACPOfferingRegistry,
  getACPSellerRuntime,
  getACPService,
  getAGDPTracker,
  getClawHubPublisher,
  getRegisteredSkillOfferings,
  registerSkillAsOffering,
  skillToOfferingHandlers,
  syncAllSkillsToOfferings,
  unregisterSkillOffering
};
//# sourceMappingURL=index.js.map