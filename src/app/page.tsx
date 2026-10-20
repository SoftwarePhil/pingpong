'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Player, Tournament } from '../types/pingpong';
import { useAuth } from '../components/AuthProvider';
import { getRoundRobinStandings, rankPlayersByRoundRobinStandings } from '../lib/standings';
import { getTournamentPlacements } from '../lib/tournamentPoints';

type HomeData = { tournaments: Tournament[]; players: Player[] };

function stageLabel(tournament: Tournament): string {
  const matches = tournament.matches ?? [];
  const bracketRounds = matches
    .filter(m => m.round === 'bracket' && !m.isThirdPlace && (m.bracketRound ?? 0) > 0)
    .map(m => m.bracketRound ?? 1);
  if (bracketRounds.length > 0) return `Bracket · round ${Math.max(...bracketRounds)}`;
  const rrRounds = matches.filter(m => m.round === 'roundRobin').map(m => m.bracketRound ?? 1);
  const current = rrRounds.length > 0 ? Math.max(...rrRounds) : 1;
  return `Round robin · round ${current} of ${tournament.roundRobinRounds}`;
}

function LiveTournament({ tournament, name }: { tournament: Tournament; name: (id: string) => string }) {
  const playerIds = tournament.activePlayers ?? tournament.players;
  const rrMatches = (tournament.matches ?? []).filter(m => m.round === 'roundRobin');
  const stats = getRoundRobinStandings(playerIds, rrMatches);
  const top = rankPlayersByRoundRobinStandings(playerIds, rrMatches).slice(0, 4);
  const gamesPlayed = (tournament.matches ?? []).reduce((total, m) => total + m.games.length, 0);

  return (
    <section className="scoreboard overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-6 p-6 sm:p-8">
        <div className="min-w-0">
          <p className="label-caps flex items-center gap-2 text-ball">
            <span className="h-2 w-2 rounded-full bg-ball animate-pulse" aria-hidden="true" />
            Live now
          </p>
          <h1 className="font-display mt-2 text-3xl sm:text-4xl text-board-ink">{tournament.name}</h1>
          <p className="mt-2 text-board-muted">
            {stageLabel(tournament)} · {playerIds.length} players · {gamesPlayed} games played
          </p>
        </div>
        <Link href="/tournaments/active" className="button button-accent px-5 py-3 text-base">
          Open tournament →
        </Link>
      </div>
      <ol className="grid grid-cols-2 lg:grid-cols-4 border-t border-white/10">
        {top.map((playerId, index) => (
          <li key={playerId} className="flex items-center gap-3 px-6 py-4 border-white/10 [&:not(:first-child)]:border-l">
            <span className="font-digits text-2xl text-board-muted">{index + 1}</span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{name(playerId)}</span>
              <span className="font-digits text-sm text-board-muted">
                {stats[playerId].wins}–{stats[playerId].losses}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Home() {
  const { isAdmin } = useAuth();
  const [data, setData] = useState<HomeData | null>(null);

  useEffect(() => {
    Promise.all([fetch('/api/tournaments'), fetch('/api/players')])
      .then(async ([t, p]) => setData({ tournaments: await t.json(), players: await p.json() }))
      .catch(() => setData({ tournaments: [], players: [] }));
  }, []);

  const summary = useMemo(() => {
    if (!data) return null;
    const names = new Map(data.players.map(p => [p.id, p.name]));
    const completed = data.tournaments
      .filter(t => t.status === 'completed')
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
    const titles = new Map<string, number>();
    completed.forEach(t => {
      const winner = getTournamentPlacements(t).firstPlaceId;
      if (winner) titles.set(winner, (titles.get(winner) ?? 0) + 1);
    });
    const latest = completed[0];
    return {
      name: (id: string) => names.get(id) ?? 'Unknown',
      active: data.tournaments.find(t => t.status !== 'completed'),
      latest,
      latestPlacements: latest ? getTournamentPlacements(latest) : null,
      titleLeaders: [...titles.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      completedCount: completed.length,
    };
  }, [data]);

  return (
    <main className="app-shell">
      <div className="page-container page-container--home space-y-6">
        {!summary ? (
          <div className="scoreboard h-48 animate-pulse" aria-label="Loading" />
        ) : summary.active ? (
          <LiveTournament tournament={summary.active} name={summary.name} />
        ) : (
          <section className="scoreboard flex flex-wrap items-center justify-between gap-6 p-6 sm:p-8">
            <div>
              <p className="label-caps text-board-muted">Between tournaments</p>
              <h1 className="font-display mt-2 text-3xl sm:text-4xl">No tournament running</h1>
              <p className="mt-2 text-board-muted">
                {summary.completedCount} tournaments played so far.
              </p>
            </div>
            {isAdmin && (
              <Link href="/tournaments/new" className="button button-accent px-5 py-3 text-base">
                Start a tournament →
              </Link>
            )}
          </section>
        )}

        <div className="net-divider" aria-hidden="true" />

        {summary && (
          <div className="grid gap-6 md:grid-cols-2">
            <section className="surface-card p-6">
              <p className="label-caps text-muted">Latest champion</p>
              {summary.latest && summary.latestPlacements?.firstPlaceId ? (
                <>
                  <p className="font-display mt-3 text-2xl text-ink">
                    {summary.name(summary.latestPlacements.firstPlaceId)}
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">
                    {summary.latest.name} · {new Date(summary.latest.startDate).toLocaleDateString()}
                  </p>
                  {summary.latestPlacements.secondPlaceId && (
                    <p className="mt-4 text-sm text-ink-soft">
                      Runner-up <span className="font-semibold text-ink">{summary.name(summary.latestPlacements.secondPlaceId)}</span>
                    </p>
                  )}
                  <Link href={`/tournaments/history?id=${summary.latest.id}`} className="mt-5 inline-block text-sm font-semibold text-table hover:underline">
                    See the bracket →
                  </Link>
                </>
              ) : (
                <p className="mt-3 text-ink-soft">No completed tournaments yet.</p>
              )}
            </section>

            <section className="surface-card p-6">
              <div className="flex items-baseline justify-between">
                <p className="label-caps text-muted">Most titles</p>
                <Link href="/players" className="text-sm font-semibold text-table hover:underline">All players →</Link>
              </div>
              {summary.titleLeaders.length > 0 ? (
                <ol className="mt-3 divide-y divide-line">
                  {summary.titleLeaders.map(([playerId, count], index) => (
                    <li key={playerId} className="flex items-center gap-3 py-2.5">
                      <span className="font-digits w-5 text-muted">{index + 1}</span>
                      <span className="flex-1 truncate font-semibold text-ink">{summary.name(playerId)}</span>
                      <span className="font-digits text-lg text-ink">{count}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-ink-soft">Titles appear here once a tournament finishes.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
