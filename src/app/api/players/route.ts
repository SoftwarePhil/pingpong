import { NextRequest, NextResponse } from 'next/server';
import { Player } from '../../../types/pingpong';
import { getPlayers, setPlayers, saveData } from '../../../data/data';

export async function GET() {
  try {
    const players = getPlayers();
    return NextResponse.json(players);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to read players' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name }: { name: string } = body;
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    const players = getPlayers();
    const newPlayer: Player = {
      id: Date.now().toString(),
      name,
    };
    players.push(newPlayer);
    setPlayers(players);
    saveData();
    return NextResponse.json(newPlayer, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to add player' }, { status: 500 });
  }
}
