import { NextRequest, NextResponse } from 'next/server';
import { Game, Match } from '../../../types/pingpong';
import fs from 'fs';
import path from 'path';

const gamesPath = path.join(process.cwd(), 'src/data/games.json');
const matchesPath = path.join(process.cwd(), 'src/data/matches.json');

export async function GET() {
  try {
    const data = fs.readFileSync(gamesPath, 'utf8');
    const games: Game[] = JSON.parse(data);
    return NextResponse.json(games);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to read games' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { player1Id, player2Id, score1, score2, matchId }: { player1Id: string; player2Id: string; score1: number; score2: number; matchId?: string } = body;
    if (!player1Id || !player2Id || score1 === undefined || score2 === undefined) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    // Validate ping pong scoring rules (deuce logic)
    const maxScore = Math.max(score1, score2);
    const minScore = Math.min(score1, score2);
    const scoreDifference = maxScore - minScore;
    if (maxScore < 11) {
      return NextResponse.json({ error: 'Game must reach 11 points to be complete' }, { status: 400 });
    }
    else{
    if (maxScore > 11 && (scoreDifference !== 2)) {
      return NextResponse.json({ error: 'Game must be won by 2 points' }, { status: 400 });
    }}

    const gamesData = fs.readFileSync(gamesPath, 'utf8');
    const games: Game[] = JSON.parse(gamesData);
    const newGame: Game = {
      id: Date.now().toString(),
      matchId,
      player1Id,
      player2Id,
      score1,
      score2,
      date: new Date().toISOString(),
    };
    games.push(newGame);
    fs.writeFileSync(gamesPath, JSON.stringify(games, null, 2));

    // Update match if matchId provided
    if (matchId) {
      const matchesData = fs.readFileSync(matchesPath, 'utf8');
      const matches: Match[] = JSON.parse(matchesData);
      const match = matches.find(m => m.id === matchId);
      if (match) {
        match.games.push(newGame);
        // Check if match is complete
        const p1Wins = match.games.filter(g => g.score1 > g.score2).length;
        const p2Wins = match.games.filter(g => g.score2 > g.score1).length;
        const requiredWins = Math.ceil(match.bestOf / 2);
        if (p1Wins >= requiredWins) {
          match.winnerId = match.player1Id;
        } else if (p2Wins >= requiredWins) {
          match.winnerId = match.player2Id;
        }
        fs.writeFileSync(matchesPath, JSON.stringify(matches, null, 2));
      }
    }

    return NextResponse.json(newGame, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to add game' }, { status: 500 });
  }
}
