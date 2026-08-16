import { useState } from 'react';
import { MARKER_PLAYER_ID, Match, Player, Tournament } from '../../../types/pingpong';
import { getPlayerAge } from '../../../lib/player';
import { isPlayInWinnerPlaceholder } from '../../../lib/tournament';

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
    ...bracketMatches.flatMap(match => [match.player1Id, match.player2Id]),
  ])].filter(isRealPlayer);

  const standings = (() => {
    const stats: Record<string, { wins: number; losses: number; played: number; pointDiff: number }> = {};
    displayedPlayerIds.forEach(p => { stats[p] = { wins: 0, losses: 0, played: 0, pointDiff: 0 }; });

    rrMatches.forEach(m => {
      if (!m.winnerId || m.player2Id === 'BYE') return;
      const loserId = m.player1Id === m.winnerId ? m.player2Id : m.player1Id;
      if (stats[m.winnerId]) {
        stats[m.winnerId].wins++;
        stats[m.winnerId].played++;
      }
      if (stats[loserId]) { stats[loserId].losses++; stats[loserId].played++; }
      m.games.forEach(g => {
        if (stats[m.player1Id]) stats[m.player1Id].pointDiff += g.score1 - g.score2;
        if (stats[m.player2Id]) stats[m.player2Id].pointDiff += g.score2 - g.score1;
      });
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

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Standings</h4>
      </div>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left px-4 py-2 font-semibold text-gray-500 text-xs uppercase tracking-wide">#</th>
            <th className="text-left px-4 py-2 font-semibold text-gray-500 text-xs uppercase tracking-wide">Player</th>
            <th className="text-center px-3 py-2 font-semibold text-gray-500 text-xs uppercase tracking-wide">W</th>
            <th className="text-center px-3 py-2 font-semibold text-gray-500 text-xs uppercase tracking-wide">L</th>
            <th className="text-center px-3 py-2 font-semibold text-gray-500 text-xs uppercase tracking-wide">+Pts</th>
            <th className="text-center px-3 py-2 font-semibold text-gray-500 text-xs uppercase tracking-wide">Win%</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, idx) => {
            const pct = s.played > 0 ? Math.round((s.wins / s.played) * 100) : 0;
            const isLeader = idx < 2; // top 2 highlighted
            return (
              <tr key={s.id} className={`border-b border-gray-100 last:border-0 ${isLeader ? 'bg-amber-50' : 'bg-white'}`}>
                <td className="px-4 py-2.5 text-gray-400 font-medium text-xs">{idx + 1}</td>
                <td className="px-4 py-2.5 font-semibold text-gray-900">
                  {isLeader && <span className="mr-1.5 text-amber-500">★</span>}
                  <button
                    type="button"
                    onClick={() => setSelectedPlayerId(selectedPlayerId === s.id ? null : s.id)}
                    aria-expanded={selectedPlayerId === s.id}
                    className="text-left text-blue-700 hover:text-blue-900 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded"
                  >
                    {getPlayerName(s.id)}
                  </button>
                </td>
                <td className="text-center px-3 py-2.5 font-bold text-green-700">{s.wins}</td>
                <td className="text-center px-3 py-2.5 font-bold text-red-500">{s.losses}</td>
                <td className={`text-center px-3 py-2.5 font-bold text-xs ${s.pointDiff > 0 ? 'text-green-600' : s.pointDiff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                  {s.pointDiff > 0 ? `+${s.pointDiff}` : s.pointDiff}
                </td>
                <td className="text-center px-3 py-2.5 text-gray-500 text-xs font-medium">{pct}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {selectedPlayer && (
        <div className="border-t border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {selectedPlayer.profilePicture ? (
                <img
                  src={selectedPlayer.profilePicture}
                  alt={`${selectedPlayer.name} profile`}
                  className="w-16 h-16 rounded-full object-cover shrink-0 border border-gray-200"
                />
              ) : (
                <div className="w-16 h-16 rounded-full avatar-gradient flex items-center justify-center text-white text-xl font-bold shrink-0">
                  {playerInitials(selectedPlayer)}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Player profile</p>
                <h5 className="text-lg font-bold text-gray-900 truncate">{selectedPlayer.name}</h5>
                <p className="text-sm text-gray-500">
                  {[selectedPlayer.firstName, selectedPlayer.lastName].filter(Boolean).join(' ') || 'No full name provided'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPlayerId(null)}
              aria-label="Close player profile"
              className="text-gray-400 hover:text-gray-700 text-xl leading-none"
            >
              ×
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
              <p className="text-xs text-gray-400">Age</p>
              <p className="font-semibold text-gray-800">{getPlayerAge(selectedPlayer) ?? 'Not provided'}</p>
            </div>
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 sm:col-span-2">
              <p className="text-xs text-gray-400">Birthday</p>
              <p className="font-semibold text-gray-800">
                {selectedPlayer.birthday ? formatBirthday(selectedPlayer.birthday) : 'Not provided'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
