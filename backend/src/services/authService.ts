import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { userModel, User } from '../models/userModel';

// Load environment variables
dotenv.config();

// Get JWT secret from environment variables or use a default (for development only)
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_for_development_only';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Set this to true in production
const SECURE_COOKIES = process.env.NODE_ENV === 'production';

export interface AuthResponse {
  user: Omit<User, 'password'>;
  token: string;
}

export class AuthService {
  /**
   * Register a new user
   */
  async register(email: string, password: string, name: string): Promise<AuthResponse> {
    try {
      // Create user in the database
      const user = await userModel.createUser(email, password, name);
      
      // Generate JWT token
      const token = this.generateToken(user);
      
      return { user, token };
    } catch (error) {
      console.error('Error in register service:', error);
      throw error;
    }
  }

  /**
   * Login a user with email and password
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      // Validate user credentials
      const user = await userModel.validateUser(email, password);
      
      if (!user) {
        throw new Error('Invalid email or password');
      }
      
      // Generate JWT token
      const token = this.generateToken(user);
      
      return { user, token };
    } catch (error) {
      console.error('Error in login service:', error);
      throw error;
    }
  }

  /**
   * Generate JWT token for a user
   */
  generateToken(user: Omit<User, 'password'>): string {
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role
    };
    
    // Fix type issues with jwt.sign
    return jwt.sign(
      payload, 
      JWT_SECRET, 
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );
  }

  /**
   * Verify and decode JWT token
   */
  verifyToken(token: string): any {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  /**
   * Get user from token
   */
  async getUserFromToken(token: string): Promise<Omit<User, 'password'> | null> {
    try {
      const decoded = this.verifyToken(token);
      const user = await userModel.findById(decoded.userId);
      
      if (!user) {
        return null;
      }
      
      // Return user without password
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      return null;
    }
  }
}

// Create singleton instance
export const authService = new AuthService(); 