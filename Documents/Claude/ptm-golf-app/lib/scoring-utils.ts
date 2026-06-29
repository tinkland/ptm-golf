// Scoring calculation utilities - testable, framework-agnostic

export interface HoleScore {
  hole: number
  par: number
  gross: number
  handicap: number
}

export interface PlayerRound {
  playerId: string
  playerName?: string
  playerHandicap: number
  holes: HoleScore[]
}

// Calculate net score for a hole (gross - handicap strokes)
export const calculateNetScore = (gross: number, par: number, handicap: number, playerHandicap: number): number => {
  // For holes 1-18: player gets 1 stroke if hole's handicap <= player's handicap
  const strokesReceived = handicap <= playerHandicap ? 1 : 0
  return gross - strokesReceived
}

// Calculate Stableford points for a hole
export const calculateStablefordPoints = (gross: number, par: number, handicap: number, playerHandicap: number): number => {
  const net = calculateNetScore(gross, par, handicap, playerHandicap)
  const diff = par - net

  if (diff >= 3) return 5
  if (diff === 2) return 4
  if (diff === 1) return 3
  if (diff === 0) return 2
  if (diff === -1) return 1
  return 0
}

// Calculate total Stableford score for a round
export const calculateTotalStableford = (round: PlayerRound): number => {
  return round.holes.reduce((total, hole) => {
    const points = calculateStablefordPoints(hole.gross, hole.par, hole.handicap, round.playerHandicap)
    return total + points
  }, 0)
}

// Calculate gross score (total strokes)
export const calculateGrossScore = (round: PlayerRound): number => {
  return round.holes.reduce((total, hole) => total + hole.gross, 0)
}

// Calculate net score for a round (gross - total handicap strokes)
export const calculateNetRound = (round: PlayerRound): number => {
  const gross = calculateGrossScore(round)
  const handicapStrokes = Math.min(round.playerHandicap, 18)
  return gross - handicapStrokes
}

// Calculate total holes played
export const calculateHolesPlayed = (round: PlayerRound): number => {
  return round.holes.filter(h => h.gross > 0).length
}

// Validate round is complete
export const isRoundComplete = (round: PlayerRound, expectedHoles: number = 18): boolean => {
  return round.holes.length === expectedHoles && round.holes.every(h => h.gross > 0)
}

// Sort players by Stableford (descending)
export const sortByStableford = (players: PlayerRound[]): PlayerRound[] => {
  return [...players].sort((a, b) => calculateTotalStableford(b) - calculateTotalStableford(a))
}

// Sort players by Gross (ascending - lower is better)
export const sortByGross = (players: PlayerRound[]): PlayerRound[] => {
  return [...players].sort((a, b) => calculateGrossScore(a) - calculateGrossScore(b))
}

// Sort players by Net (ascending - lower is better)
export const sortByNet = (players: PlayerRound[]): PlayerRound[] => {
  return [...players].sort((a, b) => calculateNetRound(a) - calculateNetRound(b))
}
