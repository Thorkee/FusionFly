import express from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileController } from '../controllers/fileController';

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
  const allowedExtensions = ['.nmea', '.obs', '.jsonl', '.json', '.txt'];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('File type not supported. Please upload NMEA, OBS, JSONL, JSON, or TXT files.'));
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Routes
router.post('/upload', upload.single('file'), fileController.uploadFile);
router.get('/status/:id', fileController.getProcessingStatus);
router.get('/download/:filename', fileController.downloadFile);
router.get('/list', fileController.listFiles);

export { router as fileRoutes }; 