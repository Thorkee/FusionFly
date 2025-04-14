# FusionFly: GNSS+IMU Data Fusion System

![FusionFly](https://img.shields.io/badge/FusionFly-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![React](https://img.shields.io/badge/React-18.x-61dafb)
![Node.js](https://img.shields.io/badge/Node.js-16.x-43853d)

FusionFly is an open-source toolkit for processing and fusing GNSS (Global Navigation Satellite System) and IMU (Inertial Measurement Unit) data with Factor Graph Optimization (FGO). The system provides a modern web interface for uploading, processing, visualizing, and downloading standardized navigation data.           
## System Architecture

FusionFly follows a standard client-server architecture with a React frontend, Express.js backend, and Redis job queue for processing large files.
                            
```
┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
│                 │          │                 │          │                 │
│  React Frontend │◄────────►│  Express Backend│◄────────►│   Redis Queue   │
│                 │   HTTP   │                 │   Jobs   │                 │
└────────┬────────┘          └────────┬────────┘          └────────┬────────┘
         │                            │                            │
         │                            │                            │
         ▼                            ▼                            ▼
┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
│  User Interface │          │  File Storage   │          │  Data Processing│
│  - File Upload  │          │  - Raw Files    │          │  - Conversion   │
│  - Visualization│          │  - Processed    │          │  - FGO          │
│  - Downloads    │          │  - Results      │          │  - Validation   │
└─────────────────┘          └─────────────────┘          └─────────────────┘
```

## Data Standardization Pipeline

FusionFly processes data through a standardization pipeline:

```
┌───────────┐     ┌────────────┐     ┌───────────────┐     ┌───────────┐     ┌──────────────┐     ┌─────────────┐
│           │     │            │     │               │     │           │     │              │     │             │
│  Detect   │────►│ Process via│────►│ AI-Assisted   │────►│ Conversion│────►│ Schema       │────►│ Schema      │
│  Format   │     │ Standard   │     │ Parsing       │     │ Validation│     │ Conversion   │     │ Validation  │
│           │     │ Script     │     │ (if needed)   │     │           │     │              │     │             │
└───────────┘     └────────────┘     └───────────────┘     └───────────┘     └──────────────┘     └─────────────┘
                         │                   │                   │                   │                   │
                         │                   │                   │                   │                   │
                         ▼                   ▼                   ▼                   ▼                   ▼
                  ┌────────────────────────────────────────────────────────────────────────────────────────┐
                  │                                                                                        │
                  │                           Automated Feedback Loop                                      │
                  │                                                                                        │
                  └────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Detect Format**
   - Analyzes file extension and content to determine the data format
   - Identifies the appropriate processing pathway

2. **Try with standard script**:
   - **RINEX (.obs files)**
     - Processes using georinex library
     - Converts to standardized format with timestamps
     - Uses AI-assisted parsing if standard conversion fails
   - **NMEA (.nmea files)**
     - Processes NMEA sentences using pynmea2
     - Handles common message types (GGA, RMC)
     - Extracts timestamps and coordinates
     - Uses AI-assisted parsing when needed
   - **Unknown Formats**
     - Analyzes file content to determine structure
     - Generates appropriate conversion logic
     - Extracts relevant location data

3. **AI-Assisted Parsing**
   - If standard script is not working, it will call Azure OpenAI service with a snippet of data
   - The LLM generates a complete, executable conversion script for automatic execution in the backend
   - Each LLM in the pipeline (format conversion, location extraction, schema conversion) generates specialized scripts
   - System executes these scripts and provides detailed error feedback for subsequent attempts
   - Includes robust validation and fallback mechanisms for all pipeline stages

4. **Conversion Validation**
   - Validates script execution and output integrity at each stage
   - Checks for correct JSONL formatting and required fields
   - If validation fails, feeds the error data back to the LLM
   - Regenerates conversion scripts up to 3 times with increasingly specific instructions

5. **Schema Conversion**
   - After converting to JSONL, the third LLM generates a specialized script to map data to the target schema
   - The system executes this script to handle complex field mappings and data transformations
   - Applies data cleaning and normalization rules
   - Produces structurally consistent output conforming to the target schema

6. **Schema Validation**
   - Performs rigorous validation against the required schema structure
   - Specifically verifies entry names match exactly with the target schema
   - Validates data types, required fields, and structural constraints
   - If validation fails, triggers the fallback mechanism:
     - Reports specific validation errors to the LLM
     - Generates improved conversion code with corrected field mappings
     - Re-processes the data with enhanced instructions
     - Repeats until output fully conforms to schema specifications

Each step includes comprehensive error handling and logging, allowing for detailed diagnostics and continuous improvement of the conversion process. The entire pipeline is designed to handle variations in input data formats while ensuring consistent, standardized output.

## Data Flow Pipeline

FusionFly processes data through a well-defined pipeline:

```
┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐
│           │     │           │     │           │     │           │     │           │
│  File     │────►│  Format   │────►│ Conversion│────►│  Process  │────►│  Output   │
│  Upload   │     │  Detection│     │ to JSONL  │     │  & Fusion │     │  Results  │
│           │     │           │     │           │     │           │     │           │
└───────────┘     └───────────┘     └───────────┘     └───────────┘     └───────────┘
       │                │                │                │                   │
       ▼                ▼                ▼                ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                     │
│  Supported Input Formats                │  Output Formats                           │
│  ─────────────────────                 │  ─────────────────                        │
│  GNSS:                                 │  Standardized JSONL                        │
│  - RINEX (.obs, .rnx, .21o)            │  Location Data                             │
│  - NMEA (.nmea, .gps, .txt)            │  Trajectory Visualization                  │
│  - UBX (binary)                        │  Validation Reports                        │
│  - JSON, CSV                           │                                            │
│                                        │                                            │
│  IMU:                                  │                                            │
│  - Raw IMU data (.imu)                 │                                            │
│  - CSV, JSON, TXT                      │                                            │
│                                        │                                            │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Component Descriptions

### Frontend (React)

The frontend is built with React and provides a modern user interface for interacting with the system. It includes:
                            
1. **Home Page**: Overview of the system and its capabilities
2. **Upload Interface**: 
   - Drag-and-drop file upload for GNSS and IMU data
   - Progress tracking for uploads and processing
   - Format detection and validation
3. **Files Page**: 
   - List of processed files with metadata
   - Download options for processed data
   - Cache management
4. **Results Visualization**: (Coming soon)
   - Trajectory visualization
   - Error analysis
   - Quality metrics

### Backend (Express.js)

The backend provides the API endpoints and processing logic:

1. **API Layer**:
   - RESTful API for file operations
   - Status reporting
   - Error handling
2. **Processing Engine**:
   - Format detection and conversion
   - GNSS data parsing (RINEX, NMEA, UBX)
   - IMU data processing
   - Data fusion with FGO (Factor Graph Optimization)
3. **Storage Management**:
   - File storage
   - Processing results
   - Cache management

### Job Queue (Redis/Bull)

Long-running processing tasks are handled by a Redis-backed job queue:

1. **Job Management**:
   - Job creation and tracking
   - Progress reporting
   - Error handling and retries
2. **Worker Processes**:
   - File conversion
   - Data processing
   - Result generation

## Detailed Process Flow

```
┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│                      │     │                      │     │                      │
│  Client              │     │  Server              │     │  Processing          │
│                      │     │                      │     │                      │
│  1. Select Files     │────►│  1. Receive Files    │────►│  1. Detect Format    │
│  2. Upload           │     │  2. Store Files      │     │  2. Convert to JSONL │
│  3. Monitor Progress │◄────│  3. Create Job       │     │  3. Extract Location │
│  4. View Results     │     │  4. Return Job ID    │     │  4. Validate Data    │
│  5. Download Output  │◄────│  5. Serve Results    │◄────│  5. Generate Output  │
│                      │     │                      │     │                      │
└──────────────────────┘     └──────────────────────┘     └──────────────────────┘
```

## API Endpoints

FusionFly exposes the following RESTful API endpoints:

| Endpoint                 | Method | Description                                  |
|--------------------------|--------|----------------------------------------------|
| `/api/files/upload`      | POST   | Upload GNSS and/or IMU files                 |
| `/api/files/status/:id`  | GET    | Check processing status for a job            |
| `/api/files/list`        | GET    | List all processed files                     |
| `/api/files/download/:id`| GET    | Download a processed file                    |
| `/api/files/clear-cache` | POST   | Clear all cached files                       |
| `/api/health`            | GET    | Check API health                             |

## GNSS+IMU Fusion with FGO

FusionFly uses Factor Graph Optimization (FGO) to fuse GNSS and IMU data. This approach:

1. Creates a graph where nodes represent states (position, velocity, orientation)
2. Adds edges representing constraints from sensor measurements
3. Optimizes the graph to find the most likely trajectory
4. Produces a consistent navigation solution robust to sensor errors

Benefits of FGO:

- Handles sensor outages and degraded signals
- Provides accurate positioning in challenging environments
- Combines complementary sensor characteristics:
  - GNSS: Absolute positioning, drift-free
  - IMU: High rate, orientation, robust to signal loss

## Getting Started

### Prerequisites

- Node.js (v16+)
- npm or yarn
- Redis server

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/Thorkee/LLMFGO.git
   cd LLMFGO
   ```

2. Install dependencies:
   ```
   npm run install:all
   ```

3. Set up environment:
   ```
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Start the development servers:
   ```
   npm run dev
   ```

## Usage

1. Navigate to `http://localhost:3000` in your browser
2. Upload GNSS and/or IMU data files on the Upload page
3. Monitor processing status
4. View and download results from the Files page

## Development

### Project Structure

```
LLMFGO/
├── frontend/           # React frontend
│   ├── public/         # Static assets
│   └── src/            # React components and logic
│       ├── components/ # Reusable UI components
│       └── pages/      # Main application pages
├── backend/            # Express.js backend
│   └── src/
│       ├── controllers/# API controllers
│       ├── services/   # Business logic
│       ├── routes/     # API routes
│       ├── models/     # Data models
│       └── utils/      # Utility functions
├── uploads/            # Uploaded and processed files
└── test-files/         # Test data for development
```

## Roadmap

- [x] Basic GNSS data processing (RINEX, NMEA, UBX)
- [x] Multi-format conversion to standardized JSONL
- [x] File upload and download functionality
- [x] IMU data support
- [ ] Complete GNSS+IMU fusion with FGO
- [ ] Interactive trajectory visualization
- [ ] Batch processing
- [ ] User authentication and file management
- [ ] Performance optimizations for large datasets

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an Issue on GitHub.

## Acknowledgments

- Built with React, Express.js, and Redis
- Uses Factor Graph Optimization techniques
- Inspired by modern GNSS+IMU fusion research
