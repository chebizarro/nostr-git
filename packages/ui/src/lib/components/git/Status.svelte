<script lang="ts">
  import type { Repo } from "./Repo.svelte"
  import type { StatusEvent } from "@nostr-git/shared-types"
  import {
    GIT_STATUS_OPEN,
    GIT_STATUS_DRAFT,
    GIT_STATUS_CLOSED,
    GIT_STATUS_COMPLETE,
    Address,
  } from "@welshman/util"
  import { CircleCheck, CircleDot, X, Clock, GitMerge, AlertCircle } from "@lucide/svelte"
  import { Button } from "../ui/button"
  import { Textarea } from "../ui/textarea"
  import { Label } from "../ui/label"
  import { Input } from "../ui/input"
  import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
  import { Badge } from "../ui/badge"
  import { Separator } from "../ui/separator"
  import { ProfileLink } from "../ui/profile"

  type StatusState = "open" | "draft" | "closed" | "merged" | "resolved"

  const {
    repo,
    rootId,
    rootKind,
    rootAuthor,
    statusEvents = [],
    actorPubkey,
    compact = false,
    onPublish,
    ProfileComponent = ProfileLink,
  }: {
    repo: Repo
    rootId: string
    rootKind: 1621 | 1617
    rootAuthor: string
    statusEvents?: StatusEvent[]
    actorPubkey?: string
    compact?: boolean
    onPublish?: (event: StatusEvent) => Promise<any>
    ProfileComponent?: any
  } = $props()

  // Authority check
  const isAuthorized = $derived.by(() => {
    if (!actorPubkey) return false
    const maintainers = repo.maintainers || []
    return actorPubkey === rootAuthor || maintainers.includes(actorPubkey)
  })

  // Determine current status
  const maintainerSet = $derived.by(() => {
    const maintainers = repo.maintainers || []
    const owner = (repo as any).repoEvent?.pubkey
    return new Set([...maintainers, owner].filter(Boolean))
  })

  const authorizedEvents = $derived.by(() => {
    return statusEvents.filter(
      (e) => e.pubkey === rootAuthor || maintainerSet.has(e.pubkey)
    )
  })

  const suggestedEvents = $derived.by(() => {
    return statusEvents.filter(
      (e) => e.pubkey !== rootAuthor && !maintainerSet.has(e.pubkey)
    )
  })

  const currentStatusEvent = $derived.by(() => {
    if (authorizedEvents.length === 0) return undefined
    // Sort by created_at descending
    return [...authorizedEvents].sort((a, b) => b.created_at - a.created_at)[0]
  })

  const currentState = $derived.by((): StatusState => {
    if (!currentStatusEvent) return "open"
    switch (currentStatusEvent.kind) {
      case GIT_STATUS_OPEN:
        return "open"
      case GIT_STATUS_DRAFT:
        return "draft"
      case GIT_STATUS_CLOSED:
        return "closed"
      case GIT_STATUS_COMPLETE:
        return rootKind === 1617 ? "merged" : "resolved"
      default:
        return "open"
    }
  })

  // History sorted by recency
  const history = $derived.by(() => {
    return [...authorizedEvents].sort((a, b) => b.created_at - a.created_at)
  })

  const suggestions = $derived.by(() => {
    return [...suggestedEvents].sort((a, b) => b.created_at - a.created_at)
  })

  // UI state
  let showEditor = $state(false)
  let selectedState = $state<StatusState>("open")
  let statusNote = $state("")
  let mergeCommit = $state("")
  let appliedCommits = $state("")
  let isPublishing = $state(false)
  let lastPublishTime = $state(0)
  let publishError = $state("")

  // Rate limit (3 seconds cooldown)
  const COOLDOWN_MS = 3000
  const canPublish = $derived.by(() => {
    return Date.now() - lastPublishTime > COOLDOWN_MS
  })

  // UI: show/hide history
  let showHistory = $state(false)
  const pastCount = $derived.by(() => Math.max(history.length - 1, 0))

  // Reset form when editor is closed
  $effect(() => {
    if (!showEditor) {
      selectedState = currentState
      statusNote = ""
      mergeCommit = ""
      appliedCommits = ""
      publishError = ""
    }
  })

  const getStateIcon = (state: StatusState) => {
    switch (state) {
      case "open":
        return { icon: CircleDot, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" }
      case "draft":
        return { icon: Clock, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" }
      case "closed":
        return { icon: X, color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200" }
      case "merged":
        return { icon: GitMerge, color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-200" }
      case "resolved":
        return { icon: CircleCheck, color: "text-sky-600", bg: "bg-sky-50", border: "border-sky-200" }
    }
  }

  const stateToKind = (state: StatusState): number => {
    switch (state) {
      case "open":
        return GIT_STATUS_OPEN
      case "draft":
        return GIT_STATUS_DRAFT
      case "closed":
        return GIT_STATUS_CLOSED
      case "merged":
      case "resolved":
        return GIT_STATUS_COMPLETE
    }
  }

  const kindToState = (kind: number): StatusState => {
    switch (kind) {
      case GIT_STATUS_OPEN:
        return "open"
      case GIT_STATUS_DRAFT:
        return "draft"
      case GIT_STATUS_CLOSED:
        return "closed"
      case GIT_STATUS_COMPLETE:
        return rootKind === 1617 ? "merged" : "resolved"
      default:
        return "open"
    }
  }

  const getDefaultCommit = async (): Promise<string> => {
    try {
      const history = await repo.getCommitHistory({ depth: 1 })
      return history?.[0]?.oid || ""
    } catch (e) {
      console.error("Failed to get default commit:", e)
      return ""
    }
  }

  const handlePublish = async () => {
    if (!canPublish) {
      publishError = "Please wait before publishing again"
      return
    }

    if (isPublishing) return

    console.log("[Status] Publishing status", { selectedState, rootId, rootKind })

    isPublishing = true
    publishError = ""

    try {
      const kind = stateToKind(selectedState)
      const repoEvent = (repo as any).repoEvent
      const repoAddr = repoEvent ? Address.fromEvent(repoEvent).toString() : ""
      const relays = repo.relays || []
      const repoEuc = repoEvent?.tags?.find((t: string[]) => t[0] === "r" && t[2] === "euc")?.[1]

      // Build tags
      const tags: string[][] = [
        ["e", rootId, "", "root"],
      ]

      if (repoAddr) {
        const relayHint = relays[0] || ""
        tags.push(["a", repoAddr, relayHint])
      }

      if (repoEuc) {
        tags.push(["r", repoEuc])
      }

      // Add merge metadata for 1631 (merged/resolved)
      if (kind === GIT_STATUS_COMPLETE) {
        let commitSha = mergeCommit.trim()
        if (!commitSha) {
          commitSha = await getDefaultCommit()
        }

        if (commitSha) {
          tags.push(["merge-commit", commitSha])
          tags.push(["r", commitSha])
        }

        const commits = appliedCommits
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)

        if (commits.length > 0) {
          tags.push(["applied-as-commits", ...commits])
          commits.forEach((c) => tags.push(["r", c]))
        } else if (commitSha) {
          // Default to merge commit if no applied commits specified
          tags.push(["applied-as-commits", commitSha])
        }
      }

      // Add recipients
      const recipients = [actorPubkey, rootAuthor, repoEvent?.pubkey].filter(Boolean) as string[]
      recipients.forEach((p) => tags.push(["p", p]))

      const statusEvent: any = {
        kind,
        content: statusNote.trim(),
        tags: tags as any,
        created_at: Math.floor(Date.now() / 1000),
        pubkey: actorPubkey!,
        id: "",
        sig: "",
      }

      console.log("[Status] Publishing status event", statusEvent)

      if (onPublish) {
        await onPublish(statusEvent)
      }

      lastPublishTime = Date.now()
      showEditor = false

      console.log("[Status] Status published successfully")
    } catch (error) {
      console.error("[Status] Failed to publish status:", error)
      publishError = error instanceof Error ? error.message : "Failed to publish status"
    } finally {
      isPublishing = false
    }
  }

  const handleAdopt = async (suggestion: StatusEvent) => {
    if (!canPublish) {
      publishError = "Please wait before publishing again"
      return
    }

    console.log("[Status] Adopting suggestion", suggestion)

    const state = kindToState(suggestion.kind)
    selectedState = state
    statusNote = suggestion.content || ""

    // Extract merge metadata if present
    const mergeCommitTag = suggestion.tags.find((t) => t[0] === "merge-commit")
    if (mergeCommitTag) {
      mergeCommit = mergeCommitTag[1] || ""
    }

    const appliedTag = suggestion.tags.find((t) => t[0] === "applied-as-commits")
    if (appliedTag) {
      appliedCommits = appliedTag.slice(1).join(", ")
    }

    await handlePublish()
  }

  const availableStates = $derived.by((): StatusState[] => {
    if (rootKind === 1617) {
      return ["open", "draft", "merged", "closed"]
    } else {
      return ["open", "draft", "resolved", "closed"]
    }
  })
</script>

{#if compact}
  <!-- Compact mode: just a badge -->
  <div class="inline-flex items-center gap-1">
    {#snippet compactBadge()}
      {@const { icon: Icon, color, bg, border } = getStateIcon(currentState)}
      <Badge variant="outline" class={`${bg} ${border} ${color} gap-1 text-[10px]`}>
        <Icon class="h-3 w-3" />
        {currentState.charAt(0).toUpperCase() + currentState.slice(1)}
      </Badge>
    {/snippet}
    {@render compactBadge()}
  </div>
{:else}
  <!-- Full mode: complete status UI -->
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2 text-lg">
        <AlertCircle class="h-5 w-5" />
        Status
      </CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <!-- Current Status -->
      <div class="flex items-center justify-between">
        {#snippet currentStatusBadge()}
          {@const { icon: Icon, color, bg, border } = getStateIcon(currentState)}
          <div class="flex items-center gap-2">
            <Badge variant="outline" class={`${bg} ${border} ${color} gap-1`}>
              <Icon class="h-4 w-4" />
              {currentState.charAt(0).toUpperCase() + currentState.slice(1)}
            </Badge>
            {#if currentStatusEvent}
              <span class="text-xs text-muted-foreground">
                by <ProfileComponent pubkey={currentStatusEvent.pubkey} /> •
                {new Date(currentStatusEvent.created_at * 1000).toLocaleString()}
              </span>
            {/if}
          </div>
        {/snippet}
        {@render currentStatusBadge()}

        <div class="flex items-center gap-2">
          {#if isAuthorized}
            <Button size="sm" variant="outline" onclick={() => (showEditor = !showEditor)}>
              {showEditor ? "Cancel" : "Change Status"}
            </Button>
          {/if}
          <Button
            size="sm"
            variant="outline"
            onclick={() => (showHistory = !showHistory)}
            disabled={pastCount === 0}
          >
            {pastCount === 0 ? "No History" : showHistory ? "Hide History" : `Show History (${pastCount})`}
          </Button>
        </div>
      </div>

      <!-- Editor -->
      {#if showEditor && isAuthorized}
        <div class="space-y-3 rounded-md border border-border bg-muted/30 p-4">
          <div>
            <Label for="status-state">New Status</Label>
            <div class="mt-2 flex flex-wrap gap-2">
              {#each availableStates as state (state)}
                {#snippet stateButton()}
                  {@const { icon: Icon, color, bg, border } = getStateIcon(state)}
                  <Button
                    size="sm"
                    variant={selectedState === state ? "default" : "outline"}
                    onclick={() => (selectedState = state)}
                    class="gap-1">
                    <Icon class="h-3 w-3" />
                    {state.charAt(0).toUpperCase() + state.slice(1)}
                  </Button>
                {/snippet}
                {@render stateButton()}
              {/each}
            </div>
          </div>

          <div>
            <Label for="status-note">Note (optional)</Label>
            <Textarea
              id="status-note"
              bind:value={statusNote}
              placeholder="Add a note about this status change..."
              rows={3}
              class="mt-1" />
          </div>

          {#if selectedState === "merged" || selectedState === "resolved"}
            <div class="space-y-2 rounded border border-border/50 bg-background p-3">
              <p class="text-xs text-muted-foreground">
                Merge metadata (optional, defaults to current HEAD)
              </p>
              <div>
                <Label for="merge-commit" class="text-xs">Merge Commit SHA</Label>
                <Input
                  id="merge-commit"
                  bind:value={mergeCommit}
                  placeholder="Leave empty for HEAD"
                  class="mt-1 text-xs" />
              </div>
              <div>
                <Label for="applied-commits" class="text-xs">Applied Commits (comma-separated)</Label>
                <Input
                  id="applied-commits"
                  bind:value={appliedCommits}
                  placeholder="sha1, sha2, sha3..."
                  class="mt-1 text-xs" />
              </div>
            </div>
          {/if}

          {#if publishError}
            <div class="rounded bg-destructive/10 p-2 text-xs text-destructive">
              {publishError}
            </div>
          {/if}

          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">
              {canPublish ? "" : `Wait ${Math.ceil((COOLDOWN_MS - (Date.now() - lastPublishTime)) / 1000)}s`}
            </span>
            <Button
              size="sm"
              onclick={handlePublish}
              disabled={isPublishing || !canPublish}>
              {isPublishing ? "Publishing..." : "Publish Status"}
            </Button>
          </div>
        </div>
      {/if}

      <!-- History -->
      <div>
        <Separator class="my-3" />
        {#if showHistory && pastCount > 0}
          <div class="space-y-2">
            {#each history.slice(1) as event (event.id)}
              {#snippet historyItem()}
                {@const state = kindToState(event.kind)}
                {@const { icon: Icon, color } = getStateIcon(state)}
                <div class="flex items-start gap-2 text-xs">
                  <Icon class={`mt-0.5 h-3 w-3 ${color}`} />
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <span class="font-medium">{state.charAt(0).toUpperCase() + state.slice(1)}</span>
                      <span class="text-muted-foreground">
                        by <ProfileComponent pubkey={event.pubkey} />
                      </span>
                      <span class="text-muted-foreground">
                        {new Date(event.created_at * 1000).toLocaleString()}
                      </span>
                    </div>
                    {#if event.content}
                      <p class="mt-1 text-muted-foreground">{event.content}</p>
                    {/if}
                  </div>
                </div>
              {/snippet}
              {@render historyItem()}
            {/each}
          </div>
        {/if}
      </div>

      <!-- Suggestions -->
      {#if suggestions.length > 0 && isAuthorized}
        <div>
          <Separator class="my-3" />
          <h4 class="mb-2 text-sm font-medium">Suggestions from Community</h4>
          <div class="space-y-2">
            {#each suggestions as event (event.id)}
              {#snippet suggestionItem()}
                {@const state = kindToState(event.kind)}
                {@const { icon: Icon, color } = getStateIcon(state)}
                <div class="flex items-start justify-between gap-2 rounded border border-border/50 bg-muted/20 p-2">
                  <div class="flex items-start gap-2 text-xs">
                    <Icon class={`mt-0.5 h-3 w-3 ${color}`} />
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <span class="font-medium">{state.charAt(0).toUpperCase() + state.slice(1)}</span>
                        <span class="text-muted-foreground">
                          by <ProfileComponent pubkey={event.pubkey} />
                        </span>
                        <span class="text-muted-foreground">
                          {new Date(event.created_at * 1000).toLocaleString()}
                        </span>
                      </div>
                      {#if event.content}
                        <p class="mt-1 text-muted-foreground">{event.content}</p>
                      {/if}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onclick={() => handleAdopt(event)}
                    disabled={!canPublish || isPublishing}>
                    Adopt
                  </Button>
                </div>
              {/snippet}
              {@render suggestionItem()}
            {/each}
          </div>
        </div>
      {/if}
    </CardContent>
  </Card>
{/if}
