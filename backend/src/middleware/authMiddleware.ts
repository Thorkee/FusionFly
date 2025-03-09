import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';

// Extend the Express Request interface to include user property
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

/**
 * Authentication middleware to protect routes
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get the token from the Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Extract the token from the header
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication token missing' });
    }
    
    // Verify and decode the token
    const decoded = authService.verifyToken(token);
    
    // Get user from token
    const user = await authService.getUserFromToken(token);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
    
    // Add user to request object
    req.user = user;
    
    // Continue to the protected route
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

/**
 * Admin authorization middleware
 */
export const authorizeAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  
  next();
}; 