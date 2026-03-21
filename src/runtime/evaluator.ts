import { createACPModuleLogger } from "./shared";
import { getACPService } from "./acp-service";
import type { ACPEvaluatorResult } from "./types";

const log = createACPModuleLogger("ACPEvaluator");

export interface EvaluationParams {
  jobId: string;
  quality: "satisfactory" | "unsatisfactory";
  score: number;
  feedback?: string;
}

export interface EvaluationResult {
  success: boolean;
  evaluation?: ACPEvaluatorResult;
  error?: string;
}

export class ACPEvaluator {
  async evaluate(params: EvaluationParams): Promise<EvaluationResult> {
    try {
      const service = getACPService();

      const result = await service.evaluateJob(params.jobId, {
        quality: params.quality,
        score: params.score,
        feedback: params.feedback || "",
      });

      log.info(`Evaluated job ${params.jobId}: ${params.quality} (${params.score})`);

      return {
        success: true,
        evaluation: {
          jobId: params.jobId,
          quality: params.quality,
          score: params.score,
          feedback: params.feedback || "",
          signature: "", // Would be populated by on-chain signature
        },
      };
    } catch (error) {
      log.error("Evaluation failed", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async batchEvaluate(evaluations: EvaluationParams[]): Promise<EvaluationResult[]> {
    const results: EvaluationResult[] = [];

    for (const evalParams of evaluations) {
      const result = await this.evaluate(evalParams);
      results.push(result);
    }

    return results;
  }

  calculateScore(deliverable: string, requirements: Record<string, unknown>): number {
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

  autoEvaluate(
    jobId: string,
    deliverable: string,
    requirements: Record<string, unknown>,
    feedback?: string
  ): EvaluationParams {
    const score = this.calculateScore(deliverable, requirements);
    const quality: "satisfactory" | "unsatisfactory" = score >= 70 ? "satisfactory" : "unsatisfactory";

    return {
      jobId,
      quality,
      score,
      feedback: feedback || `Auto-evaluated: ${score}/100`,
    };
  }
}

let _evaluator: ACPEvaluator | null = null;

export function getACPEvaluator(): ACPEvaluator {
  if (!_evaluator) {
    _evaluator = new ACPEvaluator();
  }
  return _evaluator;
}
