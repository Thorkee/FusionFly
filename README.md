# GNSS/IMU Data Processing System

**UNDER DEVELOPMENT, CONTACT JU.LIN@CONNECT.POLYU.HK FOR INQUIRIES**

A robust system for processing various GNSS and IMU data formats, with automatic format detection and conversion capabilities.

## System Architecture

The system consists of several key components:

1. Web Interface (Flask)
2. Task Queue (Celery)
3. Message Broker (Redis)
4. Processing Pipeline
5. Format Converters
6. Location Data Extractors

## Features

- **Automatic Format Detection**: Analyzes and identifies unknown GNSS data formats
- **Multiple Format Support**:
  - RINEX observation files (.obs)
  - NMEA files (.nmea)
  - UBX format (auto-detected)
  - Other common GNSS formats (auto-detected)
- **Intelligent Data Extraction**:
  - Extracts location-relevant data needed for FGO
  - Standardizes output format across different input types
- **Web Interface**:
  - Drag-and-drop file upload
  - Multiple file upload support
  - Real-time processing status
  - Download of converted files
- **Background Processing**:
  - Asynchronous processing using Celery
  - Progress tracking
  - Error handling and recovery

## Processing Pipeline

### File Upload and Processing
- User uploads GNSS data file through web interface
- System generates unique task ID and queues processing task
- Format detection and conversion occurs in the background

### Format Detection and Conversion
The system supports multiple GNSS data formats with fallback options:

#### RINEX (.obs files)
- Processes using `georinex` library
- Converts to standardized format with timestamps
- Uses AI-assisted parsing if standard conversion fails

#### NMEA (.nmea files)
- Processes NMEA sentences using `pynmea2`
- Handles common message types (GGA, RMC)
- Extracts timestamps and coordinates
- Uses AI-assisted parsing when needed

#### Unknown Formats
- Analyzes file content to determine structure
- Generates appropriate conversion logic
- Extracts relevant location data

### Location Data Extraction
Processes files to extract standard location data including:
- Timestamps
- Coordinates (latitude/longitude)
- Altitude
- Satellite information
- Quality metrics

### Data Validation
Each processing stage includes validation to ensure data quality:
- Format validation
- Required fields check
- Coordinate verification
- Timestamp consistency

## Output Format

All inputs are converted to a standardized JSONL format:

```json
{
    "timestamp_ms": 1621218691991,
    "latitude": 22.301210,
    "longitude": 114.178993,
    "altitude": 10.9,
    "num_satellites": 7,
    "hdop": 1.0,
    "quality": 1
}
```

Additional fields may include:
- `satellite_system`: GNSS system identifier
- `pseudorange`: Pseudorange measurements
- `carrier_phase`: Carrier phase measurements
- `doppler`: Doppler measurements
- `signal_strength`: Signal strength indicators
- `speed`: Ground speed (when available)
- `course`: True course (when available)

## Setup and Dependencies

### Required Software
- Python 3.11+
- Redis Server
- Celery

### Python Dependencies
```
flask>=2.0.1
openai>=1.0.0
python-dotenv>=0.19.0
georinex>=1.13.0
pynmea2>=1.19.0
pandas>=1.3.0
xarray>=2022.3.0
celery>=5.3.0
redis>=4.0.0
```

### Environment Variables
```
AZURE_OPENAI_ENDPOINT=your_endpoint_here
AZURE_OPENAI_API_KEY=your_api_key_here
AZURE_OPENAI_ENGINE=your_deployment_name_here
AZURE_OPENAI_API_VERSION=2024-08-01-preview
```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Thorkee/GNSS_IMU_AutoConversion.git
cd GNSS_IMU_AutoConversion
```

2. Create and activate a virtual environment:
```bash
python3.11 -m venv venv
source venv/bin/activate  # On Unix/macOS
# or
.\venv\Scripts\activate  # On Windows
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Update the values with your API credentials

## Running the Application

1. Start Redis server:
```bash
redis-server --port 6383
```

2. Start Celery worker:
```bash
export REDIS_PORT=6383 && celery -A app.celery worker --loglevel=info
```

3. Start Flask application:
```bash
export REDIS_PORT=6383 && export PYTHONPATH="${PYTHONPATH}:${PWD}/src" && PORT=5010 python3 app.py
```

The application will be accessible at http://127.0.0.1:5010

## Troubleshooting

### Common Issues

1. Redis Port Conflicts
   - Check if Redis is already running on the port
   - Use `lsof -ti:6383 | xargs kill -9` to free the port
   - Restart Redis server

2. File Processing Errors
   - Verify file encoding (UTF-8 recommended)
   - Check file permissions
   - Ensure proper format of input files

3. Task Queue Issues
   - Verify Redis connection
   - Check Celery worker status
   - Review task logs for errors

## Error Handling

The system implements comprehensive error handling:

1. File Format Errors
   - Invalid file format detection
   - Corrupted data handling
   - Missing field validation

2. Processing Errors
   - Conversion failures with automatic fallback
   - Validation errors with retry mechanism

3. System Errors
   - Service unavailability handling
   - Network issues management
   - API failures with fallback options

## License

MIT License - See LICENSE file for details.

## Citation

If you use this software in your research, please cite it as below:

```bibtex
@software{gnss_imu_autoconversion,
  title = {GNSS IMU Auto Conversion: An Intelligent GNSS Data Format Converter},
  author = {LIN, Ju and ZHU, Lingyao},
  year = {2025},
  version = {1.0.0},
  date-released = {2025-02-24},
  url = {https://github.com/Thorkee/GNSS_IMU_AutoConversion}
}
```

## Acknowledgments

- georinex for RINEX file processing
- pynmea2 for NMEA file processing
