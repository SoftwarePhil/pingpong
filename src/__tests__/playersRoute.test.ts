import { POST } from '../app/api/players/route';
import { PATCH } from '../app/api/players/[id]/route';
import { getPlayerAge } from '../lib/player';
import { adminRequest, playerRequest } from './authTestUtils';

jest.mock('../data/data', () => ({
  getPlayers: jest.fn(),
  setPlayers: jest.fn(),
  saveData: jest.fn(),
}));

import { getPlayers, setPlayers, saveData } from '../data/data';

const mockedGetPlayers = getPlayers as jest.MockedFunction<typeof getPlayers>;
const mockedSetPlayers = setPlayers as jest.MockedFunction<typeof setPlayers>;
const mockedSaveData = saveData as jest.MockedFunction<typeof saveData>;

describe('POST /api/players', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects unauthenticated player creation', async () => {
    const response = await POST(playerRequest('http://localhost/api/players', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Player' }),
    }));

    expect(response.status).toBe(403);
    expect(mockedGetPlayers).not.toHaveBeenCalled();
  });

  it('creates a player for an admin and returns it for selection', async () => {
    mockedGetPlayers.mockResolvedValue([]);

    const response = await POST(adminRequest('http://localhost/api/players', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Player' }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      id: expect.any(String),
      name: 'New Player',
      tournamentIds: [],
    });
    expect(mockedSetPlayers).toHaveBeenCalledWith([body]);
    expect(mockedSaveData).toHaveBeenCalledTimes(1);
  });

  it('creates a player with optional profile fields', async () => {
    mockedGetPlayers.mockResolvedValue([]);

    const response = await POST(adminRequest('http://localhost/api/players', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Profile Player',
        firstName: 'Profile',
        lastName: 'Player',
        birthday: '1990-05-10',
        profilePicture: 'https://example.com/profile.jpg',
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      id: expect.any(String),
      name: 'Profile Player',
      firstName: 'Profile',
      lastName: 'Player',
      birthday: '1990-05-10',
      profilePicture: 'https://example.com/profile.jpg',
      tournamentIds: [],
    });
  });

  it('rejects invalid optional profile fields', async () => {
    const response = await POST(adminRequest('http://localhost/api/players', {
      method: 'POST',
      body: JSON.stringify({ name: 'Invalid Player', birthday: '2020-02-30' }),
    }));

    expect(response.status).toBe(400);
    expect(mockedGetPlayers).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/players/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  function callPatch(body: unknown, request = adminRequest('http://localhost/api/players/p1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })) {
    return PATCH(request, { params: Promise.resolve({ id: 'p1' }) });
  }

  it('rejects unauthenticated profile edits before reading data', async () => {
    const response = await callPatch(
      { firstName: 'Changed' },
      playerRequest('http://localhost/api/players/p1', {
        method: 'PATCH',
        body: JSON.stringify({ firstName: 'Changed' }),
      })
    );

    expect(response.status).toBe(403);
    expect(mockedGetPlayers).not.toHaveBeenCalled();
  });

  it('updates optional profile fields for an admin', async () => {
    const player = { id: 'p1', name: 'Old Name', tournamentIds: ['t1'] };
    mockedGetPlayers.mockResolvedValue([player]);

    const response = await callPatch({
      name: 'New Name',
      firstName: 'New',
      lastName: 'Name',
      birthday: '1995-08-20',
      profilePicture: 'https://example.com/new.jpg',
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      id: 'p1',
      name: 'New Name',
      firstName: 'New',
      lastName: 'Name',
      birthday: '1995-08-20',
      profilePicture: 'https://example.com/new.jpg',
      tournamentIds: ['t1'],
    });
    expect(mockedSetPlayers).toHaveBeenCalledWith([body]);
    expect(mockedSaveData).toHaveBeenCalledTimes(1);
  });

  it('clears optional profile fields when the admin submits empty values', async () => {
    const player = {
      id: 'p1',
      name: 'Player',
      firstName: 'First',
      lastName: 'Last',
      birthday: '1995-08-20',
      profilePicture: 'https://example.com/photo.jpg',
      tournamentIds: [],
    };
    mockedGetPlayers.mockResolvedValue([player]);

    const response = await callPatch({ firstName: '', lastName: null, birthday: '', profilePicture: '' });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: 'p1', name: 'Player', tournamentIds: [] });
  });

  it('calculates age from a birthday', () => {
    expect(getPlayerAge({ birthday: '1995-08-20' }, new Date('2025-08-19T00:00:00.000Z'))).toBe(29);
    expect(getPlayerAge({ birthday: '1995-08-20' }, new Date('2025-08-20T00:00:00.000Z'))).toBe(30);
  });
});
