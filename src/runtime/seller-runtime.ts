import { Server as HttpServer, createServer } from 'http';
import WebSocket from 'ws';
import { createACPModuleLogger, createRuntimeId } from "./shared";
import type {
  ACPJob,
  ACPJobRequest,
  ExecuteJobResult,
  FundsRequest,
  ACPOfferingHandlers,
} from "./types";

const log = createACPModuleLogger("ACPSellerRuntime");

export interface SellerRuntimeConfig {
  port: number;
  autoAccept: boolean;
}

interface ConnectedClient {
  id: string;
  offeringId: string;
  socket: WebSocket;
}

export class ACPSellerRuntime {
  private wss: WebSocket.Server | null = null;
  private port: number;
  private autoAccept: boolean;
  private offerings: Map<string, ACPOfferingHandlers> = new Map();
  private activeJobs: Map<string, ACPJob> = new Map();
  private clients: Map<string, ConnectedClient> = new Map();
  private server: HttpServer | null = null;

  constructor(config: SellerRuntimeConfig) {
    this.port = config.port;
    this.autoAccept = config.autoAccept;
  }

  registerOffering(offeringId: string, handlers: ACPOfferingHandlers): void {
    this.offerings.set(offeringId, handlers);
    log.info(`Registered offering handler: ${offeringId}`);
  }

  unregisterOffering(offeringId: string): void {
    this.offerings.delete(offeringId);
    log.info(`Unregistered offering handler: ${offeringId}`);
  }

  start(): void {
    if (this.wss) {
      log.warn("Seller runtime already running");
      return;
    }

    this.server = createServer();
    this.wss = new WebSocket.Server({
      server: this.server,
      path: "/acp/sell",
    });

    this.wss.on("connection", (socket: WebSocket) => {
      const clientId = createRuntimeId("client");
      log.info(`Client connected: ${clientId}`);

      socket.on("message", async (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleMessage(clientId, socket, message);
        } catch (error) {
          log.error("Failed to parse message", error);
          socket.send(
            JSON.stringify({ type: "error", message: "Invalid message format" })
          );
        }
      });

      socket.on("close", () => {
        this.clients.delete(clientId);
        log.info(`Client disconnected: ${clientId}`);
      });

      socket.on("error", (error: Error) => {
        log.error(`Socket error for ${clientId}`, error);
      });
    });

    this.server.listen(this.port, () => {
      log.info(`ACP Seller Runtime listening on port ${this.port}`);
    });
  }

  stop(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      if (this.server) {
        this.server.close();
        this.server = null;
      }
      log.info("Seller runtime stopped");
    }
  }

  private async handleMessage(
    clientId: string,
    socket: WebSocket,
    message: { type: string; payload?: Record<string, unknown> }
  ): Promise<void> {
    switch (message.type) {
      case "register": {
        const offeringId = message.payload?.offeringId as string | undefined;
        if (!offeringId) {
          socket.send(JSON.stringify({ type: "error", message: "Missing offeringId" }));
          return;
        }
        this.clients.set(clientId, { id: clientId, offeringId, socket });
        socket.send(JSON.stringify({ type: "registered", success: true }));
        log.info(`Client ${clientId} registered for offering: ${offeringId}`);
        break;
      }

      case "job": {
        const job = message.payload?.job as ACPJob | undefined;
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

  private async handleIncomingJob(
    clientId: string,
    socket: WebSocket,
    job: ACPJob
  ): Promise<void> {
    log.info(`Received job: ${job.id} for offering: ${job.offeringId}`);

    const handlers = this.offerings.get(job.offeringId);
    if (!handlers) {
      log.error(`No handler found for offering: ${job.offeringId}`);
      this.send(clientId, socket, "job:reject", {
        jobId: job.id,
        reason: "Offering not available",
      });
      return;
    }

    this.activeJobs.set(job.id, job);

    const jobRequest: ACPJobRequest = {
      jobId: job.id,
      offeringId: job.offeringId,
      requirements: job.requirements,
      buyerWallet: job.buyerWallet,
      buyerAgentId: job.buyerAgentId,
    };

    try {
      if (handlers.validateRequirements) {
        const validation = handlers.validateRequirements(jobRequest);
        const isValid = typeof validation === "boolean" ? validation : validation.valid;

        if (!isValid) {
          const reason =
            typeof validation === "object" ? validation.reason : "Validation failed";
          this.send(clientId, socket, "job:reject", { jobId: job.id, reason });
          log.info(`Job ${job.id} rejected: ${reason}`);
          return;
        }
      }

      this.send(clientId, socket, "job:accept", { jobId: job.id });

      if (handlers.requestAdditionalFunds) {
        const additionalFunds = handlers.requestAdditionalFunds(jobRequest);
        this.send(clientId, socket, "payment:request", {
          jobId: job.id,
          ...additionalFunds,
        });
      }

      const result: ExecuteJobResult = await handlers.executeJob(jobRequest);

      this.send(clientId, socket, "job:result", {
        jobId: job.id,
        deliverable: result.deliverable,
        payableDetail: result.payableDetail,
      });

      log.info(`Job ${job.id} completed`);
    } catch (error) {
      log.error(`Job ${job.id} failed`, error);
      this.send(clientId, socket, "job:error", {
        jobId: job.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  private send(
    clientId: string,
    socket: WebSocket,
    type: string,
    payload: Record<string, unknown>
  ): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, payload }));
    }
  }

  getActiveJobCount(): number {
    return this.activeJobs.size;
  }

  isRunning(): boolean {
    return this.wss !== null && this.wss !== undefined;
  }
}

let _runtime: ACPSellerRuntime | null = null;

export function getACPSellerRuntime(): ACPSellerRuntime | null {
  return _runtime;
}

export function createACPSellerRuntime(config: SellerRuntimeConfig): ACPSellerRuntime {
  _runtime = new ACPSellerRuntime(config);
  return _runtime;
}
