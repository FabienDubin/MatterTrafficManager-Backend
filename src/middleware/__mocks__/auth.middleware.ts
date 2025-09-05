import { UserRole } from '../../models/User.model';

export const authenticate = jest.fn((req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'No token provided',
    });
  }

  // Attach mocked user based on token
  req.user = {
    userId: 'user123',
    email: 'test@example.com',
    role: UserRole.ADMIN
  };
  
  next();
});

export const authorize = (...allowedRoles: UserRole[]) => {
  return jest.fn((req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    next();
  });
};

export const requireAdmin = jest.fn((req, res, next) => {
  if (!req.user || req.user.role !== UserRole.ADMIN) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required',
    });
  }
  next();
});

export const requireTrafficManager = jest.fn((req, res, next) => {
  if (!req.user || ![UserRole.ADMIN, UserRole.TRAFFIC_MANAGER].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Traffic manager access required',
    });
  }
  next();
});