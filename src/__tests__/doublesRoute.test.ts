import { PUT } from '../app/api/tournaments/route';
import { adminRequest, playerRequest } from './authTestUtils';
import { Match, Tournament } from '../types/pingpong';

jest.mock('../data/data', () => ({
  getTournaments: jest.fn(),
  saveData: jest.fn(),
  setTournament: jest.fn(),
  getTournament: jest.fn(),
  deleteTournament: jest.fn(),
  registerMatchesIndex: jest.fn(),
  unregisterMatchesIndex: jest.fn(),
  syncTournamentPlayers: jest.fn(),
  setRoundRobinFormatAtomically: jest.fn(),
  TournamentConflictError: class TournamentConflictError extends Error {},
  TournamentNotFoundError: class TournamentNotFoundError extends Error {},
}));

jest.mock('../lib/tournament', () => ({
  createRoundRobinPairings: jest.fn(),
  advanceBracketRound: jest.fn(),
  createBracketMatches: jest.fn(),
  advanceRoundRobinRound: jest.fn(),
  resyncRoundRobinMatches: jest.fn(),
  createThirdPlaceMatch: jest.fn(),
}));

import {
  getTournament,
  setTournament,
  saveData,
  registerMatchesIndex,
  unregisterMatchesIndex,
  setRoundRobinFormatAtomically,
  TournamentConflictError,
} from '../data/data';

const mockedGetTournament = getTournament as jest.MockedFunction<typeof getTournament>;
const mockedSetTournament = setTournament as jest.MockedFunction<typeof setTournament>;
const mockedSaveData = saveData as jest.MockedFunction<typeof saveData>;
const mockedRegisterMatchesIndex = registerMatchesIndex as jest.MockedFunction<typeof registerMatchesIndex>;
const mockedUnregisterMatchesIndex = unregisterMatchesIndex as jest.MockedFunction<typeof unregisterMatchesIndex>;
const mockedSetFormat = setRoundRobinFormatAtomically as jest.MockedFunction<typeof setRoundRobinFormatAtomically>;

function makeMatch(id: string, overrides: Partial<Match> = {}): Match {
  return {
    id,
    tournamentId: 't1',
    player1Id: 'p1',
    player2Id: 'p2',
    round: 'roundRobin',
    bracketRound: 1,
    bestOf: 1,
    games: [],
    ...overrides,
  };
}

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 't1',
    name: 'T1',
    startDate: new Date().toISOString(),
    status: 'roundRobin',
    roundRobinRounds: 2,
    rrBestOf: 1,
    bracketRounds: [{ matchCount: 1, bestOf: 3 }],
    players: ['p1', 'p2', 'p3', 'p4'],
    activePlayers: ['p1', 'p2', 'p3', 'p4'],
    matches: [makeMatch('old')],
    ...overrides,
  };
}

function callPut(body: unknown, request = adminRequest('http://localhost/api/tournaments', {
  method: 'PUT',
  body: JSON.stringify(body),
})) {
  return PUT(request as never);
}

describe('setRoundRobinFormat tournament action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires admin access before reading the tournament', async () => {
    const response = await callPut(
      { id: 't1', action: 'setRoundRobinFormat', round: 1, format: 'doubles' },
      playerRequest('http://localhost/api/tournaments', { method: 'PUT' }),
    );

    expect(response.status).toBe(403);
    expect(mockedGetTournament).not.toHaveBeenCalled();
  });

  it('replaces current-round matches and updates the match index', async () => {
    const updatedTournament = makeTournament({ roundRobinFormats: { 1: 'doubles' } });
    const added = [makeMatch('new', {
      side1PlayerIds: ['p1', 'p4'],
      side2PlayerIds: ['p2', 'p3'],
    })];
    updatedTournament.matches = added;
    mockedSetFormat.mockResolvedValue(updatedTournament);

    const response = await callPut({
      id: 't1',
      action: 'setRoundRobinFormat',
      round: 1,
      format: 'doubles',
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockedSetFormat).toHaveBeenCalledWith('t1', 1, 'doubles');
    expect(mockedUnregisterMatchesIndex).not.toHaveBeenCalled();
    expect(mockedRegisterMatchesIndex).not.toHaveBeenCalled();
    expect(mockedSetTournament).not.toHaveBeenCalled();
    expect(mockedSaveData).toHaveBeenCalledTimes(1);
    expect(body.roundRobinFormats).toEqual({ 1: 'doubles' });
  });

  it('returns a validation error without persisting when conversion is rejected', async () => {
    mockedSetFormat.mockRejectedValue(new Error('Cannot change the round format after a game has been played'));

    const response = await callPut({
      id: 't1',
      action: 'setRoundRobinFormat',
      round: 1,
      format: 'doubles',
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/after a game has been played/i);
    expect(mockedSetTournament).not.toHaveBeenCalled();
    expect(mockedRegisterMatchesIndex).not.toHaveBeenCalled();
  });

  it('returns a conflict when the optimistic transaction is aborted', async () => {
    mockedSetFormat.mockRejectedValue(new TournamentConflictError('t1'));

    const response = await callPut({
      id: 't1',
      action: 'setRoundRobinFormat',
      round: 1,
      format: 'doubles',
    });

    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.error).toMatch(/changed while updating/i);
  });
});
