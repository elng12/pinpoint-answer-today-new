export type DeploymentState = "none" | "queued" | "building" | "ready" | "failed" | "unknown";
export type ReleaseQueueAction = "push-production" | "write-candidate" | "hold-review";

export type ReleaseQueuePolicyInput = {
  slug?: string;
  logicalGameDate?: string;
  publishMode?: string;
  deploymentState?: DeploymentState | string;
  lastProductionPushAt?: string | number | Date | null;
  nowMs?: string | number | Date | null;
  slaWindowMinutes?: number;
  candidateBranch?: string;
  candidateBranchExists?: boolean;
  candidateIsCurrent?: boolean;
  overrideSecondProductionPush?: boolean;
  localGatesPassed?: boolean;
};

export type ReleaseQueuePolicyDecision = {
  action: ReleaseQueueAction;
  reasonCode: string;
  productionPushSkipped: boolean;
  notificationFields: {
    slug: string;
    logicalGameDate: string;
    publishMode: string;
    deploymentState: DeploymentState;
    action: ReleaseQueueAction;
    reasonCode: string;
    candidateBranch: string;
    remainingWindowMs?: number;
  };
};

export declare const deploymentStates: DeploymentState[];
export declare const releaseQueueActions: ReleaseQueueAction[];
export declare function decidePinpointReleaseQueueAction(
  input?: ReleaseQueuePolicyInput,
): ReleaseQueuePolicyDecision;

