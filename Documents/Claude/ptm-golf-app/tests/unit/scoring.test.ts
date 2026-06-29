import {
  calculateStablefordPoints,
  calculateTotalStableford,
  calculateGrossScore,
  calculateNetRound,
  calculateHolesPlayed,
  isRoundComplete,
  sortByStableford,
  sortByGross,
  sortByNet,
  type PlayerRound,
} from '@/lib/scoring-utils'

describe('Scoring Utilities', () => {
  const createTestRound = (holes: any[], handicap: number = 10): PlayerRound => ({
    playerId: 'player-1',
    playerName: 'Test Player',
    playerHandicap: handicap,
    holes,
  })

  describe('calculateStablefordPoints', () => {
    it('should award 5 points for eagle or better', () => {
      // Par 4, gross 2 (eagle), handicap 10, player handicap 10
      const points = calculateStablefordPoints(2, 4, 10, 10)
      expect(points).toBe(5)
    })

    it('should award 4 points for birdie', () => {
      // Par 4, gross 3 (birdie), handicap 10, player handicap 10
      const points = calculateStablefordPoints(3, 4, 10, 10)
      expect(points).toBe(4)
    })

    it('should award 3 points for par', () => {
      // Par 4, gross 4 (par), handicap 10, player handicap 10
      const points = calculateStablefordPoints(4, 4, 10, 10)
      expect(points).toBe(3)
    })

    it('should award 2 points for bogey', () => {
      // Par 4, gross 5 (bogey), handicap 10, player handicap 10
      const points = calculateStablefordPoints(5, 4, 10, 10)
      expect(points).toBe(2)
    })

    it('should award 1 point for double bogey', () => {
      // Par 4, gross 6 (double bogey), handicap 10, player handicap 10
      const points = calculateStablefordPoints(6, 4, 10, 10)
      expect(points).toBe(1)
    })

    it('should award 0 points for triple bogey or worse', () => {
      // Par 4, gross 7 (triple bogey), handicap 10, player handicap 10
      const points = calculateStablefordPoints(7, 4, 10, 10)
      expect(points).toBe(0)
    })

    it('should handle handicap strokes correctly', () => {
      // Par 4, gross 5, handicap 2 (receives stroke on this hole), player handicap 10
      // Net = 5 - 1 = 4 (par), should get 2 points
      const points = calculateStablefordPoints(5, 4, 2, 10)
      expect(points).toBe(2)
    })
  })

  describe('calculateTotalStableford', () => {
    it('should sum Stableford points for all holes', () => {
      const round = createTestRound([
        { hole: 1, par: 4, gross: 4, handicap: 10 }, // (4-1=3, 4-3=1 birdie) = 3 pts
        { hole: 2, par: 3, gross: 3, handicap: 4 }, // (3-1=2, 3-2=1 birdie) = 3 pts
        { hole: 3, par: 5, gross: 5, handicap: 14 }, // (5-0=5, 5-5=0 par) = 2 pts
      ])
      expect(calculateTotalStableford(round)).toBe(8)
    })

    it('should handle mixed results', () => {
      const round = createTestRound([
        { hole: 1, par: 4, gross: 3, handicap: 10 }, // birdie (3-1=2, 4-2=2) = 4 pts
        { hole: 2, par: 3, gross: 4, handicap: 4 }, // par (4-1=3, 3-3=0) = 2 pts
        { hole: 3, par: 5, gross: 6, handicap: 14 }, // double bogey (6-0=6, 5-6=-1) = 1 pt
      ])
      expect(calculateTotalStableford(round)).toBe(7)
    })

    it('should return 0 for no holes played', () => {
      const round = createTestRound([])
      expect(calculateTotalStableford(round)).toBe(0)
    })
  })

  describe('calculateGrossScore', () => {
    it('should sum all gross scores', () => {
      const round = createTestRound([
        { hole: 1, par: 4, gross: 4, handicap: 10 },
        { hole: 2, par: 3, gross: 3, handicap: 4 },
        { hole: 3, par: 5, gross: 5, handicap: 14 },
      ])
      expect(calculateGrossScore(round)).toBe(12)
    })

    it('should handle over-par rounds', () => {
      const round = createTestRound([
        { hole: 1, par: 4, gross: 6, handicap: 10 },
        { hole: 2, par: 3, gross: 5, handicap: 4 },
      ])
      expect(calculateGrossScore(round)).toBe(11)
    })
  })

  describe('calculateNetRound', () => {
    it('should subtract handicap from gross', () => {
      const round = createTestRound(
        [
          { hole: 1, par: 4, gross: 4, handicap: 10 },
          { hole: 2, par: 3, gross: 3, handicap: 4 },
        ],
        10
      )
      // Gross = 7, Handicap = 10, Net = 7 - 10 = -3
      expect(calculateNetRound(round)).toBe(-3)
    })

    it('should handle handicaps over 18', () => {
      const round = createTestRound(
        [
          { hole: 1, par: 4, gross: 4, handicap: 10 },
          { hole: 2, par: 3, gross: 3, handicap: 4 },
        ],
        25
      )
      // Gross = 7, only 18 strokes applied, Net = 7 - 18 = -11
      expect(calculateNetRound(round)).toBe(-11)
    })
  })

  describe('calculateHolesPlayed', () => {
    it('should count holes with scores > 0', () => {
      const round = createTestRound([
        { hole: 1, par: 4, gross: 4, handicap: 10 },
        { hole: 2, par: 3, gross: 0, handicap: 4 }, // Not played
        { hole: 3, par: 5, gross: 5, handicap: 14 },
      ])
      expect(calculateHolesPlayed(round)).toBe(2)
    })

    it('should return 0 if no holes played', () => {
      const round = createTestRound([
        { hole: 1, par: 4, gross: 0, handicap: 10 },
        { hole: 2, par: 3, gross: 0, handicap: 4 },
      ])
      expect(calculateHolesPlayed(round)).toBe(0)
    })
  })

  describe('isRoundComplete', () => {
    it('should return true if all 18 holes played', () => {
      const holes = Array.from({ length: 18 }, (_, i) => ({
        hole: i + 1,
        par: i % 2 === 0 ? 4 : 3,
        gross: i % 2 === 0 ? 4 : 3,
        handicap: i + 1,
      }))
      const round = createTestRound(holes)
      expect(isRoundComplete(round, 18)).toBe(true)
    })

    it('should return false if holes are missing', () => {
      const round = createTestRound([
        { hole: 1, par: 4, gross: 4, handicap: 10 },
        { hole: 2, par: 3, gross: 3, handicap: 4 },
      ])
      expect(isRoundComplete(round, 18)).toBe(false)
    })

    it('should return false if any hole has no score', () => {
      const holes = Array.from({ length: 18 }, (_, i) => ({
        hole: i + 1,
        par: i % 2 === 0 ? 4 : 3,
        gross: i === 5 ? 0 : (i % 2 === 0 ? 4 : 3),
        handicap: i + 1,
      }))
      const round = createTestRound(holes)
      expect(isRoundComplete(round, 18)).toBe(false)
    })
  })

  describe('Leaderboard Sorting', () => {
    const players: PlayerRound[] = [
      createTestRound(
        [
          { hole: 1, par: 4, gross: 4, handicap: 10 },
          { hole: 2, par: 3, gross: 3, handicap: 4 },
          { hole: 3, par: 5, gross: 5, handicap: 14 },
        ],
        10
      ),
      createTestRound(
        [
          { hole: 1, par: 4, gross: 5, handicap: 10 },
          { hole: 2, par: 3, gross: 3, handicap: 4 },
          { hole: 3, par: 5, gross: 5, handicap: 14 },
        ],
        10
      ),
      createTestRound(
        [
          { hole: 1, par: 4, gross: 3, handicap: 10 },
          { hole: 2, par: 3, gross: 3, handicap: 4 },
          { hole: 3, par: 5, gross: 5, handicap: 14 },
        ],
        10
      ),
    ]

    it('sortByStableford should rank by points (descending)', () => {
      const sorted = sortByStableford(players)
      // Player 1 (gross 12) should be first (most points)
      // Player 2 (gross 13) second
      // Player 3 (gross 11) third
      expect(sorted[0].holes[0].gross).toBe(3) // Best (eagle)
      expect(sorted[1].holes[0].gross).toBe(4) // Par
      expect(sorted[2].holes[0].gross).toBe(5) // Bogey
    })

    it('sortByGross should rank by total strokes (ascending)', () => {
      const sorted = sortByGross(players)
      // Player 3 (gross 11) should be first
      // Player 1 (gross 12) second
      // Player 2 (gross 13) third
      expect(calculateGrossScore(sorted[0])).toBe(11)
      expect(calculateGrossScore(sorted[1])).toBe(12)
      expect(calculateGrossScore(sorted[2])).toBe(13)
    })

    it('sortByNet should rank by net score (ascending)', () => {
      const sorted = sortByNet(players)
      // All have same handicap (10), so order should match gross
      expect(calculateNetRound(sorted[0])).toBeLessThanOrEqual(calculateNetRound(sorted[1]))
    })
  })
})
