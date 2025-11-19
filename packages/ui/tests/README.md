# Patches Detail Page Tests

This directory contains comprehensive tests for the patches detail page functionality in the budabit application.

## Test Structure

### Core Test Files

- **`PatchesDetail.spec.ts`** - Main test suite covering all patches detail page functionality
- **`runner.ts`** - Test runner utilities and integration test helpers
- **`setup.ts`** - Global test setup and custom matchers
- **`vitest.config.ts`** - Vitest configuration for the test suite

### Test Stubs and Mocks

- **`stubs/context.ts`** - Minimal context stub for tests
- **`stubs/toast.ts`** - Toast notification stub
- **`stubs/tokens.ts`** - Authentication token stubs
- **`stubs/patches.ts`** - Comprehensive patches functionality mocks

## Test Coverage

### 1. Patch Navigation Tests
- ✅ Navigation between patches in a patch set
- ✅ Previous/Next button functionality
- ✅ Boundary condition handling
- ✅ Single patch scenarios
- ✅ Index jumping functionality

### 2. User-Triggered Patch Analysis Tests
- ✅ Manual analysis triggering via button click
- ✅ Analysis state management
- ✅ Error handling for failed analysis
- ✅ Manual vs automatic analysis tracking

### 3. Merge Workflow Tests
- ✅ Complete merge workflow execution
- ✅ Patch set preparation for merging
- ✅ Status event emission after successful merge
- ✅ Merge progress tracking
- ✅ Error handling for merge failures
- ✅ Dialog state management

### 4. Comment Functionality Tests
- ✅ Threaded comment creation and retrieval
- ✅ Comment filtering by patch ID
- ✅ Comment subscription system
- ✅ Comment event creation

### 5. Error Handling and Edge Cases
- ✅ Empty patch set handling
- ✅ Missing repository data scenarios
- ✅ Malformed patch data handling
- ✅ Network error simulation

### 6. UI State Management Tests
- ✅ Merge progress state transitions
- ✅ Analysis state management
- ✅ Dialog state handling
- ✅ Loading state management

### 7. Integration Tests
- ✅ Complete patch lifecycle workflow
- ✅ End-to-end user scenarios
- ✅ Error recovery scenarios

## Mock Utilities

### MockPatchNavigation
Provides patch navigation functionality for testing:
```typescript
const navigation = new MockPatchNavigation(patches);
navigation.goToNext();
navigation.goToPrevious();
navigation.goToIndex(2);
```

### MockMergeAnalysis
Simulates patch analysis functionality:
```typescript
const analysis = new MockMergeAnalysis();
const result = await analysis.analyze(patch, "main", true);
expect(analysis.wasManuallyTriggered()).toBe(true);
```

### MockMergeWorkflow
Handles merge workflow simulation:
```typescript
const workflow = new MockMergeWorkflow();
const result = await workflow.executeMerge(patchData);
expect(result.success).toBe(true);
```

### MockCommentSystem
Manages comment functionality:
```typescript
const comments = new MockCommentSystem();
const comment = comments.addComment({ content: "Test", tags: [["e", "patch-1"]] });
const patchComments = comments.getComments("patch-1");
```

### MockStatusEmitter
Handles status event emission:
```typescript
const emitter = new MockStatusEmitter();
const event = await emitter.emitStatus({ kind: 1631, content: "Applied" });
const appliedEvents = emitter.getEventsByKind(1631);
```

## Running Tests

### Basic Test Execution
```bash
# Run all tests
npm test

# Run specific test file
npm test PatchesDetail.spec.ts

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

### Test Runner Usage
```typescript
import { runPatchesDetailTests, PatchesDetailTestRunner } from './runner';

// Run all tests with default configuration
await runPatchesDetailTests();

// Run with custom configuration
await runPatchesDetailTests({
  patchCount: 5,
  commentCount: 3,
  simulateErrors: true,
  simulateWarnings: true,
  delay: 100,
});

// Use test runner class directly
const runner = new PatchesDetailTestRunner({ patchCount: 3 });
await runner.runAllTests();
```

## Test Data Factories

### Creating Test Patches
```typescript
import { createTestPatchSet, createTestComments } from './stubs/patches';

// Create a set of test patches
const patches = createTestPatchSet(3);

// Create test comments for a patch
const comments = createTestComments("patch-1", 2);
```

### Mock Data Creation
```typescript
// Create individual test objects
const patch = mkPatchData({
  id: "custom-patch",
  title: "Custom Patch",
  status: "open",
});

const commit = mkCommit({
  oid: "custom-commit",
  message: "Custom commit message",
});

const analysisResult = mkMergeAnalysisResult({
  canMerge: true,
  hasConflicts: false,
});
```

## Custom Matchers

The test suite includes custom matchers for better assertions:

```typescript
// Validate patch structure
expect(patch).toBeValidPatch();

// Validate commit structure
expect(commit).toBeValidCommit();

// Validate status event structure
expect(statusEvent).toBeValidStatusEvent();
```

## Configuration

### Test Configuration Options
```typescript
interface TestConfig {
  patchCount: number;        // Number of patches to create
  commentCount: number;      // Number of comments per patch
  simulateErrors: boolean;   // Whether to simulate error conditions
  simulateWarnings: boolean; // Whether to simulate warning conditions
  delay: number;            // Delay for async operations (ms)
}
```

### Environment Setup
- Uses `jsdom` environment for DOM testing
- Includes Web API mocks (clipboard, resize observer, etc.)
- Configured with path aliases for clean imports
- Coverage reporting enabled

## Best Practices

### Test Organization
- Group related tests in `describe` blocks
- Use descriptive test names
- Follow Arrange-Act-Assert pattern
- Mock external dependencies

### Mock Usage
- Use provided mock classes instead of manual mocking
- Reset mock state between tests
- Verify mock calls and state changes

### Error Testing
- Test both success and failure scenarios
- Verify error handling behavior
- Test edge cases and boundary conditions

### Integration Testing
- Test complete user workflows
- Verify component interactions
- Test state management across operations

## Troubleshooting

### Common Issues
1. **TypeScript errors**: Ensure all imports are correctly typed
2. **Mock failures**: Check that mock classes are properly initialized
3. **Async test timeouts**: Increase test timeout for complex operations
4. **DOM issues**: Verify jsdom environment is properly configured

### Debug Tips
- Use `console.log` with mocked console to avoid test output noise
- Leverage Vitest's debugging capabilities
- Check mock call history for interaction verification
- Use custom matchers for better error messages

## Contributing

When adding new tests:
1. Follow the existing test structure and patterns
2. Use the provided mock utilities
3. Add appropriate test data factories
4. Update this documentation for new test categories
5. Ensure all tests pass with `npm test`
