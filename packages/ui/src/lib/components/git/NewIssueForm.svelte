<script lang="ts">
  import { z } from "zod";
  import { CircleAlert } from "@lucide/svelte";
  import { CircleAlert } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";

  const { Button, Input, Textarea, Label, Checkbox } = useRegistry();
  import { X, Plus } from "@lucide/svelte";
  import { createIssueEvent } from "@nostr-git/shared-types";
  import { createIssueEvent } from "@nostr-git/shared-types";

  const { repoId, repoOwnerPubkey, postIssue } = $props();
  const { repoId, repoOwnerPubkey, postIssue } = $props();

  const back = () => history.back();

  const issueSchema = z.object({
    subject: z.string().min(1, "Subject is required"),
    content: z.string().min(1, "Description is required"),
    labels: z.array(z.string()).default([]),
  });

  let subject = $state("");
  let content = $state("");
  let labels = $state<string[]>([]);
  let customLabels = $state<string[]>([]);
  let newLabel = $state("");
  let errors = $state<{ subject?: string; content?: string }>({});
  let isSubmitting = $state(false);

  const commonLabels = [
    "bug",
    "enhancement",
    "question",
    "documentation",
    "good first issue",
    "help wanted",
  ];

  function handleLabelToggle(label: string, checked: boolean) {
    if (checked) {
      labels = [...labels, label];
    } else {
      labels = labels.filter((l) => l !== label);
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddCustomLabel();
    }
  }
  function handleAddCustomLabel() {
    const trimmed = newLabel.trim();
    if (trimmed && !customLabels.includes(trimmed) && !commonLabels.includes(trimmed)) {
      customLabels = [...customLabels, trimmed];
      labels = [...labels, trimmed];
      newLabel = "";
    }
  }

  function handleRemoveCustomLabel(label: string) {
    customLabels = customLabels.filter((l) => l !== label);
    labels = labels.filter((l) => l !== label);
  }

  async function onFormSubmit() {
    errors = {};
    isSubmitting = true;
    const result = issueSchema.safeParse({ subject, content, labels });
    if (!result.success) {
      for (const err of result.error.errors) {
        if (err.path[0]) errors[err.path[0] as "subject" | "content"] = err.message;
      }
      isSubmitting = false;
      return;
    }
    try {
      const issueEvent = createIssueEvent({
        content,
        repoAddr: `30617:${repoOwnerPubkey}:${repoId}`,
        recipients: [repoOwnerPubkey],
        subject,
        labels,
        repoAddr: `30617:${repoOwnerPubkey}:${repoId}`,
        recipients: [repoOwnerPubkey],
        subject,
        labels,
      });
      console.log(issueEvent);
      postIssue(issueEvent);
      back()
    } catch (error) {
      console.error(error);
      console.error(error);
    } finally {
      isSubmitting = false;
    }
  }

  function handleCancel() {
    back();
  }
</script>

<form class="space-y-6" onsubmit={onFormSubmit}>
  <div class="flex items-center gap-2">
    <CircleAlert class="h-6 w-6" />
    New Issue
  </div>

  <div>
    <Label for="subject">Subject</Label>
    <Input
      id="subject"
      bind:value={subject}
      class="mt-1"
      placeholder="Brief description of the issue"
    />
    {#if errors.subject}
      <div class="text-red-500 text-sm mt-1">{errors.subject}</div>
    {/if}
  </div>
  <div>
    <Label for="content">Description</Label>
    <Textarea
      id="content"
      bind:value={content}
      class="mt-1"
      rows={6}
      placeholder="Describe the issue in detail. You can use Markdown formatting."
    />
    {#if errors.content}
      <div class="text-red-500 text-sm mt-1">{errors.content}</div>
    {/if}
    <p class="text-xs text-muted-foreground">Supports Markdown formatting</p>
  </div>
  <div class="space-y-3">
    <Label>Labels</Label>
    <div class="grid grid-cols-2 gap-2">
      {#each commonLabels as label}
        <label class="flex items-center space-x-2">
          <Checkbox
            checked={labels.includes(label)}
            onclick={(e) => handleLabelToggle(label, e.target.checked)}
          />
          <span>{label}</span>
        </label>
      {/each}
      {#each customLabels as label}
        <label class="flex items-center space-x-2 rounded">
          <Checkbox
            checked={labels.includes(label)}
            onclick={(e) => handleLabelToggle(label, e.target.checked)}
          />
          <span>{label}</span>
          <button type="button" class="text-red-500" onclick={() => handleRemoveCustomLabel(label)}
            ><X size={14} /></button
          >
        </label>
      {/each}
      <div class="flex gap-2">
        <Input 
          placeholder="Add custom label"
          bind:value={newLabel}
          class="flex-1" 
          onkeydown={handleKeyDown}
        />
        <Button type="button" variant="outline" onclick={handleAddCustomLabel}
          ><Plus size={14} /></Button
        >
      </div>
    </div>
  </div>
  <div class="flex justify-end gap-3">
    <Button type="button" variant="outline" onclick={handleCancel} disabled={isSubmitting}
      >Cancel</Button
    >
    <Button type="submit" variant={"git"} disabled={isSubmitting}>
      {isSubmitting ? "Creating..." : "Create Issue"}
    </Button>
  </div>
</form>
