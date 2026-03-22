import { createACPModuleLogger, getSkillLoader, type Skill } from "./shared";
import { getACPOfferingRegistry } from "./offering-registry";
import type {
  ACPOfferingConfig,
  ACPOfferingHandlers,
  ACPJobRequest,
  ExecuteJobResult,
  ValidationResult,
  FundsRequest,
  JSONSchema,
} from "./types";

const log = createACPModuleLogger("ACPSkillAdapter");

interface SkillToOfferingConfig {
  skillName: string;
  offeringName?: string;
  description?: string;
  jobFee: string;
  jobFeeType: "fixed" | "percentage";
  evaluatorType?: "self" | "external" | "buyer";
  evaluatorAgentId?: string;
}

function parseAllowedTools(toolsString: string): string[] {
  if (!toolsString) return [];
  return toolsString.split(/\s+/).filter(Boolean);
}

function extractParametersFromSkill(skill: Skill): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  if (skill.frontmatter.metadata) {
    if (skill.frontmatter.metadata.inputSchema) {
      params.inputSchema = skill.frontmatter.metadata.inputSchema;
    }
    if (skill.frontmatter.metadata.example) {
      params.example = skill.frontmatter.metadata.example;
    }
  }

  return params;
}

interface RequirementSchema {
  type: string;
  required?: string[];
  properties?: Record<string, unknown>;
  additionalProperties?: boolean;
  [key: string]: unknown;
}

function generateRequirementSchema(skill: Skill): RequirementSchema {
  const baseSchema: RequirementSchema = {
    type: "object",
    properties: {},
    required: [],
  };

  const skillBody = skill.body.toLowerCase();

  if (skillBody.includes("input") || skillBody.includes("parameter") || skillBody.includes("argument")) {
    if (baseSchema.properties) {
      baseSchema.properties.input = {
        type: "string",
        description: "Input data or parameters for the skill",
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
        description: "Search query or term",
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
        description: "Token contract address",
      };
      baseSchema.properties.chain = {
        type: "string",
        description: "Blockchain network (e.g., base, ethereum)",
      };
    }
  }

  if (skillBody.includes("amount")) {
    if (baseSchema.properties) {
      baseSchema.properties.amount = {
        type: "string",
        description: "Amount value",
      };
    }
  }

  return baseSchema;
}

export function skillToOfferingHandlers(
  skill: Skill,
  allowedTools: string[] = []
): ACPOfferingHandlers {
  return {
    executeJob: async (request: ACPJobRequest): Promise<ExecuteJobResult> => {
      try {
        const skillLoader = getSkillLoader();
        const invocation = skillLoader.invoke(skill.frontmatter.name);

        if (!invocation) {
          return {
            deliverable: `Skill "${skill.frontmatter.name}" could not be invoked`,
          };
        }

        const result = `Executed skill: ${skill.frontmatter.name}\nDescription: ${skill.frontmatter.description}\n\nNote: Full skill execution requires proper integration with agent runtime.`;

        return {
          deliverable: result,
        };
      } catch (error) {
        return {
          deliverable: `Error executing skill: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },

    validateRequirements: (request: ACPJobRequest): ValidationResult => {
      const schema = generateRequirementSchema(skill);
      const required = schema.required || [];
      const requirements = request.requirements as Record<string, unknown>;

      for (const field of required) {
        if (!requirements[field]) {
          return {
            valid: false,
            reason: `Missing required field: ${field}`,
          };
        }
      }

      return { valid: true };
    },

    requestPayment: (request: ACPJobRequest): string => {
      return `Executing skill: ${skill.frontmatter.name}. Please proceed with payment.`;
    },
  };
}

export function createOfferingFromSkill(
  config: SkillToOfferingConfig
): { config: ACPOfferingConfig; handlers: ACPOfferingHandlers } | null {
  const skillLoader = getSkillLoader();
  const skill = skillLoader.getSkill(config.skillName);

  if (!skill) {
    log.warn(`Skill not found: ${config.skillName}`);
    return null;
  }

  const offeringConfig: ACPOfferingConfig = {
    name: config.offeringName || skill.frontmatter.name,
    description: config.description || skill.frontmatter.description,
    jobFee: config.jobFee,
    jobFeeType: config.jobFeeType,
    requiredFunds: false,
    requirement: generateRequirementSchema(skill) as JSONSchema,
    evaluatorType: config.evaluatorType,
    evaluatorAgentId: config.evaluatorAgentId,
    skillName: config.skillName,
  };

  const allowedTools = parseAllowedTools(skill.frontmatter["allowed-tools"] || "");
  const handlers = skillToOfferingHandlers(skill, allowedTools);

  return { config: offeringConfig, handlers };
}

export function registerSkillAsOffering(config: SkillToOfferingConfig): boolean {
  const result = createOfferingFromSkill(config);

  if (!result) {
    return false;
  }

  const offeringId = config.offeringName || config.skillName;
  const registry = getACPOfferingRegistry();

  registry.registerOffering(offeringId, result.config, result.handlers);
  log.info(`Registered skill "${config.skillName}" as offering "${offeringId}"`);

  return true;
}

export function unregisterSkillOffering(skillName: string): boolean {
  const registry = getACPOfferingRegistry();
  return registry.unregisterOffering(skillName);
}

export function getRegisteredSkillOfferings(): Array<{
  skillName: string;
  offeringId: string;
  config: ACPOfferingConfig;
}> {
  const registry = getACPOfferingRegistry();
  const offerings = registry.getAllOfferings();

  return offerings
    .filter((o) => o.config.skillName)
    .map((o) => ({
      skillName: o.config.skillName!,
      offeringId: o.id,
      config: o.config,
    }));
}

export function syncAllSkillsToOfferings(): number {
  const skillLoader = getSkillLoader();
  const skills = skillLoader.getAllSkills();
  let synced = 0;

  for (const skill of skills) {
    const result = createOfferingFromSkill({
      skillName: skill.frontmatter.name,
      jobFee: "0.01",
      jobFeeType: "fixed",
    });

    if (result) {
      const registry = getACPOfferingRegistry();
      if (!registry.hasOffering(skill.frontmatter.name)) {
        registry.registerOffering(skill.frontmatter.name, result.config, result.handlers);
        synced++;
      }
    }
  }

  log.info(`Synced ${synced} skills to ACP offerings`);
  return synced;
}
