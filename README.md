# FusionFly: GNSS+IMU Data Fusion System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![FusionFly](https://img.shields.io/badge/FusionFly-1.0.0-blue)
[![React](https://img.shields.io/badge/React-18.x-blue)](https://reactjs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey)](https://expressjs.com/)

FusionFly is an open-source toolkit for processing and fusing GNSS (Global Navigation Satellite System) and IMU (Inertial Measurement Unit) data with Factor Graph Optimization (FGO). The system provides a web-based interface for uploading, processing, and visualizing positioning data.

## System Architecture

FusionFly follows a standard client-server architecture with a React frontend, Express.js backend, and Redis job queue for processing large files.

```
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│               │     │               │     │               │
│  React        │     │  Express.js   │     │  Redis Queue  │
│  Frontend     │◄───►│  Backend      │◄───►│  (Bull)       │
│               │     │               │     │               │
└───────────────┘     └───────────────┘     └───────────────┘
        │                     │                     │
        │                     │                     │
        │                     ▼                     │
        │             ┌───────────────┐             │
        │             │               │             │
        └────────────►│  Result &     │◄────────────┘
                      │  File Storage │
                      │               │
                      └───────────────┘
```

## Data Flow Pipeline

FusionFly processes data through a well-defined pipeline:

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│         │     │          │     │          │     │          │     │          │
│ Upload  │────►│ Format   │────►│ Extract  │────►│ FGO      │────►│ Output   │
│ Files   │     │ Detection│     │ Data     │     │ Process  │     │ Results  │
│         │     │          │     │          │     │          │     │          │
└─────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
```

1. **Upload Files**: Users upload GNSS (RINEX, NMEA, UBX) and IMU data files
2. **Format Detection**: The system automatically detects file formats
3. **Data Extraction**: Navigation data is parsed and normalized
4. **FGO Processing**: Factor Graph Optimization algorithms fuse multiple sensor data
5. **Output Results**: Results are displayed visually and available for download

## Components

### Frontend (React)
- **File Upload Component**: Handles file selection and upload
- **Processing Status**: Real-time updates during processing
- **File List**: View and download processed files
- **Visualization**: Interactive graphs and maps of results

### Backend (Express.js)
- **File Routes**: API endpoints for file operations
- **Processing Services**: File format detection and processing
- **Job Queue**: Manages long-running processing tasks
- **Storage Services**: Handles file storage and retrieval

### Job Queue (Redis/Bull)
- **Worker Processes**: Executes CPU-intensive processing jobs
- **Job Status Tracking**: Monitors and reports processing status
- **Error Handling**: Manages failures and retries

## Process Flow

```
┌────────┐     ┌────────────────┐     ┌─────────────┐     ┌────────────────┐
│        │     │                │     │             │     │                │
│ Client │─┬──►│ Upload Request │────►│ Create Job  │────►│ Job Processing │
│        │ │   │                │     │             │     │                │
└────────┘ │   └────────────────┘     └─────────────┘     └────────────────┘
           │                                                       │
           │   ┌────────────────┐     ┌─────────────┐             │
           │   │                │     │             │             │
           └──►│ Status Check   │◄────┤ Job Updates │◄────────────┘
               │                │     │             │
               └────────────────┘     └─────────────┘
                        │
                        ▼
               ┌────────────────┐
               │                │
               │ Results        │
               │                │
               └────────────────┘
```

## API Endpoints

FusionFly exposes the following RESTful API endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/files/upload` | POST | Upload GNSS and IMU files |
| `/api/files/status/:jobId` | GET | Check processing status |
| `/api/files/list` | GET | List all processed files |
| `/api/files/download/:filename` | GET | Download a processed file |
| `/api/files/clear-cache` | POST | Clear all cached files |

## GNSS+IMU Fusion with FGO

FusionFly uses Factor Graph Optimization (FGO) to fuse GNSS and IMU data. This approach:

1. Creates a graph where nodes represent states (position, velocity, orientation)
2. Adds edges representing sensor measurements and constraints
3. Optimizes the graph to find the most likely trajectory that satisfies all constraints
4. Handles sensor noise and occasional dropouts gracefully

## Getting Started

### Prerequisites
- Node.js 14.x or higher
- Redis server
- Modern web browser

### Installation
1. Clone the repository: `git clone https://github.com/Thorkee/FusionFly.git`
2. Install dependencies: `npm run install:all`
3. Configure environment variables in `.env` files
4. Start the application: `npm run dev`

### Usage
1. Navigate to `http://localhost:3000` in your browser
2. Upload GNSS/IMU data files in supported formats
3. Monitor processing status in real-time
4. View and download processing results

## Project Structure
```
├── frontend/                # React frontend
│   ├── public/              # Static assets
│   └── src/                 # React source code
├── backend/                 # Express.js backend
│   ├── src/                 # TypeScript source files
│   │   ├── controllers/     # Request handlers
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   └── utils/           # Helper functions
│   └── uploads/             # Uploaded file storage
└── package.json             # Project configuration
```

## Roadmap
- [ ] Support for more GNSS formats
- [ ] Advanced visualization options
- [ ] Batch processing mode
- [ ] Complete GNSS+IMU fusion with FGO
- [ ] Performance optimizations
- [ ] Docker containerization

## License
MIT

## Contributing
Contributions are welcome! Please feel free to submit a Pull Request.
