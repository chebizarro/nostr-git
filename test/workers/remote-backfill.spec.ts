import {describe, expect, it} from "vitest"

import {
  buildRemoteBackfillPlanFromSnapshots,
  type RemoteBackfillRemoteSnapshot,
} from "../../src/worker/workers/remote-backfill.js"

describe("worker/remote-backfill: buildRemoteBackfillPlanFromSnapshots", () => {
  it("plans safe creates and fast-forward updates from the effective branch tip", async () => {
    const snapshots: RemoteBackfillRemoteSnapshot[] = [
      {
        remoteUrl: "https://primary.example/repo.git",
        reachable: true,
        headBranch: "main",
        refs: [
          {ref: "refs/heads/main", name: "main", type: "heads", oid: "a".repeat(40)},
          {ref: "refs/heads/feature", name: "feature", type: "heads", oid: "f".repeat(40)},
          {ref: "refs/tags/v1.0.0", name: "v1.0.0", type: "tags", oid: "t".repeat(40)},
        ],
      },
      {
        remoteUrl: "https://secondary.example/repo.git",
        reachable: true,
        headBranch: "main",
        refs: [
          {ref: "refs/heads/main", name: "main", type: "heads", oid: "b".repeat(40)},
          {ref: "refs/tags/v1.0.0", name: "v1.0.0", type: "tags", oid: "t".repeat(40)},
        ],
      },
      {
        remoteUrl: "https://mirror.example/repo.git",
        reachable: true,
        headBranch: undefined,
        refs: [],
      },
    ]

    const plan = await buildRemoteBackfillPlanFromSnapshots(snapshots, {
      isDescendent: async (oid, ancestor) => oid === "b".repeat(40) && ancestor === "a".repeat(40),
    })

    expect(plan.summary.actionableRefCount).toBe(3)
    expect(plan.summary.readyRefCount).toBe(3)
    expect(plan.summary.conflictRefCount).toBe(0)

    const mainRef = plan.refs.find(ref => ref.ref === "refs/heads/main")
    expect(mainRef).toMatchObject({
      status: "ready",
      effectiveOid: "b".repeat(40),
      createCount: 1,
      fastForwardCount: 1,
      conflictCount: 0,
      selectedByDefault: true,
    })

    const featureRef = plan.refs.find(ref => ref.ref === "refs/heads/feature")
    expect(featureRef).toMatchObject({
      status: "ready",
      effectiveOid: "f".repeat(40),
      createCount: 2,
      fastForwardCount: 0,
      conflictCount: 0,
      selectedByDefault: true,
    })

    const mirrorPlan = plan.remotes.find(
      remote => remote.remoteUrl === "https://mirror.example/repo.git",
    )
    expect(mirrorPlan).toMatchObject({
      reachable: true,
      selectedByDefault: true,
      createCount: 3,
      fastForwardCount: 0,
      conflictCount: 0,
    })
    expect(mirrorPlan?.actions.map(action => `${action.action}:${action.ref}`)).toEqual([
      "create:refs/heads/feature",
      "create:refs/heads/main",
      "create:refs/tags/v1.0.0",
    ])
  })

  it("marks conflicting tags and divergent branches as manual-only", async () => {
    const snapshots: RemoteBackfillRemoteSnapshot[] = [
      {
        remoteUrl: "https://one.example/repo.git",
        reachable: true,
        headBranch: "main",
        refs: [
          {ref: "refs/heads/main", name: "main", type: "heads", oid: "1".repeat(40)},
          {ref: "refs/tags/release", name: "release", type: "tags", oid: "a".repeat(40)},
        ],
      },
      {
        remoteUrl: "https://two.example/repo.git",
        reachable: true,
        headBranch: "main",
        refs: [
          {ref: "refs/heads/main", name: "main", type: "heads", oid: "2".repeat(40)},
          {ref: "refs/tags/release", name: "release", type: "tags", oid: "b".repeat(40)},
        ],
      },
      {
        remoteUrl: "https://three.example/repo.git",
        reachable: true,
        headBranch: undefined,
        refs: [],
      },
    ]

    const plan = await buildRemoteBackfillPlanFromSnapshots(snapshots, {
      isDescendent: async () => false,
    })

    expect(plan.summary.readyRefCount).toBe(0)
    expect(plan.summary.conflictRefCount).toBe(2)

    const mainRef = plan.refs.find(ref => ref.ref === "refs/heads/main")
    expect(mainRef).toMatchObject({
      status: "conflict",
      selectedByDefault: false,
      conflictCount: 3,
    })

    const releaseTag = plan.refs.find(ref => ref.ref === "refs/tags/release")
    expect(releaseTag).toMatchObject({
      status: "conflict",
      selectedByDefault: false,
      conflictCount: 3,
    })

    const thirdRemote = plan.remotes.find(
      remote => remote.remoteUrl === "https://three.example/repo.git",
    )
    expect(thirdRemote).toMatchObject({
      selectedByDefault: false,
      createCount: 0,
      fastForwardCount: 0,
      conflictCount: 2,
    })
    expect(thirdRemote?.actions).toEqual([])
    expect(thirdRemote?.conflicts.map(conflict => conflict.ref)).toEqual([
      "refs/heads/main",
      "refs/tags/release",
    ])
  })
})
