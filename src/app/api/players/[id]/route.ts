import { NextRequest, NextResponse } from 'next/server';
import { getPlayers, saveData, setPlayers } from '../../../../data/data';
import { requireAdmin } from '../../../../lib/auth';
import { decoratePlayerName, parsePlayerProfileFields, stripBirthdayCake } from '../../../../lib/player';
import { Player } from '../../../../types/pingpong';

const OPTIONAL_FIELDS = ['firstName', 'lastName', 'birthday', 'profilePicture'] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const { id } = await params;
    const parsed = parsePlayerProfileFields(await request.json());
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const players = await getPlayers();
    const player = players.find(candidate => candidate.id === id);
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const fields = parsed.fields;
    if (fields.name !== undefined) {
      const duplicate = players.find(candidate =>
        candidate.id !== id && stripBirthdayCake(candidate.name).toLowerCase() === fields.name!.toLowerCase()
      );
      if (duplicate) {
        return NextResponse.json({ error: `A player named "${duplicate.name}" already exists` }, { status: 409 });
      }
    }

    const updatedPlayer: Player = { ...player, ...fields };
    for (const field of OPTIONAL_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(fields, field) && fields[field] === undefined) {
        delete updatedPlayer[field];
      }
    }

    await setPlayers(players.map(candidate => candidate.id === id ? updatedPlayer : candidate));
    await saveData();
    return NextResponse.json(decoratePlayerName(updatedPlayer));
  } catch (error) {
    console.error('Error updating player:', error);
    return NextResponse.json({ error: 'Failed to update player' }, { status: 500 });
  }
}
