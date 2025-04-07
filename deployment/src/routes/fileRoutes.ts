import express from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileController } from '../controllers/fileController';
import { authenticate, authorizeAdmin } from '../middleware/authMiddleware';

const router = express.Router();

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const fileExtension = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExtension}`;
    cb(null, fileName);
  }
});

// File filter to accept only certain file types
const fileFilter = (req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExtensions = ['.nmea', '.obs', '.rnx', '.jsonl', '.json', '.txt', '.csv', '.imu', '.bin', '.ubx', '.21o', '.22o', '.23o'];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('File type not supported. Please upload NMEA, RINEX, UBX, IMU, JSON, CSV, or TXT files.'));
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Public routes
router.get('/download/:filename', fileController.downloadFile); // Allow public downloads if needed

// Protected routes (require authentication)
router.post('/upload', authenticate, upload.fields([
  { name: 'gnssFile', maxCount: 1 },
  { name: 'imuFile', maxCount: 1 }
]), fileController.uploadFile);

router.get('/status/:id', authenticate, fileController.getProcessingStatus);
router.get('/list', authenticate, fileController.listFiles);

// Admin-only routes
router.post('/clear-cache', authenticate, authorizeAdmin, fileController.clearCache);

export { router as fileRoutes }; 