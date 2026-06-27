'use client';

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Flag, Trophy, Users, Settings, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Plus, Minus, X, Target, RefreshCw, Pencil, Check, Swords, LogOut, BarChart3 } from "lucide-react";
import { QRCodeSVG as QRCode } from "qrcode.react";
import { useAuth } from "./auth-provider";
import { db } from "@/lib/firebase";
import { collection, doc, setDoc, getDoc, getDocs, query, where, onSnapshot, Unsubscribe } from "firebase/firestore";

const COLORS = {
  green: "#1F3D2B",
  greenLight: "#3A6B4A",
  greenPale: "#E9EFE5",
  cream: "#F6F1E4",
  charcoal: "#2A2622",
  gold: "#C7972F",
  goldPale: "#F2E3BC",
  flag: "#B5432D",
  flagPale: "#F1DCD3",
  sand: "#E6D6AC",
  line: "#D8CFB8",
};

const TOTAL_HOLES = 18;

const GAME_TEMPLATES = [
  { templateId: "joker", name: "Joker hole", emoji: "🃏", metric: "special", unit: "double", description: "Double Stableford points on one special hole per player." },
  { templateId: "long-drive", name: "Long drive", emoji: "🚀", metric: "highest", unit: "m", description: "Longest drive that finishes in the fairway." },
  { templateId: "ctp", name: "Closest to the pin", emoji: "🎯", metric: "lowest", unit: "cm", description: "Tee shot finishing nearest the flag on a par 3." },
  { templateId: "long-putt", name: "Longest putt holed", emoji: "⛳", metric: "highest", unit: "m", description: "Longest putt that actually goes in." },
  { templateId: "sandy", name: "Sandy saver", emoji: "🏖️", metric: "count", unit: "save", description: "Make par or better after your ball was in a bunker." },
  { templateId: "snake", name: "The snake", emoji: "🐍", metric: "latest", unit: "3-putt", description: "Whoever 3-putts most recently holds the snake." },
];

const COMPETITIONS = [
  { id: "stableford", name: "Stableford", emoji: "⭐", description: "Score from all 18 holes" },
  { id: "hardest-six", name: "Hardest and Highest", emoji: "💪", description: "Scores on individual's most difficult 6 holes by handicap" },
  { id: "best-indexed", name: "Best Indexed Score", emoji: "📊", description: "Best score on each hole index across all days" },
  { id: "best-ball-teams", name: "Best Ball Teams", emoji: "🤝", description: "Randomly paired teams across ALL groups" },
  { id: "skins", name: "Skins Tournament", emoji: "💰", description: "Win a skin by having the best score on each hole. Ties carry over." },
];

const DEFAULT_LOGO = "⛳";

const TEE_COLOURS = [
  { id: "white",  label: "White",  hex: "#F0EFE9", textHex: "#2A2622" },
  { id: "yellow", label: "Yellow", hex: "#D4A017", textHex: "#2A2622" },
  { id: "red",    label: "Red",    hex: "#C0392B", textHex: "#FFFFFF" },
  { id: "blue",   label: "Blue",   hex: "#2980B9", textHex: "#FFFFFF" },
  { id: "black",  label: "Black",  hex: "#1A1A1A", textHex: "#FFFFFF" },
  { id: "gold",   label: "Gold",   hex: "#C7972F", textHex: "#FFFFFF" },
];

const uid = () => Math.random().toString(36).slice(2, 9);

// Utility functions
function courseHandicap(hi, slope, rating, totalPar) {
  const n = Number(hi);
  if (hi === "" || hi === null || hi === undefined || isNaN(n)) return 0;
  return Math.round(n * (Number(slope) / 113) + (Number(rating) - Number(totalPar)));
}

function playingHandicap(ch, allowancePct) {
  return Math.round(ch * (Number(allowancePct) / 100));
}

function strokesOnHole(ph, si) {
  const abs = Math.abs(ph);
  const base = Math.floor(abs / TOTAL_HOLES);
  const remainder = abs % TOTAL_HOLES;
  if (ph < 0) {
    const extra = si > TOTAL_HOLES - remainder ? 1 : 0;
    return -(base + extra);
  }
  const extra = si <= remainder ? 1 : 0;
  return base + extra;
}

function stablefordPts(gross, par, strokesRecv) {
  if (gross === "PU") return 0; // Picked up = 0 points
  if (gross === null || gross === undefined || gross === "") return null;
  const net = Number(gross) - strokesRecv;
  const diff = net - Number(par);
  return Math.max(0, 2 - diff);
}

function totalParOf(course) {
  return course.holes.reduce((s, h) => s + Number(h.par || 0), 0);
}

function getPH(course, player, allowancePct) {
  const totalPar = totalParOf(course);
  const rating = course.rating !== "" && course.rating != null ? Number(course.rating) : totalPar;
  const ch = courseHandicap(player.handicapIndex, course.slope, rating, totalPar);
  return playingHandicap(ch, allowancePct);
}

// Returns a course-shaped object using the player's assigned tee for this round,
// falling back to the primary (course-level) data if no tee assigned.
function getCourseForPlayer(round, playerId) {
  const teeId = round.playerTees?.[playerId];
  if (!teeId) return round.course;
  const tee = round.course.tees?.find((t) => t.id === teeId);
  if (!tee) return round.course;
  return { ...round.course, slope: tee.slope, rating: tee.rating, holes: tee.holes };
}

function getPlayerGroup(round, playerId) {
  return round.groups.find((g) => g.playerIds.includes(playerId));
}

// Compute balanced group sizes (smaller groups go first)
// e.g. 7→[3,4], 10→[3,3,4], 11→[3,4,4]
function computeGroupSizes(numPlayers) {
  if (numPlayers <= 0) return [];
  const numGroups = Math.ceil(numPlayers / 4);
  const baseSize = Math.floor(numPlayers / numGroups);
  const remainder = numPlayers % numGroups;
  return Array.from({ length: numGroups }, (_, i) =>
    i < numGroups - remainder ? baseSize : baseSize + 1
  );
}

// Build group objects from an ordered list of player IDs, preserving existing tee times
function buildGroupsFromOrderedPlayers(orderedPlayerIds, existingGroups) {
  const sizes = computeGroupSizes(orderedPlayerIds.length);
  let idx = 0;
  return sizes.map((size, g) => {
    const groupPlayerIds = orderedPlayerIds.slice(idx, idx + size);
    idx += size;
    return { id: uid(), name: `Group ${g + 1}`, playerIds: groupPlayerIds, teeTime: existingGroups[g]?.teeTime || "" };
  });
}

function reorganizeGroupsByScore(prevRound, nextRound, players, allScores, allowance) {
  const playerScores = players
    .map((p) => {
      const group = getPlayerGroup(prevRound, p.id);
      const scoreObj = group && allScores[group.id];
      const stats = computePlayerRoundStats(prevRound, p, allowance, scoreObj);
      return { player: p, score: stats.raw };
    })
    .sort((a, b) => a.score - b.score); // ascending: worst first, leaders in last group

  const orderedIds = playerScores.map((ps) => ps.player.id);
  const newGroups = buildGroupsFromOrderedPlayers(orderedIds, nextRound.groups);
  return { ...nextRound, groups: newGroups.length > 0 ? newGroups : nextRound.groups };
}

function computePlayerRoundStats(round, player, allowancePct, scoreObj) {
  const course = getCourseForPlayer(round, player.id);
  const ph = getPH(course, player, allowancePct);
  const jokerHole = scoreObj?.jokerHoles?.[player.id];
  let raw = 0, gross = 0, thru = 0, jokerBonus = 0;
  course.holes.forEach((h) => {
    const g = scoreObj?.playerScores?.[player.id]?.[h.number];
    if (g !== "" && g != null) {
      const pts = stablefordPts(g, h.par, strokesOnHole(ph, h.si));
      raw += pts;
      // For pick-ups, use par+3 (lowest 0-point Stableford score) instead of NaN
      gross += g === "PU" ? h.par + 3 : Number(g);
      thru++;
      if (round.jokerEnabled && jokerHole && Number(jokerHole) === h.number) jokerBonus = pts;
    }
  });
  return { raw, dayTotal: raw + jokerBonus, gross, thru, jokerBonus, jokerHole };
}

function hasScore(scores, playerId, holeNum) {
  const v = scores.playerScores?.[playerId]?.[holeNum];
  return v !== "" && v != null;
}

function getHardestSixHoles(round, handicap: number): number[] {
  // Hardest 6 holes are those with FEWEST strokes allocated by handicap
  // For handicaps 1-18: all holes get 1 stroke, hardest 6 are SI 13-18
  // For handicaps 19-36: SI 1-7 get 2 strokes, SI 8-18 get 1 stroke, hardest 6 are SI 8-13
  // etc.
  const quotient = Math.floor(handicap / 18);
  const remainder = handicap % 18;

  // Find holes with minimum strokes
  // SI 1-remainder get quotient+1 strokes
  // SI (remainder+1)-18 get quotient strokes
  let hardestSIs: number[] = [];

  if (remainder === 0) {
    // All holes get same number of strokes, hardest 6 are highest SI
    hardestSIs = [13, 14, 15, 16, 17, 18];
  } else {
    // Holes with fewer strokes are harder
    // SI (remainder+1)-18 get quotient strokes (fewest)
    const startSI = remainder + 1;
    const endSI = 18;
    hardestSIs = [];
    for (let si = startSI; si <= endSI && hardestSIs.length < 6; si++) {
      hardestSIs.push(si);
    }
    // If not enough, add from SI 1
    for (let si = 1; si <= remainder && hardestSIs.length < 6; si++) {
      hardestSIs.push(si);
    }
  }

  return round.course.holes
    .filter((h) => hardestSIs.includes(h.si))
    .map((h) => h.number)
    .sort((a, b) => a - b);
}

function computePlayerHardestSixScore(round, player, allowancePct, scoreObj) {
  const ph = getPH(round.course, player, allowancePct);
  const hardestHoles = getHardestSixHoles(round, ph);
  let score = 0;
  round.course.holes.forEach((h) => {
    if (hardestHoles.includes(h.number)) {
      const g = scoreObj?.playerScores?.[player.id]?.[h.number];
      if (g !== "" && g != null) {
        const pts = stablefordPts(g, h.par, strokesOnHole(ph, h.si));
        score += pts;
      }
    }
  });
  return score;
}

function computePlayerBestIndexedScore(rounds, player, allowancePct, allScoresByRound, currentRoundId, currentScores) {
  let totalScore = 0;

  // For each stroke index (1-18)
  for (let index = 1; index <= 18; index++) {
    let bestPtsForIndex = 0;

    // Check all rounds for holes with this stroke index
    rounds.forEach((round) => {
      // Guard: ensure round has course data
      if (!round || !round.course || !round.course.holes) {
        return;
      }

      let scoreObj = null;

      // For all rounds, merge all groups from allScoresByRound
      if (allScoresByRound[round.id]) {
        const merged = { playerScores: {}, jokerHoles: {} };
        Object.values(allScoresByRound[round.id]).forEach((groupScores: any) => {
          if (groupScores?.playerScores) Object.assign(merged.playerScores, groupScores.playerScores);
          if (groupScores?.jokerHoles) Object.assign(merged.jokerHoles, groupScores.jokerHoles);
        });
        scoreObj = merged;
      }

      // For the current round, overlay currentScores (most recent, not yet synced to Firebase)
      if (round.id === currentRoundId) {
        if (scoreObj) {
          if (currentScores?.playerScores) Object.assign((scoreObj as any).playerScores, currentScores.playerScores);
          if (currentScores?.jokerHoles) Object.assign((scoreObj as any).jokerHoles, currentScores.jokerHoles);
        } else {
          scoreObj = currentScores;
        }
      }

      if (scoreObj) {
        const ph = getPH(round.course, player, allowancePct);
        // Find hole with this stroke index in this round
        const hole = round.course.holes.find((h) => h.si === index);
        if (hole) {
          const g = scoreObj?.playerScores?.[player.id]?.[hole.number];
          if (g !== "" && g != null) {
            const pts = stablefordPts(g, hole.par, strokesOnHole(ph, hole.si));
            // Keep only the best score for this index
            if (pts !== null) {
              bestPtsForIndex = Math.max(bestPtsForIndex, pts);
            }
          }
        }
      }
    });

    totalScore += bestPtsForIndex;
  }

  return totalScore;
}

function calculateRoundSkins(round, players, allowancePct, scoreObj) {
  // Returns { playerSkins: { playerId: { won: number of holes won, awarded: number of times skin awarded } }, carryOver: number }
  const playerSkins = {};
  players.forEach((p) => {
    playerSkins[p.id] = { won: 0, awarded: 0 };
  });

  let carryOver = 0; // Number of carried-over skins

  if (!round || !round.course || !round.course.holes) {
    return { playerSkins, carryOver };
  }

  round.course.holes.forEach((hole) => {
    // Find best score on this hole across all players
    const scoresOnHole = [];
    players.forEach((p) => {
      const g = scoreObj?.playerScores?.[p.id]?.[hole.number];
      if (g !== "" && g != null && g !== "PU") { // Exclude pickups
        const ph = getPH(round.course, p, allowancePct);
        const pts = stablefordPts(g, hole.par, strokesOnHole(ph, hole.si));
        scoresOnHole.push({ playerId: p.id, gross: Number(g), pts });
      }
    });

    if (scoresOnHole.length === 0) {
      carryOver++; // No valid scores, carry over
      return;
    }

    // Find best score
    const bestScore = Math.max(...scoresOnHole.map((s) => s.pts));
    const winners = scoresOnHole.filter((s) => s.pts === bestScore);

    if (winners.length === 1) {
      // Clear winner: award skin(s) including carry-overs
      winners[0].playerId && (playerSkins[winners[0].playerId].won += carryOver + 1);
      winners[0].playerId && (playerSkins[winners[0].playerId].awarded += 1);
      carryOver = 0;
    } else {
      // Tie: carry over all skins
      carryOver++;
    }
  });

  return { playerSkins, carryOver };
}

function calculateCumulativeSkins(rounds, players, allowancePct, allScoresByRound, currentRoundId, currentScores) {
  // Returns { playerId: { totalWon: number, timesAwarded: number } }
  const cumulativeSkins = {};
  players.forEach((p) => {
    cumulativeSkins[p.id] = { totalWon: 0, timesAwarded: 0 };
  });

  let carryOverFromPreviousRound = 0; // Skins that carried over from previous round

  rounds.forEach((round, roundIndex) => {
    // Collect scores for this round
    let roundScores = null;
    let foundScores = false;

    // Try group-based scores first - merge all groups
    if (round.groups && round.groups.length > 0 && allScoresByRound[round.id]) {
      const merged = { playerScores: {}, jokerHoles: {} };
      for (const group of round.groups) {
        if (allScoresByRound[round.id][group.id]) {
          const groupScores = allScoresByRound[round.id][group.id];
          if (groupScores?.playerScores) Object.assign(merged.playerScores, groupScores.playerScores);
          if (groupScores?.jokerHoles) Object.assign(merged.jokerHoles, groupScores.jokerHoles);
        }
      }
      if (Object.keys(merged.playerScores).length > 0) {
        roundScores = merged;
        foundScores = true;
      }
    }

    // Try preserved scores
    if (!foundScores) {
      const preservedKey = `${round.id}_preserved`;
      if (allScoresByRound[preservedKey]) {
        roundScores = allScoresByRound[preservedKey];
        foundScores = true;
      }
    }

    // For current round, merge all groups then overlay currentScores
    if (round.id === currentRoundId) {
      if (round.groups && round.groups.length > 0 && allScoresByRound[round.id]) {
        const merged = { playerScores: {}, jokerHoles: {} };
        for (const group of round.groups) {
          if (allScoresByRound[round.id][group.id]) {
            const groupScores = allScoresByRound[round.id][group.id];
            if (groupScores?.playerScores) Object.assign(merged.playerScores, groupScores.playerScores);
            if (groupScores?.jokerHoles) Object.assign(merged.jokerHoles, groupScores.jokerHoles);
          }
        }
        if (currentScores?.playerScores) Object.assign(merged.playerScores, currentScores.playerScores);
        if (currentScores?.jokerHoles) Object.assign(merged.jokerHoles, currentScores.jokerHoles);
        roundScores = merged;
      } else {
        roundScores = currentScores;
      }
      foundScores = true;
    }

    if (!foundScores || !roundScores) {
      return; // No scores yet for this round
    }

    // Calculate skins for this round
    const result = calculateRoundSkins(round, players, allowancePct, roundScores);

    // Apply carry-over from previous round to first hole with a winner
    let carryOverApplied = false;
    if (carryOverFromPreviousRound > 0) {
      for (const hole of round.course.holes) {
        if (carryOverApplied) break;

        const scoresOnHole = [];
        players.forEach((p) => {
          const g = roundScores?.playerScores?.[p.id]?.[hole.number];
          if (g !== "" && g != null && g !== "PU") {
            const ph = getPH(round.course, p, allowancePct);
            const pts = stablefordPts(g, hole.par, strokesOnHole(ph, hole.si));
            if (pts !== null) {
              scoresOnHole.push({ playerId: p.id, pts });
            }
          }
        });

        if (scoresOnHole.length > 0) {
          const bestScore = Math.max(...scoresOnHole.map((s) => s.pts));
          const winners = scoresOnHole.filter((s) => s.pts === bestScore);

          if (winners.length === 1) {
            // Clear winner: add carry-over
            cumulativeSkins[winners[0].playerId].totalWon += carryOverFromPreviousRound;
            carryOverApplied = true;
          }
        }
      }
    }

    // Add this round's skins to cumulative
    Object.keys(result.playerSkins).forEach((playerId) => {
      cumulativeSkins[playerId].totalWon += result.playerSkins[playerId].won;
      cumulativeSkins[playerId].timesAwarded += result.playerSkins[playerId].awarded;
    });

    // Set up carry-over for next round (if enabled)
    const isLastRound = roundIndex === rounds.length - 1;
    const nextRound = roundIndex + 1 < rounds.length ? rounds[roundIndex + 1] : null;
    const skinsGameSettings = round.games?.find((g) => g.templateId === "skins-daily");
    const carryOverEnabled = skinsGameSettings?.carryOverUnawarded !== false && !isLastRound;

    carryOverFromPreviousRound = carryOverEnabled ? result.carryOver : 0;
  });

  return cumulativeSkins;
}

function computePlayerSkinsScore(rounds, player, allowancePct, allScoresByRound, currentRoundId, currentScores, allPlayers, isCompetition = true) {
  // Returns { totalWon, timesAwarded } for display as "totalWon(timesAwarded)"
  // isCompetition: true for Skins Tournament (always carry over), false for daily skins games
  const cumulativeSkins = {};
  allPlayers.forEach((p) => {
    cumulativeSkins[p.id] = { totalWon: 0, timesAwarded: 0 };
  });

  let carryOverFromPreviousRound = 0;

  rounds.forEach((round, roundIndex) => {
    // Collect scores for this round
    let roundScores = null;
    let foundScores = false;

    if (round.groups && round.groups.length > 0 && allScoresByRound[round.id]) {
      // Merge all groups for this round
      const merged = { playerScores: {}, jokerHoles: {} };
      for (const group of round.groups) {
        if (allScoresByRound[round.id][group.id]) {
          const groupScores = allScoresByRound[round.id][group.id];
          if (groupScores?.playerScores) Object.assign(merged.playerScores, groupScores.playerScores);
          if (groupScores?.jokerHoles) Object.assign(merged.jokerHoles, groupScores.jokerHoles);
        }
      }
      if (Object.keys(merged.playerScores).length > 0) {
        roundScores = merged;
        foundScores = true;
      }
    }

    if (!foundScores) {
      const preservedKey = `${round.id}_preserved`;
      if (allScoresByRound[preservedKey]) {
        roundScores = allScoresByRound[preservedKey];
        foundScores = true;
      }
    }

    if (round.id === currentRoundId) {
      // Merge all groups from allScoresByRound then overlay currentScores (most recent for this device)
      if (round.groups && round.groups.length > 0 && allScoresByRound[round.id]) {
        const merged = { playerScores: {}, jokerHoles: {} };
        for (const group of round.groups) {
          if (allScoresByRound[round.id][group.id]) {
            const groupScores = allScoresByRound[round.id][group.id];
            if (groupScores?.playerScores) Object.assign(merged.playerScores, groupScores.playerScores);
            if (groupScores?.jokerHoles) Object.assign(merged.jokerHoles, groupScores.jokerHoles);
          }
        }
        if (currentScores?.playerScores) Object.assign(merged.playerScores, currentScores.playerScores);
        if (currentScores?.jokerHoles) Object.assign(merged.jokerHoles, currentScores.jokerHoles);
        roundScores = merged;
      } else {
        roundScores = currentScores;
      }
      foundScores = true;
    }

    if (!foundScores || !roundScores) {
      return;
    }

    // Calculate skins for this round
    const result = calculateRoundSkins(round, allPlayers, allowancePct, roundScores);

    // Apply carry-over from previous round to first hole with a winner
    let carryOverApplied = false;
    if (carryOverFromPreviousRound > 0 && round.course && round.course.holes) {
      for (const hole of round.course.holes) {
        if (carryOverApplied) break;

        const scoresOnHole = [];
        allPlayers.forEach((p) => {
          const g = roundScores?.playerScores?.[p.id]?.[hole.number];
          if (g !== "" && g != null && g !== "PU") {
            const ph = getPH(round.course, p, allowancePct);
            const pts = stablefordPts(g, hole.par, strokesOnHole(ph, hole.si));
            if (pts !== null) {
              scoresOnHole.push({ playerId: p.id, pts });
            }
          }
        });

        if (scoresOnHole.length > 0) {
          const bestScore = Math.max(...scoresOnHole.map((s) => s.pts));
          const winners = scoresOnHole.filter((s) => s.pts === bestScore);

          if (winners.length === 1) {
            cumulativeSkins[winners[0].playerId].totalWon += carryOverFromPreviousRound;
            carryOverApplied = true;
          }
        }
      }
    }

    // Add this round's skins to cumulative
    Object.keys(result.playerSkins).forEach((playerId) => {
      cumulativeSkins[playerId].totalWon += result.playerSkins[playerId].won;
      cumulativeSkins[playerId].timesAwarded += result.playerSkins[playerId].awarded;
    });

    // Determine if carry-over should apply to next round
    const isLastRound = roundIndex === rounds.length - 1;
    let carryOverEnabled = false;

    if (isCompetition) {
      // Tournament skins always carry over
      carryOverEnabled = !isLastRound;
    } else {
      // Daily skins: check game configuration
      const skinsGameSettings = round.games?.find((g) => g.templateId === "skins-daily");
      carryOverEnabled = skinsGameSettings?.carryOverUnawarded !== false && !isLastRound;
    }

    carryOverFromPreviousRound = carryOverEnabled ? result.carryOver : 0;
  });

  return cumulativeSkins[player.id] || { totalWon: 0, timesAwarded: 0 };
}

function generateRandomTeams(players: any[]) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const teams: any[] = [];

  if (shuffled.length % 2 === 0) {
    // Even number: simple pairs
    for (let i = 0; i < shuffled.length; i += 2) {
      teams.push({
        id: uid(),
        players: [shuffled[i].id, shuffled[i + 1].id],
        name: `${shuffled[i].name} & ${shuffled[i + 1].name}`,
      });
    }
  } else {
    // Odd number: lowest handicap in 2 teams
    const lowest = shuffled.reduce((min, p) => (Number(p.handicapIndex) < Number(min.handicapIndex) ? p : min));
    const others = shuffled.filter((p) => p.id !== lowest.id);

    // Team 1: lowest + first other
    teams.push({
      id: uid(),
      players: [lowest.id, others[0].id],
      name: `${lowest.name} & ${others[0].name}`,
    });

    // Team 2: lowest + second other
    if (others.length > 1) {
      teams.push({
        id: uid(),
        players: [lowest.id, others[1].id],
        name: `${lowest.name} & ${others[1].name}`,
      });
    }

    // Remaining pairs
    for (let i = 2; i < others.length; i += 2) {
      if (i + 1 < others.length) {
        teams.push({
          id: uid(),
          players: [others[i].id, others[i + 1].id],
          name: `${others[i].name} & ${others[i + 1].name}`,
        });
      }
    }
  }

  return teams;
}

function computeTeamBestBallScore(teamPlayerIds: string[], round, allowancePct, scoreObj) {
  let totalScore = 0;

  round.course.holes.forEach((h) => {
    let bestPtsForHole = 0;

    teamPlayerIds.forEach((playerId) => {
      const player = round.groups.flatMap((g) => g.playerIds).find((id) => id === playerId);
      // Find the player object from config (this is passed context)
      const g = scoreObj?.playerScores?.[playerId]?.[h.number];
      if (g !== "" && g != null) {
        // We need player handicap - would need to pass from parent
        bestPtsForHole = Math.max(bestPtsForHole, g);
      }
    });

    totalScore += bestPtsForHole;
  });

  return totalScore;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function defaultHoles() {
  return Array.from({ length: TOTAL_HOLES }, (_, i) => ({ number: i + 1, par: 4, si: i + 1, distance: "" }));
}

function defaultRound(idx) {
  return {
    id: `round${idx}`,
    label: `Round ${idx}`,
    course: { name: "", slope: 113, rating: 70, holes: defaultHoles() },
    jokerEnabled: idx === 2,
    jokerBonusAppliesOverall: true,
    excludeFromOverall: false,
    groups: [{ id: uid(), name: "Group 1", playerIds: [], teeTime: "" }],
    games: [],
    competitions: [],
    bestBallTeams: [],
  };
}

function defaultRounds() {
  return [defaultRound(1), defaultRound(2)];
}

// Firebase helpers
async function saveEventToFirebase(eventId: string, userId: string, eventData: any) {
  await setDoc(doc(db, "events", eventId), {
    ...eventData,
    ownerId: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function getEventFromFirebase(eventId: string) {
  const docSnap = await getDoc(doc(db, "events", eventId));
  return docSnap.exists() ? docSnap.data() : null;
}

async function saveScoresToFirebase(eventId: string, roundId: string, groupId: string, scores: any) {
  const scoreId = `${eventId}_${roundId}_${groupId}`;
  await setDoc(doc(db, "scores", scoreId), {
    eventId,
    roundId,
    groupId,
    playerScores: scores.playerScores || {},
    jokerHoles: scores.jokerHoles || {},
    updatedAt: new Date(),
  });
}

async function getScoresFromFirebase(eventId: string, roundId: string, groupId: string) {
  const scoreId = `${eventId}_${roundId}_${groupId}`;
  const docSnap = await getDoc(doc(db, "scores", scoreId));
  return docSnap.exists() ? docSnap.data() : { playerScores: {}, jokerHoles: {} };
}

async function saveGameEntriesToFirebase(eventId: string, roundId: string, groupId: string, entries: any) {
  const gameId = `${eventId}_${roundId}_${groupId}_games`;
  await setDoc(doc(db, "games", gameId), {
    eventId,
    roundId,
    groupId,
    entries: entries || [],
    updatedAt: new Date(),
  });
}

async function getGameEntriesFromFirebase(eventId: string, roundId: string, groupId: string) {
  const gameId = `${eventId}_${roundId}_${groupId}_games`;
  const docSnap = await getDoc(doc(db, "games", gameId));
  return docSnap.exists() ? docSnap.data()?.entries || [] : [];
}

// UI Components
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div
      className="fixed top-4 left-1/2 z-50 px-4 py-3 rounded-xl shadow-lg text-center font-medium"
      style={{ transform: "translateX(-50%)", backgroundColor: COLORS.green, color: COLORS.goldPale, maxWidth: "90%" }}
    >
      {toast}
    </div>
  );
}

// Welcome Page Component
function WelcomePage({ onLoginClick, onSetupClick, logo, links }) {
  return (
    <div style={{ backgroundColor: COLORS.cream, minHeight: "100vh" }} className="flex flex-col max-w-md mx-auto">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="text-7xl mb-4">{logo || DEFAULT_LOGO}</div>
        <h1 className="text-4xl font-display mb-2" style={{ color: COLORS.green }}>
          PTM Golf
        </h1>
        <p className="text-sm opacity-60 mb-8 text-center">Track your golf scores in real-time</p>

        <div className="w-full flex flex-col gap-3">
          <button
            onClick={onLoginClick}
            className="w-full py-3 rounded-lg font-medium"
            style={{ backgroundColor: COLORS.green, color: "white" }}
          >
            Sign In / Sign Up
          </button>
          <button
            onClick={onSetupClick}
            className="w-full py-3 rounded-lg font-medium"
            style={{ backgroundColor: COLORS.gold, color: "white" }}
          >
            Admin Setup
          </button>
        </div>
      </div>

      {links && links.length > 0 && (
        <div className="px-4 py-6 border-t" style={{ borderColor: COLORS.line }}>
          <p className="text-xs font-medium mb-3 opacity-60" style={{ color: COLORS.charcoal }}>
            Useful Links
          </p>
          <div className="flex flex-col gap-2">
            {links.map((link, idx) => (
              <a
                key={idx}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm px-3 py-2 rounded-lg text-center"
                style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}
              >
                {link.label} →
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// License Key Modal — replaces the old admin password modal
function LicenseKeyModal({ onSuccess, onCancel }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!key.trim()) return;
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/validate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!data.valid) {
        setError(data.error || "Invalid license key");
        setKey("");
        return;
      }
      // Persist to localStorage so admin doesn't re-enter after page reload
      localStorage.setItem("ptm-license", JSON.stringify({
        key: key.trim().toUpperCase(),
        maxSlots: data.maxSlots,
        tier: data.tier,
        expiresAt: data.expiresAt,
      }));
      onSuccess({ maxSlots: data.maxSlots, tier: data.tier });
    } catch {
      setError("Could not validate key. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 max-w-md mx-auto">
      <div className="bg-white rounded-xl p-6 mx-4 w-full">
        <h2 className="text-lg font-bold mb-1" style={{ color: COLORS.green }}>Admin Access</h2>
        <p className="text-xs opacity-60 mb-4" style={{ color: COLORS.charcoal }}>
          Enter your PTM Golf license key (format: PTM-XXXX-XXXX-XXXX)
        </p>
        <input
          type="text"
          placeholder="PTM-XXXX-XXXX-XXXX"
          value={key}
          onChange={(e) => { setKey(e.target.value.toUpperCase()); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          className="w-full px-3 py-2 rounded-lg border mb-1 font-mono text-sm tracking-wider"
          style={{ borderColor: COLORS.line, color: COLORS.charcoal }}
          autoFocus
          autoCapitalize="characters"
        />
        <p className="text-[11px] mb-4 opacity-50" style={{ color: COLORS.charcoal }}>
          Don't have a key?{" "}
          <a href="/get-key" target="_blank" className="underline" style={{ color: COLORS.green }}>
            Get one here →
          </a>
        </p>
        {error && <p className="text-xs mb-3" style={{ color: COLORS.flag }}>{error}</p>}
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 rounded-lg font-medium"
            style={{ backgroundColor: COLORS.cream, color: COLORS.charcoal }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex-1 py-2 rounded-lg font-medium"
            style={{ backgroundColor: COLORS.green, color: "white", opacity: loading ? 0.7 : 1 }}>
            {loading ? "Checking…" : "Enter"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, children, right = null }) {
  return (
    <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "white", border: `1px solid ${COLORS.line}` }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-lg" style={{ color: COLORS.green }}>{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function NumField({ value, onChange, w = "w-14", min, max, step = 1 }: { value: any; onChange: any; w?: string; min?: any; max?: any; step?: number }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(e.target.value)}
      className={`${w} text-center rounded-md px-1 py-1.5 text-sm`}
      style={{ border: `1px solid ${COLORS.line}`, backgroundColor: COLORS.cream }}
    />
  );
}

// SetupForm Component
function SetupForm({ initialConfig, onSave, onCancel = null, isAdmin, onAdminDone, currentRoundId = null, allScoresByRound = {}, adminLimits = null }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [eventName, setEventName] = useState(initialConfig?.eventName || "");
  const [numRounds, setNumRounds] = useState(initialConfig?.rounds?.length || 2);
  const [rounds, setRounds] = useState(initialConfig?.rounds || defaultRounds());
  const [roundTab, setRoundTab] = useState(0);
  const [adminLogo, setAdminLogo] = useState(() => localStorage.getItem("ptm-golf-logo") || DEFAULT_LOGO);
  const [adminLinks, setAdminLinks] = useState(() => {
    try {
      if (initialConfig?.links?.length) return initialConfig.links;
      return JSON.parse(localStorage.getItem("ptm-golf-links") || "[]");
    } catch {
      return [];
    }
  });
  const [players, setPlayers] = useState(initialConfig?.players || []);
  const [matches, setMatches] = useState(initialConfig?.matches || []);
  const [allowStable, setAllowStable] = useState(initialConfig?.allowance?.stableford ?? 95);
  const [allowMatch, setAllowMatch] = useState(initialConfig?.allowance?.matchplay ?? 100);

  // Update rounds when numRounds changes
  const handleNumRoundsChange = (num: number) => {
    setNumRounds(num);
    const newRounds = [];
    for (let i = 0; i < num; i++) {
      if (rounds[i]) {
        newRounds.push(rounds[i]);
      } else {
        newRounds.push({
          ...defaultRound(i + 1),
          label: `Round ${i + 1}`,
        });
      }
    }
    setRounds(newRounds);
    if (roundTab >= num) setRoundTab(num - 1);
  };

  const round = rounds[roundTab];
  const totalPar = totalParOf(round.course);

  const [groupMode, setGroupMode] = useState<"manual"|"random"|"ascending">("manual");
  // Reset mode when switching round tabs
  useEffect(() => { setGroupMode("manual"); }, [roundTab]);

  const hasExistingScores = Object.keys(allScoresByRound).some(k => !k.endsWith("_preserved") && Object.keys(allScoresByRound[k] || {}).length > 0);

  function autoAssignGroups(mode: "random"|"ascending") {
    const eligible = players.filter(p => p.name);
    let orderedIds: string[];
    if (mode === "random") {
      orderedIds = [...eligible.map(p => p.id)].sort(() => Math.random() - 0.5);
    } else {
      // ascending by overall points
      const scored = eligible.map(p => {
        let total = 0;
        rounds.forEach(r => {
          if (r.excludeFromOverall) return;
          const grp = r.groups.find(g => g.playerIds.includes(p.id));
          const so = grp ? allScoresByRound[r.id]?.[grp.id] : null;
          if (so) {
            const stats = computePlayerRoundStats(r, p, allowStable, so);
            total += stats.dayTotal;
          }
        });
        return { id: p.id, total };
      }).sort((a, b) => a.total - b.total);
      orderedIds = scored.map(s => s.id);
    }
    const newGroups = buildGroupsFromOrderedPlayers(orderedIds, round.groups);
    setRounds(rs => rs.map((r, i) => i === roundTab ? { ...r, groups: newGroups } : r));
  }

  // Determine if current round tab is editable (future rounds only)
  const currentRoundIndex = currentRoundId ? rounds.findIndex((r) => r.id === currentRoundId) : -1;
  const isEditableRound = currentRoundIndex === -1 || roundTab > currentRoundIndex; // Allow editing if no current round or this is a future round

  function updateRound(field, val) {
    if (!isEditableRound) return; // Don't allow edits to past/current rounds
    setRounds((rs) => rs.map((r, i) => (i === roundTab ? { ...r, [field]: val } : r)));
  }
  function updateCourse(field, val) {
    setRounds((rs) => rs.map((r, i) => (i === roundTab ? { ...r, course: { ...r.course, [field]: val } } : r)));
  }
  function updateHole(holeIdx, field, val) {
    setRounds((rs) =>
      rs.map((r, i) =>
        i === roundTab
          ? { ...r, course: { ...r.course, holes: r.course.holes.map((h, hi) => (hi === holeIdx ? { ...h, [field]: val === "" ? "" : Number(val) } : h)) } }
          : r
      )
    );
  }
  function addExtraTee() {
    setRounds((rs) => rs.map((r, i) => {
      if (i !== roundTab) return r;
      const existing = r.course.tees || [];
      if (existing.length >= 2) return r;
      const newTee = {
        id: uid(),
        label: ["Red", "Blue", "Yellow", "Black", "Gold"].filter(l => !existing.some(t => t.label === l))[0] || "Extra",
        colour: ["red", "blue", "yellow", "black", "gold"].filter(c => !existing.some(t => t.colour === c))[0] || "red",
        slope: r.course.slope,
        rating: r.course.rating,
        holes: r.course.holes.map(h => ({ ...h })),
      };
      return { ...r, course: { ...r.course, tees: [...existing, newTee] } };
    }));
  }
  function removeExtraTee(teeId) {
    setRounds((rs) => rs.map((r, i) => {
      if (i !== roundTab) return r;
      const tees = (r.course.tees || []).filter(t => t.id !== teeId);
      // Also clear any playerTees assignments for this tee
      const playerTees = { ...(r.playerTees || {}) };
      Object.keys(playerTees).forEach(pid => { if (playerTees[pid] === teeId) delete playerTees[pid]; });
      return { ...r, course: { ...r.course, tees }, playerTees };
    }));
  }
  function updateExtraTee(teeId, field, val) {
    setRounds((rs) => rs.map((r, i) => {
      if (i !== roundTab) return r;
      return { ...r, course: { ...r.course, tees: (r.course.tees || []).map(t => t.id === teeId ? { ...t, [field]: val } : t) } };
    }));
  }
  function updateExtraTeeHole(teeId, holeIdx, field, val) {
    setRounds((rs) => rs.map((r, i) => {
      if (i !== roundTab) return r;
      return { ...r, course: { ...r.course, tees: (r.course.tees || []).map(t =>
        t.id === teeId
          ? { ...t, holes: t.holes.map((h, hi) => hi === holeIdx ? { ...h, [field]: val === "" ? "" : Number(val) } : h) }
          : t
      ) } };
    }));
  }
  function setPlayerTee(playerId, teeId) {
    setRounds((rs) => rs.map((r, i) => {
      if (i !== roundTab) return r;
      const playerTees = { ...(r.playerTees || {}) };
      if (teeId) playerTees[playerId] = teeId; else delete playerTees[playerId];
      return { ...r, playerTees };
    }));
  }
  function addPlayer() {
    setPlayers((p) => [...p, { id: uid(), name: "", handicapIndex: "" }]);
  }
  function updatePlayer(id, field, val) {
    setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, [field]: val } : p)));
  }
  function removePlayer(id) {
    setPlayers((ps) => ps.filter((p) => p.id !== id));
    setRounds((rs) => rs.map((r) => ({ ...r, groups: r.groups.map((g) => ({ ...g, playerIds: g.playerIds.filter((pid) => pid !== id) })) })));
  }
  function addGroup() {
    setRounds((rs) => rs.map((r, i) => (i === roundTab ? { ...r, groups: [...r.groups, { id: uid(), name: `Group ${r.groups.length + 1}`, playerIds: [] }] } : r)));
  }
  function removeGroup(gid) {
    setRounds((rs) => rs.map((r, i) => (i === roundTab ? { ...r, groups: r.groups.filter((g) => g.id !== gid) } : r)));
  }
  function renameGroup(gid, name) {
    setRounds((rs) => rs.map((r, i) => (i === roundTab ? { ...r, groups: r.groups.map((g) => (g.id === gid ? { ...g, name } : g)) } : r)));
  }
  function setPlayerGroup(playerId, groupId) {
    setRounds((rs) =>
      rs.map((r, i) =>
        i === roundTab
          ? { ...r, groups: r.groups.map((g) => (g.id === groupId ? { ...g, playerIds: [...new Set([...g.playerIds, playerId])] } : { ...g, playerIds: g.playerIds.filter((pid) => pid !== playerId) })) }
          : r
      )
    );
  }

  // Get active templates for current round from round.games
  function getActiveTemplates() {
    const map = {};
    (round.games || []).forEach((g) => {
      if (g.templateId) map[g.templateId] = g;
    });
    return map;
  }

  // Toggle a game template for current round
  function toggleTemplate(t) {
    const activeTemplates = getActiveTemplates();
    setRounds((rs) =>
      rs.map((r, i) => {
        if (i !== roundTab) return r;
        const newGames = [...(r.games || [])];
        const existingIdx = newGames.findIndex((g) => g.templateId === t.templateId);
        if (existingIdx >= 0) {
          // Remove if exists
          newGames.splice(existingIdx, 1);
        } else {
          // Add if doesn't exist
          newGames.push({
            id: uid(),
            templateId: t.templateId,
            name: t.name,
            emoji: t.emoji,
            metric: t.metric,
            unit: t.unit,
            description: t.description,
            holes: [],
          });
        }
        return { ...r, games: newGames };
      })
    );
  }

  // Update holes for a game template in current round
  function updateGameHoles(templateId, holes) {
    setRounds((rs) =>
      rs.map((r, i) => {
        if (i !== roundTab) return r;
        const newGames = (r.games || []).map((g) =>
          g.templateId === templateId ? { ...g, holes } : g
        );
        return { ...r, games: newGames };
      })
    );
  }

  function exportConfig() {
    const config = {
      eventName,
      rounds,
      players,
      allowance: { stableford: 100 },
    };
    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ptm-golf-test-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importConfig() {
    fileInputRef.current?.click();
  }

  function handleFileUpload(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const config = JSON.parse(event.target?.result as string);
        setEventName(config.eventName || "");
        let newRounds = config.rounds || defaultRounds();
        setRounds(newRounds);
        setPlayers(config.players || []);
        if (config.course) {
          setRounds((r) =>
            r.map((round, idx) => (idx === roundTab ? { ...round, course: config.course } : round))
          );
        }
        // Games are now loaded from each round, not from config.games
      } catch (err) {
        alert("Error loading config: " + err);
      }
    };
    reader.readAsText(file);
  }

  function handleLogoUpload(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setAdminLogo(base64);
      localStorage.setItem("ptm-golf-logo", base64);
    };
    reader.readAsDataURL(file);
  }

  function updateAdminLink(idx: number, field: string, value: string) {
    const updated = [...adminLinks];
    updated[idx] = { ...updated[idx], [field]: value };
    setAdminLinks(updated);
    localStorage.setItem("ptm-golf-links", JSON.stringify(updated));
  }

  function addAdminLink() {
    if (adminLinks.length < 3) {
      const updated = [...adminLinks, { label: "", url: "" }];
      setAdminLinks(updated);
      localStorage.setItem("ptm-golf-links", JSON.stringify(updated));
    }
  }

  function removeAdminLink(idx: number) {
    const updated = adminLinks.filter((_, i) => i !== idx);
    setAdminLinks(updated);
    localStorage.setItem("ptm-golf-links", JSON.stringify(updated));
  }

  function handleSave() {
    // Update each round to enable/disable joker based on games selection
    const updatedRounds = rounds.map((r) => ({
      ...r,
      jokerEnabled: (r.games || []).some((g) => g.templateId === "joker"),
      jokerBonusAppliesOverall: r.jokerBonusAppliesOverall !== false, // Preserve setting, default to true
    }));

    const config = {
      eventName: eventName || "Golf day",
      rounds: updatedRounds,
      players,
      matches,
      allowance: { stableford: Number(allowStable) || 95, matchplay: Number(allowMatch) || 100 },
      links: adminLinks,
    };
    onSave(config);
  }

  return (
    <div className="max-w-md mx-auto px-4 py-5 pb-10">
      <h2 className="font-display text-2xl mb-1" style={{ color: COLORS.green }}>
        {initialConfig ? "Edit round" : "Set up your golf days"}
      </h2>

      <input name="eventName" placeholder="Event name" value={eventName} onChange={(e) => setEventName(e.target.value)} className="w-full rounded-md px-3 py-2 text-sm mb-4" style={{ border: `1px solid ${COLORS.line}` }} />

      {!initialConfig && (
        <SectionCard title="Number of Rounds">
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                onClick={() => handleNumRoundsChange(n)}
                className="px-3 py-2 rounded-lg text-sm font-medium"
                style={{
                  backgroundColor: numRounds === n ? COLORS.green : "white",
                  color: numRounds === n ? "white" : COLORS.charcoal,
                  border: `1px solid ${COLORS.line}`,
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-xs opacity-60 mt-3">
            Competitions will calculate across all {numRounds} round{numRounds > 1 ? 's' : ''}. Each round has its own daily leaderboard.
          </p>
        </SectionCard>
      )}

      {adminLimits && (() => {
        const usedSlots = players.filter(p => p.name).length * rounds.length;
        const pct = Math.min(100, Math.round((usedSlots / adminLimits.maxSlots) * 100));
        const atLimit = usedSlots >= adminLimits.maxSlots;
        return (
          <div className="rounded-xl p-3 mb-4" style={{ backgroundColor: atLimit ? COLORS.flagPale : COLORS.goldPale, border: `1px solid ${atLimit ? COLORS.flag : COLORS.gold}` }}>
            <div className="flex justify-between text-xs mb-1.5">
              <span style={{ color: atLimit ? COLORS.flag : COLORS.charcoal }}>Event slots used</span>
              <span className="font-bold" style={{ color: atLimit ? COLORS.flag : COLORS.gold }}>{usedSlots} / {adminLimits.maxSlots === 9999 ? "∞" : adminLimits.maxSlots}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(0,0,0,0.08)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: atLimit ? COLORS.flag : COLORS.gold }} />
            </div>
            {atLimit && <p className="text-[11px] mt-1.5" style={{ color: COLORS.flag }}>Slot limit reached. Add fewer players or fewer rounds, or upgrade your key at /get-key.</p>}
          </div>
        );
      })()}
      <SectionCard title="Players" right={(() => {
        const usedSlots = players.filter(p => p.name).length * rounds.length;
        const wouldExceed = adminLimits && (usedSlots + rounds.length) > adminLimits.maxSlots;
        return (
          <button onClick={wouldExceed ? undefined : addPlayer} disabled={!!wouldExceed}
            className="text-xs flex items-center gap-1 px-2 py-1 rounded-md"
            style={{ backgroundColor: wouldExceed ? COLORS.cream : COLORS.greenPale, color: wouldExceed ? COLORS.charcoal : COLORS.green, opacity: wouldExceed ? 0.5 : 1, cursor: wouldExceed ? "not-allowed" : "pointer" }}
            title={wouldExceed ? `Adding a player would exceed your ${adminLimits!.maxSlots}-slot limit` : "Add player"}>
            <Plus size={14} /> Player
          </button>
        );
      })()}>
        <div className="flex flex-col gap-2">
          {players.length === 0 && <p className="text-sm opacity-60">No players yet.</p>}
          {players.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <input placeholder="Name" value={p.name} onChange={(e) => updatePlayer(p.id, "name", e.target.value)} className="flex-1 rounded-md px-2 py-1.5 text-sm" style={{ border: `1px solid ${COLORS.line}` }} />
              <input placeholder="GA" value={p.handicapIndex} onChange={(e) => updatePlayer(p.id, "handicapIndex", e.target.value)} className="w-16 rounded-md px-2 py-1.5 text-sm text-center" style={{ border: `1px solid ${COLORS.line}` }} />
              <button onClick={() => removePlayer(p.id)} aria-label="Remove player">
                <X size={16} style={{ color: COLORS.flag }} />
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Competitions - Event-level, configured once */}
      <div style={{ opacity: roundTab > 0 ? 0.5 : 1, pointerEvents: roundTab > 0 ? "none" : "auto" }}>
        <SectionCard title="Competitions">
          {roundTab > 0 && (
            <p className="text-xs mb-3 italic" style={{ color: COLORS.charcoal }}>
              ℹ️ Competitions are configured once for the entire event.
            </p>
          )}
          <div className="flex flex-col gap-3">
          {COMPETITIONS.map((comp) => (
            <div key={comp.id} className="rounded-lg p-2.5" style={{ backgroundColor: COLORS.cream, border: `1px solid ${COLORS.line}` }}>
              <label className="flex items-center gap-2 mb-1">
                <input type="checkbox" defaultChecked={comp.id !== "best-indexed" && comp.id !== "best-ball-teams"} style={{ accentColor: COLORS.gold }} disabled={comp.id === "stableford" || roundTab > 0} />
                <span className="text-sm font-medium" style={{ color: COLORS.charcoal }}>{comp.emoji} {comp.name}</span>
              </label>
              <p className="text-xs opacity-60 ml-6" style={{ color: COLORS.charcoal }}>{comp.description}</p>
            </div>
          ))}
          </div>
        </SectionCard>
      </div>

      {/* Best Ball Teams - Event-level, configured once */}
      <div style={{ opacity: roundTab > 0 ? 0.5 : 1, pointerEvents: roundTab > 0 ? "none" : "auto" }}>
        <SectionCard title="🤝 Best Ball Teams">
        {roundTab > 0 && (
          <p className="text-xs mb-3 italic" style={{ color: COLORS.charcoal }}>
            ℹ️ Teams are configured once and persist across all days.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {COMPETITIONS.some((c) => c.id === "best-ball-teams") && (
            <button
              onClick={() => {
                // Get all players in the round (from groups if assigned, otherwise all players)
                const allRoundPlayerIds = rounds[roundTab].groups?.flatMap((g) => g.playerIds) || [];
                const roundPlayers = allRoundPlayerIds.length > 0
                  ? allRoundPlayerIds.map((pid) => players.find((p) => p.id === pid)).filter(Boolean)
                  : players.filter((p) => p.name);
                const newTeams = generateRandomTeams(roundPlayers);
                const updatedRound = { ...rounds[roundTab], bestBallTeams: newTeams };
                setRounds(rounds.map((r) => (r.id === rounds[roundTab].id ? updatedRound : r)));
              }}
              className="w-full py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}
            >
              {rounds[roundTab]?.bestBallTeams && rounds[roundTab].bestBallTeams.length > 0 ? "Regenerate Teams" : "Generate Teams"}
            </button>
          )}
          {rounds[roundTab]?.bestBallTeams && rounds[roundTab].bestBallTeams.length > 0 && (
            <div className="rounded-lg p-3" style={{ backgroundColor: COLORS.cream, border: `1px solid ${COLORS.line}` }}>
              {rounds[roundTab].bestBallTeams.map((team, idx) => (
                <div key={idx} className="text-xs mb-1.5 py-1" style={{ color: COLORS.charcoal }}>
                  <strong>Team {idx + 1}:</strong> {team.name || team.players?.map((pid) => players.find((p) => p.id === pid)?.name || "?").join(" & ") || "—"}
                </div>
              ))}
            </div>
          )}
        </div>
        </SectionCard>
      </div>

      <div className="flex gap-1 mb-3">
        {rounds.map((r, i) => (
          <button
            key={r.id}
            onClick={() => setRoundTab(i)}
            className="flex-1 py-2 rounded-lg text-sm font-medium"
            style={{ backgroundColor: roundTab === i ? COLORS.green : "white", color: roundTab === i ? "white" : COLORS.charcoal, border: `1px solid ${COLORS.line}` }}
          >
            {r.label}
          </button>
        ))}
      </div>

      <SectionCard title="Course">
        <div className="flex flex-col gap-2">
          <input placeholder="Round label" value={round.label} onChange={(e) => updateRound("label", e.target.value)} className="rounded-md px-3 py-2 text-sm" style={{ border: `1px solid ${COLORS.line}` }} />
          <label className="flex items-center gap-2 px-1 py-1">
            <input
              type="checkbox"
              checked={!round.excludeFromOverall}
              onChange={(e) => updateRound("excludeFromOverall", !e.target.checked)}
              style={{ accentColor: COLORS.green }}
            />
            <span className="text-sm" style={{ color: COLORS.charcoal }}>Include in Overall scores & competitions</span>
          </label>
          {round.excludeFromOverall && (
            <p className="text-xs px-1" style={{ color: COLORS.flag }}>⚠️ This round's scores won't count toward Overall — daily games still operate.</p>
          )}
          <input placeholder="Course name" value={round.course.name} onChange={(e) => updateCourse("name", e.target.value)} className="w-full rounded-md px-3 py-2 text-sm" style={{ border: `1px solid ${COLORS.line}` }} />
          {rounds.filter((r, i) => i !== roundTab && r.course.name).length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const src = rounds.find(r => r.id === e.target.value);
                if (!src) return;
                setRounds(rs => rs.map((r, i) => i !== roundTab ? r : {
                  ...r,
                  course: {
                    ...r.course,
                    name: src.course.name,
                    slope: src.course.slope,
                    rating: src.course.rating,
                    holes: src.course.holes.map(h => ({ ...h })),
                    primaryTeeLabel: src.course.primaryTeeLabel,
                    primaryTeeColour: src.course.primaryTeeColour,
                    tees: (src.course.tees || []).map(t => ({ ...t, id: uid(), holes: t.holes.map(h => ({ ...h })) })),
                  },
                  // Copy group structure (names + tee times) but clear player assignments
                  groups: src.groups.map(g => ({ ...g, id: uid(), playerIds: [] })),
                  playerTees: {},
                }));
              }}
              className="w-full rounded-md px-3 py-2 text-sm"
              style={{ border: `1px solid ${COLORS.line}`, color: COLORS.charcoal }}
            >
              <option value="">⬡ Copy course &amp; groups from…</option>
              {rounds.filter((r, i) => i !== roundTab && r.course.name).map(r => (
                <option key={r.id} value={r.id}>{r.label}: {r.course.name}</option>
              ))}
            </select>
          )}
        </div>
      </SectionCard>

      {/* Primary tee — slope, rating, holes */}
      {(() => {
        const primaryColour = TEE_COLOURS.find(c => c.id === (round.course.primaryTeeColour || "white")) || TEE_COLOURS[0];
        const primaryLabel = round.course.primaryTeeLabel || "White";
        return (
          <SectionCard title={
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full border border-black/10" style={{ backgroundColor: primaryColour.hex }} />
              {primaryLabel} Tees (par {totalPar})
            </span>
          }>
            {/* Primary tee label + colour */}
            <div className="flex gap-2 mb-3">
              <input
                placeholder="Tee label (e.g. White)"
                value={primaryLabel}
                onChange={(e) => updateCourse("primaryTeeLabel", e.target.value)}
                className="flex-1 rounded-md px-2 py-1.5 text-sm"
                style={{ border: `1px solid ${COLORS.line}` }}
              />
              <div className="flex gap-1">
                {TEE_COLOURS.map(c => (
                  <button key={c.id} title={c.label}
                    onClick={() => {
                      updateCourse("primaryTeeColour", c.id);
                      // Auto-update label if it currently matches any colour name or is empty
                      const currentLabel = round.course.primaryTeeLabel || "";
                      if (!currentLabel || TEE_COLOURS.some(tc => tc.label === currentLabel)) {
                        updateCourse("primaryTeeLabel", c.label);
                      }
                    }}
                    className="w-6 h-6 rounded-full border-2 flex-shrink-0"
                    style={{ backgroundColor: c.hex, borderColor: (round.course.primaryTeeColour || "white") === c.id ? COLORS.green : "transparent" }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-3 mb-3">
              <label className="flex-1 text-xs" style={{ color: COLORS.charcoal }}>
                Slope
                <NumField w="w-full" value={round.course.slope} onChange={(v) => updateCourse("slope", Number(v) || 113)} min={55} max={155} />
              </label>
              <label className="flex-1 text-xs" style={{ color: COLORS.charcoal }}>
                Course rating
                <NumField w="w-full" value={round.course.rating} onChange={(v) => updateCourse("rating", v === "" ? 70 : Number(v))} min={60} max={80} step={0.1} />
              </label>
            </div>
            <div className="grid gap-1.5">
              <div className="grid grid-cols-4 gap-1 text-[11px] font-medium px-1" style={{ color: COLORS.charcoal, opacity: 0.6 }}>
                <span>Hole</span><span>Par</span><span>SI</span><span>Dist</span>
              </div>
              {round.course.holes.map((h, i) => (
                <div key={h.number} className="grid grid-cols-4 gap-1 items-center">
                  <span className="text-sm font-medium" style={{ color: COLORS.green }}>{h.number}</span>
                  <NumField w="w-full" value={h.par} onChange={(v) => updateHole(i, "par", v)} min={3} max={6} />
                  <NumField w="w-full" value={h.si} onChange={(v) => updateHole(i, "si", v)} min={1} max={18} />
                  <NumField w="w-full" value={h.distance} onChange={(v) => updateHole(i, "distance", v)} />
                </div>
              ))}
            </div>
          </SectionCard>
        );
      })()}

      {/* Additional tees */}
      {(round.course.tees || []).map((tee) => {
        const teeColour = TEE_COLOURS.find(c => c.id === tee.colour) || TEE_COLOURS[2];
        const teePar = tee.holes.reduce((s, h) => s + Number(h.par || 0), 0);
        return (
          <SectionCard key={tee.id} title={
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full border border-black/10" style={{ backgroundColor: teeColour.hex }} />
              {tee.label} Tees (par {teePar})
            </span>
          } right={
            <button onClick={() => removeExtraTee(tee.id)} className="p-1 rounded" aria-label="Remove tee">
              <X size={15} style={{ color: COLORS.flag }} />
            </button>
          }>
            <div className="flex gap-2 mb-3">
              <input
                placeholder="Tee label"
                value={tee.label}
                onChange={(e) => updateExtraTee(tee.id, "label", e.target.value)}
                className="flex-1 rounded-md px-2 py-1.5 text-sm"
                style={{ border: `1px solid ${COLORS.line}` }}
              />
              <div className="flex gap-1">
                {TEE_COLOURS.map(c => (
                  <button key={c.id} title={c.label}
                    onClick={() => {
                      updateExtraTee(tee.id, "colour", c.id);
                      if (!tee.label || TEE_COLOURS.some(tc => tc.label === tee.label)) {
                        updateExtraTee(tee.id, "label", c.label);
                      }
                    }}
                    className="w-6 h-6 rounded-full border-2 flex-shrink-0"
                    style={{ backgroundColor: c.hex, borderColor: tee.colour === c.id ? COLORS.green : "transparent" }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-3 mb-3">
              <label className="flex-1 text-xs" style={{ color: COLORS.charcoal }}>
                Slope
                <NumField w="w-full" value={tee.slope} onChange={(v) => updateExtraTee(tee.id, "slope", Number(v) || 113)} min={55} max={155} />
              </label>
              <label className="flex-1 text-xs" style={{ color: COLORS.charcoal }}>
                Course rating
                <NumField w="w-full" value={tee.rating} onChange={(v) => updateExtraTee(tee.id, "rating", v === "" ? 70 : Number(v))} min={60} max={80} step={0.1} />
              </label>
            </div>
            <div className="grid gap-1.5">
              <div className="grid grid-cols-4 gap-1 text-[11px] font-medium px-1" style={{ color: COLORS.charcoal, opacity: 0.6 }}>
                <span>Hole</span><span>Par</span><span>SI</span><span>Dist</span>
              </div>
              {tee.holes.map((h, i) => (
                <div key={h.number} className="grid grid-cols-4 gap-1 items-center">
                  <span className="text-sm font-medium" style={{ color: COLORS.green }}>{h.number}</span>
                  <NumField w="w-full" value={h.par} onChange={(v) => updateExtraTeeHole(tee.id, i, "par", v)} min={3} max={6} />
                  <NumField w="w-full" value={h.si} onChange={(v) => updateExtraTeeHole(tee.id, i, "si", v)} min={1} max={18} />
                  <NumField w="w-full" value={h.distance} onChange={(v) => updateExtraTeeHole(tee.id, i, "distance", v)} />
                </div>
              ))}
            </div>
          </SectionCard>
        );
      })}

      {/* Add Tee button — only if < 2 additional tees */}
      {(round.course.tees || []).length < 2 && (
        <button
          onClick={addExtraTee}
          className="w-full py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
          style={{ border: `2px dashed ${COLORS.line}`, color: COLORS.charcoal, backgroundColor: "transparent" }}
        >
          <Plus size={16} /> Add Tee Marker
        </button>
      )}

      <SectionCard title={`Groups — ${round.label}`} right={<button onClick={addGroup} className="text-xs flex items-center gap-1 px-2 py-1 rounded-md" style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}><Plus size={14} /> Group</button>}>
        {/* Group assignment mode */}
        <div className="flex gap-1 mb-3">
          {(["manual","random","ascending"] as const).map(m => (
            <button key={m} onClick={() => setGroupMode(m)}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium capitalize"
              style={{ backgroundColor: groupMode === m ? COLORS.green : "white", color: groupMode === m ? "white" : COLORS.charcoal, border: `1px solid ${COLORS.line}` }}>
              {m === "ascending" ? "By Score" : m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        {groupMode !== "manual" && (
          <button
            onClick={() => autoAssignGroups(groupMode as "random"|"ascending")}
            disabled={groupMode === "ascending" && !hasExistingScores}
            className="w-full py-2 rounded-lg text-sm font-medium mb-3"
            style={{ backgroundColor: (groupMode === "ascending" && !hasExistingScores) ? COLORS.cream : COLORS.goldPale, color: (groupMode === "ascending" && !hasExistingScores) ? COLORS.charcoal : COLORS.gold, opacity: (groupMode === "ascending" && !hasExistingScores) ? 0.6 : 1 }}
          >
            {groupMode === "ascending" && !hasExistingScores
              ? "By Score — no scores recorded yet"
              : `↻ Auto-assign (${groupMode === "random" ? "Random" : "By Overall Score"})`}
          </button>
        )}
        <div className="flex flex-col gap-2 mb-3">
          {round.groups.map((g) => (
            <div key={g.id} className="flex items-center gap-2">
              <input value={g.name} onChange={(e) => renameGroup(g.id, e.target.value)} placeholder="Group name" className="flex-1 rounded-md px-2 py-1.5 text-sm" style={{ border: `1px solid ${COLORS.line}` }} />
              <input type="time" value={g.teeTime || ""} onChange={(e) => setRounds((rs) => rs.map((r) => r.id === round.id ? { ...r, groups: r.groups.map((gg) => gg.id === g.id ? { ...gg, teeTime: e.target.value } : gg) } : r))} className="w-24 rounded-md px-2 py-1.5 text-sm" style={{ border: `1px solid ${COLORS.line}` }} />
              <span className="text-xs opacity-60 whitespace-nowrap">{g.playerIds.length}p</span>
              {round.groups.length > 1 && (
                <button onClick={() => removeGroup(g.id)} aria-label="Remove group">
                  <X size={16} style={{ color: COLORS.flag }} />
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs font-medium mb-1.5" style={{ color: COLORS.charcoal }}>Assign players</p>
        <div className="flex flex-col gap-2">
          {players.filter((p) => p.name).map((p) => {
            const hasExtraTees = (round.course.tees || []).length > 0;
            const assignedTeeId = round.playerTees?.[p.id] || "";
            const assignedTeeColour = assignedTeeId
              ? TEE_COLOURS.find(c => c.id === (round.course.tees || []).find(t => t.id === assignedTeeId)?.colour)
              : TEE_COLOURS.find(c => c.id === (round.course.primaryTeeColour || "white"));
            return (
              <div key={p.id} className="flex items-center gap-2">
                {hasExtraTees && (
                  <span className="inline-block w-3 h-3 rounded-full flex-shrink-0 border border-black/10"
                    style={{ backgroundColor: assignedTeeColour?.hex || "#F0EFE9" }} />
                )}
                <span className="flex-1 text-sm" style={{ color: COLORS.charcoal }}>{p.name}</span>
                {hasExtraTees && (
                  <select
                    value={assignedTeeId}
                    onChange={(e) => setPlayerTee(p.id, e.target.value)}
                    className="rounded-md px-1 py-1.5 text-xs"
                    style={{ border: `1px solid ${COLORS.line}` }}
                  >
                    <option value="">{round.course.primaryTeeLabel || "White"}</option>
                    {(round.course.tees || []).map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                )}
                <select value={round.groups.find((g) => g.playerIds.includes(p.id))?.id || ""} onChange={(e) => setPlayerGroup(p.id, e.target.value)} className="rounded-md px-1 py-1.5 text-xs" style={{ border: `1px solid ${COLORS.line}` }}>
                  <option value="">—</option>
                  {round.groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title={`Games — ${round.label}`}>
          <div className="flex flex-col gap-3">
          {GAME_TEMPLATES.map((t) => {
            const activeTemplates = getActiveTemplates();
            const active = !!activeTemplates[t.templateId];
            const selectedHoles = activeTemplates[t.templateId]?.holes || [];
            const isHoleGame = ["long-drive", "ctp", "long-putt"].includes(t.templateId);
            const isJoker = t.templateId === "joker";
            return (
              <div key={t.templateId}>
                <div className="rounded-lg p-2.5" style={{ backgroundColor: active ? COLORS.goldPale : COLORS.cream, border: `1px solid ${active ? COLORS.gold : COLORS.line}` }}>
                  <button onClick={() => toggleTemplate(t)} className="flex items-center gap-2 flex-1 text-left w-full">
                    <span className="text-lg">{t.emoji}</span>
                    <span>
                      <span className="text-sm font-medium block" style={{ color: COLORS.charcoal }}>{t.name}</span>
                      <span className="text-[11px] opacity-60 block">{t.description}</span>
                    </span>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: active ? COLORS.gold : "white", border: `1px solid ${COLORS.line}` }}>
                      {active && <Check size={14} color="white" />}
                    </div>
                  </button>
                </div>
                {active && isHoleGame && !isJoker && (
                  <div className="mt-2 p-2 rounded-lg" style={{ backgroundColor: COLORS.cream, border: `1px solid ${COLORS.line}` }}>
                    <p className="text-xs font-medium mb-1.5" style={{ color: COLORS.charcoal }}>Select hole(s):</p>
                    <div className="grid grid-cols-9 gap-1">
                      {round.course.holes.map((h) => (
                        <button
                          key={h.number}
                          onClick={() => {
                            const holes = selectedHoles.includes(h.number)
                              ? selectedHoles.filter((n) => n !== h.number)
                              : [...selectedHoles, h.number].sort((a, b) => a - b);
                            updateGameHoles(t.templateId, holes);
                          }}
                          className="aspect-square rounded text-xs font-medium"
                          style={{
                            backgroundColor: selectedHoles.includes(h.number) ? COLORS.gold : "white",
                            color: selectedHoles.includes(h.number) ? "white" : COLORS.charcoal,
                            border: `1px solid ${COLORS.line}`,
                          }}
                        >
                          {h.number}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {active && isJoker && (
                  <div className="mt-2 p-3 rounded-lg" style={{ backgroundColor: COLORS.flagPale, border: `1px solid ${COLORS.flag}` }}>
                    <p className="text-xs font-medium mb-2.5" style={{ color: COLORS.flag }}>⭐ Joker Bonus Applies To:</p>
                    <label className="flex items-center gap-2 text-sm mb-2" style={{ color: COLORS.charcoal }}>
                      <input
                        type="radio"
                        name={`jokerScope-${round.id}`}
                        value="both"
                        checked={round.jokerBonusAppliesOverall !== false}
                        onChange={() => updateRound("jokerBonusAppliesOverall", true)}
                        style={{ accentColor: COLORS.flag }}
                      />
                      <span><strong>Option A:</strong> Daily & Overall Totals</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm" style={{ color: COLORS.charcoal }}>
                      <input
                        type="radio"
                        name={`jokerScope-${round.id}`}
                        value="daily"
                        checked={round.jokerBonusAppliesOverall === false}
                        onChange={() => updateRound("jokerBonusAppliesOverall", false)}
                        style={{ accentColor: COLORS.flag }}
                      />
                      <span><strong>Option B:</strong> Daily Leaderboard Only</span>
                    </label>
                    <p className="text-xs mt-2.5 opacity-70" style={{ color: COLORS.charcoal }}>
                      Option A: Joker points count toward both day and tournament totals<br/>
                      Option B: Joker points only count toward daily score
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {/* Hardest & Highest option */}
          <div className="rounded-lg p-2.5" style={{ backgroundColor: round.games?.some((g) => g.templateId === "hardest-daily") ? COLORS.greenPale : COLORS.cream, border: `1px solid ${round.games?.some((g) => g.templateId === "hardest-daily") ? COLORS.green : COLORS.line}` }}>
            <button
              onClick={() => {
                const hasHardest = round.games?.some((g) => g.templateId === "hardest-daily");
                const newGames = hasHardest
                  ? (round.games || []).filter((g) => g.templateId !== "hardest-daily")
                  : [...(round.games || []), { id: uid(), templateId: "hardest-daily", name: "Hardest & Highest (Daily)", emoji: "🏆", description: "Daily best score on your 6 hardest holes" }];
                updateRound("games", newGames);
              }}
              className="flex items-center gap-2 w-full"
            >
              <span className="text-lg">🏆</span>
              <span className="flex-1 text-left">
                <span className="text-sm font-medium block" style={{ color: COLORS.charcoal }}>Hardest & Highest (Daily)</span>
                <span className="text-[11px] opacity-60 block">Best score on 6 hardest holes each day</span>
              </span>
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: round.games?.some((g) => g.templateId === "hardest-daily") ? COLORS.green : "white", border: `1px solid ${COLORS.line}` }}>
                {round.games?.some((g) => g.templateId === "hardest-daily") && <Check size={14} color="white" />}
              </div>
            </button>
          </div>

          {/* Best Ball Teams option */}
          <div className="rounded-lg p-2.5" style={{ backgroundColor: round.games?.some((g) => g.templateId === "bestball-daily") ? COLORS.greenPale : COLORS.cream, border: `1px solid ${round.games?.some((g) => g.templateId === "bestball-daily") ? COLORS.green : COLORS.line}` }}>
            <button
              onClick={() => {
                const hasBestBall = round.games?.some((g) => g.templateId === "bestball-daily");
                let newGames = hasBestBall
                  ? (round.games || []).filter((g) => g.templateId !== "bestball-daily")
                  : [...(round.games || []), { id: uid(), templateId: "bestball-daily", name: "Best Ball Teams (Daily)", emoji: "👥", description: "Best score from each pair" }];

                if (!hasBestBall && round.groups) {
                  const dayPlayers = round.groups.flatMap((g) => g.playerIds).map((pid) => players.find((p) => p.id === pid)).filter(Boolean);
                  const defaultTeams = rounds[0]?.bestBallTeams && rounds[0].bestBallTeams.length > 0
                    ? rounds[0].bestBallTeams
                    : generateRandomTeams(dayPlayers);
                  updateRound("games", newGames);
                  updateRound("dailyBestBallTeams", defaultTeams);
                } else {
                  updateRound("games", newGames);
                  updateRound("dailyBestBallTeams", null);
                }
              }}
              className="flex items-center gap-2 w-full"
            >
              <span className="text-lg">👥</span>
              <span className="flex-1 text-left">
                <span className="text-sm font-medium block" style={{ color: COLORS.charcoal }}>Best Ball Teams (Daily)</span>
                <span className="text-[11px] opacity-60 block">Randomly paired teams just for this day</span>
              </span>
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: round.games?.some((g) => g.templateId === "bestball-daily") ? COLORS.green : "white", border: `1px solid ${COLORS.line}` }}>
                {round.games?.some((g) => g.templateId === "bestball-daily") && <Check size={14} color="white" />}
              </div>
            </button>
            {round.games?.some((g) => g.templateId === "bestball-daily") && (
              <>
                {round.dailyBestBallTeams && round.dailyBestBallTeams.length > 0 && (
                  <div className="mt-2 p-2 rounded-lg" style={{ backgroundColor: COLORS.cream, border: `1px solid ${COLORS.line}` }}>
                    <p className="text-xs font-medium mb-2" style={{ color: COLORS.charcoal }}>Daily Teams:</p>
                    {round.dailyBestBallTeams.map((team, idx) => (
                      <div key={idx} className="text-xs mb-1" style={{ color: COLORS.charcoal }}>
                        <strong>Team {idx + 1}:</strong> {team.players?.map((pid) => players.find((p) => p.id === pid)?.name || "?").join(" & ") || "—"}
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => {
                    // Get all players in the round (from all groups)
                    const allRoundPlayerIds = round.groups?.flatMap((g) => g.playerIds) || [];
                    const dayPlayers = allRoundPlayerIds
                      .map((pid) => players.find((p) => p.id === pid))
                      .filter(Boolean);

                    if (dayPlayers.length > 0) {
                      const newTeams = generateRandomTeams(dayPlayers);
                      updateRound("dailyBestBallTeams", newTeams);
                    } else {
                      // Fallback: use all players if no groups found
                      const newTeams = generateRandomTeams(players.filter((p) => p.name));
                      updateRound("dailyBestBallTeams", newTeams);
                    }
                  }}
                  className="mt-2 w-full py-2 rounded-lg text-xs font-medium"
                  style={{ backgroundColor: COLORS.goldPale, color: COLORS.gold }}
                >
                  Regenerate Daily Teams
                </button>
              </>
            )}
          </div>

          {/* Skins Daily Game option */}
          <div className="rounded-lg p-2.5" style={{ backgroundColor: round.games?.some((g) => g.templateId === "skins-daily") ? COLORS.greenPale : COLORS.cream, border: `1px solid ${round.games?.some((g) => g.templateId === "skins-daily") ? COLORS.green : COLORS.line}` }}>
            <button
              onClick={() => {
                const hasSkins = round.games?.some((g) => g.templateId === "skins-daily");
                const newGames = hasSkins
                  ? (round.games || []).filter((g) => g.templateId !== "skins-daily")
                  : [...(round.games || []), { id: uid(), templateId: "skins-daily", name: "Skins (Daily)", emoji: "💰", description: "Win skins by having the best score on each hole", carryOverUnawarded: true }];
                updateRound("games", newGames);

                // If enabling Skins with carry-over, auto-enable on next day too
                if (!hasSkins && roundTab < rounds.length - 1) {
                  const nextRound = rounds[roundTab + 1];
                  if (nextRound && !nextRound.games?.some((g) => g.templateId === "skins-daily")) {
                    const nextGames = [...(nextRound.games || []), { id: uid(), templateId: "skins-daily", name: "Skins (Daily)", emoji: "💰", description: "Win skins by having the best score on each hole", carryOverUnawarded: true }];
                    setRounds(rounds.map((r, i) => i === roundTab + 1 ? { ...r, games: nextGames } : r));
                  }
                }
              }}
              className="flex items-center gap-2 w-full"
            >
              <span className="text-lg">💰</span>
              <span className="flex-1 text-left">
                <span className="text-sm font-medium block" style={{ color: COLORS.charcoal }}>Skins (Daily)</span>
                <span className="text-[11px] opacity-60 block">Best score on each hole. Ties carry over to next hole</span>
              </span>
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: round.games?.some((g) => g.templateId === "skins-daily") ? COLORS.green : "white", border: `1px solid ${COLORS.line}` }}>
                {round.games?.some((g) => g.templateId === "skins-daily") && <Check size={14} color="white" />}
              </div>
            </button>
            {round.games?.some((g) => g.templateId === "skins-daily") && (
              <div className="mt-2 p-3 rounded-lg" style={{ backgroundColor: COLORS.greenPale, border: `1px solid ${COLORS.green}` }}>
                <label className="flex items-center gap-2 text-sm" style={{ color: COLORS.charcoal }}>
                  <input
                    type="checkbox"
                    checked={round.games?.find((g) => g.templateId === "skins-daily")?.carryOverUnawarded !== false}
                    onChange={(e) => {
                      const skinsGame = round.games?.find((g) => g.templateId === "skins-daily");
                      if (skinsGame) {
                        const updatedGame = { ...skinsGame, carryOverUnawarded: e.target.checked };
                        const newGames = round.games?.map((g) => g.templateId === "skins-daily" ? updatedGame : g);
                        updateRound("games", newGames);
                      }
                    }}
                    style={{ accentColor: COLORS.green }}
                  />
                  <span><strong>{roundTab < rounds.length - 1 ? "Carry unawarded skins to next day" : "N/A (last day)"}</strong></span>
                </label>
                {roundTab === rounds.length - 1 && (
                  <p className="text-xs mt-2 opacity-70" style={{ color: COLORS.charcoal }}>
                    This is the final day, so unawarded skins cannot carry over
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        </SectionCard>

      {isAdmin && (
        <SectionCard title="Admin Settings">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: COLORS.charcoal }}>Logo (emoji or image)</p>
              <div className="flex gap-2">
                <div className="text-4xl">{adminLogo}</div>
                <button
                  onClick={() => logoInputRef.current?.click()}
                  className="flex-1 py-2 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}
                >
                  Change
                </button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  style={{ display: "none" }}
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium mb-2" style={{ color: COLORS.charcoal }}>
                Useful Links (up to 3)
              </p>
              <div className="flex flex-col gap-2">
                {adminLinks.map((link, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Link name"
                      value={link.label}
                      onChange={(e) => updateAdminLink(idx, "label", e.target.value)}
                      className="flex-1 px-2 py-1.5 text-sm rounded-lg"
                      style={{ border: `1px solid ${COLORS.line}` }}
                    />
                    <input
                      type="text"
                      placeholder="URL"
                      value={link.url}
                      onChange={(e) => updateAdminLink(idx, "url", e.target.value)}
                      className="flex-1 px-2 py-1.5 text-sm rounded-lg"
                      style={{ border: `1px solid ${COLORS.line}` }}
                    />
                    <button
                      onClick={() => removeAdminLink(idx)}
                      className="w-10 h-10 flex items-center justify-center rounded-lg"
                      style={{ backgroundColor: COLORS.flagPale, color: COLORS.flag }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {adminLinks.length < 3 && (
                  <button
                    onClick={addAdminLink}
                    className="py-2 rounded-lg text-sm font-medium"
                    style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}
                  >
                    + Add Link
                  </button>
                )}
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      <div className="flex gap-2 mt-4 mb-4">
        <button onClick={exportConfig} className="flex-1 py-2.5 rounded-lg font-medium text-sm" style={{ backgroundColor: COLORS.goldPale, color: COLORS.gold }}>
          📥 Export
        </button>
        <button onClick={importConfig} className="flex-1 py-2.5 rounded-lg font-medium text-sm" style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}>
          📤 Import
        </button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileUpload} style={{ display: "none" }} />
      </div>

      <div className="flex gap-2">
        {onCancel && (
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl font-medium text-sm" style={{ backgroundColor: "white", border: `1px solid ${COLORS.line}`, color: COLORS.charcoal }}>
            Cancel
          </button>
        )}
        <button onClick={handleSave} className="flex-1 py-3 rounded-xl font-medium text-sm" style={{ backgroundColor: COLORS.green, color: "white" }}>
          {initialConfig ? "Save changes" : "Save Event"}
        </button>
      </div>
    </div>
  );
}

// JoinScreen Component
function JoinScreen({ config, round, onJoin, onEdit, onReset }) {
  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <div className="text-center mb-6">
        <Flag size={28} style={{ color: COLORS.green }} className="mx-auto mb-2" />
        <h2 className="font-display text-2xl" style={{ color: COLORS.green }}>{config.eventName}</h2>
        <p className="text-sm opacity-60">
          {config.rounds.map((r) => `${r.label}: ${r.course.name || "TBC"}`).join("  ·  ")}
        </p>
      </div>
      <p className="text-sm font-medium mb-2" style={{ color: COLORS.charcoal }}>Which {round.label} group are you?</p>
      <div className="flex flex-col gap-2 mb-6">
        {round.groups.map((g) => {
          const names = g.playerIds.map((id) => config.players.find((p) => p.id === id)?.name).filter(Boolean);
          return (
            <button key={g.id} onClick={() => onJoin(g.id)} className="text-left rounded-xl p-4" style={{ backgroundColor: "white", border: `1px solid ${COLORS.line}` }}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium" style={{ color: COLORS.green }}>{g.name}</span>
                <ChevronRight size={18} style={{ color: COLORS.green }} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs opacity-60">{names.length ? names.join(", ") : "No players"}</p>
                {g.teeTime && <span className="text-xs font-medium" style={{ color: COLORS.gold }}>🕐 {g.teeTime}</span>}
              </div>
            </button>
          );
        })}
      </div>
      <button onClick={onEdit} className="w-full py-2.5 rounded-xl text-sm font-medium mb-2" style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}>
        Edit round
      </button>
      <button onClick={onReset} className="w-full py-2 rounded-xl text-xs" style={{ color: COLORS.flag }}>
        New event
      </button>
    </div>
  );
}

// End of Day Processing Screen
function EndOfDayProcessing({ config, dayOneRound, dayTwoRound, allScores, allScoresByRound: propAllScoresByRound = {}, currentScores, gameEntriesData, onComplete, onBack }) {
  const [gameWinners, setGameWinners] = useState({});
  const [manualGroupAssignments, setManualGroupAssignments] = useState<any>({});
  const [groupMode, setGroupMode] = useState<"ascending"|"random"|"manual">("ascending");
  const [baseGroups, setBaseGroups] = useState<any[] | null>(null);
  const allowance = config.allowance.stableford;
  const gameEntries = gameEntriesData || [];
  const teams = dayOneRound.bestBallTeams || [];

  function computeBaseGroups(mode: "ascending"|"random"|"manual"): any[] | null {
    if (!dayTwoRound) return null;
    const allPlayers = config.players.filter(p => p.name);
    if (mode === "ascending") {
      const ranked = allPlayers.map(p => {
        let total = 0;
        config.rounds.filter(r => !r.excludeFromOverall).forEach(r => {
          const group = getPlayerGroup(r, p.id);
          let so: any = null;
          if (r.id === dayOneRound.id) {
            so = group ? (allScores?.[group.id] || null) : null;
            if (currentScores?.playerScores) {
              so = so ? { ...so, playerScores: { ...so.playerScores, ...currentScores.playerScores } } : currentScores;
            }
          } else {
            const preserved = propAllScoresByRound[`${r.id}_preserved`];
            so = preserved || (group ? propAllScoresByRound[r.id]?.[group.id] : null) || null;
          }
          if (so) {
            const stats = computePlayerRoundStats(r, p, allowance, so);
            total += r.jokerBonusAppliesOverall !== false ? stats.dayTotal : stats.raw;
          }
        });
        return { player: p, total };
      }).sort((a, b) => a.total - b.total);
      return buildGroupsFromOrderedPlayers(ranked.map(r => r.player.id), dayTwoRound.groups);
    } else if (mode === "random") {
      const shuffled = [...allPlayers.map(p => p.id)].sort(() => Math.random() - 0.5);
      return buildGroupsFromOrderedPlayers(shuffled, dayTwoRound.groups);
    } else {
      return dayTwoRound.groups;
    }
  }

  // Recompute ascending groups whenever score data arrives (handles async Firebase load)
  const allScoresCount = Object.keys(allScores).length + Object.keys(propAllScoresByRound).length;
  useEffect(() => {
    if (dayTwoRound && groupMode === "ascending") {
      setBaseGroups(computeBaseGroups("ascending"));
    }
  }, [allScoresCount]); // eslint-disable-line

  function handleModeChange(mode: "ascending"|"random"|"manual") {
    setGroupMode(mode);
    setBaseGroups(computeBaseGroups(mode));
    setManualGroupAssignments({});
  }

  // Get Day 1 leaderboard
  const leaderboard = config.players
    .filter((p) => p.name)
    .map((p) => {
      const group = getPlayerGroup(dayOneRound, p.id);
      // Try to use allScores from Firebase, fallback to current scores
      let scoreObj = null;
      if (group && allScores && allScores[group.id]) {
        scoreObj = allScores[group.id];
      } else if (group && currentScores && currentScores.playerScores) {
        scoreObj = currentScores;
      }
      const stats = computePlayerRoundStats(dayOneRound, p, allowance, scoreObj);
      return { player: p, ...stats };
    })
    .sort((a, b) => b.raw - a.raw);

  // Get on-course games - any game with holes configured
  const dailyGameIds = ["sandy-saver", "snake", "joker"];
  const onCourseGames = dayOneRound.games?.filter((g) => !dailyGameIds.includes(g.templateId) && g.holes && Array.isArray(g.holes) && g.holes.length > 0) || [];


  const handleComplete = () => {
    let newDay2Round = null;

    if (dayTwoRound) {
      const groups = baseGroups || dayTwoRound.groups;
      let finalGroups = groups;
      if (Object.keys(manualGroupAssignments).length > 0) {
        const updatedGroups = groups.map((group) => ({
          ...group,
          playerIds: group.playerIds.filter((pid) => !manualGroupAssignments[pid]),
        }));
        Object.entries(manualGroupAssignments).forEach(([playerId, groupId]: [string, any]) => {
          const targetGroup = updatedGroups.find((g) => g.id === groupId);
          if (targetGroup && !targetGroup.playerIds.includes(playerId)) {
            targetGroup.playerIds.push(playerId);
          }
        });
        finalGroups = updatedGroups;
      }
      newDay2Round = { ...dayTwoRound, groups: finalGroups };
    }

    onComplete({ gameWinners, dayTwoTeams: teams, dayTwoRound: newDay2Round });
  };

  // Compute final groups applying any manual overrides on top of base groups
  const finalGroups = (() => {
    const groups = baseGroups || [];
    if (!groups.length) return groups;
    const updated = groups.map(g => ({ ...g, playerIds: [...g.playerIds.filter(pid => !manualGroupAssignments[pid])] }));
    Object.entries(manualGroupAssignments).forEach(([pid, gid]: [string, any]) => {
      const tg = updated.find(g => g.id === gid);
      if (tg && !tg.playerIds.includes(pid)) tg.playerIds.push(pid);
    });
    return updated;
  })();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl" style={{ color: COLORS.green }}>{dayOneRound.label} Summary{dayTwoRound ? ` & ${dayTwoRound.label} Setup` : ""}</h2>
        <button
          onClick={onBack || (() => window.history.back())}
          className="p-2 rounded-lg hover:bg-gray-100"
          title="Return to board"
        >
          <ChevronLeft size={24} style={{ color: COLORS.charcoal }} />
        </button>
      </div>

      {/* Day Results */}
      <div className="rounded-xl overflow-hidden border mb-6" style={{ borderColor: COLORS.line }}>
        <div className="bg-white p-4" style={{ backgroundColor: COLORS.goldPale }}>
          <h3 className="font-medium" style={{ color: COLORS.gold }}>📊 Day Results</h3>
        </div>
        <div className="bg-white p-4 space-y-3">
          {/* Sandy Saves */}
          {(() => {
            const sandySaves: { [key: string]: number } = {};
            gameEntries.forEach((e: any) => {
              if (e.gameId === "sandy" && e.save) {
                if (!sandySaves[e.playerId]) sandySaves[e.playerId] = 0;
                sandySaves[e.playerId]++;
              }
            });

            const hasSandies = Object.values(sandySaves).some((v: any) => v > 0);
            if (hasSandies) {
              return (
                <div>
                  <p className="text-xs font-medium mb-2" style={{ color: COLORS.charcoal }}>🏜️ Sandy Saves</p>
                  <div className="flex flex-wrap gap-2">
                    {config.players
                      .filter((p) => (sandySaves[p.id] || 0) > 0)
                      .sort((a, b) => (sandySaves[b.id] || 0) - (sandySaves[a.id] || 0))
                      .map((p) => (
                        <span key={p.id} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}>
                          {p.name}: {sandySaves[p.id]}
                        </span>
                      ))}
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {/* Last 3-Putter */}
          {(() => {
            const snakeEntries = (gameEntries as any[]).filter((e: any) => e.gameId === "snake" && e.threePutts);
            if (snakeEntries.length === 0) return null;

            const lastSnakeEntry = snakeEntries.reduce((latest: any, current: any) => {
              return !latest || (current.hole > latest.hole) ? current : latest;
            });

            const lastSnaker = config.players.find((p) => p.id === lastSnakeEntry.playerId);
            return (
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: COLORS.charcoal }}>🐍 Current Snake Holder</p>
                <div className="p-2 rounded text-sm" style={{ backgroundColor: COLORS.flagPale }}>
                  <span className="font-medium" style={{ color: COLORS.flag }}>{lastSnaker?.name}</span>
                  <span className="text-xs opacity-70 ml-2">(3-putted on hole {lastSnakeEntry.hole})</span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Day 1 Leaderboard */}
      <div className="rounded-xl overflow-hidden border mb-6" style={{ borderColor: COLORS.line }}>
        <div className="bg-white p-4" style={{ backgroundColor: COLORS.greenPale }}>
          <h3 className="font-medium" style={{ color: COLORS.green }}>{dayOneRound.label} Leaderboard</h3>
        </div>
        <div className="bg-white divide-y" style={{ borderColor: COLORS.line }}>
          {leaderboard.map((entry, idx) => (
            <div key={entry.player.id} className="p-3 flex items-center justify-between text-sm">
              <div>
                <span className="font-medium">{idx + 1}. {entry.player.name}</span>
                <span className="text-xs opacity-60 ml-2">{entry.gross} strokes</span>
              </div>
              <span className="font-medium" style={{ color: COLORS.gold }}>{entry.raw} pts</span>
            </div>
          ))}
        </div>
      </div>


      {/* On-Course Game Winners */}
      {onCourseGames.length > 0 && (
        <div className="rounded-xl p-4 mb-6 bg-white border" style={{ borderColor: COLORS.line }}>
          <h3 className="font-medium mb-4" style={{ color: COLORS.green }}>⛳ On-Course Game Winners</h3>
          <div className="space-y-4">
            {onCourseGames.map((game) => (
              <div key={game.id}>
                <label className="text-sm font-medium block mb-2">{game.emoji} {game.name}</label>
                {game.holes && game.holes.length > 1 ? (
                  <div className="space-y-2 pl-2">
                    {game.holes.map((holeNum) => (
                      <div key={holeNum} className="flex items-center gap-2">
                        <span className="text-sm w-16 shrink-0" style={{ color: COLORS.charcoal }}>Hole {holeNum}:</span>
                        <select
                          value={gameWinners[`oncourse-${game.templateId}-hole-${holeNum}`] || ""}
                          onChange={(e) => setGameWinners({ ...gameWinners, [`oncourse-${game.templateId}-hole-${holeNum}`]: e.target.value })}
                          className="flex-1 text-sm rounded px-3 py-2"
                          style={{ border: `1px solid ${COLORS.line}` }}
                        >
                          <option value="">Select winner...</option>
                          {leaderboard.map((entry) => (
                            <option key={entry.player.id} value={entry.player.id}>{entry.player.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                ) : (
                  <select
                    value={gameWinners[`oncourse-${game.templateId}`] || ""}
                    onChange={(e) => setGameWinners({ ...gameWinners, [`oncourse-${game.templateId}`]: e.target.value })}
                    className="w-full text-sm rounded px-3 py-2"
                    style={{ border: `1px solid ${COLORS.line}` }}
                  >
                    <option value="">Select winner...</option>
                    {leaderboard.map((entry) => (
                      <option key={entry.player.id} value={entry.player.id}>{entry.player.name}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Best Ball Teams Day 1 Results - shown before Day 2 groups */}
      {teams && teams.length > 0 && (
        <div className="rounded-xl overflow-hidden border mb-6" style={{ borderColor: COLORS.line }}>
          <div className="bg-white p-4" style={{ backgroundColor: COLORS.greenPale }}>
            <h3 className="font-medium" style={{ color: COLORS.green }}>🤝 Best Ball Teams - {dayOneRound.label} Results</h3>
          </div>
          <div className="bg-white p-4">
            {(() => {
              const teamScores = teams.map((team) => {
                let teamScore = 0;
                dayOneRound.course?.holes?.forEach((hole) => {
                  let bestHoleScore = null;
                  team.players.forEach((playerId) => {
                    const group = getPlayerGroup(dayOneRound, playerId);
                    let so = null;
                    if (group && allScores && allScores[group.id]) {
                      so = allScores[group.id];
                    }
                    const player = config.players.find(p => p.id === playerId);
                    if (so && player) {
                      const g = so.playerScores?.[playerId]?.[hole.number];
                      if (g !== "" && g != null) {
                        const ph = getPH(dayOneRound.course, player, allowance);
                        const pts = stablefordPts(g, hole.par, strokesOnHole(ph, hole.si));
                        if (bestHoleScore === null || (pts !== null && pts > bestHoleScore)) {
                          bestHoleScore = pts;
                        }
                      }
                    }
                  });
                  if (bestHoleScore !== null) teamScore += bestHoleScore;
                });
                return { team, teamScore };
              }).sort((a, b) => b.teamScore - a.teamScore);

              return teamScores.map(({ team, teamScore }, idx) => (
                <div key={idx} className="p-2 rounded mb-2" style={{ backgroundColor: COLORS.cream }}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{idx + 1}. {team.name || `Team ${idx + 1}`}</span>
                    <span style={{ color: COLORS.green, fontWeight: "500" }}>{teamScore} pts</span>
                  </div>
                  <div className="text-xs opacity-60 mt-1">
                    {team.players.map(pid => config.players.find(p => p.id === pid)?.name).join(", ")}
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* Next round group assignment — mode selector + per-player dropdowns in one card */}
      {dayTwoRound && (
        <div className="rounded-xl p-4 mb-6 bg-white border" style={{ borderColor: COLORS.line }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium" style={{ color: COLORS.green }}>{dayTwoRound.label} Groups</h3>
            <div className="flex gap-1">
              {(["ascending","random","manual"] as const).map(m => (
                <button key={m} onClick={() => handleModeChange(m)}
                  className="px-2 py-1 rounded text-xs font-medium"
                  style={{ backgroundColor: groupMode === m ? COLORS.green : COLORS.cream, color: groupMode === m ? "white" : COLORS.charcoal, border: `1px solid ${groupMode === m ? COLORS.green : COLORS.line}` }}>
                  {m === "ascending" ? "By Score" : m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            {finalGroups.map((group, gidx) => (
              <div key={group.id || gidx} className="rounded-lg overflow-hidden border" style={{ borderColor: COLORS.line }}>
                <div className="px-3 py-1.5" style={{ backgroundColor: COLORS.greenPale }}>
                  <span className="text-xs font-semibold" style={{ color: COLORS.green }}>{group.name || `Group ${gidx + 1}`}</span>
                </div>
                {group.playerIds.map(pid => {
                  const player = config.players.find(p => p.id === pid);
                  const scoreEntry = leaderboard.find(e => e.player.id === pid);
                  return (
                    <div key={pid} className="flex items-center gap-2 px-3 py-2 border-t" style={{ borderColor: COLORS.line }}>
                      <span className="flex-1 text-sm" style={{ color: COLORS.charcoal }}>{player?.name || pid}</span>
                      <span className="text-xs mr-1" style={{ color: COLORS.gold }}>{scoreEntry?.raw ?? "—"} pts</span>
                      <select
                        value={group.id}
                        onChange={e => {
                          const newGid = e.target.value;
                          if (newGid && newGid !== group.id) setManualGroupAssignments(prev => ({ ...prev, [pid]: newGid }));
                        }}
                        className="text-xs rounded px-1.5 py-1 border"
                        style={{ borderColor: COLORS.line, color: COLORS.charcoal, minWidth: "80px" }}
                      >
                        {(baseGroups || []).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Complete Button */}
      <button
        onClick={handleComplete}
        className="w-full py-3 rounded-lg font-medium text-sm"
        style={{ backgroundColor: COLORS.green, color: "white" }}
      >
        {dayTwoRound ? `Complete ${dayOneRound.label} → Start ${dayTwoRound.label}` : `Complete Tournament`}
      </button>
    </div>
  );
}

// PickGroupScreen Component
function PickGroupScreen({ config, round, onPick, onCancel }) {
  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <p className="text-sm font-medium mb-2" style={{ color: COLORS.charcoal }}>Select your group:</p>
      <div className="flex flex-col gap-2">
        {round.groups.map((g) => {
          const names = g.playerIds.map((id) => config?.players?.find((p) => p.id === id)?.name).filter(Boolean);
          return (
            <button key={g.id} onClick={() => onPick(g.id)} className="text-left rounded-xl p-4" style={{ backgroundColor: "white", border: `1px solid ${COLORS.line}` }}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium" style={{ color: COLORS.green }}>{g.name}</span>
                <ChevronRight size={18} style={{ color: COLORS.green }} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs opacity-60">{names.length ? names.join(", ") : "No players"}</p>
                {g.teeTime && <span className="text-xs font-medium" style={{ color: COLORS.gold }}>🕐 {g.teeTime}</span>}
              </div>
            </button>
          );
        })}
      </div>
      {onCancel && (
        <button onClick={onCancel} className="w-full py-2.5 rounded-xl text-sm font-medium mt-4" style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}>
          Cancel
        </button>
      )}
    </div>
  );
}

// ScoreTab Component
function ScoreTab({ config, round, groupId, scores, onScoreChange, onCelebrate, gameEntries, onGameEntriesChange, onFinish }) {
  const [hole, setHole] = useState(1);
  const group = round.groups.find((g) => g.id === groupId);
  const groupPlayers = group ? config.players.filter((p) => group.playerIds.includes(p.id)) : [];
  const holeData = round.course.holes.find((h) => h.number === hole);
  const allowance = config.allowance.stableford;

  function setGross(playerId, val) {
    let numeric;
    if (val === "PU") {
      numeric = "PU"; // Keep "PU" as a string
    } else if (val === "") {
      numeric = "";
    } else {
      numeric = Math.max(1, Math.min(15, Number(val)));
    }
    const updated = {
      ...scores,
      playerScores: {
        ...scores.playerScores,
        [playerId]: { ...(scores.playerScores[playerId] || {}), [hole]: numeric },
      },
    };
    onScoreChange(updated);
  }

  if (!group) return <p className="p-6 text-sm opacity-60">No group selected.</p>;

  // Scroll to top when hole changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [hole]);

  return (
    <div className="px-4 py-4 pb-24">
      <div className="rounded-2xl p-4 mb-4 flex items-center justify-between" style={{ backgroundColor: COLORS.green }}>
        <button onClick={() => setHole((h) => Math.max(1, h - 1))} aria-label="Previous hole">
          <ChevronLeft size={22} color={COLORS.goldPale} />
        </button>
        <div className="text-center flex-1">
          <p className="text-xs uppercase tracking-wide" style={{ color: COLORS.goldPale, opacity: 0.8 }}>Hole</p>
          <p className="font-display text-3xl" style={{ color: "white" }}>{hole}</p>
          <p className="text-xs mt-0.5" style={{ color: COLORS.goldPale }}>
            Par {holeData.par} · SI {holeData.si}
          </p>
        </div>
        <button onClick={() => setHole((h) => Math.min(TOTAL_HOLES, h + 1))} aria-label="Next hole">
          <ChevronRight size={22} color={COLORS.goldPale} />
        </button>
      </div>

      {/* Excluded-from-overall banner */}
      {round.excludeFromOverall && (
        <div className="rounded-lg px-3 py-2 mb-4 text-sm font-medium text-center" style={{ backgroundColor: COLORS.flagPale, border: `1px solid ${COLORS.flag}`, color: COLORS.flag }}>
          ⚠️ {round.label} scores are not included in the Overall competition
        </div>
      )}

      {/* Competitions ribbon for this hole */}
      {(() => {
        const competitionsOnHole = round.games?.filter((game) => {
          const holesForGame = game.holes || [];
          return holesForGame.includes(hole);
        }) || [];

        if (competitionsOnHole.length > 0) {
          return (
            <div className="rounded-lg p-3 mb-4 text-sm font-medium" style={{ backgroundColor: COLORS.goldPale, border: `2px solid ${COLORS.gold}` }}>
              <div style={{ color: "#1a1a1a", display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                {competitionsOnHole.map((game) => (
                  <span key={game.id}>
                    {game.emoji} {game.name}
                  </span>
                ))}
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* Joker hole selector - only on Hole 1 */}
      {round.jokerEnabled && hole === 1 && (
        <div className="rounded-lg p-3 mb-4" style={{ backgroundColor: COLORS.flagPale, border: `2px solid ${COLORS.flag}` }}>
          <p className="text-xs font-medium mb-3" style={{ color: COLORS.flag }}>⭐ Select Your Joker Hole (Each Player)</p>
          {groupPlayers.map((player) => (
            <div key={player.id} className="mb-3">
              <p className="text-xs font-medium mb-2" style={{ color: COLORS.charcoal }}>{player.name}</p>
              <div className="flex gap-1 flex-wrap">
                {round.course.holes.map((h) => {
                  const selected = Number(scores.jokerHoles?.[player.id]) === h.number;
                  return (
                    <button
                      key={`${player.id}-hole-${h.number}`}
                      onClick={() => {
                        const updated = { ...scores, jokerHoles: { ...scores.jokerHoles, [player.id]: h.number } };
                        onScoreChange(updated);
                      }}
                      className="px-2 py-1 rounded text-xs font-medium"
                      style={{
                        backgroundColor: selected ? COLORS.flag : COLORS.cream,
                        color: selected ? "white" : COLORS.charcoal,
                        border: `1px solid ${COLORS.flag}`,
                      }}
                    >
                      {h.number}
                    </button>
                  );
                })}
                {/* NA button for players not allowed to use joker */}
                <button
                  onClick={() => {
                    const updated = { ...scores, jokerHoles: { ...scores.jokerHoles, [player.id]: "NA" } };
                    onScoreChange(updated);
                  }}
                  className="px-2 py-1 rounded text-xs font-medium"
                  style={{
                    backgroundColor: scores.jokerHoles?.[player.id] === "NA" ? COLORS.charcoal : COLORS.cream,
                    color: scores.jokerHoles?.[player.id] === "NA" ? "white" : COLORS.charcoal,
                    border: `1px solid ${COLORS.charcoal}`,
                  }}
                >
                  NA
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-9 gap-1 mb-4">
        {round.course.holes.map((h) => (
          <button
            key={h.number}
            onClick={() => setHole(h.number)}
            className="aspect-square rounded-md text-xs font-medium"
            style={{
              backgroundColor: h.number === hole ? COLORS.gold : "white",
              color: h.number === hole ? "white" : COLORS.charcoal,
              border: `1px solid ${COLORS.line}`,
            }}
          >
            {h.number}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {groupPlayers.map((p) => {
          const playerCourse = getCourseForPlayer(round, p.id);
          const playerHoleData = playerCourse.holes.find((h) => h.number === hole) || holeData;
          const ph = getPH(playerCourse, p, allowance);
          const sr = strokesOnHole(ph, playerHoleData.si);
          const gross = (scores.playerScores[p.id] || {})[hole];
          const pts = stablefordPts(gross, playerHoleData.par, sr);
          const isJokerHere = round.jokerEnabled && Number(scores.jokerHoles?.[p.id]) === hole;
          const displayPts = isJokerHere && pts != null ? pts * 2 : pts;
          const stats = computePlayerRoundStats(round, p, allowance, scores);
          return (
            <div key={p.id} className="rounded-xl p-3" style={{ backgroundColor: "white", border: `1px solid ${COLORS.line}` }}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-medium text-sm" style={{ color: COLORS.charcoal }}>
                    {p.name}
                    {isJokerHere && <span className="ml-1">⭐</span>}
                  </span>
                  <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: COLORS.goldPale, color: COLORS.gold }}>
                    {ph > 0 ? `+${ph}` : ph}
                  </span>
                  {sr !== 0 && (
                    <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}>
                      {sr > 0 ? `+${sr}` : sr}
                    </span>
                  )}
                </div>
                <span className="text-xs opacity-50">Thru {stats.thru} · {stats.dayTotal} pts</span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <button onClick={() => setGross(p.id, gross === "PU" ? playerHoleData.par : (gross && gross > 1 ? gross - 1 : 1))} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: COLORS.cream }}>
                  <Minus size={16} style={{ color: COLORS.green }} />
                </button>
                <span className="font-display text-2xl w-12 text-center" style={{ color: gross === "PU" ? COLORS.flag : COLORS.green }}>{gross === "PU" ? "PU" : gross === "" || gross == null ? "–" : gross}</span>
                <button onClick={() => setGross(p.id, gross === "PU" ? playerHoleData.par : (gross ? gross + 1 : playerHoleData.par))} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: COLORS.cream }}>
                  <Plus size={16} style={{ color: COLORS.green }} />
                </button>
                <span className="text-xs flex-1 text-right" style={{ color: gross === "PU" ? COLORS.flag : displayPts >= 3 ? COLORS.gold : COLORS.charcoal, opacity: displayPts == null && gross !== "PU" ? 0.3 : 1 }}>
                  {gross === "PU" ? "0 pts (PU)" : displayPts == null ? "no score" : `${displayPts} pt${displayPts === 1 ? "" : "s"}`}
                </span>
              </div>
              {/* Game entry buttons - only show if enabled */}
              {(round.games?.some((g) => g.templateId === "snake") || round.games?.some((g) => g.templateId === "sandy")) && (
              <div className="flex gap-2 mt-2 text-xs">
                {round.games?.some((g) => g.templateId === "snake") && (
                <label className="flex items-center gap-1.5 flex-1" style={{ color: COLORS.charcoal }}>
                  <input
                    type="checkbox"
                    checked={gameEntries.some((e) => e.playerId === p.id && e.gameId === "snake" && e.hole === hole && e.threePutts)}
                    onChange={(e) => {
                      const updated = [...gameEntries];
                      const idx = updated.findIndex((x) => x.playerId === p.id && x.gameId === "snake" && x.hole === hole);
                      if (e.target.checked) {
                        if (idx >= 0) updated[idx].threePutts = true;
                        else updated.push({ id: uid(), playerId: p.id, gameId: "snake", hole, threePutts: true });
                      } else {
                        if (idx >= 0) updated[idx].threePutts = false;
                      }
                      onGameEntriesChange(updated);
                    }}
                    style={{ accentColor: COLORS.gold }}
                  />
                  <span>3-putt</span>
                </label>
                )}
                {round.games?.some((g) => g.templateId === "sandy") && (
                <label className="flex items-center gap-1.5 flex-1" style={{ color: COLORS.charcoal, opacity: gross !== "" && gross != null && Number(gross) <= holeData.par ? 1 : 0.4 }}>
                  <input
                    type="checkbox"
                    disabled={gross === "" || gross == null || Number(gross) > holeData.par}
                    checked={gameEntries.some((e) => e.playerId === p.id && e.gameId === "sandy" && e.hole === hole && e.save)}
                    onChange={(e) => {
                      const updated = [...gameEntries];
                      const idx = updated.findIndex((x) => x.playerId === p.id && x.gameId === "sandy" && x.hole === hole);
                      if (e.target.checked) {
                        if (idx >= 0) updated[idx].save = true;
                        else updated.push({ id: uid(), playerId: p.id, gameId: "sandy", hole, save: true });
                      } else {
                        if (idx >= 0) updated[idx].save = false;
                      }
                      onGameEntriesChange(updated);
                    }}
                    style={{ accentColor: COLORS.flag }}
                  />
                  <span>Sandy</span>
                </label>
                )}
              </div>
              )}
              <button
                onClick={() => {
                  if (gross === "PU") {
                    setGross(p.id, ""); // Clear PU
                  } else {
                    setGross(p.id, "PU"); // Set PU (can do anytime)
                  }
                }}
                className="w-full mt-3 py-2.5 rounded-lg font-medium text-sm"
                style={{
                  backgroundColor: gross === "PU" ? COLORS.flag : COLORS.cream,
                  color: gross === "PU" ? "white" : COLORS.charcoal,
                  border: `1.5px solid ${gross === "PU" ? COLORS.flag : COLORS.line}`,
                  cursor: "pointer",
                }}
              >
                🛑 Picked Up (PU)
              </button>
            </div>
          );
        })}
      </div>

      {/* Next Hole / Finish Round Button */}
      {(() => {
        const allPlayersScored = groupPlayers.every((p) => {
          const score = (scores.playerScores[p.id] || {})[hole];
          return score !== "" && score != null;
        });

        const allHolesScored = groupPlayers.every((p) => {
          return round.course.holes.every((h) => {
            const score = (scores.playerScores[p.id] || {})[h.number];
            return score !== "" && score != null;
          });
        });

        const isLastHole = hole === TOTAL_HOLES;
        const buttonText = allHolesScored ? "Finish Round" : "Next Hole";
        const buttonDisabled = !allPlayersScored;

        return (
          <div className="fixed bottom-0 left-0 right-0 px-4 py-4 bg-white border-t flex gap-2" style={{ borderColor: COLORS.line, maxWidth: "32rem", marginLeft: "auto", marginRight: "auto", zIndex: 100 }}>
            <button
              onClick={() => {
                // Check if all players have scored current hole BEFORE moving
                if (!allPlayersScored) return;

                if (allHolesScored) {
                  // Finish round - trigger the completion logic
                  onFinish?.();
                } else if (isLastHole) {
                  // On last hole but not all holes scored - go back to hole 1
                  setHole(1);
                } else {
                  // Move to next hole
                  setHole((h) => Math.min(TOTAL_HOLES, h + 1));
                }
              }}
              disabled={buttonDisabled}
              className="flex-1 rounded-lg py-3 font-medium text-sm"
              style={{
                backgroundColor: !buttonDisabled ? COLORS.green : COLORS.charcoal,
                color: "white",
                opacity: !buttonDisabled ? 1 : 0.5,
              }}
            >
              {buttonText}
            </button>
          </div>
        );
      })()}
    </div>
  );
}

// End of Round Games Screen (for any games with hole selection)
function EndOfRoundGamesScreen({ config, round, groupId, gameEntries, onEntriesChange, onFinish }) {
  const group = round.groups.find((g) => g.id === groupId);
  const groupPlayers = group ? config.players.filter((p) => group.playerIds.includes(p.id)) : [];
  // Show all games that support hole selection (any game with a holes array)
  const endOfRoundGames = round.games?.filter((g) => g.holes && Array.isArray(g.holes)) || [];

  if (!group) return null;

  if (endOfRoundGames.length === 0) {
    return (
      <div className="px-4 py-8 pb-24 text-center">
        <p className="text-sm opacity-60 mb-6">No end-of-round games configured.</p>
        <button onClick={onFinish} className="rounded-lg px-4 py-2 font-medium" style={{ backgroundColor: COLORS.green, color: "white" }}>
          Finish Round
        </button>
      </div>
    );
  }

  const getGameHoles = (game: any) => {
    const selectedHoles = game.holes || [];
    if (selectedHoles.length > 0) {
      return round.course.holes.filter((h) => selectedHoles.includes(h.number));
    }
    return [];
  };

  return (
    <div className="px-4 py-4 pb-24">
      <h2 className="font-display text-xl mb-4" style={{ color: COLORS.green }}>
        End of Round Games
      </h2>
      <div className="flex flex-col gap-4">
        {endOfRoundGames.map((game) => {
          const gameHoles = getGameHoles(game);
          return (
            <div key={game.id} className="rounded-xl p-4" style={{ backgroundColor: "white", border: `1px solid ${COLORS.line}` }}>
              <h3 className="font-medium mb-3" style={{ color: COLORS.green }}>
                {game.emoji} {game.name}
              </h3>
              {gameHoles.length === 0 ? (
                <p className="text-sm opacity-60">No holes selected for this game during setup.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {gameHoles.map((hole) => {
                    const winner = gameEntries.find((e) => e.gameId === game.id && e.hole === hole.number)?.winner;
                    const winnerPlayer = winner ? config.players.find((p) => p.id === winner) : null;
                    return (
                      <div key={hole.number} className="p-2 rounded-lg" style={{ backgroundColor: COLORS.cream }}>
                        <p className="text-xs font-medium mb-2" style={{ color: COLORS.charcoal }}>
                          Hole {hole.number} (Par {hole.par})
                        </p>
                        {winnerPlayer ? (
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium" style={{ color: COLORS.gold }}>
                              ✓ {winnerPlayer.name}
                            </span>
                            <button
                              onClick={() => {
                                const updated = gameEntries.filter(
                                  (e) => !(e.gameId === game.id && e.hole === hole.number)
                                );
                                onEntriesChange(updated);
                              }}
                              className="text-xs px-2 py-1 rounded"
                              style={{ backgroundColor: "white", color: COLORS.flag }}
                            >
                              Change
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => {
                                const updated = gameEntries.filter(
                                  (e) => !(e.gameId === game.id && e.hole === hole.number)
                                );
                                onEntriesChange(updated);
                              }}
                              className="p-2 rounded text-sm font-medium text-left"
                              style={{
                                backgroundColor: COLORS.cream,
                                color: COLORS.charcoal,
                                border: `1px solid ${COLORS.line}`,
                              }}
                            >
                              — No Winner
                            </button>
                            {config.players.map((p) => (
                              <button
                                key={p.id}
                                onClick={() => {
                                  const updated = gameEntries.filter(
                                    (e) => !(e.gameId === game.id && e.hole === hole.number)
                                  );
                                  updated.push({
                                    id: uid(),
                                    gameId: game.id,
                                    hole: hole.number,
                                    winner: p.id,
                                  });
                                  onEntriesChange(updated);
                                }}
                                className="p-2 rounded text-sm font-medium text-left"
                                style={{
                                  backgroundColor: COLORS.gold,
                                  color: "white",
                                  border: `1px solid ${COLORS.line}`,
                                }}
                              >
                                {p.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={onFinish}
        className="w-full mt-6 rounded-lg px-4 py-3 font-medium"
        style={{ backgroundColor: COLORS.green, color: "white" }}
      >
        Finish Round
      </button>
    </div>
  );
}

// GamesTab Component
function GamesTab({ config, round, groupId, gameEntries, onEntriesChange }) {
  const [teams, setTeams] = useState<any[]>(() => {
    try {
      const saved = sessionStorage.getItem(`teams-${round.id}-${groupId}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const group = round.groups.find((g) => g.id === groupId);
  const groupPlayers = group ? config.players.filter((p) => group.playerIds.includes(p.id)) : [];
  const allRoundPlayers = config.players.filter((p) => round.groups.some((g) => g.playerIds.includes(p.id)));
  const activeGames = round.games || [];
  const hasTeamCompetition = true; // Always available

  const handleGenerateTeams = () => {
    const newTeams = generateRandomTeams(allRoundPlayers);
    setTeams(newTeams);
    sessionStorage.setItem(`teams-${round.id}-${groupId}`, JSON.stringify(newTeams));
  };

  const updateEntry = (playerId: string, gameId: string, field: string, value: any) => {
    const updated = [...gameEntries];
    const idx = updated.findIndex((e) => e.playerId === playerId && e.gameId === gameId);
    if (idx >= 0) {
      updated[idx] = { ...updated[idx], [field]: value };
    } else {
      updated.push({ id: uid(), playerId, gameId, [field]: value });
    }
    onEntriesChange(updated);
  };

  const getEntry = (playerId: string, gameId: string) => {
    return gameEntries.find((e) => e.playerId === playerId && e.gameId === gameId) || {};
  };

  if (!group) return <p className="p-6 text-sm opacity-60">No group selected.</p>;

  return (
    <div className="px-4 py-4 pb-24">
      <h2 className="font-display text-xl mb-4" style={{ color: COLORS.green }}>
        Games
      </h2>

      {/* Best Ball Teams Section */}
      <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "white", border: `1px solid ${COLORS.line}` }}>
        <h3 className="font-medium mb-3" style={{ color: COLORS.green }}>
          🤝 Best Ball Teams
        </h3>
        {teams.length === 0 ? (
          <button
            onClick={handleGenerateTeams}
            className="w-full py-2.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}
          >
            Generate Random Teams
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            {teams.map((team) => (
              <div key={team.id} className="p-2.5 rounded-lg" style={{ backgroundColor: COLORS.greenPale }}>
                <p className="text-sm font-medium" style={{ color: COLORS.green }}>
                  {team.name}
                </p>
              </div>
            ))}
            <button
              onClick={handleGenerateTeams}
              className="mt-2 py-2 rounded-lg text-xs font-medium"
              style={{ backgroundColor: COLORS.goldPale, color: COLORS.gold }}
            >
              Regenerate Teams
            </button>
          </div>
        )}
      </div>

      {/* Sandy Saver Section */}
      {activeGames.some((g) => g.templateId === "sandy") && (
        <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "white", border: `1px solid ${COLORS.line}` }}>
          <h3 className="font-medium mb-3" style={{ color: COLORS.green }}>
            🏜️ Sandy Saver
          </h3>
          <div className="flex flex-col gap-2">
            {groupPlayers.map((p) => {
              const sandyCount = gameEntries.filter((e) => e.playerId === p.id && e.gameId === "sandy" && e.save).length;
              const entry = getEntry(p.id, "sandy");
              return (
                <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg" style={{ backgroundColor: COLORS.cream }}>
                  <span className="text-sm font-medium" style={{ color: COLORS.charcoal }}>{p.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold" style={{ color: COLORS.gold }}>{sandyCount}</span>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={!!entry.save}
                        onChange={(e) => updateEntry(p.id, "sandy", "save", e.target.checked)}
                        style={{ accentColor: COLORS.gold }}
                      />
                      <span className="text-xs" style={{ color: COLORS.charcoal }}>This hole</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* The Snake Section */}
      {activeGames.some((g) => g.templateId === "snake") && (
        <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "white", border: `1px solid ${COLORS.line}` }}>
          <h3 className="font-medium mb-3" style={{ color: COLORS.green }}>
            🐍 The Snake
          </h3>
          {(() => {
            const snakeEntries = gameEntries.filter((e) => e.gameId === "snake" && e.threePutts);
            const snakesByPlayer = {};
            snakeEntries.forEach((e) => {
              if (!snakesByPlayer[e.playerId]) snakesByPlayer[e.playerId] = [];
              snakesByPlayer[e.playerId].push(e.hole);
            });

            const currentHolder = Object.entries(snakesByPlayer).reduce((acc: any, [playerId, holes]: any) => {
              const maxHole = Math.max(...(holes as number[]));
              return !acc || maxHole > Math.max(...((snakesByPlayer[acc.id] as number[]) || [0])) ? { id: playerId, holes } : acc;
            }, null);

            return (
              <div className="flex flex-col gap-2">
                {groupPlayers.map((p) => {
                  const playerHoles = snakesByPlayer[p.id] || [];
                  const maxHole = playerHoles.length > 0 ? Math.max(...playerHoles) : null;
                  const isHolder = currentHolder?.id === p.id;
                  return (
                    <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg" style={{ backgroundColor: isHolder ? COLORS.flagPale : COLORS.cream }}>
                      <span className="text-sm font-medium" style={{ color: COLORS.charcoal }}>{p.name}</span>
                      <div className="flex items-center gap-3">
                        {isHolder && <span className="text-xs font-bold px-2 py-1 rounded" style={{ backgroundColor: COLORS.flag, color: "white" }}>🐍 Holder</span>}
                        <span className="text-xs" style={{ color: COLORS.charcoal }}>3-putts: {playerHoles.length} {maxHole ? `(hole ${maxHole})` : ""}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// LeaderboardTab Component
function LeaderboardTab({ config, allScoresByRound, currentRoundId, currentScores }) {
  const [view, setView] = useState(config.rounds[0].id);
  const [competition, setCompetition] = useState("stableford");
  const allowance = config.allowance.stableford;

  const rows = (() => {
    // Special handling for Best Ball Teams
    if (competition === "best-ball-teams") {
      // For "overall" view, aggregate team scores across all rounds
      if (view === "overall" && config.rounds[0]?.bestBallTeams) {
        const allTeams = config.rounds[0].bestBallTeams; // Same teams across all rounds
        return allTeams.map((team) => {
          let totalTeamScore = 0;
          let totalThru = 0;

          config.rounds.forEach((round) => {
            round.course.holes.forEach((hole) => {
              let bestHoleScore = null;

              team.players.forEach((playerId) => {
                let so = null;
                // Try allScoresByRound first (synced from all groups), then preserved, then current
                const group = getPlayerGroup(round, playerId);
                if (group && allScoresByRound[round.id] && allScoresByRound[round.id][group.id]) {
                  so = allScoresByRound[round.id][group.id];
                } else {
                  const preservedKey = `${round.id}_preserved`;
                  if (allScoresByRound[preservedKey]) {
                    so = allScoresByRound[preservedKey];
                  } else if (round.id === currentRoundId) {
                    so = currentScores;
                  }
                }
                const player = config.players.find(p => p.id === playerId);

                if (so && player) {
                  const g = so.playerScores?.[playerId]?.[hole.number];
                  if (g !== "" && g != null) {
                    const ph = getPH(round.course, player, allowance);
                    const pts = stablefordPts(g, hole.par, strokesOnHole(ph, hole.si));
                    if (bestHoleScore === null || (pts !== null && pts > bestHoleScore)) {
                      bestHoleScore = pts;
                    }
                  }
                }
              });

              if (bestHoleScore !== null) {
                totalTeamScore += bestHoleScore;
                totalThru++;
              }
            });
          });

          return {
            id: team.id,
            name: team.name,
            groupName: "Team",
            pts: totalTeamScore,
            thru: totalThru,
          };
        }).sort((a, b) => b.pts - a.pts);
      }

      // For single round view, show teams with that round's scores
      const r = config.rounds.find((rr) => rr.id === view);
      // Use daily teams if available (Best Ball Teams Daily), otherwise use overall teams
      const teamsToShow = r?.games?.some((g) => g.templateId === "bestball-daily") && r?.dailyBestBallTeams ? r.dailyBestBallTeams : r?.bestBallTeams;
      if (teamsToShow) {
      return teamsToShow.map((team, idx) => {
        let teamScore = 0;
        let thru = 0;

        r.course.holes.forEach((hole) => {
          let bestHoleScore = null;

          team.players.forEach((playerId) => {
            const group = getPlayerGroup(r, playerId);
            // Use allScoresByRound first (synced from all groups), then fallback to current
            let so = null;
            if (group && allScoresByRound[r.id] && allScoresByRound[r.id][group.id]) {
              so = allScoresByRound[r.id][group.id];
            } else if (r.id === currentRoundId && group) {
              so = currentScores;
            }
            const player = config.players.find(p => p.id === playerId);

            if (so && player) {
              const g = so.playerScores?.[playerId]?.[hole.number];
              if (g !== "" && g != null) {
                const ph = getPH(r.course, player, allowance);
                const pts = stablefordPts(g, hole.par, strokesOnHole(ph, hole.si));
                if (bestHoleScore === null || (pts !== null && pts > bestHoleScore)) {
                  bestHoleScore = pts;
                }
              }
            }
          });

          if (bestHoleScore !== null) {
            teamScore += bestHoleScore;
            thru++;
          }
        });

        return {
          id: team.id,
          name: team.name,
          groupName: "Team",
          pts: teamScore,
          thru: thru,
        };
      }).sort((a, b) => b.pts - a.pts);
      }
    }

    // Regular individual player scoring
    return config.players
      .filter((p) => p.name)
      .map((p) => {
        if (view === "overall") {
          let total = 0, hardestSixTotal = 0, thru = 0;
          config.rounds.filter((rnd) => !rnd.excludeFromOverall).forEach((rnd) => {
            let so = null;

            // Try to get scores from all groups (allScoresByRound has synced data from Firebase)
            // This shows overall scores across ALL devices/groups, not just current device
            if (rnd.id === currentRoundId) {
              // Current round: try allScoresByRound first (synced scores from all groups),
              // then fall back to currentScores (local live scores) for just this device
              const group = getPlayerGroup(rnd, p.id);
              so = (allScoresByRound[rnd.id] && allScoresByRound[rnd.id][group.id]) || currentScores;
            } else {
              // Past rounds: try preserved scores first, then allScoresByRound lookup
              const preservedKey = `${rnd.id}_preserved`;
              if (allScoresByRound[preservedKey]) {
                so = allScoresByRound[preservedKey];
              } else {
                // Fallback to group-based lookup
                const group = getPlayerGroup(rnd, p.id);
                so = group && allScoresByRound[rnd.id] && allScoresByRound[rnd.id][group.id];
              }
            }

            const stats = computePlayerRoundStats(rnd, p, allowance, so);
            // For overall, include joker bonus only if the round's jokerBonusAppliesOverall is true
            // stats.raw = base points, stats.dayTotal = base + joker bonus
            const roundTotal = rnd.jokerBonusAppliesOverall !== false ? stats.dayTotal : stats.raw;
            total += roundTotal;
            thru += stats.thru;
            hardestSixTotal += computePlayerHardestSixScore(rnd, p, allowance, so);
          });
          let finalScore = total;
          let skinsData = null;
          if (competition === "stableford") finalScore = total;
          else if (competition === "hardest-six") finalScore = hardestSixTotal;
          else if (competition === "best-indexed") finalScore = computePlayerBestIndexedScore(config.rounds.filter(r => !r.excludeFromOverall), p, allowance, allScoresByRound, currentRoundId, currentScores);
          else if (competition === "skins") {
            skinsData = computePlayerSkinsScore(config.rounds.filter(r => !r.excludeFromOverall), p, allowance, allScoresByRound, currentRoundId, currentScores, config.players, true);
            finalScore = skinsData.totalWon;
          }
          return { id: p.id, name: p.name, groupName: "All rounds", pts: finalScore, thru, skinsData };
        }
        const r = config.rounds.find((rr) => rr.id === view);
        // Guard: if round doesn't exist, return placeholder
        if (!r) {
          return { id: p.id, name: p.name, groupName: "–", pts: 0, gross: 0, thru: 0, jokerBonus: 0, jokerHole: undefined };
        }
        const group = getPlayerGroup(r, p.id);
        let so = null;
        if (group) {
          if (view === currentRoundId) {
            // Current round being scored: try allScoresByRound first, then currentScores as fallback
            so = (allScoresByRound[view] && allScoresByRound[view][group.id]) || currentScores;
          } else {
            // Past round: use group-based lookup first, then preserved scores as fallback
            so = (allScoresByRound[view] && allScoresByRound[view][group.id]) || null;
            if (!so) {
              // If not found by group, try preserved scores
              const preservedKey = `${view}_preserved`;
              so = allScoresByRound[preservedKey] || null;
            }
          }
        }
        const stats = computePlayerRoundStats(r, p, allowance, so);
        const hardestSixScore = computePlayerHardestSixScore(r, p, allowance, so);
        let finalScore = stats.dayTotal;
        let skinsData = null;
        if (competition === "stableford") finalScore = stats.dayTotal;
        else if (competition === "hardest-six") finalScore = hardestSixScore;
        else if (competition === "best-indexed") finalScore = r ? computePlayerBestIndexedScore([r], p, allowance, group ? { [r.id]: { [group.id]: so } } : {}, r.id, so) : 0;
        else if (competition === "best-ball-teams") finalScore = stats.dayTotal; // Teams handled separately above
        else if (competition === "skins") {
          // For skins, need ALL scores from this round (all groups), not just current group
          const roundAllScores = allScoresByRound[r.id] || {};
          skinsData = computePlayerSkinsScore([r], p, allowance, { [r.id]: roundAllScores }, currentRoundId, currentScores, config.players, true);
          finalScore = skinsData.totalWon;
        }
        return { id: p.id, name: p.name, groupName: group?.name || "–", pts: finalScore, gross: stats.gross, thru: stats.thru, jokerBonus: stats.jokerBonus, jokerHole: stats.jokerHole, skinsData };
      })
      .sort((a, b) => b.pts - a.pts);
  })();

  const activeCompetition = COMPETITIONS.find((c) => c.id === competition);

  return (
    <div className="px-4 py-4 pb-24">
      <h2 className="font-display text-xl mb-3" style={{ color: COLORS.green }}>Leaderboard</h2>
      <div className="flex gap-1 mb-3">
        {config.rounds.map((r) => (
          <button key={r.id} onClick={() => setView(r.id)} className="flex-1 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: view === r.id ? (r.excludeFromOverall ? COLORS.flag : COLORS.green) : (r.excludeFromOverall ? COLORS.flagPale : "white"), color: view === r.id ? "white" : (r.excludeFromOverall ? COLORS.flag : COLORS.charcoal), border: `1px solid ${r.excludeFromOverall ? COLORS.flag : COLORS.line}` }}>
            {r.label}{r.excludeFromOverall ? " *" : ""}
          </button>
        ))}
        <button onClick={() => setView("overall")} className="flex-1 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: view === "overall" ? COLORS.green : "white", color: view === "overall" ? "white" : COLORS.charcoal, border: `1px solid ${COLORS.line}` }}>
          Overall
        </button>
      </div>
      <div className="flex gap-1 mb-3">
        {COMPETITIONS.map((comp) => (
          <button key={comp.id} onClick={() => setCompetition(comp.id)} className="flex-1 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: competition === comp.id ? COLORS.gold : "white", color: competition === comp.id ? "white" : COLORS.charcoal, border: `1px solid ${COLORS.line}` }}>
            {comp.emoji} {comp.name}
          </button>
        ))}
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${COLORS.line}` }}>
        {rows.length === 0 ? (
          <p className="text-sm opacity-60 p-4 text-center">No players yet.</p>
        ) : (
          rows.map((r, i) => (
            <div
              key={r.id}
              className="flex items-center justify-between px-4 py-2.5"
              style={{ backgroundColor: i % 2 === 0 ? COLORS.green : COLORS.greenLight, borderBottom: i === rows.length - 1 ? "none" : `1px solid rgba(255,255,255,0.08)` }}
            >
              <div className="flex items-center gap-3">
                <span className="font-display text-sm w-5" style={{ color: COLORS.goldPale }}>{i + 1}</span>
                <div>
                  <p className="text-sm font-medium" style={{ color: "white" }}>{r.name}</p>
                  <p className="text-[11px]" style={{ color: COLORS.goldPale, opacity: 0.7 }}>
                    {r.groupName} · thru {r.thru}
                  </p>
                </div>
              </div>
              <div className="text-right">
                {competition === "skins" && r.skinsData ? (
                  <span className="font-display text-lg" style={{ color: COLORS.gold }}>
                    {r.skinsData.totalWon}({r.skinsData.timesAwarded})
                  </span>
                ) : (
                  <span className="font-display text-lg" style={{ color: COLORS.gold }}>{r.pts}</span>
                )}
                {r.jokerBonus > 0 && competition === "stableford" && (
                  <p className="text-[10px]" style={{ color: COLORS.goldPale }}>
                    [+{r.jokerBonus}]
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// GameResultsTab Component - Shows comprehensive daily results
function GameResultsTab({ config, allScoresByRound, currentRoundId, currentScores, eventId, gameEntries = [] }) {
  const [selectedRoundId, setSelectedRoundId] = useState(config.rounds[0]?.id);
  const [freshScores, setFreshScores] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const allowance = config.allowance.stableford;
  const selectedRound = config.rounds.find((r) => r.id === selectedRoundId);

  // Refresh scores from Firebase when round is selected or component loads
  useEffect(() => {
    const refreshScoresFromFirebase = async () => {
      if (!eventId || !selectedRoundId || !selectedRound) return;
      try {
        const merged = { playerScores: {}, jokerHoles: {} };
        // Load scores from all groups for this round
        for (const group of selectedRound.groups) {
          const scores = await getScoresFromFirebase(eventId, selectedRoundId, group.id);
          if (scores?.playerScores) Object.assign(merged.playerScores, scores.playerScores);
          if (scores?.jokerHoles) Object.assign(merged.jokerHoles, scores.jokerHoles);
        }
        setFreshScores(merged);
      } catch (err) {
        console.warn("Could not refresh scores from Firebase:", err);
      }
    };
    refreshScoresFromFirebase();
  }, [selectedRoundId, eventId, selectedRound]);

  // Handle swipe-to-refresh
  useEffect(() => {
    let touchStartYValue = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartYValue = e.touches[0].clientY;
    };

    const handleTouchEnd = async (e: TouchEvent) => {
      const touchEndY = e.changedTouches[0].clientY;
      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      // Pull down swipe and at top of page
      if (touchEndY - touchStartYValue > 50 && scrollTop < 50) {
        setIsRefreshing(true);
        try {
          if (eventId && selectedRoundId && selectedRound) {
            const merged = { playerScores: {}, jokerHoles: {} };
            for (const group of selectedRound.groups) {
              const scores = await getScoresFromFirebase(eventId, selectedRoundId, group.id);
              if (scores?.playerScores) Object.assign(merged.playerScores, scores.playerScores);
              if (scores?.jokerHoles) Object.assign(merged.jokerHoles, scores.jokerHoles);
            }
            setFreshScores(merged);
          }
        } catch (err) {
          console.warn("Swipe refresh failed:", err);
        } finally {
          setIsRefreshing(false);
        }
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [eventId, selectedRoundId, selectedRound]);

  const getScoresForRound = (roundId: string) => {
    // Use freshly loaded Firebase scores if available (most current)
    if (freshScores) {
      return freshScores;
    }

    // Try localStorage as fallback (both individual round and merged versions)
    try {
      // For current round, check individual round storage first
      if (roundId === currentRoundId) {
        const individualKey = `golf-scores-${eventId}-${roundId}`;
        const stored = localStorage.getItem(individualKey);
        if (stored) {
          return JSON.parse(stored);
        }
      }

      // Try merged storage
      const stored = localStorage.getItem(`golf-scores-${eventId}`);
      if (stored) {
        const allScores = JSON.parse(stored);
        if (allScores[roundId]) {
          // Return merged scores from all groups
          const merged = { playerScores: {}, jokerHoles: {} };
          Object.values(allScores[roundId]).forEach((groupScores: any) => {
            if (groupScores?.playerScores) Object.assign(merged.playerScores, groupScores.playerScores);
            if (groupScores?.jokerHoles) Object.assign(merged.jokerHoles, groupScores.jokerHoles);
          });
          return merged;
        }
      }
    } catch (e) {
      console.error("Error loading from localStorage:", e);
    }

    // Fallback to state
    const preservedKey = `${roundId}_preserved`;
    if (allScoresByRound[preservedKey]) return allScoresByRound[preservedKey];

    // Merge all groups from allScoresByRound (like localStorage does)
    if (allScoresByRound[roundId]) {
      const merged = { playerScores: {}, jokerHoles: {} };
      Object.values(allScoresByRound[roundId]).forEach((groupScores: any) => {
        if (groupScores?.playerScores) Object.assign(merged.playerScores, groupScores.playerScores);
        if (groupScores?.jokerHoles) Object.assign(merged.jokerHoles, groupScores.jokerHoles);
      });
      return merged;
    }

    if (roundId === currentRoundId) return currentScores;

    return null;
  };

  const scores = getScoresForRound(selectedRoundId);

  const getGameWinner = (gameId: string, holeNum: number) => {
    const entries = gameEntries.filter((e) => e.gameId === gameId && e.hole === holeNum);
    if (gameId === "sandy") {
      return config.players.find((p) => entries.some((e) => e.playerId === p.id && e.save))?.name;
    }
    if (gameId === "snake") {
      const snakeEntry = entries.find((e) => e.threePutts);
      return snakeEntry ? config.players.find((p) => p.id === snakeEntry.playerId)?.name : null;
    }
    return null;
  };

  const handleManualRefresh = async () => {
    if (!eventId || !selectedRoundId || !selectedRound || isRefreshing) return;
    setIsRefreshing(true);
    try {
      const merged = { playerScores: {}, jokerHoles: {} };
      for (const group of selectedRound.groups) {
        const scores = await getScoresFromFirebase(eventId, selectedRoundId, group.id);
        if (scores?.playerScores) Object.assign(merged.playerScores, scores.playerScores);
        if (scores?.jokerHoles) Object.assign(merged.jokerHoles, scores.jokerHoles);
      }
      setFreshScores(merged);
    } catch (err) {
      console.warn("Manual refresh failed:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="px-4 py-4 pb-24">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-xl" style={{ color: COLORS.green }}>📊 Daily Results</h2>
        <button
          onClick={handleManualRefresh}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          title="Refresh results"
        >
          <RefreshCw size={18} style={{ color: COLORS.green }} />
        </button>
      </div>

      {/* Round Selection */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-2">
        {config.rounds.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelectedRoundId(r.id)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0"
            style={{
              backgroundColor: selectedRoundId === r.id ? (r.excludeFromOverall ? COLORS.flag : COLORS.green) : (r.excludeFromOverall ? COLORS.flagPale : "white"),
              color: selectedRoundId === r.id ? "white" : (r.excludeFromOverall ? COLORS.flag : COLORS.charcoal),
              border: `1px solid ${r.excludeFromOverall ? COLORS.flag : COLORS.line}`,
            }}
          >
            {r.label}{r.excludeFromOverall ? " *" : ""}
          </button>
        ))}
      </div>

      {/* Leaderboard Section */}
      {selectedRound && scores && (
        <>
          <div className="mb-4">
            <h3 className="text-sm font-medium mb-2" style={{ color: COLORS.green }}>Leaderboard</h3>
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: COLORS.line }}>
              {selectedRound.groups.map((group, groupIdx) => {
                const groupPlayers = config.players.filter((p) => group.playerIds.includes(p.id));
                return (
                  <div key={group.id} style={{ backgroundColor: groupIdx % 2 === 0 ? COLORS.green : COLORS.greenLight }}>
                    <div className="px-4 py-2" style={{ backgroundColor: COLORS.green, color: "white" }}>
                      <p className="text-xs font-medium">{group.name}</p>
                    </div>
                    <div>
                      {groupPlayers.map((player) => {
                        const playerScores = scores?.playerScores?.[player.id] || {};
                        const jokerHole = scores?.jokerHoles?.[player.id];
                        const holesScored = Object.keys(playerScores).filter((h) => playerScores[h] !== "" && playerScores[h] != null).length;
                        let totalPts = 0, jokerBonus = 0;

                        selectedRound.course.holes.forEach((h) => {
                          const g = playerScores[h.number];
                          if (g !== "" && g != null) {
                            const ph = getPH(selectedRound.course, player, allowance);
                            const pts = stablefordPts(g, h.par, strokesOnHole(ph, h.si));
                            if (pts != null) {
                              // Apply joker bonus (double points) if this is the joker hole
                              const isJokerHole = h.number === jokerHole && jokerHole !== "NA";
                              const finalPts = isJokerHole ? pts * 2 : pts;
                              totalPts += finalPts;
                              if (isJokerHole) jokerBonus = pts; // Store the base points for display
                            }
                          }
                        });

                        const displayScore = `${totalPts} pts${jokerBonus > 0 ? ` [+${jokerBonus}]` : ""}`;
                        return (
                          <div key={player.id} className="flex items-center justify-between px-4 py-2 border-t" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                            <span className="text-sm" style={{ color: "white" }}>{player.name}</span>
                            <span className="text-sm font-bold" style={{ color: COLORS.gold }}>{displayScore} · {holesScored}/18</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Daily Competition Format */}
          {selectedRound && (
            <div className="mb-4 rounded-lg p-3" style={{ backgroundColor: COLORS.goldPale, border: `1px solid ${COLORS.gold}` }}>
              <p className="text-xs font-medium" style={{ color: COLORS.gold }}>Daily Competition Format:</p>
              <p className="text-xs mt-1" style={{ color: COLORS.charcoal }}>
                {COMPETITIONS.filter((c) => selectedRound.games?.some((g) => g.templateId === c.id) || COMPETITIONS.findIndex((x) => x.id === c.id) === 0)
                  .map((c) => c.name)
                  .join(", ") || "Stableford"}
              </p>
            </div>
          )}

          {/* Games & Competitions */}
          {(selectedRound.games?.length > 0 || selectedRound.bestBallTeams?.length > 0) && (
            <div className="mb-4">
              <h3 className="text-sm font-medium mb-2" style={{ color: COLORS.green }}>Games</h3>
              <div className="flex flex-col gap-2">
                {/* Best Ball Teams — shown as "game was played" card, results on Board tab */}
                {selectedRound.bestBallTeams?.length > 0 && (
                  <div className="rounded-lg p-3" style={{ backgroundColor: "white", border: `1px solid ${COLORS.line}` }}>
                    <p className="text-xs font-medium" style={{ color: COLORS.green }}>🤝 Best Ball Teams</p>
                    <p className="text-xs mt-1 opacity-60">Teams: {selectedRound.bestBallTeams.map((t: any) => t.name || "Team").join(" · ")}</p>
                  </div>
                )}
                {selectedRound.games?.map((game) => {
                  const savedWinners = selectedRound.gameWinners || {};

                  // Per-hole on-course games
                  if (game.holes && game.holes.length > 1) {
                    return (
                      <div key={game.id} className="rounded-lg p-3" style={{ backgroundColor: "white", border: `1px solid ${COLORS.line}` }}>
                        <p className="text-xs font-medium mb-2" style={{ color: COLORS.green }}>{game.emoji} {game.name}</p>
                        <div className="space-y-1 pl-2">
                          {game.holes.map((holeNum) => {
                            const winnerId = savedWinners[`oncourse-${game.templateId}-hole-${holeNum}`];
                            const winnerName = config.players.find((p) => p.id === winnerId)?.name;
                            return (
                              <div key={holeNum} className="flex justify-between text-xs">
                                <span style={{ color: COLORS.charcoal }}>Hole {holeNum}</span>
                                <span style={{ color: COLORS.gold, fontWeight: "600" }}>{winnerName || "—"}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  // Single-hole or daily games
                  let winnerId = savedWinners[`oncourse-${game.templateId}`] || savedWinners[`daily-${game.templateId}`];
                  // Sandy: derive from gameEntries if no saved winner
                  if (!winnerId && game.templateId === "sandy") {
                    for (const group of selectedRound.groups) {
                      for (const playerId of group.playerIds) {
                        if (gameEntries.some((e) => e.playerId === playerId && e.gameId === "sandy" && e.save)) {
                          winnerId = playerId;
                          break;
                        }
                      }
                      if (winnerId) break;
                    }
                  }
                  const winnerName = winnerId ? config.players.find((p) => p.id === winnerId)?.name : null;

                  return (
                    <div key={game.id} className="rounded-lg p-3" style={{ backgroundColor: "white", border: `1px solid ${COLORS.line}` }}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-xs font-medium mb-1" style={{ color: COLORS.green }}>{game.emoji} {game.name}</p>
                          {game.holes && game.holes.length === 1 && (
                            <p className="text-xs" style={{ color: COLORS.charcoal }}>Hole {game.holes[0]}</p>
                          )}
                        </div>
                        {winnerName && <p className="text-xs font-bold" style={{ color: COLORS.gold }}>{winnerName}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Overall Standings to this point */}
      {selectedRound && (() => {
        const selectedIdx = config.rounds.findIndex(r => r.id === selectedRoundId);
        const roundsToDate = config.rounds.slice(0, selectedIdx + 1).filter(r => !r.excludeFromOverall);
        if (roundsToDate.length === 0) return null;
        const playerTotals = config.players.filter(p => p.name).map(p => {
          let total = 0;
          roundsToDate.forEach(r => {
            const roundScores = allScoresByRound[r.id] || {};
            const group = getPlayerGroup(r, p.id);
            const so = group ? roundScores[group.id] : null;
            if (so) {
              const stats = computePlayerRoundStats(r, p, allowance, so);
              total += r.jokerBonusAppliesOverall !== false ? stats.dayTotal : stats.raw;
            }
          });
          return { player: p, total };
        }).sort((a, b) => b.total - a.total);
        return (
          <div className="mb-4">
            <h3 className="text-sm font-medium mb-2" style={{ color: COLORS.green }}>
              Overall Standings (after {selectedRound.label})
            </h3>
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: COLORS.line }}>
              {playerTotals.map(({ player, total }, idx) => (
                <div key={player.id} className="flex items-center justify-between px-4 py-2 border-t first:border-t-0"
                  style={{ borderColor: COLORS.line, backgroundColor: idx === 0 ? COLORS.goldPale : "white" }}>
                  <span className="text-sm font-medium" style={{ color: COLORS.charcoal }}>{idx + 1}. {player.name}</span>
                  <span className="text-sm font-bold" style={{ color: COLORS.gold }}>{total} pts</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <p className="text-xs mt-4 text-center opacity-60" style={{ color: COLORS.charcoal }}>
        Results by group · Complete data from {selectedRound?.label}
      </p>

      {config.links?.length > 0 && (
        <div className="mt-6 pt-4 border-t" style={{ borderColor: COLORS.line }}>
          <p className="text-xs font-medium mb-2 opacity-60" style={{ color: COLORS.charcoal }}>Useful Links</p>
          <div className="flex flex-col gap-2">
            {config.links.map((link: any, idx: number) => (
              <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer"
                className="text-sm px-3 py-2 rounded-lg text-center"
                style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}>
                {link.label} →
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// AdminPanel Component — hub for mid-event admin actions
function AdminPanel({ onGoToSetup, onGoToRounds, onGoToPlayers, onBack }) {
  const items = [
    { label: "Edit Event Setup", sub: "Courses, games, allowances, links", icon: Settings, action: onGoToSetup },
    { label: "Manage Rounds", sub: "Add, delete or reorder rounds", icon: Trophy, action: onGoToRounds },
    { label: "Manage Players", sub: "Withdraw, replace or add players", icon: Users, action: onGoToPlayers },
  ];
  return (
    <div className="max-w-md mx-auto px-4 py-6" style={{ backgroundColor: COLORS.cream, minHeight: "100vh" }}>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100">
          <ChevronLeft size={24} style={{ color: COLORS.charcoal }} />
        </button>
        <h2 className="font-display text-2xl" style={{ color: COLORS.green }}>Admin</h2>
      </div>
      <div className="flex flex-col gap-3">
        {items.map(({ label, sub, icon: Icon, action }) => (
          <button key={label} onClick={action} className="w-full p-4 rounded-xl bg-white border text-left flex items-center gap-3" style={{ borderColor: COLORS.line }}>
            <Icon size={20} style={{ color: COLORS.green }} />
            <div className="flex-1">
              <p className="font-medium text-sm" style={{ color: COLORS.charcoal }}>{label}</p>
              <p className="text-xs opacity-60">{sub}</p>
            </div>
            <ChevronRight size={16} style={{ color: COLORS.charcoal, opacity: 0.4 }} />
          </button>
        ))}
      </div>
    </div>
  );
}

// RoundsAdmin Component — add, delete, reorder rounds mid-event
function RoundsAdmin({ config, currentRoundId, onSave, onBack }) {
  const rounds = config.rounds;
  const currentIdx = rounds.findIndex(r => r.id === currentRoundId);
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState(`Round ${rounds.length + 1}`);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function saveRounds(newRounds) {
    const stillHasCurrent = newRounds.some(r => r.id === currentRoundId);
    onSave({ ...config, rounds: newRounds, currentRoundId: stillHasCurrent ? currentRoundId : newRounds[0]?.id });
  }

  function moveRound(idx, dir) {
    const swap = idx + dir;
    if (swap < 0 || swap >= rounds.length) return;
    const nr = [...rounds];
    [nr[idx], nr[swap]] = [nr[swap], nr[idx]];
    saveRounds(nr);
  }

  function deleteRound(id) {
    saveRounds(rounds.filter(r => r.id !== id));
    setConfirmId(null);
  }

  function addRound() {
    const label = newLabel.trim() || `Round ${rounds.length + 1}`;
    const nr = { ...defaultRound(rounds.length + 1), id: uid(), label };
    saveRounds([...rounds, nr]);
    setShowAdd(false);
    setNewLabel(`Round ${rounds.length + 2}`);
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6 pb-24" style={{ backgroundColor: COLORS.cream, minHeight: "100vh" }}>
      <div className="flex items-center gap-3 mb-2">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100">
          <ChevronLeft size={24} style={{ color: COLORS.charcoal }} />
        </button>
        <h2 className="font-display text-2xl" style={{ color: COLORS.green }}>Manage Rounds</h2>
      </div>
      <p className="text-xs opacity-60 mb-4 ml-1">Completed and active rounds cannot be deleted. Use ↑↓ to reorder any round.</p>

      {confirmId && (
        <div className="mb-4 p-4 rounded-xl border bg-white" style={{ borderColor: COLORS.flag }}>
          <p className="text-sm font-medium mb-3" style={{ color: COLORS.charcoal }}>
            Delete &ldquo;{rounds.find(r => r.id === confirmId)?.label}&rdquo;? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button onClick={() => deleteRound(confirmId)} className="flex-1 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: COLORS.flag }}>Delete</button>
            <button onClick={() => setConfirmId(null)} className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ border: `1px solid ${COLORS.line}`, backgroundColor: "white" }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 mb-4">
        {rounds.map((r, idx) => {
          const isPast = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isFuture = idx > currentIdx;
          const canDelete = isFuture;
          return (
            <div key={r.id} className="p-3 rounded-xl bg-white border flex items-center gap-2" style={{ borderColor: isCurrent ? COLORS.green : COLORS.line }}>
              <div className="flex flex-col">
                <button onClick={() => moveRound(idx, -1)} disabled={idx === 0} className="p-0.5 rounded disabled:opacity-20 hover:bg-gray-100">
                  <ChevronUp size={15} style={{ color: COLORS.charcoal }} />
                </button>
                <button onClick={() => moveRound(idx, 1)} disabled={idx === rounds.length - 1} className="p-0.5 rounded disabled:opacity-20 hover:bg-gray-100">
                  <ChevronDown size={15} style={{ color: COLORS.charcoal }} />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate" style={{ color: COLORS.charcoal }}>{r.label}</p>
                <p className="text-xs" style={{ color: isPast ? COLORS.charcoal : isCurrent ? COLORS.green : COLORS.gold, opacity: isPast ? 0.5 : 1 }}>
                  {isPast ? "Completed" : isCurrent ? "Active" : "Upcoming"}{r.course?.name ? ` · ${r.course.name}` : ""}
                </p>
              </div>
              {canDelete ? (
                <button onClick={() => setConfirmId(r.id)} className="p-2 rounded-lg flex-shrink-0" style={{ backgroundColor: COLORS.flagPale }}>
                  <X size={15} style={{ color: COLORS.flag }} />
                </button>
              ) : (
                <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 opacity-20">
                  <X size={15} style={{ color: COLORS.charcoal }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showAdd ? (
        <div className="p-4 rounded-xl bg-white border mb-4" style={{ borderColor: COLORS.line }}>
          <p className="text-sm font-medium mb-2" style={{ color: COLORS.charcoal }}>New Round Name</p>
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Round 3" className="w-full px-3 py-2 rounded-lg text-sm mb-2" style={{ border: `1px solid ${COLORS.line}` }} />
          <p className="text-xs opacity-60 mb-3">Configure course, groups and games via Edit Event Setup after adding.</p>
          <div className="flex gap-2">
            <button onClick={addRound} className="flex-1 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: COLORS.green }}>Add Round</button>
            <button onClick={() => setShowAdd(false)} className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ border: `1px solid ${COLORS.line}`, backgroundColor: "white" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2" style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}>
          <Plus size={16} /> Add Round
        </button>
      )}
    </div>
  );
}

// PlayersAdmin Component — withdraw, replace, or add players mid-event
// Uses save-on-exit: changes are held in local state and saved once when Back is pressed
function PlayersAdmin({ config: initialConfig, currentRoundId, onSave, onBack }) {
  const [localConfig, setLocalConfig] = useState(initialConfig);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editHcp, setEditHcp] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addHcp, setAddHcp] = useState("");

  const currentRound = localConfig.rounds.find(r => r.id === currentRoundId) || localConfig.rounds[0];

  function startEdit(p) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditHcp(p.handicap != null ? String(p.handicap) : "");
    setConfirmId(null);
  }

  function saveEdit(playerId) {
    const hcp = parseFloat(editHcp);
    const updatedPlayers = localConfig.players.map(p =>
      p.id === playerId ? { ...p, name: editName.trim(), handicap: isNaN(hcp) ? p.handicap : hcp } : p
    );
    setLocalConfig(c => ({ ...c, players: updatedPlayers }));
    setEditingId(null);
  }

  function removePlayer(playerId) {
    const updatedPlayers = localConfig.players.filter(p => p.id !== playerId);
    const updatedRounds = localConfig.rounds.map(r => ({
      ...r,
      groups: r.groups.map(g => ({ ...g, playerIds: g.playerIds.filter(pid => pid !== playerId) })),
    }));
    setLocalConfig(c => ({ ...c, players: updatedPlayers, rounds: updatedRounds }));
    setConfirmId(null);
  }

  function addPlayer() {
    if (!addName.trim()) return;
    const hcp = parseFloat(addHcp);
    const newPlayer = { id: uid(), name: addName.trim(), handicap: isNaN(hcp) ? 0 : hcp };
    setLocalConfig(c => ({ ...c, players: [...c.players, newPlayer] }));
    setAddName(""); setAddHcp(""); setShowAdd(false);
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6 pb-24" style={{ backgroundColor: COLORS.cream, minHeight: "100vh" }}>
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => { onSave(localConfig); onBack(); }} className="p-2 rounded-lg hover:bg-gray-100">
          <ChevronLeft size={24} style={{ color: COLORS.charcoal }} />
        </button>
        <h2 className="font-display text-2xl" style={{ color: COLORS.green }}>Manage Players</h2>
      </div>
      <p className="text-xs opacity-60 mb-4 ml-1">Edit/Replace updates name &amp; handicap — all recorded scores are kept. Remove clears the player from all groups.</p>

      <div className="flex flex-col gap-2 mb-4">
        {localConfig.players.filter(p => p.name).map(p => {
          const group = currentRound ? getPlayerGroup(currentRound, p.id) : null;

          if (editingId === p.id) {
            return (
              <div key={p.id} className="p-3 rounded-xl bg-white border" style={{ borderColor: COLORS.gold }}>
                <div className="flex gap-2 mb-2">
                  <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" className="flex-1 px-2 py-1.5 rounded text-sm" style={{ border: `1px solid ${COLORS.line}` }} />
                  <input value={editHcp} onChange={e => setEditHcp(e.target.value)} placeholder="HCP" type="number" step="0.1" className="w-20 px-2 py-1.5 rounded text-sm" style={{ border: `1px solid ${COLORS.line}` }} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(p.id)} className="flex-1 py-1.5 rounded text-sm font-medium text-white" style={{ backgroundColor: COLORS.green }}>Save</button>
                  <button onClick={() => setEditingId(null)} className="flex-1 py-1.5 rounded text-sm" style={{ border: `1px solid ${COLORS.line}`, backgroundColor: "white" }}>Cancel</button>
                </div>
              </div>
            );
          }

          if (confirmId === p.id) {
            return (
              <div key={p.id} className="p-3 rounded-xl bg-white border" style={{ borderColor: COLORS.flag }}>
                <p className="text-sm mb-2" style={{ color: COLORS.charcoal }}>Remove <strong>{p.name}</strong> from the event?</p>
                <div className="flex gap-2">
                  <button onClick={() => removePlayer(p.id)} className="flex-1 py-1.5 rounded text-sm font-medium text-white" style={{ backgroundColor: COLORS.flag }}>Remove</button>
                  <button onClick={() => setConfirmId(null)} className="flex-1 py-1.5 rounded text-sm" style={{ border: `1px solid ${COLORS.line}`, backgroundColor: "white" }}>Cancel</button>
                </div>
              </div>
            );
          }

          return (
            <div key={p.id} className="p-3 rounded-xl bg-white border flex items-center gap-2" style={{ borderColor: COLORS.line }}>
              {(() => {
                const teeId = currentRound?.playerTees?.[p.id];
                const tee = teeId ? currentRound.course?.tees?.find(t => t.id === teeId) : null;
                const teeColourId = tee ? tee.colour : (currentRound?.course?.primaryTeeColour || "white");
                const teeLabel = tee ? tee.label : (currentRound?.course?.primaryTeeLabel || "White");
                const colour = TEE_COLOURS.find(c => c.id === teeColourId) || TEE_COLOURS[0];
                return (
                  <span title={`${teeLabel} tees`} className="inline-block w-3 h-3 rounded-full flex-shrink-0 border border-black/10"
                    style={{ backgroundColor: colour.hex }} />
                );
              })()}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate" style={{ color: COLORS.charcoal }}>{p.name}</p>
                <p className="text-xs opacity-60">HCP {p.handicap ?? "—"}{group ? ` · ${group.name}` : " · Unassigned"}</p>
              </div>
              <button onClick={() => startEdit(p)} className="p-2 rounded-lg flex-shrink-0" style={{ backgroundColor: COLORS.goldPale }}>
                <Pencil size={14} style={{ color: COLORS.gold }} />
              </button>
              <button onClick={() => { setConfirmId(p.id); setEditingId(null); }} className="p-2 rounded-lg flex-shrink-0" style={{ backgroundColor: COLORS.flagPale }}>
                <X size={14} style={{ color: COLORS.flag }} />
              </button>
            </div>
          );
        })}
      </div>

      {showAdd ? (
        <div className="p-4 rounded-xl bg-white border mb-4" style={{ borderColor: COLORS.line }}>
          <p className="text-sm font-medium mb-2" style={{ color: COLORS.charcoal }}>Add Player</p>
          <div className="flex gap-2 mb-3">
            <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="Name" className="flex-1 px-3 py-2 rounded-lg text-sm" style={{ border: `1px solid ${COLORS.line}` }} />
            <input value={addHcp} onChange={e => setAddHcp(e.target.value)} placeholder="HCP" type="number" step="0.1" className="w-20 px-3 py-2 rounded-lg text-sm" style={{ border: `1px solid ${COLORS.line}` }} />
          </div>
          <p className="text-xs opacity-60 mb-3">Assign to a group via Edit Event Setup → Groups after adding.</p>
          <div className="flex gap-2">
            <button onClick={addPlayer} className="flex-1 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: COLORS.green }}>Add</button>
            <button onClick={() => setShowAdd(false)} className="flex-1 py-2 rounded-lg text-sm" style={{ border: `1px solid ${COLORS.line}`, backgroundColor: "white" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2" style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}>
          <Plus size={16} /> Add Player
        </button>
      )}
    </div>
  );
}

// Main GolfApp Component
export default function GolfApp({ userId, isAdmin, onAdminDone, adminLimits }: { userId: string; isAdmin?: boolean; onAdminDone?: () => void; adminLimits?: { maxSlots: number; tier: string } | null }) {
  const { logout } = useAuth();
  const loadedScoresRef = useRef<any>(null); // Store loaded scores to avoid state timing issues
  const [screen, setScreen] = useState("loading");
  const [setupReturnTo, setSetupReturnTo] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [config, setConfig] = useState<any>(null);
  const [groupSelections, setGroupSelections] = useState({});
  const [activeRoundId, setActiveRoundId] = useState(null);
  const [tab, setTab] = useState("score");
  const [scores, setScores] = useState({ playerScores: {}, jokerHoles: {} });
  const [gameEntries, setGameEntries] = useState<any[]>([]);
  const [allScoresByRound, setAllScoresByRound] = useState({});
  const [finishingRound, setFinishingRound] = useState(false);
  const [showEndOfDay, setShowEndOfDay] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<any>(null);
  const [effectiveIsAdmin, setEffectiveIsAdmin] = useState(isAdmin || false);

  // Check if user is the event admin based on stored adminUserId
  useEffect(() => {
    if (config?.adminUserId && userId !== "admin") {
      // If the config has an adminUserId and it matches current userId, user is admin
      if (config.adminUserId === userId) {
        setEffectiveIsAdmin(true);
      } else {
        setEffectiveIsAdmin(false);
      }
    } else {
      // Otherwise use the passed isAdmin prop
      setEffectiveIsAdmin(isAdmin || false);
    }
  }, [config, userId, isAdmin]);

  const celebrate = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const checkForEvent = async () => {
      const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      const urlEventId = params.get("eventId");

      if (urlEventId) {
        // Try localStorage first (faster and works offline/without Firebase permission)
        try {
          const localEvent = localStorage.getItem(`event-${urlEventId}`);
          if (localEvent) {
            const evt = JSON.parse(localEvent);
            setConfig(evt);
            setEventId(urlEventId);
            setActiveRoundId(evt.currentRoundId || evt.rounds[0]?.id);
            setScreen("join");
            // Always also check Firebase for latest round advancement (don't return early)
            try {
              const firebaseEvt = await getEventFromFirebase(urlEventId);
              if (firebaseEvt) {
                setConfig(firebaseEvt);
                setActiveRoundId(firebaseEvt.currentRoundId || firebaseEvt.rounds[0]?.id);
                localStorage.setItem(`event-${urlEventId}`, JSON.stringify(firebaseEvt));
              }
            } catch (e) {
              // Firebase unavailable - localStorage version is fine
            }
            return;
          }
        } catch (err) {
          console.warn("Failed to load event from localStorage:", err);
        }

        // Fallback to Firebase if not in localStorage
        try {
          const evt = await getEventFromFirebase(urlEventId);
          if (evt) {
            setConfig(evt);
            setEventId(urlEventId);
            setActiveRoundId(evt.currentRoundId || evt.rounds[0]?.id);
            localStorage.setItem(`event-${urlEventId}`, JSON.stringify(evt));
            setScreen("join");
            return;
          }
        } catch (err) {
          // Firebase load failed - might be permissions or network issue
          console.log("Could not load event from Firebase, will show setup screen");
        }
      }
      setScreen("setup");
    };
    checkForEvent();
  }, []);

  useEffect(() => {
    if (!eventId || !activeRoundId || !config || screen !== "main") return;
    const gid = groupSelections[activeRoundId];
    if (!gid) return;

    getScoresFromFirebase(eventId, activeRoundId, gid).then(setScores);
    getGameEntriesFromFirebase(eventId, activeRoundId, gid).then(setGameEntries);
  }, [eventId, activeRoundId, groupSelections, screen, config]);

  const refreshAllScores = useCallback(async () => {
    if (!eventId || !config) return;
    const result = {};
    for (const r of config.rounds) {
      result[r.id] = {};
      for (const g of r.groups) {
        result[r.id][g.id] = await getScoresFromFirebase(eventId, r.id, g.id);
      }
    }
    setAllScoresByRound(result);
  }, [eventId, config]);

  useEffect(() => {
    if ((tab === "leaderboard" || showEndOfDay) && eventId && config) {
      // Refresh immediately when opening leaderboard or end-of-day screen
      refreshAllScores();
      // Then refresh every 5 seconds while viewing (for live sync across devices)
      const interval = setInterval(refreshAllScores, 5000);
      return () => clearInterval(interval);
    }
  }, [tab, showEndOfDay, eventId, config, refreshAllScores]);

  const handleScoreChange = (updated: any) => {
    setScores(updated);
    // Save to localStorage immediately (primary persistence)
    if (eventId && activeRoundId) {
      try {
        const key = `golf-scores-${eventId}-${activeRoundId}`;
        localStorage.setItem(key, JSON.stringify(updated));
      } catch (e) {
        console.warn("Failed to save to localStorage:", e);
      }
    }
    // Also try Firebase (secondary, may fail if permissions aren't set)
    if (eventId && activeRoundId) {
      const gid = groupSelections[activeRoundId];
      if (gid) saveScoresToFirebase(eventId, activeRoundId, gid, updated).catch(e => console.warn("Firebase save failed (this is OK locally):", e));
    }
  };

  const onGameEntriesChange = (updated: any[]) => {
    setGameEntries(updated);
    if (eventId && activeRoundId) {
      const gid = groupSelections[activeRoundId];
      if (gid) saveGameEntriesToFirebase(eventId, activeRoundId, gid, updated);
    }
  };

  const handleFinishRound = async () => {
    if (finishingRound) return; // Prevent double-click

    const currentRoundIdx = config.rounds.findIndex((r) => r.id === activeRoundId);
    const nextRound = config.rounds[currentRoundIdx + 1];

    setFinishingRound(true);

    // Refresh all scores before showing end-of-day processing
    if (eventId && config) {
      const result = {};

      // Try to load from localStorage first (primary source)
      for (const r of config.rounds) {
        result[r.id] = {};
        for (const g of r.groups) {
          try {
            const key = `golf-scores-${eventId}-${r.id}`;
            const stored = localStorage.getItem(key);
            if (stored) {
              result[r.id][g.id] = JSON.parse(stored);
            } else {
              // If not in localStorage, try Firebase
              result[r.id][g.id] = await getScoresFromFirebase(eventId, r.id, g.id);
            }
          } catch (err) {
            console.warn(`Could not load scores for ${r.id}/${g.id}:`, err);
            result[r.id][g.id] = { playerScores: {}, jokerHoles: {} };
          }
        }
      }

      // Store in ref and localStorage for later use
      loadedScoresRef.current = result;
      try {
        localStorage.setItem(`golf-scores-${eventId}`, JSON.stringify(result));
      } catch (e) {
        console.warn("Could not save to localStorage:", e);
      }
      setAllScoresByRound(result);
    }

    // Show end-of-day processing screen (admin always, scorers only if more rounds)
    setFinishingRound(false);
    if (effectiveIsAdmin) {
      setShowEndOfDay(true);
    } else {
      if (nextRound) {
        // Non-admin scorers wait on leaderboard while admin processes end of day
        setTab("leaderboard");
      } else {
        celebrate("🎉 All rounds complete!");
        setScreen("main");
      }
    }
  };

  const handleEndOfDayComplete = (eventData: any) => {
    const currentRoundIdx = config.rounds.findIndex((r) => r.id === activeRoundId);
    const nextRound = eventData.dayTwoRound; // null if this is the final round
    const currentRound = config.rounds[currentRoundIdx];

    // Get scores from ref (loaded in handleFinishRound) - avoids state timing issues
    const currentScoresFromRef = loadedScoresRef.current?.[activeRoundId];

    // Save game winners into the current round
    const updatedCurrentRound = {
      ...currentRound,
      gameWinners: eventData.gameWinners || {},
    };

    // Preserve scores - both in original structure AND as merged flat structure
    setAllScoresByRound((cur) => {
      const updated = { ...cur };
      if (currentScoresFromRef) {
        updated[activeRoundId] = currentScoresFromRef;
        const preserved = { playerScores: {}, jokerHoles: {} };
        Object.values(currentScoresFromRef).forEach((groupScores: any) => {
          if (groupScores?.playerScores) Object.assign(preserved.playerScores, groupScores.playerScores);
          if (groupScores?.jokerHoles) Object.assign(preserved.jokerHoles, groupScores.jokerHoles);
        });
        updated[`${activeRoundId}_preserved`] = preserved;
      }
      return updated;
    });

    if (nextRound) {
      // Day transition — update next round groups and advance
      const updatedNextRound = {
        ...nextRound,
        bestBallTeams: currentRound.bestBallTeams,
      };
      const updatedConfig = {
        ...config,
        currentRoundId: nextRound.id,
        rounds: config.rounds.map((r) => {
          if (r.id === activeRoundId) return updatedCurrentRound;
          if (r.id === nextRound.id) return updatedNextRound;
          return r;
        }),
      };
      setConfig(updatedConfig);
      if (eventId) {
        try { localStorage.setItem(`event-${eventId}`, JSON.stringify(updatedConfig)); } catch (e) {}
        saveEventToFirebase(eventId, userId, updatedConfig).catch(e => console.warn("Firebase save failed:", e));
      }
      setActiveRoundId(nextRound.id);
      setGroupSelections((cur) => ({ ...cur, [nextRound.id]: null }));
      setScores({ playerScores: {}, jokerHoles: {} });
      setGameEntries([]);
      setTab("score");
      setShowEndOfDay(false);
      setScreen("join");
      celebrate(`📍 ${nextRound.label} Setup Complete - Ready to Score`);
    } else {
      // Final round — save game winners and wrap up
      const updatedConfig = {
        ...config,
        rounds: config.rounds.map((r) => r.id === activeRoundId ? updatedCurrentRound : r),
      };
      setConfig(updatedConfig);
      if (eventId) {
        try { localStorage.setItem(`event-${eventId}`, JSON.stringify(updatedConfig)); } catch (e) {}
        saveEventToFirebase(eventId, userId, updatedConfig).catch(e => console.warn("Firebase save failed:", e));
      }
      setShowEndOfDay(false);
      celebrate("🎉 Tournament Complete!");
      setScreen("main");
    }
  };

  const handleSetupSave = async (newConfig: any) => {
    try {
      const newEventId = uid();
      const configWithIds = {
        ...newConfig,
        adminUserId: userId !== "admin" ? userId : undefined, // Store admin's userId for later identification
        rounds: newConfig.rounds.map((r) => ({
          ...r,
          games: (r.games || []).map((g) => ({
            ...g,
            id: g.id || uid(),
          })),
        })),
      };

      // Set up locally immediately (works offline)
      setEventId(newEventId);
      setConfig(configWithIds);
      setActiveRoundId(configWithIds.rounds[0].id);
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", `?eventId=${newEventId}`);
      }

      // Save full event config to localStorage (so scorers can load it even without Firebase read permission)
      localStorage.setItem(`event-${newEventId}`, JSON.stringify(configWithIds));

      setScreen("event-created");
      celebrate("✅ Event created!");

      // Only try to save to Firebase if user is authenticated (not in admin setup mode)
      if (userId !== "admin") {
        saveEventToFirebase(newEventId, userId, configWithIds).catch((err) => {
          console.log("Event will sync when online:", err);
        });
      } else {
        // In admin setup mode - user can log in later to sync
        console.log("Admin setup complete. Event will sync after login.");
      }
    } catch (err) {
      console.error("Error creating event:", err);
      celebrate("❌ Failed to create event");
    }
  };

  const handleMidEventSave = (updatedConfig: any) => {
    setConfig(updatedConfig);
    if (eventId) {
      try { localStorage.setItem(`event-${eventId}`, JSON.stringify(updatedConfig)); } catch (e) {}
      saveEventToFirebase(eventId, userId, updatedConfig).catch(e => console.warn("Firebase save failed:", e));
    }
  };

  const handleReset = async () => {
    // Clear event and logout
    try {
      localStorage.removeItem("ptm-golf-eventId");
      await logout();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const fontStyle = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap');
      .font-display { font-family: 'Fraunces', serif; }
      * { font-family: 'Inter', sans-serif; }
    `}</style>
  );

  if (screen === "loading") {
    return (
      <div style={{ backgroundColor: COLORS.cream, minHeight: "100vh" }}>
        {fontStyle}
        <div className="flex items-center justify-center py-20">
          <Flag size={28} style={{ color: COLORS.green }} className="animate-pulse" />
        </div>
      </div>
    );
  }

  if (screen === "event-created" && config && effectiveIsAdmin) {
    const eventLink = `${typeof window !== "undefined" ? window.location.origin : ""}?eventId=${eventId}`;
    return (
      <div style={{ backgroundColor: COLORS.cream, minHeight: "100vh" }} className="flex flex-col items-center justify-center max-w-md mx-auto px-4">
        {fontStyle}
        <Toast toast={toast} />

        <div className="text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: COLORS.green }}>
            Event Created!
          </h2>
          <p className="text-sm opacity-60 mb-6" style={{ color: COLORS.charcoal }}>
            {config.eventName}
          </p>

          <div className="bg-white rounded-xl p-4 mb-6" style={{ border: `2px solid ${COLORS.gold}` }}>
            <p className="text-xs opacity-60 mb-2" style={{ color: COLORS.charcoal }}>Event Link:</p>
            <p className="text-xs font-mono break-all mb-4 px-2 py-2 rounded" style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}>
              {eventLink}
            </p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(eventLink);
                celebrate("📋 Link copied!");
              }}
              className="w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2"
              style={{ backgroundColor: COLORS.gold, color: "white" }}
            >
              📋 Copy Event Link
            </button>

            {/* QR Code */}
            <div className="mt-4 pt-4 border-t" style={{ borderColor: COLORS.line }}>
              <p className="text-xs opacity-60 mb-3" style={{ color: COLORS.charcoal }}>Or scan QR code:</p>
              <div className="flex justify-center mb-3">
                <div style={{ padding: "8px", backgroundColor: "white", borderRadius: "8px" }}>
                  <QRCode value={eventLink} size={180} level="H" includeMargin={true} />
                </div>
              </div>
              <button
                onClick={() => {
                  const qrCanvas = document.querySelector("canvas");
                  if (qrCanvas) {
                    const image = qrCanvas.toDataURL("image/png");
                    const link = document.createElement("a");
                    link.href = image;
                    link.download = `ptm-golf-event-${eventId}-qr.png`;
                    link.click();
                    celebrate("⬇️ QR code downloaded!");
                  }
                }}
                className="w-full py-2 rounded-lg font-medium text-xs"
                style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}
              >
                ⬇️ Download QR Code
              </button>
            </div>
          </div>

          <p className="text-xs mb-4" style={{ color: COLORS.charcoal }}>
            Share this link with participants so they can join the event!
          </p>

          <button
            onClick={() => {
              setScreen("main");
              celebrate("✅ Ready to go!");
            }}
            className="w-full py-3 rounded-lg font-medium"
            style={{ backgroundColor: COLORS.green, color: "white" }}
          >
            Continue to Event
          </button>
        </div>
      </div>
    );
  }

  // End of Day Processing (admin only)
  if (showEndOfDay && config && effectiveIsAdmin) {
    const currentRound = config.rounds.find((r) => r.id === activeRoundId);
    const nextRound = config.rounds[config.rounds.findIndex((r) => r.id === activeRoundId) + 1];
    return (
      <EndOfDayProcessing
        config={config}
        dayOneRound={currentRound}
        dayTwoRound={nextRound}
        allScores={allScoresByRound[activeRoundId] || {}}
        allScoresByRound={allScoresByRound}
        currentScores={scores}
        gameEntriesData={gameEntries}
        onComplete={handleEndOfDayComplete}
        onBack={() => setShowEndOfDay(false)}
      />
    );
  }

  if (screen === "admin-panel") {
    return (
      <AdminPanel
        onGoToSetup={() => { setSetupReturnTo("admin-panel"); setScreen("setup"); }}
        onGoToRounds={() => setScreen("rounds-admin")}
        onGoToPlayers={() => setScreen("players-admin")}
        onBack={() => setScreen("main")}
      />
    );
  }

  if (screen === "rounds-admin") {
    return (
      <RoundsAdmin
        config={config}
        currentRoundId={activeRoundId}
        onSave={(updatedConfig) => { handleMidEventSave(updatedConfig); setScreen("admin-panel"); }}
        onBack={() => setScreen("admin-panel")}
      />
    );
  }

  if (screen === "players-admin") {
    return (
      <PlayersAdmin
        config={config}
        currentRoundId={activeRoundId}
        onSave={(updatedConfig) => { handleMidEventSave(updatedConfig); }}
        onBack={() => setScreen("admin-panel")}
      />
    );
  }

  if (screen === "setup") {
    // Regular users can't access setup (event creation)
    if (!effectiveIsAdmin) {
      return (
        <div style={{ backgroundColor: COLORS.cream, minHeight: "100vh" }} className="flex flex-col items-center justify-center max-w-md mx-auto px-4">
          <p className="text-center mb-6" style={{ color: COLORS.charcoal }}>
            No event is currently active. Please ask your admin to set up an event before you can start scoring.
          </p>
          <button
            onClick={handleReset}
            className="py-2 px-6 rounded-lg font-medium flex items-center gap-2"
            style={{ backgroundColor: COLORS.flagPale, color: COLORS.flag }}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      );
    }

    const midEventSave = (newConfig: any) => {
      const configWithIds = {
        ...newConfig,
        adminUserId: config?.adminUserId,
        rounds: newConfig.rounds.map((r: any) => ({
          ...r,
          games: (r.games || []).map((g: any) => ({ ...g, id: g.id || uid() })),
        })),
      };
      handleMidEventSave(configWithIds);
      setSetupReturnTo(null);
      setScreen("admin-panel");
    };

    return (
      <div style={{ backgroundColor: COLORS.cream, minHeight: "100vh" }}>
        {fontStyle}
        <SetupForm
          initialConfig={config}
          onSave={setupReturnTo ? midEventSave : handleSetupSave}
          onCancel={setupReturnTo ? () => { setSetupReturnTo(null); setScreen("admin-panel"); } : null}
          isAdmin={effectiveIsAdmin}
          onAdminDone={onAdminDone}
          allScoresByRound={allScoresByRound}
          adminLimits={adminLimits ?? (() => { try { const s = JSON.parse(localStorage.getItem("ptm-license") || "null"); return s?.maxSlots ? s : null; } catch { return null; } })()}
        />
        <div className="max-w-md mx-auto px-4 pb-4 flex gap-2">
          {effectiveIsAdmin && onAdminDone && (
            <button
              onClick={onAdminDone}
              className="flex-1 py-2 px-4 rounded-lg text-sm flex items-center justify-center gap-2 font-medium"
              style={{ backgroundColor: COLORS.cream, color: COLORS.charcoal, border: `1px solid ${COLORS.line}` }}
            >
              Exit without Saving
            </button>
          )}
          <button
            onClick={handleReset}
            className="flex-1 py-2 px-4 rounded-lg text-sm flex items-center justify-center gap-2"
            style={{ backgroundColor: COLORS.flagPale, color: COLORS.flag }}
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (screen === "join" && config) {
    const joinRound = activeRoundId ? config.rounds.find((r) => r.id === activeRoundId) : config.rounds[0];
    return (
      <div style={{ backgroundColor: COLORS.cream, minHeight: "100vh" }}>
        {fontStyle}
        <Toast toast={toast} />
        <JoinScreen
          config={config}
          round={joinRound}
          onJoin={(gid) => {
            setGroupSelections({ ...groupSelections, [joinRound.id]: gid });
            setTab("score");
            setScreen("main");
          }}
          onEdit={() => setScreen("setup")}
          onReset={handleReset}
        />
      </div>
    );
  }

  const tabs = [
    { id: "score", label: "Score", icon: Pencil },
    { id: "games", label: "Games", icon: Target },
    { id: "leaderboard", label: "Board", icon: Trophy },
    { id: "results", label: "Results", icon: BarChart3 },
  ];

  const activeRound = config?.rounds.find((r) => r.id === activeRoundId) || config?.rounds?.[0];
  const currentGroupId = groupSelections[activeRoundId];
  const needsPick = !currentGroupId;

  return (
    <div style={{ backgroundColor: COLORS.cream, minHeight: "100vh" }} className="relative max-w-md mx-auto">
      {fontStyle}
      <Toast toast={toast} />

      <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: "white", borderBottom: `1px solid ${COLORS.line}` }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: COLORS.green }}>
            ⛳ {config?.eventName}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: COLORS.charcoal, opacity: 0.6 }}>
            {activeRound?.label || ""}
          </p>
        </div>
        <div className="flex gap-2">
          {effectiveIsAdmin && (
            <button onClick={() => setScreen("admin-panel")} aria-label="Admin">
              <Settings size={18} style={{ color: COLORS.charcoal, opacity: 0.6 }} />
            </button>
          )}
          <button onClick={handleReset} aria-label="Sign out">
            <LogOut size={18} style={{ color: COLORS.charcoal, opacity: 0.6 }} />
          </button>
        </div>
      </div>

      {needsPick ? (
        <PickGroupScreen
          config={config}
          round={activeRound}
          onPick={(gid) => {
            setGroupSelections({ ...groupSelections, [activeRoundId]: gid });
          }}
          onCancel={() => {}}
        />
      ) : finishingRound ? (
        <EndOfRoundGamesScreen
          config={config}
          round={activeRound}
          groupId={currentGroupId}
          gameEntries={gameEntries}
          onEntriesChange={onGameEntriesChange}
          onFinish={handleFinishRound}
        />
      ) : (
        <>
          {/* Tab Navigation at Top */}
          <div className="sticky top-0 bg-white border-b z-40" style={{ borderColor: COLORS.line }}>
            <div className="flex max-w-md mx-auto">
              {tabs.map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button key={t.id} onClick={() => setTab(t.id)} className="flex-1 flex flex-col items-center gap-0.5 py-3">
                    <Icon size={20} style={{ color: active ? COLORS.green : COLORS.charcoal, opacity: active ? 1 : 0.45 }} />
                    <span className="text-[11px] font-medium" style={{ color: active ? COLORS.green : COLORS.charcoal, opacity: active ? 1 : 0.45 }}>
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab Content */}
          {tab === "score" && config && (
            <ScoreTab
              config={config}
              round={activeRound}
              groupId={currentGroupId}
              scores={scores}
              onScoreChange={handleScoreChange}
              onCelebrate={celebrate}
              gameEntries={gameEntries}
              onGameEntriesChange={onGameEntriesChange}
              onFinish={handleFinishRound}
            />
          )}
          {tab === "games" && config && (
            <GamesTab
              config={config}
              round={activeRound}
              groupId={currentGroupId}
              gameEntries={gameEntries}
              onEntriesChange={onGameEntriesChange}
            />
          )}
          {tab === "leaderboard" && config && (
            <LeaderboardTab
              config={config}
              allScoresByRound={allScoresByRound}
              currentRoundId={activeRoundId}
              currentScores={scores}
            />
          )}
          {tab === "results" && config && (
            <GameResultsTab
              config={config}
              allScoresByRound={allScoresByRound}
              currentRoundId={activeRoundId}
              currentScores={scores}
              eventId={eventId}
              gameEntries={gameEntries}
            />
          )}
        </>
      )}
    </div>
  );
}
