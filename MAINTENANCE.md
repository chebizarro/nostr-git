# Documentation Maintenance Guidelines

This document outlines how to keep the Nostr-Git project documentation up-to-date and consistent as the codebase evolves.

## Documentation Update Triggers

### When to Update Documentation

#### Code Changes
- **New features**: Update `README.md`, `API.md`, and relevant guides
- **API changes**: Update `API.md` and `AI_CONTEXT.md` immediately
- **Architecture changes**: Update `ARCHITECTURE.md` and `AI_CONTEXT.md`
- **New dependencies**: Update `DEVELOPMENT.md` and `ARCHITECTURE.md`
- **Breaking changes**: Update all relevant documentation with migration guides

#### Project Structure Changes
- **New packages**: Update `README.md`, `ARCHITECTURE.md`, and `AI_CONTEXT.md`
- **Package renames**: Update all cross-references across documentation
- **Build process changes**: Update `DEVELOPMENT.md` and `DEPLOYMENT.md`
- **Configuration changes**: Update inline comments and relevant guides

#### Development Workflow Changes
- **New tools**: Update `DEVELOPMENT.md` and `CODING_STANDARDS.md`
- **Process changes**: Update `CODING_STANDARDS.md` and `DEVELOPMENT.md`
- **CI/CD updates**: Update `DEPLOYMENT.md`

## Documentation Review Process

### Pre-Commit Checks
```bash
# Add to .husky/pre-commit or similar
#!/bin/sh

# Check for documentation consistency
echo "Checking documentation..."

# Verify all packages are documented in README.md
node scripts/check-package-docs.js

# Check for broken internal links
node scripts/check-doc-links.js

# Validate code examples in documentation
node scripts/validate-code-examples.js
```

### Pull Request Requirements
- [ ] Documentation updated for any API changes
- [ ] Code examples tested and verified
- [ ] Cross-references updated
- [ ] Spelling and grammar checked
- [ ] AI_CONTEXT.md updated for new patterns

### Quarterly Documentation Review
Schedule quarterly reviews to:
- Verify all documentation is current
- Remove outdated information
- Update examples with current best practices
- Check external links for validity
- Review and update AI_CONTEXT.md patterns

## Consistency Guidelines

### Cross-Reference Management

#### Package References
Always use consistent package names and links:
```markdown
# ✅ Good - Consistent format
- **[@nostr-git/core](packages/core/)** – Core library description

# ❌ Bad - Inconsistent format
- **@nostr-git/core** - core library
```

#### Internal Links
Use relative paths for internal documentation:
```markdown
# ✅ Good - Relative links
See [Architecture Guide](ARCHITECTURE.md) for details.

# ❌ Bad - Absolute links
See [Architecture Guide](/docs/ARCHITECTURE.md) for details.
```

### Code Example Standards

#### Always Test Examples
```typescript
// ✅ Good - Tested example with imports
import { createRepoEvent } from '@nostr-git/core';

const repo = {
  name: 'example-repo',
  url: 'https://github.com/user/example-repo'
};
const event = createRepoEvent(repo);

// ❌ Bad - Untested pseudo-code
const event = createEvent(someRepo);
```

#### Version-Specific Examples
```typescript
// Include version comments for breaking changes
// @since v1.2.0 - New API format
const result = await api.getRepository('user', 'repo');

// @deprecated v1.1.0 - Use getRepository instead
const result = await api.fetchRepo('user', 'repo');
```

### Terminology Consistency

#### Maintain Glossary
Keep consistent terminology across all documentation:

- **Nostr Event** (not "nostr event" or "NOSTR event")
- **Git Repository** (not "git repo" in formal docs)
- **NIP-34** (not "nip-34" or "NIP34")
- **Web Worker** (not "webworker" or "web-worker")

#### Domain-Specific Terms
Use project-specific terms consistently:
- **ngit** - CLI tool and short name
- **Patch Event** - Nostr event containing Git patch
- **Repo Announcement** - Repository discovery event

## Automation Scripts

### Documentation Validation

#### Package Documentation Checker
```javascript
// scripts/check-package-docs.js
const fs = require('fs');
const path = require('path');

const packagesDir = path.join(__dirname, '../packages');
const readmePath = path.join(__dirname, '../README.md');

// Check that all packages are documented in README
const packages = fs.readdirSync(packagesDir);
const readmeContent = fs.readFileSync(readmePath, 'utf8');

packages.forEach(pkg => {
  if (!readmeContent.includes(`@nostr-git/${pkg}`)) {
    console.error(`Package ${pkg} not documented in README.md`);
    process.exit(1);
  }
});
```

#### Link Checker
```javascript
// scripts/check-doc-links.js
const fs = require('fs');
const path = require('path');

function checkMarkdownLinks(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const [, text, link] = match;
    
    // Check internal links
    if (!link.startsWith('http') && !link.startsWith('#')) {
      const targetPath = path.resolve(path.dirname(filePath), link);
      if (!fs.existsSync(targetPath)) {
        console.error(`Broken link in ${filePath}: ${link}`);
      }
    }
  }
}
```

### Code Example Validation

#### TypeScript Example Checker
```javascript
// scripts/validate-code-examples.js
const fs = require('fs');
const { execSync } = require('child_process');

function extractCodeBlocks(content) {
  const codeBlockRegex = /```typescript\n([\s\S]*?)\n```/g;
  const blocks = [];
  let match;
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    blocks.push(match[1]);
  }
  
  return blocks;
}

function validateTypeScriptCode(code) {
  const tempFile = '/tmp/doc-example.ts';
  fs.writeFileSync(tempFile, code);
  
  try {
    execSync(`npx tsc --noEmit ${tempFile}`, { stdio: 'pipe' });
    return true;
  } catch (error) {
    console.error(`TypeScript validation failed:\n${code}\nError: ${error.message}`);
    return false;
  }
}
```

## Integration with Development Workflow

### Git Hooks

#### Pre-Commit Hook
```bash
#!/bin/sh
# .husky/pre-commit

# Run documentation checks
npm run docs:check

# Update AI_CONTEXT.md if core patterns changed
if git diff --cached --name-only | grep -E "(packages/core|packages/shared-types)" > /dev/null; then
  echo "Core changes detected - consider updating AI_CONTEXT.md"
fi
```

#### Pre-Push Hook
```bash
#!/bin/sh
# .husky/pre-push

# Validate all documentation before pushing
npm run docs:validate
npm run docs:build-check
```

### CI/CD Integration

#### Documentation CI Job
```yaml
# .github/workflows/docs.yml
name: Documentation

on:
  pull_request:
    paths:
      - 'docs/**'
      - '*.md'
      - 'packages/*/README.md'

jobs:
  validate-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Check documentation consistency
        run: |
          npm run docs:check
          npm run docs:validate-examples
          npm run docs:check-links
      
      - name: Build documentation
        run: npm run docs:build
```

## Documentation Metrics

### Track Documentation Health

#### Coverage Metrics
- API coverage: % of public APIs documented
- Example coverage: % of APIs with working examples
- Link health: % of internal links working
- Freshness: Days since last update for each doc

#### Quality Metrics
- Spelling/grammar score
- Readability score
- User feedback ratings
- Time to find information

### Monitoring Script
```javascript
// scripts/doc-metrics.js
const fs = require('fs');
const path = require('path');

function calculateDocMetrics() {
  const docs = [
    'README.md',
    'ARCHITECTURE.md',
    'AI_CONTEXT.md',
    'DEVELOPMENT.md',
    'CODING_STANDARDS.md',
    'DEPLOYMENT.md',
    'API.md'
  ];
  
  const metrics = {
    totalDocs: docs.length,
    totalWords: 0,
    lastUpdated: new Date(),
    brokenLinks: 0,
    codeExamples: 0
  };
  
  docs.forEach(doc => {
    if (fs.existsSync(doc)) {
      const content = fs.readFileSync(doc, 'utf8');
      metrics.totalWords += content.split(/\s+/).length;
      metrics.codeExamples += (content.match(/```/g) || []).length / 2;
    }
  });
  
  console.log('Documentation Metrics:', metrics);
  return metrics;
}
```

## Documentation Ownership

### Responsibility Matrix

| Documentation | Primary Owner | Secondary Owner | Update Frequency |
|---------------|---------------|-----------------|------------------|
| README.md | Project Lead | All Contributors | Per Release |
| ARCHITECTURE.md | Lead Architect | Senior Developers | Per Major Change |
| AI_CONTEXT.md | AI/LLM Specialist | All Developers | Per Pattern Change |
| DEVELOPMENT.md | DevOps Lead | All Contributors | Per Tool Change |
| CODING_STANDARDS.md | Tech Lead | All Developers | Quarterly |
| DEPLOYMENT.md | DevOps Lead | Release Manager | Per Process Change |
| API.md | API Maintainers | Package Owners | Per API Change |

### Review Schedule

#### Weekly Reviews
- Check for outdated information
- Review recent code changes for doc impact
- Update examples if APIs changed

#### Monthly Reviews
- Full link validation
- Code example testing
- Terminology consistency check

#### Quarterly Reviews
- Complete documentation audit
- User feedback incorporation
- Metrics analysis and improvement planning

## Tools and Resources

### Recommended Tools
- **Vale**: Prose linting and style checking
- **markdownlint**: Markdown formatting consistency
- **textlint**: Natural language linting
- **Grammarly**: Grammar and readability checking

### Documentation Templates
Keep templates for common documentation patterns:
- New package documentation template
- API documentation template
- Tutorial/guide template
- Troubleshooting section template

This maintenance guide ensures that documentation remains accurate, consistent, and valuable as the Nostr-Git project evolves.
