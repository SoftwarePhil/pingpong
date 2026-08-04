import { POST } from '../app/api/players/route';
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
});
