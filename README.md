# LLMFGO - React GNSS Converter Application

A modern React-based GNSS (Global Navigation Satellite System) data converter application with a clean UI and powerful backend.

## Features

- Convert NMEA format files to JSON and other formats
- Extract location data from GNSS files
- Responsive React frontend with modern UI
- Express.js backend for file processing
- File upload functionality
- Redis-based job processing

## Project Structure

```
LLMFGO/
├── frontend/           # React frontend application
│   ├── src/            # React source code
│   ├── public/         # Static assets
│   └── package.json    # Frontend dependencies
├── backend/            # Express.js backend application
│   ├── src/            # TypeScript source code
│   ├── uploads/        # File upload directory
│   └── package.json    # Backend dependencies
└── README.md           # Project documentation
```

## Getting Started

### Prerequisites

- Node.js (v14+)
- npm or yarn
- Redis server

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/your-username/LLMFGO.git
   cd LLMFGO
   ```

2. Install frontend dependencies:
   ```
   cd frontend
   npm install
   ```

3. Install backend dependencies:
   ```
   cd ../backend
   npm install
   ```

4. Create a `.env` file in the backend directory:
   ```
   PORT=3001
   REDIS_URL=redis://localhost:6379
   UPLOAD_DIR=uploads
   ```

5. Start Redis server:
   ```
   redis-server
   ```

### Running the Application

1. Start the backend:
   ```
   cd backend
   npm run dev
   ```

2. Start the frontend:
   ```
   cd frontend
   npm start
   ```

3. The application will be available at `http://localhost:3000`

## API Endpoints

- `POST /api/upload`: Upload GNSS files for conversion
- `GET /api/files`: Retrieve processed files
- `GET /api/files/:id`: Get details for a specific file

## Deployment

The application can be deployed to Vercel using the deployment script provided in the root directory.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
