import { createACPModuleLogger, getSkillLoader, type Skill } from "./shared";
import { getACPService } from "./acp-service";
import type { ACPOfferingRegistration } from "./types";

const log = createACPModuleLogger("ClawHubPublisher");

export interface ClawHubSkillConfig {
  name: string;
  description: string;
  category?: string;
  price: string;
  feeType: "fixed" | "percentage";
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
}

export interface PublishResult {
  success: boolean;
  offeringId?: string;
  error?: string;
}

function skillToOfferingConfig(skill: Skill): Partial<ClawHubSkillConfig> {
  const frontmatter = skill.frontmatter;
  const metadata = frontmatter.metadata || {};

  const category = (metadata.category as string) ||
                   (frontmatter as any).tags?.[0] ||
                   "utility";

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    category,
    inputs: (metadata.inputSchema as Record<string, unknown>) || {},
    outputs: (metadata.outputSchema as Record<string, unknown>) || {},
  };
}

export class ClawHubPublisher {
  async publishSkill(
    skillName: string,
    config: ClawHubSkillConfig
  ): Promise<PublishResult> {
    try {
      const skillLoader = getSkillLoader();
      const skill = skillLoader.getSkill(skillName);

      if (!skill) {
        return {
          success: false,
          error: `Skill not found: ${skillName}`,
        };
      }

      const service = getACPService();

      const offering: ACPOfferingRegistration = {
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
              description: "Input for the skill",
            },
          },
          required: ["input"],
        },
      };

      const result = await service.registerOffering(offering);

      log.info(`Published skill "${skillName}" as offering: ${result.id}`);

      return {
        success: true,
        offeringId: result.id,
      };
    } catch (error) {
      log.error("Failed to publish skill", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async publishAllSkills(
    defaultPrice: string = "0.01",
    feeType: "fixed" | "percentage" = "fixed"
  ): Promise<{ published: number; failed: number; errors: string[] }> {
    const skillLoader = getSkillLoader();
    const skills = skillLoader.getAllSkills();

    let published = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const skill of skills) {
      const config = skillToOfferingConfig(skill);

      const result = await this.publishSkill(skill.frontmatter.name, {
        name: config.name || skill.frontmatter.name,
        description: config.description || skill.frontmatter.description,
        category: config.category,
        price: defaultPrice,
        feeType,
        inputs: config.inputs,
        outputs: config.outputs,
      });

      if (result.success) {
        published++;
      } else {
        failed++;
        errors.push(`${skill.frontmatter.name}: ${result.error}`);
      }
    }

    log.info(`Published ${published}/${skills.length} skills to ClawHub`);

    return { published, failed, errors };
  }

  async unpublishOffering(offeringId: string): Promise<PublishResult> {
    try {
      const service = getACPService();
      await service.deleteOffering(offeringId);

      log.info(`Unpublished offering: ${offeringId}`);

      return { success: true };
    } catch (error) {
      log.error("Failed to unpublish offering", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async listPublishedOfferings(): Promise<Array<{ id: string; name: string; status: string }>> {
    try {
      const service = getACPService();
      const offerings = await service.listOfferings();

      return offerings.map((o) => ({
        id: o.id,
        name: o.name,
        status: o.status,
      }));
    } catch (error) {
      log.error("Failed to list published offerings", error);
      return [];
    }
  }
}

let _publisher: ClawHubPublisher | null = null;

export function getClawHubPublisher(): ClawHubPublisher {
  if (!_publisher) {
    _publisher = new ClawHubPublisher();
  }
  return _publisher;
}
