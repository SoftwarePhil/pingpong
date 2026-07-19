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
      stats[m.winnerId].wins++;
      stats[m.winnerId].played++;
      if (stats[loserId]) { stats[loserId].losses++; stats[loserId].played++; }
      m.games.forEach(g => {
        stats[m.player1Id].pointDiff += g.score1 - g.score2;
        stats[m.player2Id].pointDiff += g.score2 - g.score1;
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
    <div className="panel overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <h4 className="eyebrow" style={{ margin: 0 }}>Standings</h4>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th className="w-10">#</th>
            <th>Player</th>
            <th style={{ textAlign: 'center' }}>W</th>
            <th style={{ textAlign: 'center' }}>L</th>
            <th style={{ textAlign: 'center' }}>+Pts</th>
            <th style={{ textAlign: 'center' }}>Win%</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, idx) => {
            const pct = s.played > 0 ? Math.round((s.wins / s.played) * 100) : 0;
            const isLeader = idx < 2;
            return (
              <tr key={s.id} className={idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : ''}>
                <td className="text-dim font-mono text-xs">{idx + 1}</td>
                <td className="font-semibold">
                  {isLeader && <span className="text-gold mr-1.5">★</span>}
                  {getPlayerName(s.id)}
                </td>
                <td className="text-center text-win font-bold score">{s.wins}</td>
                <td className="text-center text-loss font-bold score">{s.losses}</td>
                <td className={`text-center font-mono text-xs font-bold ${s.pointDiff > 0 ? 'text-win' : s.pointDiff < 0 ? 'text-loss' : 'text-dim'}`}>
                  {s.pointDiff > 0 ? `+${s.pointDiff}` : s.pointDiff}
                </td>
                <td className="text-center text-muted text-xs font-mono">{pct}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
