const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 8001;

// Create uploads directory if it doesn't exist (for local fallback)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create results directory if it doesn't exist (for local fallback)
const resultsDir = path.join(__dirname, 'results');
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

// Create local database directory if it doesn't exist (for local fallback)
const localDbDir = path.join(__dirname, 'localdb');
if (!fs.existsSync(localDbDir)) {
  fs.mkdirSync(localDbDir, { recursive: true });
  
  // Create empty users.json file if it doesn't exist
  const usersFilePath = path.join(localDbDir, 'users.json');
  if (!fs.existsSync(usersFilePath)) {
    fs.writeFileSync(usersFilePath, JSON.stringify({ users: [] }));
  }
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use(morgan('dev'));
app.use('/uploads', express.static(uploadsDir));

// Import initialization functions
const { initializeStorage } = require('./dist/services/blobStorageService');
const { initializeCosmosDb } = require('./dist/config/cosmosDbSetup');

// Log initialization for debugging in Azure
console.log('Starting server initialization...');

// Global variable to track if services are initialized
let blobStorageInitialized = false;

// Main server startup function with improved error handling
async function startServer() {
  try {
    console.log(`Using ${process.env.NODE_ENV || 'development'} environment`);
    
    // Initialize storage with fallback to local filesystem
    try {
      await initializeStorage();
      blobStorageInitialized = true;
    } catch (error) {
      console.error('Error initializing blob storage:', error);
      console.log('Using local filesystem for storage (development mode)');
      // Continue without failing - we'll use local filesystem fallback
    }
    
    // Load routes - improved error handling
    let authRoutes, fileRoutes;
    try {
      authRoutes = require('./dist/routes/authRoutes').authRoutes;
      fileRoutes = require('./dist/routes/fileRoutes').fileRoutes;
      console.log('Successfully loaded routes from TypeScript build');
    } catch (error) {
      console.error('Error loading TypeScript routes:', error);
      
      try {
        // Try loading from JavaScript files directly as fallback
        authRoutes = require('./routes/authRoutes').authRoutes;
        fileRoutes = require('./routes/fileRoutes').fileRoutes;
        console.log('Successfully loaded routes from JavaScript files');
      } catch (secondError) {
        console.error('Failed to load routes from JavaScript files:', secondError);
        throw new Error('Cannot start server without routes');
      }
    }
    
    // Apply auth routes
    app.use('/api/auth', authRoutes);
    app.use('/api/files', fileRoutes);
    
    // Add local file API routes if needed
    if (!blobStorageInitialized || process.env.NODE_ENV !== 'production') {
      console.log('Adding local file API fallback routes');
      
      app.get('/api/files/list', (req, res) => {
        try {
          // Read files from uploads directory
          const files = fs.readdirSync(uploadsDir)
            .filter(file => !file.startsWith('.'))
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
      
      // Add clear cache route as a fallback
      app.post('/api/files/clear-cache', (req, res) => {
        try {
          console.log(`Clearing cache from directory: ${uploadsDir}`);
          
          // Check if directory exists
          if (!fs.existsSync(uploadsDir)) {
            return res.status(200).json({ message: 'No cache to clear' });
          }
          
          // Get files and directories, excluding hidden files and the test directory
          const files = fs.readdirSync(uploadsDir)
            .filter(file => !file.startsWith('.') && file !== 'test');
          
          // Delete each file
          let deletedCount = 0;
          const errors = [];
          
          for (const file of files) {
            const filePath = path.join(uploadsDir, file);
            try {
              const stats = fs.statSync(filePath);
              
              if (stats.isDirectory()) {
                console.log(`Skipping directory: ${file}`);
                continue;
              }
              
              fs.unlinkSync(filePath);
              console.log(`Deleted file: ${file}`);
              deletedCount++;
            } catch (error) {
              console.error(`Error deleting file ${file}:`, error);
              errors.push({ file, error: error.message });
            }
          }
          
          if (errors.length > 0) {
            return res.status(207).json({
              message: `Cache partially cleared. ${deletedCount} files deleted, ${errors.length} errors.`,
              deletedCount,
              errors
            });
          }
          
          res.status(200).json({ 
            message: 'Cache cleared successfully', 
            deletedCount 
          });
        } catch (error) {
          console.error('Error clearing cache:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(500).json({ error: `Failed to clear cache: ${errorMessage}` });
        }
      });
    }
    
    // Initialize Cosmos DB with improved error handling
    try {
      console.log('Setting up Cosmos DB...');
      await initializeCosmosDb();
    } catch (error) {
      console.error('Error initializing Cosmos DB:', error);
      console.log('Using local database fallback');
      // Continue without failing - we'll use local file-based DB fallback
    }
   
    // Serve frontend static files in production
    if (process.env.NODE_ENV === 'production') {
      console.log('Setting up to serve frontend static files from /frontend directory');
      const frontendPath = path.join(__dirname, 'frontend');
      
      // Check if frontend directory exists
      if (fs.existsSync(frontendPath)) {
        console.log(`Frontend directory found at: ${frontendPath}`);
        
        // Serve static files
        app.use(express.static(frontendPath));
        
        // Serve index.html for any unknown routes
        app.get('*', (req, res) => {
          // Skip API routes
          if (req.path.startsWith('/api/')) {
            return res.status(404).json({ error: 'API endpoint not found' });
          }
          
          const indexPath = path.join(frontendPath, 'index.html');
          if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
          } else {
            console.error('Frontend index.html not found');
            res.status(404).send('Frontend not properly deployed');
          }
        });
        
        console.log('Frontend static files will be served');
      } else {
        console.error('Frontend directory not found at:', frontendPath);
      }
    }
    
    // Health check endpoint
    app.get('/api/health', (req, res) => {
      res.status(200).json({ 
        status: 'ok',
        environment: process.env.NODE_ENV || 'development',
        blobStorage: blobStorageInitialized ? 'connected' : 'fallback',
        directories: {
          uploads: fs.existsSync(uploadsDir),
          results: fs.existsSync(resultsDir),
          localDb: fs.existsSync(localDbDir),
          frontend: fs.existsSync(path.join(__dirname, 'frontend'))
        }
      });
    });
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Fatal error during server startup:', error);
    
    // Create a simple fallback app that at least responds to health checks
    // This ensures Azure doesn't keep restarting the container
    const fallbackApp = express();
    fallbackApp.use(cors());
    
    fallbackApp.get('/api/health', (req, res) => {
      res.status(500).json({ 
        status: 'error',
        error: error.message || 'Unknown startup error',
        recoverable: false
      });
    });
    
    fallbackApp.get('*', (req, res) => {
      res.status(500).send('Application is in recovery mode due to startup failure');
    });
    
    fallbackApp.listen(PORT, () => {
      console.log(`RECOVERY MODE: Server running in limited mode on port ${PORT}`);
    });
  }
}

// Start the server
startServer().catch(error => {
  console.error('Failed to start server:', error);
  
  // Create a minimal express app that just responds to health checks
  // This prevents Azure from continuously restarting the container
  const emergencyApp = express();
  emergencyApp.get('/api/health', (req, res) => {
    res.status(500).json({ 
      status: 'critical_error',
      error: error.message || 'Unknown fatal error',
      recoverable: false
    });
  });
  
  emergencyApp.get('*', (req, res) => {
    res.status(500).send('Application failed to start due to a critical error');
  });
  
  emergencyApp.listen(PORT, () => {
    console.log(`EMERGENCY MODE: Minimal server running on port ${PORT}`);
  });
}); 