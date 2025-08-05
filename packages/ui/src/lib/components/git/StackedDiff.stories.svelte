<script lang="ts">
  import StackedDiff from './StackedDiff.svelte';
  import type { CommitMeta } from './useDiffStore.js';

  // Mock worker for demonstration
  const mockWorker = {
    async getCommitDetails({ repoId, commitId }: { repoId: string; commitId: string }) {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
      
      // Mock different types of commits
      const mockCommits: Record<string, any> = {
        'abc1234': {
          success: true,
          meta: {
            sha: 'abc1234567890abcdef1234567890abcdef123456',
            author: 'Alice Developer',
            email: 'alice@example.com',
            date: Date.now() - 86400000, // 1 day ago
            message: 'Add user authentication system\n\nImplements JWT-based authentication with refresh tokens.\nIncludes middleware for route protection and user session management.',
            parents: ['def5678901234567890abcdef567890abcdef5678']
          },
          changes: [
            {
              path: 'src/auth/middleware.ts',
              status: 'added' as const,
              diffHunks: [{
                oldStart: 0,
                oldLines: 0,
                newStart: 1,
                newLines: 25,
                patches: [
                  { line: 'import { Request, Response, NextFunction } from \'express\';', type: '+' as const },
                  { line: 'import jwt from \'jsonwebtoken\';', type: '+' as const },
                  { line: '', type: '+' as const },
                  { line: 'export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {', type: '+' as const },
                  { line: '  const authHeader = req.headers[\'authorization\'];', type: '+' as const },
                  { line: '  const token = authHeader && authHeader.split(\' \')[1];', type: '+' as const },
                  { line: '', type: '+' as const },
                  { line: '  if (!token) {', type: '+' as const },
                  { line: '    return res.sendStatus(401);', type: '+' as const },
                  { line: '  }', type: '+' as const },
                  { line: '', type: '+' as const },
                  { line: '  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!, (err: any, user: any) => {', type: '+' as const },
                  { line: '    if (err) return res.sendStatus(403);', type: '+' as const },
                  { line: '    req.user = user;', type: '+' as const },
                  { line: '    next();', type: '+' as const },
                  { line: '  });', type: '+' as const },
                  { line: '};', type: '+' as const }
                ]
              }]
            },
            {
              path: 'src/routes/auth.ts',
              status: 'added' as const,
              diffHunks: [{
                oldStart: 0,
                oldLines: 0,
                newStart: 1,
                newLines: 30,
                patches: [
                  { line: 'import express from \'express\';', type: '+' as const },
                  { line: 'import bcrypt from \'bcrypt\';', type: '+' as const },
                  { line: 'import jwt from \'jsonwebtoken\';', type: '+' as const },
                  { line: 'import { User } from \'../models/User\';', type: '+' as const },
                  { line: '', type: '+' as const },
                  { line: 'const router = express.Router();', type: '+' as const },
                  { line: '', type: '+' as const },
                  { line: 'router.post(\'/login\', async (req, res) => {', type: '+' as const },
                  { line: '  const { email, password } = req.body;', type: '+' as const },
                  { line: '  const user = await User.findOne({ email });', type: '+' as const },
                  { line: '', type: '+' as const },
                  { line: '  if (!user || !await bcrypt.compare(password, user.password)) {', type: '+' as const },
                  { line: '    return res.status(401).json({ error: \'Invalid credentials\' });', type: '+' as const },
                  { line: '  }', type: '+' as const },
                  { line: '', type: '+' as const },
                  { line: '  const accessToken = jwt.sign(', type: '+' as const },
                  { line: '    { userId: user._id, email: user.email },', type: '+' as const },
                  { line: '    process.env.ACCESS_TOKEN_SECRET!,', type: '+' as const },
                  { line: '    { expiresIn: \'15m\' }', type: '+' as const },
                  { line: '  );', type: '+' as const },
                  { line: '', type: '+' as const },
                  { line: '  res.json({ accessToken, user: { id: user._id, email: user.email } });', type: '+' as const },
                  { line: '});', type: '+' as const },
                  { line: '', type: '+' as const },
                  { line: 'export default router;', type: '+' as const }
                ]
              }]
            }
          ]
        },
        'def5678': {
          success: true,
          meta: {
            sha: 'def5678901234567890abcdef567890abcdef5678',
            author: 'Bob Reviewer',
            email: 'bob@example.com',
            date: Date.now() - 172800000, // 2 days ago
            message: 'Fix memory leak in user session cleanup',
            parents: ['ghi9012345678901234567890abcdef901234567890']
          },
          changes: [
            {
              path: 'src/auth/session.ts',
              status: 'modified' as const,
              diffHunks: [{
                oldStart: 15,
                oldLines: 8,
                newStart: 15,
                newLines: 12,
                patches: [
                  { line: '  private cleanupExpiredSessions() {', type: ' ' as const },
                  { line: '    const now = Date.now();', type: ' ' as const },
                  { line: '    for (const [sessionId, session] of this.sessions.entries()) {', type: ' ' as const },
                  { line: '      if (session.expiresAt < now) {', type: '-' as const },
                  { line: '        this.sessions.delete(sessionId);', type: '-' as const },
                  { line: '      if (session.expiresAt < now) {', type: '+' as const },
                  { line: '        this.sessions.delete(sessionId);', type: '+' as const },
                  { line: '        // Clear any associated timers', type: '+' as const },
                  { line: '        if (session.refreshTimer) {', type: '+' as const },
                  { line: '          clearTimeout(session.refreshTimer);', type: '+' as const },
                  { line: '        }', type: '+' as const },
                  { line: '      }', type: ' ' as const },
                  { line: '    }', type: ' ' as const }
                ]
              }]
            }
          ]
        },
        'ghi9012': {
          success: true,
          meta: {
            sha: 'ghi9012345678901234567890abcdef901234567890',
            author: 'Charlie Contributor',
            email: 'charlie@example.com',
            date: Date.now() - 259200000, // 3 days ago
            message: 'Remove deprecated API endpoints\n\nCleans up old v1 API routes that are no longer supported.',
            parents: ['jkl3456789012345678901234567890abcdef345678']
          },
          changes: [
            {
              path: 'src/routes/api/v1/users.ts',
              status: 'deleted' as const,
              diffHunks: [{
                oldStart: 1,
                oldLines: 20,
                newStart: 0,
                newLines: 0,
                patches: [
                  { line: 'import express from \'express\';', type: '-' as const },
                  { line: 'import { User } from \'../../../models/User\';', type: '-' as const },
                  { line: '', type: '-' as const },
                  { line: 'const router = express.Router();', type: '-' as const },
                  { line: '', type: '-' as const },
                  { line: '// DEPRECATED: Use v2 API instead', type: '-' as const },
                  { line: 'router.get(\'/\', async (req, res) => {', type: '-' as const },
                  { line: '  const users = await User.find({});', type: '-' as const },
                  { line: '  res.json(users);', type: '-' as const },
                  { line: '});', type: '-' as const },
                  { line: '', type: '-' as const },
                  { line: 'export default router;', type: '-' as const }
                ]
              }]
            },
            {
              path: 'src/app.ts',
              status: 'modified' as const,
              diffHunks: [{
                oldStart: 8,
                oldLines: 3,
                newStart: 8,
                newLines: 1,
                patches: [
                  { line: 'import authRoutes from \'./routes/auth\';', type: ' ' as const },
                  { line: 'import v1UserRoutes from \'./routes/api/v1/users\';', type: '-' as const },
                  { line: 'import v2UserRoutes from \'./routes/api/v2/users\';', type: ' ' as const },
                  { line: '', type: ' ' as const }
                ]
              }, {
                oldStart: 20,
                oldLines: 2,
                newStart: 19,
                newLines: 1,
                patches: [
                  { line: 'app.use(\'/auth\', authRoutes);', type: ' ' as const },
                  { line: 'app.use(\'/api/v1/users\', v1UserRoutes);', type: '-' as const },
                  { line: 'app.use(\'/api/v2/users\', v2UserRoutes);', type: ' ' as const }
                ]
              }]
            }
          ]
        }
      };

      const mockData = mockCommits[commitId.substring(0, 7)];
      if (mockData) {
        return mockData;
      }

      // Default error case
      return {
        success: false,
        error: `Commit ${commitId} not found`
      };
    }
  };

  // Mock commit metadata
  const mockCommits: CommitMeta[] = [
    {
      sha: 'abc1234567890abcdef1234567890abcdef123456',
      author: 'Alice Developer',
      email: 'alice@example.com',
      date: Date.now() - 86400000, // 1 day ago
      message: 'Add user authentication system',
      parents: ['def5678901234567890abcdef567890abcdef5678']
    },
    {
      sha: 'def5678901234567890abcdef567890abcdef5678',
      author: 'Bob Reviewer',
      email: 'bob@example.com',
      date: Date.now() - 172800000, // 2 days ago
      message: 'Fix memory leak in user session cleanup',
      parents: ['ghi9012345678901234567890abcdef901234567890']
    },
    {
      sha: 'ghi9012345678901234567890abcdef901234567890',
      author: 'Charlie Contributor',
      email: 'charlie@example.com',
      date: Date.now() - 259200000, // 3 days ago
      message: 'Remove deprecated API endpoints',
      parents: ['jkl3456789012345678901234567890abcdef345678']
    }
  ];

  // Story configurations
  let selectedStory = $state('basic');
  let highlightedFiles = $state<string[]>([]);
  let autoExpandFirst = $state(true);
  let enableVirtualization = $state(false);

  const stories = {
    basic: {
      title: 'Basic Stacked Diff',
      commits: mockCommits,
      highlightedFiles: [],
      autoExpandFirst: true
    },
    highlighted: {
      title: 'With Highlighted Files',
      commits: mockCommits,
      highlightedFiles: ['src/auth/middleware.ts', 'src/app.ts'],
      autoExpandFirst: false
    },
    single: {
      title: 'Single Commit',
      commits: [mockCommits[0]],
      highlightedFiles: [],
      autoExpandFirst: true
    },
    virtualized: {
      title: 'Virtualized (Large List)',
      commits: Array.from({ length: 100 }, (_, i) => ({
        ...mockCommits[i % 3],
        sha: `${mockCommits[i % 3].sha.substring(0, 35)}${i.toString().padStart(6, '0')}`,
        date: Date.now() - (i * 3600000), // Each commit 1 hour apart
        message: `${mockCommits[i % 3].message} (${i + 1})`
      })),
      highlightedFiles: [],
      autoExpandFirst: false
    }
  };

  const currentStory = $derived(stories[selectedStory as keyof typeof stories]);

  const handleSelectFile = (filePath: string) => {
    console.log('Selected file:', filePath);
  };
</script>

<div class="p-6 space-y-6">
  <div class="border-b border-border pb-4">
    <h1 class="text-2xl font-bold mb-4">StackedDiff Component</h1>
    <p class="text-muted-foreground mb-4">
      A commit-oriented diff viewer inspired by Phabricator and Gerrit, showing each commit as its own diff with metadata and file grouping.
    </p>
    
    <!-- Story Selector -->
    <div class="flex flex-wrap gap-2 mb-4">
      {#each Object.entries(stories) as [key, story]}
        <button
          onclick={() => selectedStory = key}
          class="px-3 py-1.5 text-sm rounded-md transition-colors"
          class:bg-primary={selectedStory === key}
          class:text-primary-foreground={selectedStory === key}
          class:bg-secondary={selectedStory !== key}
          class:text-secondary-foreground={selectedStory !== key}
        >
          {story.title}
        </button>
      {/each}
    </div>

    <!-- Controls -->
    <div class="flex flex-wrap gap-4 text-sm">
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          bind:checked={autoExpandFirst}
          class="rounded border-border"
        />
        Auto-expand first commit
      </label>
      
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          bind:checked={enableVirtualization}
          class="rounded border-border"
        />
        Enable virtualization
      </label>
    </div>

    {#if selectedStory === 'highlighted'}
      <div class="mt-4">
        <label for="highlighted-files" class="block text-sm font-medium mb-2">Highlighted Files:</label>
        <div class="flex flex-wrap gap-2">
          {#each ['src/auth/middleware.ts', 'src/auth/session.ts', 'src/app.ts', 'src/routes/auth.ts'] as file}
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={currentStory.highlightedFiles.includes(file)}
                onchange={(e) => {
                  const checked = e.currentTarget.checked;
                  if (checked) {
                    currentStory.highlightedFiles = [...currentStory.highlightedFiles, file];
                  } else {
                    currentStory.highlightedFiles = currentStory.highlightedFiles.filter(f => f !== file);
                  }
                }}
                class="rounded border-border"
              />
              <code class="text-xs">{file}</code>
            </label>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Story Content -->
  <div class="border border-border rounded-lg p-1">
    <StackedDiff
      commits={currentStory.commits}
      repo={{
        repoEvent: { id: 'demo-repo', kind: 30617, tags: [], content: '', created_at: 0, pubkey: '', sig: '' } as any,
        workerManager: { 
          execute: async (operation: string, params: any) => {
            if (operation === 'getCommitDetails') {
              return await mockWorker.getCommitDetails(params);
            }
            throw new Error(`Unknown operation: ${operation}`);
          }
        }
      } as any}
      highlightedFiles={currentStory.highlightedFiles}
      autoExpandFirst={currentStory.autoExpandFirst || autoExpandFirst}
      enableVirtualization={enableVirtualization}
      maxVisibleCommits={10}
      onSelectFileDiff={handleSelectFile}
    />
  </div>

  <!-- Documentation -->
  <div class="border-t border-border pt-6 text-sm text-muted-foreground">
    <h3 class="font-semibold text-foreground mb-2">Features Demonstrated:</h3>
    <ul class="list-disc list-inside space-y-1">
      <li><strong>Commit-by-commit view:</strong> Each commit is shown separately with its own metadata and file changes</li>
      <li><strong>File status indicators:</strong> Added (A), Modified (M), Deleted (D), Renamed (R) files are clearly marked</li>
      <li><strong>Split diff view:</strong> Side-by-side old/new line numbers with change indicators</li>
      <li><strong>Syntax highlighting:</strong> Code is highlighted based on file extension</li>
      <li><strong>Lazy loading:</strong> Commit diffs are loaded on-demand when expanded</li>
      <li><strong>File highlighting:</strong> Specific files can be highlighted and auto-expanded</li>
      <li><strong>Caching:</strong> Loaded diffs are cached to avoid redundant requests</li>
      <li><strong>Virtualization:</strong> Large commit lists can be virtualized for performance</li>
      <li><strong>Responsive design:</strong> Works well on different screen sizes</li>
      <li><strong>Accessibility:</strong> Proper ARIA labels and keyboard navigation support</li>
    </ul>
    
    <h3 class="font-semibold text-foreground mb-2 mt-4">Use Cases:</h3>
    <ul class="list-disc list-inside space-y-1">
      <li><strong>Code review:</strong> Review changes commit-by-commit to understand the development narrative</li>
      <li><strong>Patch series:</strong> View related commits as a logical sequence of changes</li>
      <li><strong>Debugging:</strong> Identify which specific commit introduced an issue</li>
      <li><strong>Learning:</strong> Understand how a feature was built step-by-step</li>
    </ul>
  </div>
</div>

<style lang="postcss">
  @import './styles.diff.css';
</style>
