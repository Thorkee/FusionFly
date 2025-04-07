// Simplified server for Azure deployment
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

// Create Express app
const app = express();
const PORT = process.env.PORT || 8000;

// Basic middleware
app.use(cors());
app.use(express.json());

// Create required directories
const dirs = ['uploads', 'results', 'localdb'];
dirs.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    console.log(`Creating directory: ${dir}`);
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Health check endpoint - very simple and robust
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    message: 'Basic server is running'
  });
});

// Status message for default route
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>FusionFly - Status</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          .card { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .success { color: green; }
          .warning { color: orange; }
          .api-url { background: #f5f5f5; padding: 10px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <h1>FusionFly Application Status</h1>
        <div class="card">
          <h2 class="success">Server is running!</h2>
          <p>The basic server component is operational. API endpoints are available.</p>
          <p>Check the health endpoint: <span class="api-url">/api/health</span></p>
        </div>
        <div class="card">
          <h2 class="warning">Limited Functionality Mode</h2>
          <p>This is a simplified server for Azure deployment diagnostics.</p>
          <p>Full application functionality will be available after resolving deployment issues.</p>
        </div>
      </body>
    </html>
  `);
});

// Basic API placeholder
app.get('/api', (req, res) => {
  res.json({
    message: 'API is operational',
    status: 'limited',
    endpoints: ['/api/health']
  });
});

// Catch-all error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Server error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred' 
      : err.message
  });
});

// Start server with robust error handling
try {
  app.listen(PORT, () => {
    console.log(`Basic Azure server running on port ${PORT}`);
    console.log(`Health check available at: /api/health`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Log environment variables (excluding secrets)
    console.log('\nEnvironment variables:');
    Object.keys(process.env)
      .filter(key => !key.includes('KEY') && !key.includes('SECRET') && !key.includes('PASSWORD'))
      .forEach(key => {
        console.log(`${key}: ${process.env[key]}`);
      });
  });
} catch (error) {
  console.error('Failed to start server:', error);
  
  // Create a minimal express app as a last resort
  const emergencyApp = express();
  emergencyApp.get('*', (req, res) => {
    res.status(500).send('Emergency fallback activated. Server failed to start properly.');
  });
  
  emergencyApp.listen(PORT, () => {
    console.log(`EMERGENCY MODE: Fallback server running on port ${PORT}`);
  });
} 