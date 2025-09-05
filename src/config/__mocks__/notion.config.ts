export const notion = {
  users: {
    list: jest.fn()
  },
  databases: {
    query: jest.fn(),
    retrieve: jest.fn()
  },
  pages: {
    create: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn()
  }
};

export const DATABASES = {
  traffic: 'mock-traffic-db-id',
  membres: 'mock-membres-db-id',
  projets: 'mock-projets-db-id',
  clients: 'mock-clients-db-id',
  teams: 'mock-teams-db-id'
};