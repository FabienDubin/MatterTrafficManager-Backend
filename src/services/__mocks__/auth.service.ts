export const authService = {
  login: jest.fn(),
  refreshAccessToken: jest.fn(),
  verifyAccessToken: jest.fn(),
  logout: jest.fn(),
  createUser: jest.fn(),
  invalidateAllUserTokens: jest.fn(),
  generateTokens: jest.fn()
};