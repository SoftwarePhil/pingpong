import { useState } from 'react';
import { MARKER_PLAYER_ID, Match, Player, Tournament } from '../../../types/pingpong';
import { getPlayerAge } from '../../../lib/player';
import { isPlayInWinnerPlaceholder } from '../../../lib/tournament';
import { getMatchPlayerIds } from '../../../lib/matchFormat';
import { getRoundRobinStandings } from '../../../lib/standings';

interface LeaderboardProps {
  tournament: Tournament;
  players: Player[];
  getPlayerName: (id: string) => string;
  bracketMatches?: Match[];
}

function playerInitials(player: Player) {
  const initials = `${player.firstName?.charAt(0) ?? ''}${player.lastName?.charAt(0) ?? ''}`;
  return (initials || player.name.charAt(0)).toUpperCase();
}

function formatBirthday(birthday: string) {
  return new Date(`${birthday}T00:00:00.000Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function Leaderboard({ tournament, players, getPlayerName, bracketMatches = [] }: LeaderboardProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const rrMatches = (tournament.matches ?? []).filter(m => m.round === 'roundRobin');
  const isRealPlayer = (id: string) =>
    id !== 'BYE' &&
    id !== 'TBD' &&
    id !== MARKER_PLAYER_ID &&
    !isPlayInWinnerPlaceholder(id);
  const displayedPlayerIds = [...new Set([
    ...tournament.players,
    ...(tournament.activePlayers ?? []),
    ...(tournament.playerRanking ?? []),
    ...bracketMatches.flatMap(getMatchPlayerIds),
  ])].filter(isRealPlayer);

  const standings = (() => {
    const stats: Record<string, { wins: number; losses: number; played: number; pointDiff: number }> = {};
    displayedPlayerIds.forEach(p => { stats[p] = { wins: 0, losses: 0, played: 0, pointDiff: 0 }; });

    const calculated = getRoundRobinStandings(displayedPlayerIds, rrMatches);
    displayedPlayerIds.forEach(playerId => {
      stats[playerId] = {
        wins: calculated[playerId].wins,
        losses: calculated[playerId].losses,
        played: calculated[playerId].played,
        pointDiff: calculated[playerId].pointDiff,
      };
    });

    return displayedPlayerIds
      .map(id => ({ id, ...stats[id] }))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
        return a.played - b.played;
      });
  })();

  const selectedPlayer = selectedPlayerId
    ? players.find(player => player.id === selectedPlayerId) ?? null
    : null;

  const th = 'label-caps px-3 py-2 text-muted';

  return (
    <section className="surface-card overflow-hidden">
      <div className="border-b border-line px-5 py-3">
        <h3 className="label-caps text-muted">Standings</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-sunken">
              <th className={`${th} w-10 pl-5 text-left`}>#</th>
              <th className={`${th} text-left`}>Player</th>
              <th className={`${th} text-right`}>W</th>
              <th className={`${th} text-right`}>L</th>
              <th className={`${th} text-right`} title="Point difference">+/–</th>
              <th className={`${th} pr-5 text-right`}>Win %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {standings.map((s, idx) => {
              const pct = s.played > 0 ? Math.round((s.wins / s.played) * 100) : 0;
              const isLeader = idx < 2;
              return (
                <tr key={s.id} className={isLeader ? 'bg-table-soft/60' : ''}>
                  <td className={`font-digits py-2.5 pl-5 pr-3 text-base ${isLeader ? 'text-table' : 'text-muted'}`}>{idx + 1}</td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => setSelectedPlayerId(selectedPlayerId === s.id ? null : s.id)}
                      aria-expanded={selectedPlayerId === s.id}
                      className="text-left font-semibold text-ink hover:text-table hover:underline"
                    >
                      {getPlayerName(s.id)}
                    </button>
                  </td>
                  <td className="font-digits px-3 py-2.5 text-right text-base text-ink">{s.wins}</td>
                  <td className="font-digits px-3 py-2.5 text-right text-base text-ink-soft">{s.losses}</td>
                  <td className={`font-digits px-3 py-2.5 text-right text-base ${s.pointDiff > 0 ? 'text-win' : s.pointDiff < 0 ? 'text-loss' : 'text-muted'}`}>
                    {s.pointDiff > 0 ? `+${s.pointDiff}` : s.pointDiff}
                  </td>
                  <td className="font-digits py-2.5 pl-3 pr-5 text-right text-base text-ink-soft">{pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedPlayer && (
        <div className="border-t border-line bg-surface-sunken p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              {selectedPlayer.profilePicture ? (
                // eslint-disable-next-line @next/next/no-img-element -- profile pictures are arbitrary external URLs
                <img
                  src={selectedPlayer.profilePicture}
                  alt={`${selectedPlayer.name} profile`}
                  className="h-14 w-14 shrink-0 rounded-full border border-line object-cover"
                />
              ) : (
                <div className="avatar-gradient flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white">
                  {playerInitials(selectedPlayer)}
                </div>
              )}
              <div className="min-w-0">
                <h4 className="truncate text-lg font-bold text-ink">{selectedPlayer.name}</h4>
                <p className="text-sm text-ink-soft">
                  {[selectedPlayer.firstName, selectedPlayer.lastName].filter(Boolean).join(' ') || 'No full name provided'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPlayerId(null)}
              aria-label="Close player profile"
              className="text-xl leading-none text-muted hover:text-ink"
            >
              ×
            </button>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-line bg-surface px-3 py-2">
              <dt className="text-xs text-muted">Age</dt>
              <dd className="font-semibold text-ink">{getPlayerAge(selectedPlayer) ?? 'Not provided'}</dd>
            </div>
            <div className="rounded-lg border border-line bg-surface px-3 py-2">
              <dt className="text-xs text-muted">Birthday</dt>
              <dd className="font-semibold text-ink">
                {selectedPlayer.birthday ? formatBirthday(selectedPlayer.birthday) : 'Not provided'}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
