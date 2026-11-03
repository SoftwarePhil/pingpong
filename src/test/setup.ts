// Route tests sign in as the fake admins in authTestUtils. A session is
// checked against the admin's record, so look those up here instead of in
// MongoDB. Tests of the admins module itself call jest.unmock('../data/admins').
jest.mock('../data/admins', () => {
  const actual = jest.requireActual('../data/admins');
  const { TEST_ADMINS } = jest.requireActual('../__tests__/authTestUtils');
  return {
    ...actual,
    getAdminById: jest.fn(async (id: string) => TEST_ADMINS.find((admin: { id: string }) => admin.id === id) ?? null),
  };
});
