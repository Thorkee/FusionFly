import { Request, Response } from 'express';
import { authService } from '../services/authService';
import { userModel } from '../models/userModel';

export const authController = {
  // Register a new user
  register: async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body;
      
      // Validate input
      if (!email || !password || !name) {
        return res.status(400).json({ error: 'Email, password, and name are required' });
      }
      
      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      
      // Password validation (min 8 characters, at least 1 letter and 1 number)
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        return res.status(400).json({ 
          error: 'Password must be at least 8 characters long and contain at least one letter and one number' 
        });
      }
      
      // Register the user
      const result = await authService.register(email, password, name);
      
      // Return token and user info (excluding password)
      res.status(201).json({
        message: 'User registered successfully',
        user: result.user,
        token: result.token
      });
    } catch (error) {
      console.error('Error registering user:', error);
      
      if (error instanceof Error && error.message === 'Email already in use') {
        return res.status(409).json({ error: 'Email is already registered' });
      }
      
      res.status(500).json({ error: 'Registration failed' });
    }
  },
  
  // Login a user
  login: async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      
      // Validate input
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      
      // Attempt to login
      const result = await authService.login(email, password);
      
      // Return token and user info
      res.status(200).json({
        message: 'Login successful',
        user: result.user,
        token: result.token
      });
    } catch (error) {
      console.error('Error logging in:', error);
      res.status(401).json({ error: 'Invalid email or password' });
    }
  },
  
  // Get the current user's profile
  getProfile: async (req: Request, res: Response) => {
    try {
      // User is already attached to the request by the authenticate middleware
      res.status(200).json({ user: req.user });
    } catch (error) {
      console.error('Error getting user profile:', error);
      res.status(500).json({ error: 'Failed to get user profile' });
    }
  },
  
  // Update user profile
  updateProfile: async (req: Request, res: Response) => {
    try {
      const { name, email } = req.body;
      const userId = req.user.id;
      
      // Update user details
      const updatedUser = userModel.updateUser(userId, { name, email });
      
      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.status(200).json({
        message: 'Profile updated successfully',
        user: updatedUser
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  },
  
  // Change password
  changePassword: async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;
      
      // Validate input
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
      }
      
      // Password validation
      if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        return res.status(400).json({ 
          error: 'New password must be at least 8 characters long and contain at least one letter and one number' 
        });
      }
      
      // Change password
      const success = await userModel.changePassword(userId, currentPassword, newPassword);
      
      if (!success) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
      
      res.status(200).json({ message: 'Password changed successfully' });
    } catch (error) {
      console.error('Error changing password:', error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  },
  
  // Admin only: Get all users
  getAllUsers: async (req: Request, res: Response) => {
    try {
      // This route is protected by the authorizeAdmin middleware
      const users = userModel.getAllUsers();
      
      res.status(200).json({ users });
    } catch (error) {
      console.error('Error getting users:', error);
      res.status(500).json({ error: 'Failed to get users' });
    }
  }
}; 