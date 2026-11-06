import { NextRequest, NextResponse } from 'next/server';
import { Player } from '../../../types/pingpong';
import { newId } from '../../../lib/random';
import { getPlayers, setPlayers } from '../../../data/data';
import { clubFromRequest } from '../../../lib/clubRequest';
import { requireAdmin } from '../../../lib/auth';
import { decoratePlayerName, parsePlayerProfileFields, stripBirthdayCake } from '../../../lib/player';

export async function GET(request: NextRequest) {
  try {
    const club = await clubFromRequest(request);
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });
    const players = await getPlayers(club.id);
    return NextResponse.json(players.map(player => decoratePlayerName(player)));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to read players' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { admin, denied } = await requireAdmin(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const parsed = parsePlayerProfileFields(body, true);
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const fields = parsed.fields;
    const name = fields.name!;
    const players = await getPlayers(admin.clubId);
    const duplicate = players.find(p => stripBirthdayCake(p.name).toLowerCase() === name.toLowerCase());
    if (duplicate) {
      return NextResponse.json({ error: `A player named "${duplicate.name}" already exists` }, { status: 409 });
    }
    const newPlayer: Player = {
      id: newId(),
      clubId: admin.clubId,
      name,
      tournamentIds: [],
      createdAt: new Date().toISOString(),
      ...(fields.firstName !== undefined && { firstName: fields.firstName }),
      ...(fields.lastName !== undefined && { lastName: fields.lastName }),
      ...(fields.birthday !== undefined && { birthday: fields.birthday }),
      ...(fields.profilePicture !== undefined && { profilePicture: fields.profilePicture }),
    };
    players.push(newPlayer);
    await setPlayers(players);
    return NextResponse.json(decoratePlayerName(newPlayer), { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to add player' }, { status: 500 });
  }
}
