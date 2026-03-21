import { createACPModuleLogger } from "./shared";
import type {
  ACPOfferingHandlers,
  ACPOfferingConfig,
  ACPOfferingRegistration,
  ExecuteJobResult,
  ACPJobRequest,
  ValidationResult,
  FundsRequest,
  JSONSchema,
} from "./types";

const log = createACPModuleLogger("ACPOfferingRegistry");

export interface OfferingDefinition {
  id: string;
  config: ACPOfferingConfig;
  handlers: ACPOfferingHandlers;
  registeredAt: number;
}

export class ACPOfferingRegistry {
  private offerings: Map<string, OfferingDefinition> = new Map();

  registerOffering(
    id: string,
    config: ACPOfferingConfig,
    handlers: ACPOfferingHandlers
  ): void {
    if (this.offerings.has(id)) {
      log.warn(`Overwriting existing offering: ${id}`);
    }

    this.offerings.set(id, {
      id,
      config,
      handlers,
      registeredAt: Date.now(),
    });

    log.info(`Registered offering: ${id}`, {
      name: config.name,
      description: config.description,
    });
  }

  unregisterOffering(id: string): boolean {
    const deleted = this.offerings.delete(id);
    if (deleted) {
      log.info(`Unregistered offering: ${id}`);
    }
    return deleted;
  }

  getOffering(id: string): OfferingDefinition | undefined {
    return this.offerings.get(id);
  }

  getAllOfferings(): OfferingDefinition[] {
    return Array.from(this.offerings.values());
  }

  getOfferingIds(): string[] {
    return Array.from(this.offerings.keys());
  }

  hasOffering(id: string): boolean {
    return this.offerings.has(id);
  }

  executeJob(id: string, request: ACPJobRequest): Promise<ExecuteJobResult> {
    const offering = this.offerings.get(id);
    if (!offering) {
      throw new Error(`Offering not found: ${id}`);
    }
    return offering.handlers.executeJob(request);
  }

  validateRequirements(id: string, request: ACPJobRequest): ValidationResult | boolean {
    const offering = this.offerings.get(id);
    if (!offering) {
      throw new Error(`Offering not found: ${id}`);
    }
    if (!offering.handlers.validateRequirements) {
      return { valid: true };
    }
    return offering.handlers.validateRequirements(request);
  }

  requestPayment(id: string, request: ACPJobRequest): string | undefined {
    const offering = this.offerings.get(id);
    if (!offering) {
      throw new Error(`Offering not found: ${id}`);
    }
    if (!offering.handlers.requestPayment) {
      return undefined;
    }
    return offering.handlers.requestPayment(request);
  }

  requestAdditionalFunds(id: string, request: ACPJobRequest): FundsRequest | undefined {
    const offering = this.offerings.get(id);
    if (!offering) {
      throw new Error(`Offering not found: ${id}`);
    }
    if (!offering.handlers.requestAdditionalFunds) {
      return undefined;
    }
    return offering.handlers.requestAdditionalFunds(request);
  }

  toRegistrationSchema(id: string): ACPOfferingRegistration | undefined {
    const offering = this.offerings.get(id);
    if (!offering) {
      return undefined;
    }

    return {
      name: offering.config.name,
      description: offering.config.description,
      jobFee: offering.config.jobFee,
      jobFeeType: offering.config.jobFeeType,
      requiredFunds: offering.config.requiredFunds,
      requirement: offering.config.requirement,
    };
  }

  clear(): void {
    this.offerings.clear();
    log.info("Cleared all offerings");
  }

  count(): number {
    return this.offerings.size;
  }
}

let _registry: ACPOfferingRegistry | null = null;

export function getACPOfferingRegistry(): ACPOfferingRegistry {
  if (!_registry) {
    _registry = new ACPOfferingRegistry();
  }
  return _registry;
}

export function createACPOfferingRegistry(): ACPOfferingRegistry {
  _registry = new ACPOfferingRegistry();
  return _registry;
}
