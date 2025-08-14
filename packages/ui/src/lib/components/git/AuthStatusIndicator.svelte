<script lang="ts">
  import { Badge, Button } from "$lib/components";
  import { tokens } from "$lib/stores/tokens";
  import { Key, Shield, AlertCircle, CheckCircle, RefreshCw } from "@lucide/svelte";
  import type { RepoAnnouncementEvent } from "@nostr-git/shared-types";
  import { parseRepoAnnouncementEvent } from "@nostr-git/shared-types";
  import { pubkey } from "@welshman/app";
  import { onMount } from "svelte";

  interface Props {
    event: RepoAnnouncementEvent;
  }

  const { event }: Props = $props();

  // Parse repo data
  const repoData = parseRepoAnnouncementEvent(event);

  // Get tokens from store
  let tokenList = $state([]);
  tokens.subscribe(t => tokenList = t);
  
  // Loading state for refresh operations
  let isRefreshing = $state(false);
  
  // Refresh tokens manually
  async function refreshTokens() {
    isRefreshing = true;
    try {
      await tokens.refresh();
    } catch (error) {
      console.error('Failed to refresh tokens:', error);
    } finally {
      isRefreshing = false;
    }
  }
  
  onMount(async () => {
    // Tokens are initialized at app level - just wait if needed
    try {
      await tokens.waitForInitialization();
    } catch (error) {
      console.warn('Failed to load tokens in AuthStatusIndicator:', error);
    }
  });
  
  // Extract hosts from clone URLs
  const repoHosts = $derived.by(() => {
    const hosts = new Set<string>();
    
    // Extract from clone URLs
    repoData.clone.forEach(url => {
      try {
        const urlObj = new URL(url);
        hosts.add(urlObj.hostname);
      } catch (e) {
        // Skip invalid URLs
      }
    });
    
    // Extract from web URLs
    repoData.web.forEach(url => {
      try {
        const urlObj = new URL(url);
        hosts.add(urlObj.hostname);
      } catch (e) {
        // Skip invalid URLs
      }
    });
    
    return Array.from(hosts);
  });
  
  // Check if we have tokens for this repo's hosts
  const hasTokensForRepo = $derived.by(() => {
    return tokenList.some(token => 
      repoHosts.includes(token.host)
    );
  });
  
  // Get matching tokens for this repo
  const matchingTokens = $derived.by(() => {
    return tokenList.filter(token => 
      repoHosts.includes(token.host)
    );
  });
  
  // Check if user is a maintainer/owner
  const isMaintainer = $derived.by(() => {
    const userPubkey = $pubkey;
    if (!userPubkey) return false;
    
    // Check if user is the repo owner (event author)
    if (event.pubkey === userPubkey) return true;
    
    // Check maintainers list in repo tags
    return event.tags.some(tag => tag[0] === "maintainers" && tag[1] === userPubkey);
  });
  
  // Determine overall auth status
  const authStatus = $derived.by(() => {
    const userPubkey = $pubkey;
    if (!userPubkey) {
      return {
        type: 'no-user',
        icon: AlertCircle,
        color: 'text-gray-500',
        bgColor: 'bg-gray-100',
        message: 'Not logged in'
      };
    }
    
    if (isMaintainer && hasTokensForRepo) {
      return {
        type: 'authorized',
        icon: CheckCircle,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        message: 'Authorized maintainer'
      };
    }
    
    if (isMaintainer && !hasTokensForRepo) {
      return {
        type: 'maintainer-no-token',
        icon: Key,
        color: 'text-orange-600',
        bgColor: 'bg-orange-100',
        message: 'Maintainer - needs auth token'
      };
    }
    
    if (!isMaintainer && hasTokensForRepo) {
      return {
        type: 'token-no-access',
        icon: Shield,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        message: 'Has token - not maintainer'
      };
    }
    
    return {
      type: 'no-access',
      icon: AlertCircle,
      color: 'text-gray-500',
      bgColor: 'bg-gray-100',
      message: 'Read-only access'
    };
  });


</script>

<div class="flex items-center gap-2">
  <!-- Auth Status Badge -->
  <Badge variant="outline" class={`${authStatus.bgColor} ${authStatus.color} border-current`}>
    {@const IconComponent = authStatus.icon}
    <IconComponent class="h-3 w-3 mr-1" />
    {authStatus.message}
  </Badge>
  
  <!-- Token Count Indicator -->
  {#if tokenList.length > 0}
    <Badge variant="secondary" class="text-xs">
      <Key class="h-3 w-3 mr-1" />
      {matchingTokens.length}/{tokenList.length} tokens
    </Badge>
  {/if}
  
  <!-- Action Button for maintainers without tokens -->
  {#if authStatus.type === 'maintainer-no-token'}
    <Button variant="outline" size="sm" class="text-xs">
      <Key class="h-3 w-3 mr-1" />
      Add Token
    </Button>
  {/if}
</div>


