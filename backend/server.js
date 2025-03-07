const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 8000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const fileExtension = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExtension}`;
    cb(null, fileName);
  }
});

// File filter to accept only certain file types
const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.nmea', '.obs', '.jsonl', '.json', '.txt', '.ubx', '.csv', '.rnx', '.21o', '.22o', '.23o'];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not supported. Please upload one of these formats: ${allowedExtensions.join(', ')}`));
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use('/uploads', express.static(uploadsDir));

// Mock file processing for testing
const processedFiles = {};

// Routes
app.post('/api/files/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, filename, path: filePath } = req.file;
    
    // Create a mock job ID
    const jobId = uuidv4();
    
    // Store mock processing info
    processedFiles[jobId] = {
      id: jobId,
      state: 'completed',
      progress: 100,
      result: {
        status: 'completed',
        message: 'File processing completed successfully',
        files: {
          original: filename,
          jsonl: `${filename.split('.')[0]}.jsonl`,
          location: `${filename.split('.')[0]}.location.jsonl`
        }
      },
      createdAt: Date.now()
    };
    
    res.status(200).json({
      message: 'File uploaded successfully',
      jobId,
      filename,
      originalname
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file: ' + error.message });
  }
});

app.get('/api/files/status/:id', (req, res) => {
  try {
    const { id } = req.params;
    const status = processedFiles[id];
    
    if (!status) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.status(200).json(status);
  } catch (error) {
    console.error('Error getting job status:', error);
    res.status(500).json({ error: 'Failed to get job status' });
  }
});

app.get('/api/files/download/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(uploadsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.download(filePath);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

app.get('/api/files/list', (req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir)
      .filter(file => !file.startsWith('.')) // Filter out hidden files
      .map(file => {
        const filePath = path.join(uploadsDir, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          size: stats.size,
          createdAt: stats.birthtime
        };
      });
    
    res.status(200).json(files);
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 