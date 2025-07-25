  <div class="flex items-start gap-3">
    {#if statusIcon}
      {@const { icon: Icon, color } = statusIcon()}
      <div class="flex-shrink-0">
        <Icon class={`h-4 w-4 sm:h-6 sm:w-6 ${color}`} />
      </div>
    {/if}
    <div class="flex-1 min-w-0">
      <div class="flex items-center justify-between gap-2 mb-1">
        <a href={`patches/${id}`} class="block min-w-0 flex-1">
          <h3
            class="text-lg font-medium hover:text-accent transition-colors truncate"
            title={title || description}
          >
            {description}
          </h3>
        </a>

        <div class="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            size="icon"
            aria-expanded={isExpanded}
            aria-controls="patch-description"
            style="border-color: hsl(var(--border))"
            onclick={() => (isExpanded = !isExpanded)}
          >
        </div>
      </div>

      <div class="flex items-center flex-wrap gap-2 text-xs text-muted-foreground mb-1">
        <span>Base: {baseBranch}</span>
        <span>•</span>
        <span>{commitCount + (patches?.length ?? 0)} commits</span>
      </div>

      {#if isExpanded}
        <p class="text-sm text-muted-foreground mt-3 break-words">{description}</p>
        <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="outline">
            <a href={`patches/${id}`}>View Diff</a>
          </Button>
          </div>
        </div>
      {:else}
        <p id="patch-description" class="text-sm text-muted-foreground mt-3 line-clamp-2 break-words">
          {description}
        </p>
        <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm">
            <a href={`patches/${id}`}>View Diff</a>
          </Button>
        </div>
      {/if}
    </div>
    <div class="flex-shrink-0 max-sm:hidden">
      <ProfileComponent pubkey={event.pubkey} hideDetails={true} />
    </div>
  </div>
</Card>
libgit2 1.9.0