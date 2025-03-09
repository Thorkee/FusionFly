import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { usersContainer, LocalDatabase } from '../config/cosmosDbSetup';
import { Resource } from '@azure/cosmos';

// Check if we should use local fallback
const useLocalFallback = process.env.USE_LOCAL_DB_FALLBACK === 'true' || !usersContainer;

export interface User {
  id: string;
  email: string;
  name: string;
  password: string;
  role: 'admin' | 'user';
  createdAt: Date;
  lastLogin?: Date;
}

export type UserResource = User & Resource;

export class UserModel {
  // Create a new user
  async createUser(email: string, password: string, name: string, role: 'admin' | 'user' = 'user'): Promise<Omit<User, 'password'>> {
    try {
      // Check if email already exists
      let emailExists = false;
      
      if (useLocalFallback) {
        const users = await LocalDatabase.queryUsers((user: User) => user.email === email);
        emailExists = users.length > 0;
      } else {
        const { resources } = await usersContainer!.items
          .query({
            query: "SELECT * FROM c WHERE c.email = @email",
            parameters: [{ name: "@email", value: email }]
          })
          .fetchAll();
        
        emailExists = resources.length > 0;
      }
      
      if (emailExists) {
        throw new Error('Email already in use');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create new user object
      const newUser: User = {
        id: crypto.randomUUID(),
        email,
        name,
        password: hashedPassword,
        role,
        createdAt: new Date()
      };

      // Save user
      let savedUser;
      
      if (useLocalFallback) {
        savedUser = await LocalDatabase.createUser(newUser);
      } else {
        const { resource } = await usersContainer!.items.create(newUser);
        savedUser = resource as UserResource;
      }
      
      // Return user without password
      const { password: _, ...userWithoutPassword } = savedUser;
      return userWithoutPassword;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  // Find user by email
  async findByEmail(email: string): Promise<UserResource | undefined> {
    try {
      if (useLocalFallback) {
        const users = await LocalDatabase.queryUsers((user: User) => user.email === email);
        return users[0] as UserResource;
      } else {
        const { resources } = await usersContainer!.items
          .query({
            query: "SELECT * FROM c WHERE c.email = @email",
            parameters: [{ name: "@email", value: email }]
          })
          .fetchAll();
        
        return resources[0] as UserResource;
      }
    } catch (error) {
      console.error('Error finding user by email:', error);
      return undefined;
    }
  }

  // Find user by ID
  async findById(id: string): Promise<UserResource | undefined> {
    try {
      if (useLocalFallback) {
        const users = await LocalDatabase.queryUsers((user: User) => user.id === id);
        return users[0] as UserResource;
      } else {
        const { resources } = await usersContainer!.items
          .query({
            query: "SELECT * FROM c WHERE c.id = @id",
            parameters: [{ name: "@id", value: id }]
          })
          .fetchAll();
        
        return resources[0] as UserResource;
      }
    } catch (error) {
      console.error('Error finding user by id:', error);
      return undefined;
    }
  }

  // Validate user credentials
  async validateUser(email: string, password: string): Promise<Omit<User, 'password'> | null> {
    try {
      const user = await this.findByEmail(email);
      
      if (!user) {
        return null;
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      
      if (!isPasswordValid) {
        return null;
      }

      // Update last login time
      user.lastLogin = new Date();
      
      if (useLocalFallback) {
        await LocalDatabase.updateUser(user.id, user);
      } else {
        await usersContainer!.item(user.id, user.email).replace(user);
      }
      
      // Return user without password
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      console.error('Error validating user:', error);
      return null;
    }
  }

  // Update user details
  async updateUser(id: string, updates: Partial<Omit<User, 'id' | 'password'>>): Promise<Omit<User, 'password'> | null> {
    try {
      const user = await this.findById(id);
      
      if (!user) {
        return null;
      }

      // Update user fields
      const updatedUser = {
        ...user,
        ...updates
      };

      // Save updated user
      let savedUser;
      
      if (useLocalFallback) {
        savedUser = await LocalDatabase.updateUser(id, updatedUser);
      } else {
        const { resource } = await usersContainer!.item(user.id, user.email).replace(updatedUser);
        savedUser = resource as UserResource;
      }
      
      // Return updated user without password
      const { password: _, ...userWithoutPassword } = savedUser;
      return userWithoutPassword;
    } catch (error) {
      console.error('Error updating user:', error);
      return null;
    }
  }

  // Change user password
  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<boolean> {
    try {
      const user = await this.findById(id);
      
      if (!user) {
        return false;
      }

      // Verify current password
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      
      if (!isPasswordValid) {
        return false;
      }

      // Hash and update new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;
      
      // Save updated user
      if (useLocalFallback) {
        await LocalDatabase.updateUser(id, user);
      } else {
        await usersContainer!.item(user.id, user.email).replace(user);
      }
      
      return true;
    } catch (error) {
      console.error('Error changing password:', error);
      return false;
    }
  }

  // Get all users (for admin purposes)
  async getAllUsers(): Promise<Omit<User, 'password'>[]> {
    try {
      let resources;
      
      if (useLocalFallback) {
        resources = await LocalDatabase.readUsers();
      } else {
        const { resources: cosmosResources } = await usersContainer!.items.readAll().fetchAll();
        resources = cosmosResources;
      }
      
      // Return users without passwords
      return resources.map((user: User & Resource) => {
        const { password, ...userWithoutPassword } = user as UserResource;
        return userWithoutPassword;
      });
    } catch (error) {
      console.error('Error getting all users:', error);
      return [];
    }
  }
}

// Create singleton instance
export const userModel = new UserModel(); 