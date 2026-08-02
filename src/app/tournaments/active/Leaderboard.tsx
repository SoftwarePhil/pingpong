import { Tournament } from '../../../types/pingpong';

interface LeaderboardProps {
  tournament: Tournament;
  getPlayerName: (id: string) => string;
}

export default function Leaderboard({ tournament, getPlayerName }: LeaderboardProps) {
  const rrMatches = (tournament.matches ?? []).filter(m => m.round === 'roundRobin');

  const standings = (() => {
    const stats: Record<string, { wins: number; losses: number; played: number; pointDiff: number }> = {};
    tournament.players.forEach(p => { stats[p] = { wins: 0, losses: 0, played: 0, pointDiff: 0 }; });

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

    return tournament.players
      .map(id => ({ id, ...stats[id] }))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
        return a.played - b.played;
      });
  })();

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
                  {getPlayerName(s.id)}
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
    </div>
  );
}
