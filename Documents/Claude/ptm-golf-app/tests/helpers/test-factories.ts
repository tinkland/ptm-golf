// Factory functions for creating test data
import eventsFixture from '../fixtures/events.json'
import scoresFixture from '../fixtures/scores.json'

export const createTestEvent = (overrides = {}) => ({
  ...eventsFixture.basicEvent,
  ...overrides,
})

export const createTestEventWithPlayers = (overrides = {}) => ({
  ...eventsFixture.eventWithPlayers,
  ...overrides,
})

export const createTestScores = (playerId: string) => ({
  playerId,
  ...(scoresFixture.sampleScores[playerId] || scoresFixture.sampleScores['player-1']),
})

export const createTestPlayer = (overrides = {}) => ({
  id: 'player-' + Math.random().toString(36).substr(2, 9),
  name: 'Test Player',
  email: 'test@example.com',
  handicap: 10,
  ...overrides,
})

export const createTestRound = (overrides = {}) => ({
  id: 'round-' + Math.random().toString(36).substr(2, 9),
  label: 'Test Round',
  date: new Date().toISOString(),
  courseId: 'course-001',
  par: 72,
  si: [10, 4, 14, 2, 8, 16, 6, 12, 1, 9, 3, 15, 7, 11, 13, 5, 17, 18],
  ...overrides,
})
