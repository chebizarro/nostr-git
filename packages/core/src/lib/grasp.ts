// @nostr-git/core: grasp.ts
// GRASP: Repository Creation Delay helper

export interface GraspDelayConfig {
  initialPushDelayMs: number;
}

export async function createRepoThenPush(args: {
  createHttp: () => Promise<void>;
  pushFirstCommit: () => Promise<void>;
  delay: GraspDelayConfig; // e.g., { initialPushDelayMs: 3000 }
  onAfterPush?: () => Promise<void>; // Optional callback for post-push operations
}): Promise<void> {
  await args.createHttp();
  const ms = Math.max(0, args.delay?.initialPushDelayMs ?? 0);
  if (ms > 0) {
    await new Promise((r) => setTimeout(r, ms));
  }
  await args.pushFirstCommit();
  
  // Call post-push callback if provided (e.g., for publishing state events)
  if (args.onAfterPush) {
    await args.onAfterPush();
  }
}
