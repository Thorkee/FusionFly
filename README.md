# FusionFly: GNSS+IMU Data Fusion System

![FusionFly](https://img.shields.io/badge/FusionFly-v1.0.0-4a90e2?style=for-the-badge&logo=appveyor)
[![FusionFly Wiki](https://img.shields.io/badge/Documentation-Wiki-6caa5f?style=for-the-badge&logo=github)](https://github.com/Thorkee/FusionFly/wiki)
![React](https://img.shields.io/badge/React-18.x-61dafb?style=for-the-badge&logo=react&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-16.x-43853d?style=for-the-badge&logo=node.js&logoColor=white)

FusionFly is an open-source toolkit for processing and fusing GNSS (Global Navigation Satellite System) and IMU (Inertial Measurement Unit) data with Factor Graph Optimization (FGO). The system provides a modern web interface for uploading, processing, visualizing, and downloading standardized navigation data.           

## Demo

Check out the FusionFly demo video to see the system in action:

https://youtu.be/oGyyChs1mSo

You can also:
- [Download the Demo Video](./public/assets/FusionFly%20Demo.mov) directly from the repository

*Note: After cloning the repository, you can find the demo video in the public/assets directory.*

## System Architecture

FusionFly follows a standard client-server architecture with a React frontend, Express.js backend, and Redis job queue for processing large files.

![FusionFly Architecture](./public/assets/Fusionsly%20Arch.png)
                            
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
   - Executes the generated conversion code automatically in the backend
   - Provides detailed error information to improve subsequent attempts

### LLM Robustness Features

FusionFly implements robust validation and fallback mechanisms for each LLM step in the AI-assisted conversion pipeline:

#### Format Conversion (First LLM)
- **Script Generation**: LLM generates a complete Node.js script to process the input file
- **Validation**: System executes the generated script and validates that output conforms to expected JSONL format
- **Fallback Mechanism**: 
  - When the script fails to execute or produces invalid output, the system captures specific errors
  - Error details are fed back to the LLM in a structured format for improved retry
  - The LLM is instructed to fix specific issues in its subsequent script generation attempt
  - System makes up to 3 attempts with increasingly detailed error feedback

#### Location Extraction (Second LLM)
- **Script Generation**: LLM generates a specialized Node.js script to extract location data from the first-stage output
- **Validation**: System executes the script and validates coordinates (latitude/longitude in correct ranges), timestamps, and required field presence
- **Fallback Mechanism**:
  - Detects script execution errors or missing/invalid location data in extraction output
  - Provides field-specific guidance to the LLM about conversion issues
  - Includes examples of proper formatting in error feedback
  - Retries with progressive reinforcement learning pattern

#### Schema Conversion (Third LLM) - Enhanced Two-Submodule Approach
- **Submodule 1: Direct Schema Conversion**
  - Takes a small sample of data from Module 2 (location data)
  - Directly converts it to the target schema format without generating code
  - Validates the converted sample against schema requirements
  - Produces a set of high-quality examples to guide the second submodule
  - Prompt focuses on direct data transformation, not code generation

- **Submodule 2: Transformation Script Generation**
  - Takes both raw data and the converted examples from Submodule 1
  - Generates a Node.js transformation script based on the pattern shown in the examples
  - Script is executed to process the entire dataset
  - Output is validated against schema requirements
  - Prompt includes both input data and properly formatted examples for pattern matching

- **Enhanced Validation and Feedback Flow**:
  - If Submodule 1 fails, the entire process fails (since examples are required for Submodule 2)
  - Detailed error messages identify specific schema non-compliance issues
  - Output from both submodules is validated against target schema
  - Retries with improved instructions based on specific validation failures

### Third LLM Pipeline Architecture

The detailed architecture of the enhanced third LLM module is illustrated below:

![Third LLM Two-Submodule Architecture](/public/assets/Module3_Flpw.png)

This diagram shows how the system first attempts direct schema conversion with Submodule 1, then uses both the original data and converted examples to generate a transformation script with Submodule 2. The script is then executed to process the entire dataset, with validation at each step ensuring compliance with the pre-defined schema.

The complete data transformation pipeline across all three modules is shown here:

![Complete LLM Pipeline](/public/assets/FYP_LLM_Pipeline_000.png)

This end-to-end view shows how each module contributes to the overall transformation process, from format conversion through location extraction to the final schema conversion.

#### Unit Testing
- Comprehensive test suite covers each LLM step with:
  - Happy path tests with valid inputs and expected outputs
  - Error handling tests with malformed inputs
  - Edge case tests (empty files, missing fields, etc.)
  - API error simulation and recovery tests
  - Validation and fallback mechanism tests

#### Error Feedback Loop
- The entire pipeline implements a closed feedback loop where:
  - Each step validates the output of the previous step
  - Validation errors are captured in detail
  - Structured error information guides the next LLM attempt
  - System learns from previous failures to improve conversion quality
  - Detailed logs are maintained for debugging and improvement

This multi-layer validation and fallback approach ensures robust processing even with challenging or unusual data formats, significantly improving the reliability of the AI-assisted conversion pipeline.

4. **Conversion Validation**
   - Runs comprehensive unit tests on the converted data
   - Validates correct JSONL formatting and data integrity
   - If validation fails, feeds the error data to the LLM
   - Regenerates conversion scripts up to 10 times until correctly converted to JSONL

5. **Schema Conversion**
   - After converting to JSONL, extracts data entries to the target schema
   - Uses the enhanced two-submodule approach:
     1. First directly converts a small sample to the target schema
     2. Then generates a script using both raw data and converted examples
   - Handles complex field mappings and data transformations
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
│  ─────────────────────                  │  ─────────────────                        │
│  GNSS:                                  │  Standardized JSONL                       │
│  - RINEX (.obs, .rnx, .21o)             │  Location Data                            │
│  - NMEA (.nmea, .gps, .txt)             │  Trajectory Visualization                 │
│  - UBX (binary)                         │  Validation Reports                       │
│  - JSON, CSV                            │                                           │
│                                         │                                           │
│  IMU:                                   │                                           │
│  - Raw IMU data (.imu)                  │                                           │
│  - CSV, JSON, TXT                       │                                           │
│                                         │                                           │
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

## Benchmark System

FusionFly includes a comprehensive scientific benchmark system for evaluating the accuracy, robustness, and efficiency of navigation data transformation processes.

### Benchmark Architecture

The benchmark system is organized as follows:

```
benchmark/
├── raw/                # Raw, unformatted navigation data
│   ├── gnss/           # GNSS data in various formats
│   └── imu/            # IMU data in various formats
├── standardized/       # Standardized data (ground truth)
├── test_cases/         # Test cases for benchmarking
│   ├── normal/         # Normal operating scenarios
│   └── edge_cases/     # Challenging data scenarios
├── metadata/           # Dataset and schema information
├── evaluation/         # Evaluation tools and metrics
└── results/            # Benchmark results
```

### Test Case Design

The benchmark includes carefully constructed test scenarios:

1. **Normal Test Cases**:
   - Medium Urban Environment with NMEA
   - Medium Urban Environment with RINEX OBS
   - Tunnel Environment (IMU-only)

2. **Edge Cases**:
   - Missing Data: Files with various fields removed (5-30%)
   - Corrupted Data: Files with invalid/extreme values
   - Format Variations: Different field ordering, units, etc.

### Scientific Evaluation Metrics

#### 1. Data Field Accuracy Metrics

These metrics quantify how precisely the transformed data matches ground truth values across all navigation parameters.

**Implementation Logic:**
- Points from ground truth and transformed datasets are matched by timestamps
- Field-by-field comparison is performed using dot notation (e.g., `position_lla.latitude_deg`)
- Statistical measures are calculated for each field

**Core Metrics:**
- **Mean Absolute Error (MAE)**: Average absolute difference between original and transformed values
  ```python
  mae = np.mean(errors)  # Simple, interpretable measure of error magnitude
  ```
- **Root Mean Square Error (RMSE)**: Square root of average squared differences
  ```python
  rmse = np.sqrt(np.mean(np.array(errors) ** 2))  # Penalizes larger errors
  ```
- **Normalized RMSE**: RMSE normalized by the range of original values
  ```python
  nrmse = rmse / (max(gt_values) - min(gt_values))  # Makes errors comparable across different measurement types
  ```

**Specialized Accuracy Metrics:**
- Coordinate transformation accuracy (ECEF↔LLA)
- Timestamp conversion precision (microseconds)
- Sampling rate preservation
- Structural schema compliance

#### 2. Robustness Metrics

These metrics evaluate how well the system handles variations, edge cases, and challenging inputs.

**Implementation Logic:**
- Test files contain intentionally corrupted or challenging data
- System processes these files and results are compared to expected handling
- Specific types of data corruption are systematically introduced:
  ```json
  {
    "time_unix": 1621218775.5489783,
    "linear_acceleration": {
      "x": 100.0,  // Extreme value (corrupted)
      "y": -100.0, // Extreme value (corrupted)
      "z": 100.0   // Extreme value (corrupted)
    }
  }
  ```

**Core Metrics:**
- **Success Rate**: Percentage of edge cases successfully processed
- **Error Recovery Rate**: Percentage of corrupted data points properly handled
- **Accuracy Under Stress**: Field accuracy metrics on edge case data

**Specialized Robustness Metrics:**
- Missing data handling at 5%, 10%, 20%, and 30% levels
- Outlier detection and filtering performance
- Special value handling (NaN, infinity, null)
- Response to inconsistent sampling rates

#### 3. Efficiency Metrics

These metrics measure the computational resources required for data transformation.

**Implementation Logic:**
- Performance monitoring during transformation process
- Resource usage tracking using `psutil` library

**Core Metrics:**
- **Transformation Time**: Processing time per data point
- **Peak Memory Usage**: Maximum memory consumption during processing
- **CPU Utilization**: Average and peak CPU usage percentage
- **Size Ratio**: Ratio of transformed data size to original data size

### Benchmark Automation

The benchmark system is fully automated:

```bash
# Run the complete benchmark suite
./run_benchmark.sh

# Evaluate specific test cases
python evaluation/metrics.py --ground-truth standardized/ --converted results/
python evaluation/benchmark.py --input-dir test_cases/normal/case1/ --output-dir results/
```

### Visualization and Reporting

The benchmark generates comprehensive reports with:
- Statistical summaries of all metrics
- Field-by-field comparisons between original and transformed data
- Error distribution visualizations
- Overall quality score based on weighted metrics

For detailed technical information about metrics implementation, see [Benchmark Metrics Implementation](benchmark/METRICS_IMPLEMENTATION.md).

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
- For production deployment: 
  - Azure Cosmos DB account
  - Azure Blob Storage account
  - Vercel account (optional)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/Thorkee/FusionFly.git
   cd FusionFly
   ```

2. Install dependencies:
   ```
   npm run install:all
   ```

3. Set up environment:
   ```
   cp backend/.env.example backend/.env
   # Edit .env with your configuration
   ```

4. Start the development servers:
   ```
   npm run dev
   ```

## Deployment to Vercel

If you wish to deploy the application to Vercel, follow these steps:

### Backend Deployment

1. Import the project in Vercel Dashboard
2. Configure environment variables:
   - All variables from `backend/.env.example`
   - Set `USE_LOCAL_DB_FALLBACK=false` for production
   - Add your Cosmos DB, Blob Storage credentials
3. Deploy the backend service

### Frontend Deployment

1. Update `frontend/.env.production` with your backend URL
2. Import the frontend project in Vercel Dashboard
3. Deploy the frontend application

### Post-Deployment Steps

1. Create containers in Azure Blob Storage:
   - `uploads`
   - `processed`
   - `results`

2. Initialize Cosmos DB:
   - The application will automatically create the database and containers on first run
   - No manual initialization is required

## Usage

1. Navigate to `http://localhost:3000` in your browser
2. Upload GNSS and/or IMU data files on the Upload page
3. Monitor processing status
4. View and download results from the Files page

## Development

### Project Structure

```
FusionFly/
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

## Troubleshooting

- If file uploads fail, check your Blob Storage connection string
- For authentication issues, verify your JWT secret
- If you encounter Cosmos DB errors, ensure your endpoint and key are correct

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an Issue on GitHub.

## Acknowledgments

- Built with React, Express.js, and Redis
- Uses Factor Graph Optimization techniques
- Inspired by modern GNSS+IMU fusion research
