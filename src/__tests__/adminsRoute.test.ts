import { GET, POST } from '../app/api/admins/route';
import { DELETE } from '../app/api/admins/[id]/route';
import { AdminExistsError, LastOwnerError } from '../data/admins';
import { adminRequest, ownerRequest, TEST_ADMINS, TEST_OWNER } from './authTestUtils';

jest.mock('../data/admins', () => ({
  ...jest.requireActual('../data/admins'),
  getAdminById: jest.fn(),
  listAdmins: jest.fn(),
  addAdmin: jest.fn(),
  removeAdmin: jest.fn(),
}));

import { addAdmin, getAdminById, listAdmins, removeAdmin } from '../data/admins';

const mockedListAdmins = listAdmins as jest.MockedFunction<typeof listAdmins>;
const mockedAddAdmin = addAdmin as jest.MockedFunction<typeof addAdmin>;
const mockedRemoveAdmin = removeAdmin as jest.MockedFunction<typeof removeAdmin>;

const url = 'http://localhost/api/admins';
const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  jest.clearAllMocks();
  (getAdminById as jest.MockedFunction<typeof getAdminById>)
    .mockImplementation(async id => TEST_ADMINS.find(admin => admin.id === id) ?? null);
});

describe('/api/admins', () => {
  it("lists the owner's club admins", async () => {
    mockedListAdmins.mockResolvedValue(TEST_ADMINS);

    const res = await GET(ownerRequest(url));

    expect(res.status).toBe(200);
    expect(mockedListAdmins).toHaveBeenCalledWith('club-dallas');
  });

  it('refuses admins who are not owners', async () => {
    expect((await GET(adminRequest(url))).status).toBe(403);
    expect((await POST(adminRequest(url, json({ email: 'a@b.co', name: 'A' })))).status).toBe(403);
    expect((await DELETE(adminRequest(`${url}/x`, { method: 'DELETE' }), params('x'))).status).toBe(403);
    expect(mockedListAdmins).not.toHaveBeenCalled();
    expect(mockedAddAdmin).not.toHaveBeenCalled();
    expect(mockedRemoveAdmin).not.toHaveBeenCalled();
  });

  it("adds an admin to the owner's own club", async () => {
    mockedAddAdmin.mockImplementation(async input => ({ id: 'new', createdAt: 'now', ...input }));

    const res = await POST(ownerRequest(url, json({ email: 'new@example.com', name: 'New', clubId: 'club-other' })));

    expect(res.status).toBe(201);
    expect(mockedAddAdmin).toHaveBeenCalledWith({ clubId: TEST_OWNER.clubId, email: 'new@example.com', name: 'New', role: 'admin' });
  });

  it('validates new admins', async () => {
    expect((await POST(ownerRequest(url, json({ email: 'bad', name: 'A' })))).status).toBe(400);
    expect((await POST(ownerRequest(url, json({ email: 'a@b.co', name: ' ' })))).status).toBe(400);
    expect((await POST(ownerRequest(url, json({ email: 'a@b.co', name: 'A', role: 'superuser' })))).status).toBe(400);
    expect(mockedAddAdmin).not.toHaveBeenCalled();
  });

  it('refuses a duplicate email', async () => {
    mockedAddAdmin.mockRejectedValue(new AdminExistsError('a@b.co'));
    expect((await POST(ownerRequest(url, json({ email: 'a@b.co', name: 'A' })))).status).toBe(409);
  });

  it("removes an admin from the owner's club", async () => {
    mockedRemoveAdmin.mockResolvedValue(true);

    const res = await DELETE(ownerRequest(`${url}/admin-1`, { method: 'DELETE' }), params('admin-1'));

    expect(res.status).toBe(200);
    expect(mockedRemoveAdmin).toHaveBeenCalledWith(TEST_OWNER.clubId, 'admin-1');
  });

  it('refuses to remove the last owner, and reports unknown admins', async () => {
    mockedRemoveAdmin.mockRejectedValueOnce(new LastOwnerError()).mockResolvedValueOnce(false);

    expect((await DELETE(ownerRequest(`${url}/admin-owner`, { method: 'DELETE' }), params('admin-owner'))).status).toBe(409);
    expect((await DELETE(ownerRequest(`${url}/nobody`, { method: 'DELETE' }), params('nobody'))).status).toBe(404);
  });
});
