import { NextRequest, NextResponse } from 'next/server';
import { Player } from '../../../types/pingpong';
import { getPlayers, setPlayers, saveData } from '../../../data/data';
import { requireAdmin } from '../../../lib/auth';
import { decoratePlayerName, parsePlayerProfileFields, stripBirthdayCake } from '../../../lib/player';

export async function GET() {
  try {
    const players = await getPlayers();
    return NextResponse.json(players.map(player => decoratePlayerName(player)));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to read players' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const parsed = parsePlayerProfileFields(body, true);
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const fields = parsed.fields;
    const name = fields.name!;
    const players = await getPlayers();
    const duplicate = players.find(p => stripBirthdayCake(p.name).toLowerCase() === name.toLowerCase());
    if (duplicate) {
      return NextResponse.json({ error: `A player named "${duplicate.name}" already exists` }, { status: 409 });
    }
    const newPlayer: Player = {
      id: Date.now().toString(),
      name,
      tournamentIds: [],
      ...(fields.firstName !== undefined && { firstName: fields.firstName }),
      ...(fields.lastName !== undefined && { lastName: fields.lastName }),
      ...(fields.birthday !== undefined && { birthday: fields.birthday }),
      ...(fields.profilePicture !== undefined && { profilePicture: fields.profilePicture }),
    };
    players.push(newPlayer);
    await setPlayers(players);
    await saveData();
    return NextResponse.json(decoratePlayerName(newPlayer), { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to add player' }, { status: 500 });
  }
}
