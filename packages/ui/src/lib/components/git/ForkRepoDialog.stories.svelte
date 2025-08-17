<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import ForkRepoDialog from "./ForkRepoDialog.svelte";
  import { Repo } from "./Repo.svelte";
  import { writable, type Readable } from "svelte/store";
  import { tokens } from "../../stores/tokens";
  import { useForkRepo } from "../../hooks/useForkRepo.svelte";
  import type { UseForkRepoOptions, ForkProgress, ForkResult } from "../../hooks/useForkRepo.svelte";

  function createMinimalRepo({
    owner = "octocat",
    name = "hello-world",
    description = "Sample repository",
    cloneUrl = "https://github.com/octocat/hello-world.git"
  } = {}) {
    // Minimal NIP-34-ish events to satisfy Repo parsing
    const repoEvent = writable<any>({
      kind: 30617,
      pubkey: "pubkey123",
      id: "eventid123",
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["d", `${owner}/${name}`],
        ["name", name],
        ["description", description],
        ["clone", cloneUrl],
      ],
      content: "",
      sig: "sig",
    }) as Readable<any>;

    const repoStateEvent = writable<any>({
      kind: 30618,
      pubkey: "pubkey123",
      id: "stateid123",
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["HEAD", "refs/heads/main"],
      ],
      content: "",
      sig: "sig",
    }) as Readable<any>;

    const issues = writable([]);
    const patches = writable([]);

    return new Repo({ repoEvent, repoStateEvent, issues, patches });
  }

  const defaultRepo = createMinimalRepo();

  // --- DI mocks for useForkRepo ---
  type UseForkRepo = (options?: UseForkRepoOptions) => ReturnType<typeof useForkRepo>;

  const makeInProgressMock: UseForkRepo = ({ onProgress }: UseForkRepoOptions = {}) => {
    let isForking = true;
    let error: string | null = null;
    let progress: ForkProgress[] = [
      { step: 'validate', message: 'Validating token...', status: 'completed' },
      { step: 'user', message: 'Getting current user...', status: 'completed' },
      { step: 'fork', message: 'Creating fork and cloning repository...', status: 'running' },
    ];
    onProgress?.(progress);
    return {
      get progress() { return progress; },
      get error() { return error; },
      get isForking() { return isForking; },
      async forkRepository() {
        // keep running; simulate slow network
        await new Promise((r) => setTimeout(r, 3000));
        return null;
      },
      reset() {
        isForking = false;
        progress = [];
        error = null;
      }
    };
  };

  const makeCompletedMock: UseForkRepo = ({ onProgress, onForkCompleted }: UseForkRepoOptions = {}) => {
    let isForking = false;
    let error: string | null = null;
    let progress: ForkProgress[] = [
      { step: 'validate', message: 'Token validated', status: 'completed' },
      { step: 'user', message: 'Current user: octocat', status: 'completed' },
      { step: 'fork', message: 'Repository forked and cloned successfully', status: 'completed' },
      { step: 'events', message: 'Nostr events created successfully', status: 'completed' },
      { step: 'publish', message: 'Successfully published to Nostr relays', status: 'completed' },
    ];
    onProgress?.(progress);
    // Trigger completion with a mock result so the dialog can show the URL
    const result: ForkResult = {
      repoId: 'octocat/hello-world-fork',
      forkUrl: 'https://github.com/octocat/hello-world-fork.git',
      defaultBranch: 'main',
      branches: ['main'],
      tags: [],
      announcementEvent: {} as any,
      stateEvent: {} as any,
    };
    onForkCompleted?.(result);
    return {
      get progress() { return progress; },
      get error() { return error; },
      get isForking() { return isForking; },
      async forkRepository() { return null; },
      reset() {
        isForking = false;
        progress = [];
        error = null;
      }
    };
  };

  const makeErrorMock: UseForkRepo = ({ onProgress }: UseForkRepoOptions = {}) => {
    let isForking = false;
    let error: string | null = 'Fork operation failed: API rate limit exceeded';
    let progress: ForkProgress[] = [
      { step: 'validate', message: 'Validating token...', status: 'completed' },
      { step: 'user', message: 'Getting current user...', status: 'completed' },
      { step: 'fork', message: 'Failed: API rate limit exceeded', status: 'error', error },
    ];
    onProgress?.(progress);
    return {
      get progress() { return progress; },
      get error() { return error; },
      get isForking() { return isForking; },
      async forkRepository() { return null; },
      reset() {
        isForking = false;
        progress = [];
        error = null;
      }
    };
  };

  const { Story } = defineMeta({
    title: "git/ForkRepoDialog",
    component: ForkRepoDialog,
    argTypes: {
      onPublishEvent: { action: "publish" },
      pubkey: { control: "text" },
      graspServerUrls: { control: "object" },
      useForkRepoImpl: { control: false },
    },
    args: {
      repo: defaultRepo,
      pubkey: "npub1example...",
      graspServerUrls: [
        "wss://relay.example.com",
        "wss://nostr.example.org",
      ],
      onPublishEvent: async () => {},
      useForkRepoImpl: undefined,
    },
  });
</script>

<!-- Default: no tokens available (shows setup hint, allows selecting GRASP) -->
<Story name="Default (No tokens)">
  <svelte:fragment slot="controls" let:args>
    {#key 'default-no-tokens'}
      {tokens.clear()}
      <ForkRepoDialog {...args} />
    {/key}
  </svelte:fragment>
</Story>

<!-- Completed state via DI mock -->
<Story name="Fork Completed (DI)">
  <svelte:fragment slot="controls" let:args>
    {#key 'completed-di'}
      {tokens.clear()}
      {tokens.push({ host: 'github.com', token: 'ghp_storybook_token' })}
      <ForkRepoDialog {...args} useForkRepoImpl={makeCompletedMock} />
    {/key}
  </svelte:fragment>
</Story>

<!-- GitHub available -->
<Story name="GitHub token available">
  <svelte:fragment slot="controls" let:args>
    {#key 'github-token'}
      {tokens.clear()}
      {tokens.push({ host: 'github.com', token: 'ghp_storybook_token' })}
      <ForkRepoDialog {...args} />
    {/key}
  </svelte:fragment>
</Story>

<!-- GitLab available -->
<Story name="GitLab token available">
  <svelte:fragment slot="controls" let:args>
    {#key 'gitlab-token'}
      {tokens.clear()}
      {tokens.push({ host: 'gitlab.com', token: 'glpat_storybook_token' })}
      <ForkRepoDialog {...args} />
    {/key}
  </svelte:fragment>
</Story>

<!-- Bitbucket available -->
<Story name="Bitbucket token available">
  <svelte:fragment slot="controls" let:args>
    {#key 'bitbucket-token'}
      {tokens.clear()}
      {tokens.push({ host: 'bitbucket.org', token: 'bb_storybook_token' })}
      <ForkRepoDialog {...args} />
    {/key}
  </svelte:fragment>
</Story>

<!-- GRASP-focused: no tokens, show relay URL chips -->
<Story name="GRASP (Nostr) focus">
  <svelte:fragment slot="controls" let:args>
    {#key 'grasp-only'}
      {tokens.clear()}
      <ForkRepoDialog {...args} />
    {/key}
  </svelte:fragment>
</Story>

<!-- In-progress state via DI mock -->
<Story name="Fork In Progress (DI)">
  <svelte:fragment slot="controls" let:args>
    {#key 'in-progress-di'}
      {tokens.clear()}
      {tokens.push({ host: 'github.com', token: 'ghp_storybook_token' })}
      <ForkRepoDialog {...args} useForkRepoImpl={makeInProgressMock} />
    {/key}
  </svelte:fragment>
  
</Story>

<!-- Error state via DI mock -->
<Story name="Fork Error (DI)">
  <svelte:fragment slot="controls" let:args>
    {#key 'error-di'}
      {tokens.clear()}
      {tokens.push({ host: 'github.com', token: 'ghp_storybook_token' })}
      <ForkRepoDialog {...args} useForkRepoImpl={makeErrorMock} />
    {/key}
  </svelte:fragment>
</Story>
