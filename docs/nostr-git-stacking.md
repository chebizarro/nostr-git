# Nostr-Git Stacking Protocol

This document introduces first-class stack, merge, and conflict metadata for Nostr-Git.

- New kinds:
  - 30410 (Stack)
  - 30411 (Merge Metadata)
  - 30412 (Conflict Metadata)

- Patch tag extensions:
  - ["stack", <stack-id>]
  - ["depends", <patch-id-or-commit>]
  - ["rev", <revision-id>]
  - ["supersedes", <previous-revision-id>]

## Stack (30410)
Represents an ordered set of related patches.

Required tags:
- ["a", <repoAddr>]
- ["stack", <stack-id>]

Optional tags:
- ["member", <patch-id-or-commit>] (repeatable)
- ["order", ...members]

Content: optional text or JSON description.

## Merge Metadata (30411)
Summarizes merge analysis for a patch or stack member.

Required tags:
- ["a", <repoAddr>]
- ["e", <root-event-id>, "", "root"]

Optional tags:
- ["base-branch", <name>]
- ["target-branch", <name>]
- ["result", "clean"|"ff"|"conflict"]
- ["merge-commit", <oid>]

Content: JSON payload with details.

## Conflict Metadata (30412)
Provides per-file conflict details.

Required tags:
- ["a", <repoAddr>]
- ["e", <root-event-id>, "", "root"]

Optional tags:
- ["file", <path>] (repeatable)

Content: JSON payload with conflict markers/segments per file.

## Revision Semantics
Patches may advertise revision lineage using tags:
- ["rev", <revision-id>]
- ["supersedes", <previous-revision-id>]
- ["depends", <patch-or-commit-id>]

## Subscription Guidance
Include kinds [1617, 30410, 30411, 30412] with tag filters (#a, #e) alongside repo events.

## Builders and Validation
Use @nostr-git/shared-types builders and validators:
- createStackEvent, createMergeMetadataEvent, createConflictMetadataEvent
- validateStackEvent, validateMergeMetadataEvent, validateConflictMetadataEvent

## Core Stack Graph
Core exposes a StackGraph helper to fold revisions and resolve dependency order for stacks. See tests for examples.
