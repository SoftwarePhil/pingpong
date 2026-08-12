'use client';

import { useState } from 'react';
import { Player, Tournament } from '../../../types/pingpong';
import {
  calculateTournamentPoints,
  DEFAULT_TOURNAMENT_POINT_VALUES,
  getTournamentDateKey,
  TournamentPointsResult,
  validateTournamentPointValues,
} from '../../../lib/tournamentPoints';

interface TournamentPointsPanelProps {
  tournaments: Tournament[];
  players: Player[];
  fromDate: string;
  toDate: string;
  onFromDateChange: (date: string) => void;
  onToDateChange: (date: string) => void;
}

function getRankLabel(rank: number): string {
  if (rank === 1) return '1st';
  if (rank === 2) return '2nd';
  if (rank === 3) return '3rd';
  if (rank % 100 >= 11 && rank % 100 <= 13) return `${rank}th`;
  if (rank % 10 === 1) return `${rank}st`;
  if (rank % 10 === 2) return `${rank}nd`;
  if (rank % 10 === 3) return `${rank}rd`;
  return `${rank}th`;
}

export default function TournamentPointsPanel({
  tournaments,
  players,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
}: TournamentPointsPanelProps) {
  const [firstPlacePoints, setFirstPlacePoints] = useState(String(DEFAULT_TOURNAMENT_POINT_VALUES.firstPlacePoints));
  const [secondPlacePoints, setSecondPlacePoints] = useState(String(DEFAULT_TOURNAMENT_POINT_VALUES.secondPlacePoints));
  const [thirdPlacePoints, setThirdPlacePoints] = useState(String(DEFAULT_TOURNAMENT_POINT_VALUES.thirdPlacePoints));
  const [doubleLastTournament, setDoubleLastTournament] = useState(false);

  const datedTournaments = tournaments
    .map(tournament => ({ tournament, date: getTournamentDateKey(tournament.startDate) }))
    .filter(item => item.date);
  const availableDates = datedTournaments.map(item => item.date);
  const earliestDate = availableDates.length > 0 ? [...availableDates].sort()[0] : undefined;
  const latestDate = availableDates.length > 0 ? [...availableDates].sort().pop() : undefined;

  const rangeError = fromDate && toDate && fromDate > toDate
    ? 'The start date must be on or before the end date.'
    : null;
  const pointValues = {
    firstPlacePoints: Number(firstPlacePoints),
    secondPlacePoints: Number(secondPlacePoints),
    thirdPlacePoints: Number(thirdPlacePoints),
  };
  const pointInputError = [firstPlacePoints, secondPlacePoints, thirdPlacePoints]
    .some(value => value.trim() === '' || !Number.isFinite(Number(value)))
    ? 'Enter a positive number for each placement.'
    : validateTournamentPointValues(pointValues);

  const selectedTournaments = rangeError
    ? []
    : datedTournaments
      .filter(({ date }) => (!fromDate || date >= fromDate) && (!toDate || date <= toDate))
      .map(({ tournament }) => tournament);

  let result: TournamentPointsResult | null = null;
  if (!rangeError && !pointInputError) {
    result = calculateTournamentPoints(selectedTournaments, pointValues, doubleLastTournament);
  }

  const getPlayerName = (playerId: string) => players.find(player => player.id === playerId)?.name ?? 'Unknown';
  const winner = result?.winnerId
    ? result.leaderboard.find(entry => entry.playerId === result!.winnerId)
    : null;
  const latestSelectedTournament = selectedTournaments.length > 0
    ? [...selectedTournaments].sort((a, b) => {
      const dateDifference = new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      return dateDifference !== 0 ? dateDifference : b.id.localeCompare(a.id);
    })[0]
    : null;

  return (
    <section className="bg-white rounded-xl shadow-sm border-2 border-indigo-200 overflow-hidden mb-8">
      <div className="px-6 py-5 bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-indigo-100">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Multi-tournament championship</p>
            <h2 className="text-2xl font-bold text-gray-900 mt-1">Points leaderboard</h2>
            <p className="text-sm text-gray-600 mt-1">Choose a date range and combine tournament placements into one winner.</p>
          </div>
          <div className="rounded-lg bg-white/70 border border-indigo-100 px-4 py-3 text-sm text-gray-600">
            <div className="font-semibold text-gray-900">{selectedTournaments.length} tournament{selectedTournaments.length === 1 ? '' : 's'} selected</div>
            {latestSelectedTournament && (
              <div className="mt-1">Latest: {latestSelectedTournament.name}</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-5">
          <label className="text-sm font-semibold text-gray-700">
            From
            <input
              type="date"
              value={fromDate}
              min={earliestDate}
              max={latestDate}
              onChange={event => onFromDateChange(event.target.value)}
              className="form-control mt-1 block w-full rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-semibold text-gray-700">
            To
            <input
              type="date"
              value={toDate}
              min={earliestDate}
              max={latestDate}
              onChange={event => onToDateChange(event.target.value)}
              className="form-control mt-1 block w-full rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-semibold text-gray-700">
            1st place points
            <input
              type="number"
              min="1"
              step="1"
              value={firstPlacePoints}
              onChange={event => setFirstPlacePoints(event.target.value)}
              className="form-control mt-1 block w-full rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-semibold text-gray-700">
            2nd place points
            <input
              type="number"
              min="1"
              step="1"
              value={secondPlacePoints}
              onChange={event => setSecondPlacePoints(event.target.value)}
              className="form-control mt-1 block w-full rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-semibold text-gray-700">
            3rd place points
            <input
              type="number"
              min="1"
              step="1"
              value={thirdPlacePoints}
              onChange={event => setThirdPlacePoints(event.target.value)}
              className="form-control mt-1 block w-full rounded-lg px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="mt-4 flex items-start gap-3 text-sm text-gray-700 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={doubleLastTournament}
            onChange={event => setDoubleLastTournament(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span>
            <span className="font-semibold">Double points for the latest tournament in this range</span>
            <span className="block text-xs text-gray-500 mt-0.5">The latest tournament is determined by its start date.</span>
          </span>
        </label>

        {(rangeError || pointInputError) && (
          <p className="mt-3 text-sm font-medium text-red-600">{rangeError ?? pointInputError}</p>
        )}
      </div>

      {selectedTournaments.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-gray-500">No completed tournaments fall within this date range.</p>
      ) : result ? (
        <div className="p-6 space-y-6">
          {winner && (
            <div className="rounded-xl border border-yellow-200 bg-gradient-to-r from-yellow-50 to-amber-100 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-yellow-700">Overall winner</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{getPlayerName(winner.playerId)}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-3xl font-black text-yellow-800 tabular-nums">{winner.totalPoints}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-yellow-700">points</p>
              </div>
            </div>
          )}

          <div>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-600">Leaderboard</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Scoring: {pointValues.firstPlacePoints} for 1st, {pointValues.secondPlacePoints} for 2nd, {pointValues.thirdPlacePoints} for 3rd.
                </p>
              </div>
              {doubleLastTournament && latestSelectedTournament && (
                <p className="text-xs font-semibold text-indigo-700">2x applied to {latestSelectedTournament.name}</p>
              )}
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm min-w-[620px]">
                <thead>
                  <tr className="border-b-2 border-gray-200 bg-gray-50 text-gray-600">
                    <th className="text-left py-3 px-3 font-semibold w-14">Rank</th>
                    <th className="text-left py-3 px-3 font-semibold">Player</th>
                    <th className="text-center py-3 px-3 font-semibold">Points</th>
                    <th className="text-center py-3 px-3 font-semibold">1st</th>
                    <th className="text-center py-3 px-3 font-semibold">2nd</th>
                    <th className="text-center py-3 px-3 font-semibold">3rd</th>
                    <th className="text-center py-3 px-3 font-semibold">Events</th>
                  </tr>
                </thead>
                <tbody>
                  {result.leaderboard.map((entry, index) => (
                    <tr
                      key={entry.playerId}
                      className={`border-b border-gray-100 last:border-0 ${index === 0 ? 'bg-yellow-50 font-semibold' : 'bg-white'}`}
                    >
                      <td className="py-3 px-3 text-gray-500">{getRankLabel(index + 1)}</td>
                      <td className="py-3 px-3 font-medium text-gray-900">{getPlayerName(entry.playerId)}</td>
                      <td className="py-3 px-3 text-center font-bold text-indigo-700 tabular-nums">{entry.totalPoints}</td>
                      <td className="py-3 px-3 text-center text-gray-700 tabular-nums">{entry.firstPlaces}</td>
                      <td className="py-3 px-3 text-center text-gray-700 tabular-nums">{entry.secondPlaces}</td>
                      <td className="py-3 px-3 text-center text-gray-700 tabular-nums">{entry.thirdPlaces}</td>
                      <td className="py-3 px-3 text-center text-gray-500 tabular-nums">{entry.tournamentsPlayed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
