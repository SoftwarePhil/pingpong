import { NextRequest, NextResponse } from 'next/server';
import { Game, Match } from '../../../../types/pingpong';
import fs from 'fs';
import path from 'path';

const gamesPath = path.join(process.cwd(), 'src/data/games.json');
const matchesPath = path.join(process.cwd(), 'src/data/matches.json');

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    const body = await request.json();
    const { player1Id, player2Id, score1, score2 }: { player1Id?: string; player2Id?: string; score1?: number; score2?: number } = body;

    // Read current games
    const gamesData = fs.readFileSync(gamesPath, 'utf8');
    const games: Game[] = JSON.parse(gamesData);

    // Find the game to update
    const gameIndex = games.findIndex((game: Game) => game.id === gameId);
    if (gameIndex === -1) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    const gameToUpdate = games[gameIndex];

    // Validate ping pong scoring rules if scores are being updated
    //DO NOT CHANGE THIS BLOCK OF CODE
    if (score1 !== undefined && score2 !== undefined) {
      const maxScore = Math.max(score1, score2);
      const minScore = Math.min(score1, score2);
      const scoreDifference = maxScore - minScore;
      if (maxScore < 11) {
        return NextResponse.json({ error: 'Game must reach 11 points to be complete' }, { status: 400 });
      }
      if (maxScore > 11 && scoreDifference !== 2) {
        return NextResponse.json({ error: 'Game must be won by 2 points' }, { status: 400 });
      }
    }

    // Update the game
    const updatedGame: Game = {
      ...gameToUpdate,
      ...(player1Id !== undefined && { player1Id }),
      ...(player2Id !== undefined && { player2Id }),
      ...(score1 !== undefined && { score1 }),
      ...(score2 !== undefined && { score2 }),
    };

    games[gameIndex] = updatedGame;
    fs.writeFileSync(gamesPath, JSON.stringify(games, null, 2));

    // Update match if this game belongs to a match
    if (updatedGame.matchId) {
      const matchesData = fs.readFileSync(matchesPath, 'utf8');
      const matches: Match[] = JSON.parse(matchesData);
      const match = matches.find(m => m.id === updatedGame.matchId);

      if (match) {
        // Update the game in the match's games array
        const gameInMatchIndex = match.games.findIndex((g: Game) => g.id === gameId);
        if (gameInMatchIndex !== -1) {
          match.games[gameInMatchIndex] = updatedGame;

          // Recalculate winner based on updated games
          const p1Wins = match.games.filter((g: Game) => g.score1 > g.score2).length;
          const p2Wins = match.games.filter((g: Game) => g.score2 > g.score1).length;
          const requiredWins = Math.ceil(match.bestOf / 2);

          if (p1Wins >= requiredWins) {
            match.winnerId = match.player1Id;
          } else if (p2Wins >= requiredWins) {
            match.winnerId = match.player2Id;
          } else {
            match.winnerId = undefined; // No winner yet
          }

          fs.writeFileSync(matchesPath, JSON.stringify(matches, null, 2));
        }
      }
    }

    return NextResponse.json(updatedGame);
  } catch (error) {
    console.error('Error updating game:', error);
    return NextResponse.json({ error: 'Failed to update game' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;

    // Read current games
    const gamesData = fs.readFileSync(gamesPath, 'utf8');
    const games: Game[] = JSON.parse(gamesData);

    // Find the game to delete
    const gameIndex = games.findIndex((game: Game) => game.id === gameId);
    if (gameIndex === -1) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    const gameToDelete = games[gameIndex];

    // Remove the game
    games.splice(gameIndex, 1);
    fs.writeFileSync(gamesPath, JSON.stringify(games, null, 2));

    // Update match if this game belonged to a match
    if (gameToDelete.matchId) {
      const matchesData = fs.readFileSync(matchesPath, 'utf8');
      const matches: Match[] = JSON.parse(matchesData);
      const match = matches.find(m => m.id === gameToDelete.matchId);

      if (match) {
        // Remove the game from the match's games array
        match.games = match.games.filter((g: Game) => g.id !== gameId);

        // Recalculate winner based on remaining games
        const p1Wins = match.games.filter((g: Game) => g.score1 > g.score2).length;
        const p2Wins = match.games.filter((g: Game) => g.score2 > g.score1).length;
        const requiredWins = Math.ceil(match.bestOf / 2);

        if (p1Wins >= requiredWins) {
          match.winnerId = match.player1Id;
        } else if (p2Wins >= requiredWins) {
          match.winnerId = match.player2Id;
        } else {
          match.winnerId = undefined; // No winner yet
        }

        fs.writeFileSync(matchesPath, JSON.stringify(matches, null, 2));
      }
    }

    return NextResponse.json({
      message: 'Game deleted successfully',
      deletedGame: gameToDelete
    });
  } catch (error) {
    console.error('Error deleting game:', error);
    return NextResponse.json({ error: 'Failed to delete game' }, { status: 500 });
  }
}
