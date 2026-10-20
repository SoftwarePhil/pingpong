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
  const top = rankPlayersByRoundRobinStandings(playerIds, rrMatches).slice(0, 8);
  const gamesPlayed = (tournament.matches ?? []).reduce((total, m) => total + m.games.length, 0);
  const slots = [0, 1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <section className="table-banner table-banner--live">
      <div className="table-banner__left">
        <p className="label-caps flex items-center gap-2 text-ball">
          <span className="h-2 w-2 rounded-full bg-ball" aria-hidden="true" />
          Live now
        </p>
        <h1 className="font-display mt-2 text-3xl sm:text-4xl text-board-ink">{tournament.name}</h1>
        <p className="mt-2 text-board-muted">
          {stageLabel(tournament)} · {playerIds.length} players · {gamesPlayed} games played
        </p>
      </div>
      <div className="table-banner__board">
        {slots.map(slot => {
          if (slot === 4) {
            return (
              <Link key="open" href="/tournaments/active" className="table-banner__cell table-banner__open">
                Open tournament →
              </Link>
            );
          }
          const playerIndex = slot < 4 ? slot : slot - 1;
          const playerId = top[playerIndex];
          if (!playerId) return <div key={slot} className="table-banner__cell" />;
          return (
            <div key={playerId} className="table-banner__cell">
              <span className="table-banner__rank">{playerIndex + 1}</span>
              <span className="table-banner__name">{name(playerId)}</span>
              <span className="table-banner__record">
                {stats[playerId].wins}–{stats[playerId].losses}
              </span>
            </div>
          );
        })}
      </div>
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
          <div className="table-banner h-48 animate-pulse" aria-label="Loading" />
        ) : summary.active ? (
          <LiveTournament tournament={summary.active} name={summary.name} />
        ) : (
          <section className="table-banner">
            <div className="table-banner__left">
              <p className="label-caps text-board-muted">Between tournaments</p>
              <h1 className="font-display mt-2 text-3xl sm:text-4xl">No tournament running</h1>
              <p className="mt-2 text-board-muted">
                {summary.completedCount} tournaments played so far.
              </p>
            </div>
            <div className="table-banner__divider" aria-hidden="true" />
            <div className="table-banner__right">
              {isAdmin && (
                <Link href="/tournaments/new" className="button button-accent px-5 py-3 text-base">
                  Start a tournament →
                </Link>
              )}
            </div>
          </section>
        )}

        {summary && (
          <div className="table-halves">
            <section className="table-half">
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

            <section className="table-half">
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
