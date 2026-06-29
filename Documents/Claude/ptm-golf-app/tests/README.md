# Test Suite

Comprehensive regression test suite for PTM Golf scoring app. **Zero cost** — uses only free, open-source tools.

## Directory Structure

```
tests/
├── unit/              # Unit tests (Jest) - fast, isolated logic
├── integration/       # Integration tests (Jest + Firebase Emulator) - real data layer
├── e2e/              # End-to-end tests (Playwright) - full user flows
├── fixtures/         # Test data (JSON files)
├── helpers/          # Test utilities, factories, helpers
└── README.md         # This file
```

## Running Tests

### Run all tests
```bash
npm run test:all
```

### Run by type
```bash
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:e2e           # E2E tests only
npm run test:e2e:ui        # E2E with visual UI
```

### Watch mode (auto-rerun on file changes)
```bash
npm run test:watch
```

## Test Priorities

Tests are built in priority order (highest regression risk → lowest):

### 1. **Unit Tests** (Firebase Operations, Calculations)
- Location: `tests/unit/`
- Speed: ~100ms total
- Coverage: Scoring logic, leaderboard sorting, handicap calculations
- Run first — catches most bugs quickly

### 2. **Integration Tests** (Firebase + Data Layer)
- Location: `tests/integration/`
- Speed: ~1-2s per test
- Uses Firebase Emulator (local, free)
- Tests: Event persistence, score syncing, multi-user scenarios
- **Not yet built** — we'll add these next

### 3. **E2E Tests** (Critical User Flows)
- Location: `tests/e2e/`
- Speed: ~5-10s per test
- Uses Playwright + real app
- Tests: Admin creates event → Players score → Results display
- **Not yet built** — we'll add these after integration tests

### 4. **Visual Regression** (UI/Layout Changes)
- Current: None (requires paid service like Percy)
- Future: Add once you want to catch CSS regressions
- Cost: ~$99/month, so skipped for now

## Test Data

### Fixtures (`tests/fixtures/`)
Pre-built test scenarios in JSON. Use when tests need realistic but static data.

```json
// Example: events.json
{
  "basicEvent": { ... },
  "eventWithPlayers": { ... }
}
```

### Factories (`tests/helpers/test-factories.ts`)
Functions that generate random/custom test data. Use when you need fresh data per test.

```typescript
const player = createTestPlayer({ handicap: 5 })
const round = createTestRound({ courseId: 'course-001' })
```

## Key Files

- `jest.config.js` — Jest configuration
- `jest.setup.js` — Mocks for Firebase, Next.js
- `playwright.config.ts` — Playwright configuration
- `.github/workflows/test.yml` — CI/CD pipeline

## Coverage Goals

Current targets:
- **Unit tests:** 80%+ coverage
- **Integration tests:** 100% of data flows
- **E2E tests:** All critical user paths

Check coverage:
```bash
npm run test:unit -- --coverage
```

## CI/CD

Tests run automatically on:
- Every push to `main` or `develop`
- Every pull request

View results in GitHub Actions tab.

## Adding a New Test

### Unit Test Template
```typescript
// tests/unit/my-feature.test.ts
describe('My Feature', () => {
  it('should do something', () => {
    const result = myFunction()
    expect(result).toBe(expected)
  })
})
```

### Integration Test Template
```typescript
// tests/integration/my-feature.test.ts
describe('My Feature (Firebase)', () => {
  beforeEach(async () => {
    // Set up Firebase Emulator
  })

  it('should persist data', async () => {
    // Test real Firebase operations
  })
})
```

### E2E Test Template
```typescript
// tests/e2e/my-flow.spec.ts
import { test, expect } from '@playwright/test'

test('User can create event', async ({ page }) => {
  await page.goto('/')
  await page.click('button:has-text("New Event")')
  await expect(page).toHaveURL(/\/event/)
})
```

## Regression Testing Strategy

When you make a change:

1. **Run unit tests** (~100ms) — catches calculation bugs instantly
2. **Run integration tests** (~1-2s) — ensures Firebase operations work
3. **Run E2E tests** (~30s) — verifies full user flows
4. **Review coverage** — ensure your change is tested

If a test fails after your change:
- Understand why (test might be wrong too)
- Fix the code or the test
- Commit together

## Future Improvements

- [ ] Add Firebase Emulator integration tests
- [ ] Add E2E critical flow tests (create event → score → export)
- [ ] Add E2E mobile tests (Playwright + Galaxy S5)
- [ ] Add visual regression tests (Percy, after revenue)
- [ ] Add performance benchmarks
- [ ] Add accessibility tests (axe-core)

## Questions?

When tests fail:
1. Read the error message carefully
2. Check if the test is wrong or the code is wrong
3. Look at similar passing tests for examples
4. Ask for help if stuck
