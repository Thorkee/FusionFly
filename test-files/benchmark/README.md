# Navigation Data Standardization Benchmark Dataset

This benchmark dataset provides a scientific way to evaluate AI agents that transform unformatted navigation data (GNSS and IMU) into standardized formats ready for Factor Graph Optimization (FGO).

## Dataset Overview

This benchmark dataset is created using real data from the UrbanNav Dataset, specifically focusing on the Medium Urban environment in Hong Kong. It includes both raw and standardized data formats for GNSS (NMEA and OBS) and IMU sensors, along with various test cases and evaluation tools.

## Dataset Structure

The benchmark dataset is organized as follows:

```
benchmark_dataset/
├── raw/                      # Raw, unformatted navigation data
│   ├── gnss/
│   │   ├── nmea/             # NMEA format GNSS data
│   │   └── obs/              # RINEX observation format GNSS data
│   └── imu/                  # Raw IMU data in CSV format
├── standardized/             # Standardized data following the schema
│   ├── gnss_data/            # Standardized GNSS data
│   └── imu_data/             # Standardized IMU data
├── test_cases/               # Test cases for benchmarking
│   ├── normal/               # Normal scenarios
│   │   ├── case1/            # Medium Urban Environment (GNSS NMEA + IMU)
│   │   ├── case2/            # Medium Urban Environment (GNSS OBS + IMU)
│   │   └── case3/            # Tunnel Environment (IMU only)
│   └── edge_cases/           # Edge cases for robustness testing
│       ├── missing_data/     # Data with missing fields
│       ├── corrupted_data/   # Data with corrupted values
│       └── format_variations/# Variations in data format
├── metadata/                 # Dataset metadata
│   ├── dataset_info.json     # General information about the dataset
│   ├── sensor_specifications.json # Specifications of sensors used
│   └── schema_documentation.json  # Documentation of the standardized schema
└── evaluation/               # Evaluation tools
    ├── metrics.py            # Script for evaluating conversion accuracy
    ├── benchmark.py          # Script for benchmarking conversion speed
    └── results_template/     # Templates for evaluation results
```

## Test Cases

### Normal Scenarios

1. **Medium Urban Environment with NMEA (case1)**
   - Complete GNSS (NMEA format) and IMU data
   - Typical urban canyon with high-rising buildings
   - Real data from UrbanNav Dataset

2. **Medium Urban Environment with OBS (case2)**
   - Complete GNSS (RINEX OBS format) and IMU data
   - Same environment as case1 but with different GNSS format
   - Real data from UrbanNav Dataset

3. **Tunnel Environment (case3)**
   - IMU data only (no GNSS)
   - Simulates tunnel environment with no GNSS reception
   - Uses real IMU data from UrbanNav Dataset

### Edge Cases

1. **Missing Data**
   - GNSS data with missing position
   - GNSS data with missing time
   - GNSS data with missing DOP
   - IMU data with missing linear acceleration
   - IMU data with missing angular velocity
   - IMU data with missing orientation

2. **Corrupted Data**
   - GNSS data with invalid coordinates
   - GNSS data with extreme DOP values
   - GNSS data with inconsistent timestamps
   - IMU data with outliers in acceleration
   - IMU data with NaN values
   - IMU data with inconsistent timestamps

3. **Format Variations**
   - NMEA data with different sentence types
   - RINEX observation data with varying satellite counts
   - IMU data with different field ordering
   - IMU data with extra fields
   - IMU data with different units
   - GNSS data with different position formats (ECEF vs. LLA)

## Evaluation Metrics

### Conversion Accuracy
- Position Error (m)
- Orientation Error (deg)
- Acceleration Error (m/s²)
- Matched Points (%)

### Conversion Speed
- Total Time (s)
- Average Time per File (s)
- Peak Memory Usage (MB)
- Average CPU Usage (%)

### Robustness
- Success Rate (%)
- Error Recovery Rate (%)

## Usage Instructions

### Evaluating an AI Agent

1. Use the test cases in `test_cases/` to evaluate your AI agent
2. For each test case:
   - Input: Raw data files in the test case directory
   - Expected output: Standardized data following the schema in `metadata/schema_documentation.json`

3. Run the evaluation tools:
   ```
   python evaluation/metrics.py --ground-truth benchmark_dataset/standardized/ --converted your_output_dir/
   ```

4. For performance benchmarking:
   ```
   python evaluation/benchmark.py --input benchmark_dataset/raw/ --output your_output_dir/ --script your_conversion_script.py
   ```

### Schema Overview

#### GNSS Data Schema
```json
{
  "gnss_data": [
    {
      "time_unix": 1621209175.0,
      "position_lla": {
        "latitude_deg": 22.301232,
        "longitude_deg": 114.178997,
        "altitude_m": 9.0
      },
      "dop": 0.62,
      "clock_error_estimate": 0.000023
    }
  ]
}
```

#### IMU Data Schema
```json
{
  "imu_data": [
    {
      "time_unix": 1621218775.548978,
      "linear_acceleration": {
        "x": -0.024497,
        "y": 0.044380,
        "z": 9.713465
      },
      "angular_velocity": {
        "x": -0.056247,
        "y": 0.011484,
        "z": -0.009869
      },
      "orientation": {
        "w": 0.429272,
        "x": 0.014892,
        "y": -0.000650,
        "z": 0.903052
      }
    }
  ]
}
```

## Data Sources

This benchmark dataset is based on the UrbanNav Dataset, specifically:
- UrbanNav-HK-Medium-Urban-1 dataset
- Xsense IMU data
- u-blox F9P GNSS receiver data

The original UrbanNav Dataset can be found at: https://github.com/IPNL-POLYU/UrbanNavDataset

## License

This benchmark dataset is provided for research and educational purposes only.
