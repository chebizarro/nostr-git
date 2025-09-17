import {expectType, expectAssignable} from "tsd"
import type {
  getTag,
  getTags,
  getTagValue,
  PatchEvent,
  RepoAnnouncementEvent,
} from "./dist/index.d.ts"

// Sample typed events
declare const patch: PatchEvent
declare const repo: RepoAnnouncementEvent

// getTag with known tag name should narrow tuple for PatchEvent
const _getTag: typeof getTag = null as any
const committer = _getTag(patch, "committer")
expectType<["committer", string, string, string, string] | undefined>(committer)

// getTagValue with known tag name should be string (first value) or undefined
const _getTagValue: typeof getTagValue = null as any
const committerName = _getTagValue(patch, "committer")
expectType<string | undefined>(committerName)

// getTags for multi-value known tag name on repo announcement
const _getTags: typeof getTags = null as any
const clones = _getTags(repo, "clone")
expectType<Array<["clone", ...string[]]>>(clones)

// Unknown tag name falls back to [T, ...string[]]
const unknownTag = _getTag(repo, "unknown-tag")
expectType<["unknown-tag", ...string[]] | undefined>(unknownTag)

const unknownValue = _getTagValue(repo, "unknown-tag")
expectAssignable<string | undefined>(unknownValue)
