import { NextRequest, NextResponse } from 'next/server';
import { Player } from '../../../types/pingpong';
import fs from 'fs';
import path from 'path';

const dataPath = path.join(process.cwd(), 'src/data/players.json');

export async function GET() {
  try {
    const data = fs.readFileSync(dataPath, 'utf8');
    const players: Player[] = JSON.parse(data);
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
    const data = fs.readFileSync(dataPath, 'utf8');
    const players: Player[] = JSON.parse(data);
    const newPlayer: Player = {
      id: Date.now().toString(),
      name,
    };
    players.push(newPlayer);
    fs.writeFileSync(dataPath, JSON.stringify(players, null, 2));
    return NextResponse.json(newPlayer, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to add player' }, { status: 500 });
  }
}
