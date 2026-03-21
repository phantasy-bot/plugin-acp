export type JSONSchema = object;

export type ACPNetwork = "base-sepolia" | "base-mainnet";
export type FeeType = "fixed" | "percentage";
export type JobStatus =
  | "pending"
  | "payment_requested"
  | "paid"
  | "executing"
  | "completed"
  | "disputed"
  | "cancelled";
export type OfferingStatus = "active" | "inactive";

export interface ACPOffering {
  id: string;
  name: string;
  description: string;
  jobFee: string;
  jobFeeType: FeeType;
  requiredFunds: boolean;
  requirement: JSONSchema;
  status: OfferingStatus;
  providerAgentId?: string;
  providerWallet?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ACPJob {
  id: string;
  offeringId: string;
  offeringName?: string;
  buyerWallet: string;
  buyerAgentId?: string;
  sellerWallet: string;
  sellerAgentId?: string;
  requirements: Record<string, unknown>;
  status: JobStatus;
  jobFee: string;
  additionalFundsRequired?: {
    amount: string;
    tokenAddress: string;
    recipient: string;
  };
  deliverable?: string;
  payableDetail?: {
    tokenAddress: string;
    amount: string;
  };
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface ACPJobRequest {
  jobId: string;
  offeringId: string;
  requirements: Record<string, unknown>;
  buyerWallet: string;
  buyerAgentId?: string;
}

export interface ExecuteJobResult {
  deliverable: string | { type: string; value: unknown };
  payableDetail?: {
    tokenAddress: string;
    amount: string;
  };
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface FundsRequest {
  content?: string;
  amount: string;
  tokenAddress: string;
  recipient: string;
}

export interface ACPOfferingHandlers {
  executeJob: (request: ACPJobRequest) => Promise<ExecuteJobResult>;
  validateRequirements?: (request: ACPJobRequest) => ValidationResult | boolean;
  requestPayment?: (request: ACPJobRequest) => string;
  requestAdditionalFunds?: (request: ACPJobRequest) => FundsRequest;
}

export interface ACPServiceConfig {
  apiKey: string;
  network: ACPNetwork;
  sellerPid?: string;
  sellerMode?: {
    autoAccept: boolean;
    defaultFee: string;
  };
  buyerMode?: {
    autoPay: boolean;
    maxJobFee: string;
  };
}

export interface ACPMarketplaceListing {
  id: string;
  name: string;
  description: string;
  providerAgentId: string;
  providerWallet: string;
  category?: string;
  jobFee: string;
  jobFeeType: FeeType;
  requiredFunds: boolean;
  rating?: number;
  jobsCompleted?: number;
}

export interface ACPSearchOptions {
  query?: string;
  category?: string;
  minRating?: number;
  limit?: number;
  offset?: number;
}

export interface ACPWalletInfo {
  address: string;
  network: ACPNetwork;
  balance: string;
  tokens: Array<{
    address: string;
    symbol: string;
    balance: string;
  }>;
}

export interface ACPEvaluatorResult {
  jobId: string;
  quality: "satisfactory" | "unsatisfactory";
  score: number;
  feedback: string;
  signature: string;
}

export interface ACPAgreement {
  jobId: string;
  buyerSignature: string;
  sellerSignature: string;
  terms: {
    offeringId: string;
    requirements: Record<string, unknown>;
    fee: string;
    timestamp: number;
  };
}

export interface AGDPMetrics {
  agentId: string;
  period: "daily" | "weekly" | "monthly" | "all";
  revenue: {
    total: string;
    byOffering: Record<string, string>;
  };
  jobsCompleted: number;
  averageRating: number;
  timestamp: number;
}

export interface RevenueEvent {
  jobId: string;
  offeringId: string;
  amount: string;
  token: string;
  timestamp: number;
  type: "fee" | "tips" | "refund";
}

export interface ACPOfferingConfig {
  name: string;
  description: string;
  jobFee: string;
  jobFeeType: FeeType;
  requiredFunds: boolean;
  requirement: JSONSchema;
  evaluatorType?: "self" | "external" | "buyer";
  evaluatorAgentId?: string;
  skillName?: string;
}

export interface ACPOfferingRegistration {
  name: string;
  description: string;
  jobFee: string;
  jobFeeType: FeeType;
  requiredFunds: boolean;
  requirement: JSONSchema;
}
