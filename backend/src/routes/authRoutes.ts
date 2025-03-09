import express from 'express';
import { authController } from '../controllers/authController';
import { authenticate, authorizeAdmin } from '../middleware/authMiddleware';

const router = express.Router();

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected routes (require authentication)
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, authController.updateProfile);
router.post('/change-password', authenticate, authController.changePassword);

// Admin routes
router.get('/users', authenticate, authorizeAdmin, authController.getAllUsers);

export { router as authRoutes }; 