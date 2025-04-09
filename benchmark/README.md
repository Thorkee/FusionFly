# Navigation Data Standardization Benchmark Dataset

This benchmark dataset provides a scientific way to evaluate AI agents that transform unformatted navigation data (GNSS and IMU) into standardized formats ready for Factor Graph Optimization (FGO).

## Dataset Overview

This benchmark dataset is created using real data from the UrbanNav Dataset, specifically focusing on the Medium Urban environment in Hong Kong. It includes both raw and standardized data formats for GNSS (NMEA and OBS) and IMU sensors, along with various test cases and evaluation tools.

## Dataset Structure

The benchmark dataset is organized as follows:

```
benchmark_dataset/
├── raw/                # Raw, unformatted navigation data
│   ├── gnss/
│   │   ├── nmea/       # NMEA format GNSS data
│   │   └── obs/        # RINEX observation format GNSS data
│   └── imu/            # Raw IMU data in CSV format
├── standardized/       # Standardized data following the schema
│   ├── gnss_data/      # Standardized GNSS data
│   └── imu_data/       # Standardized IMU data
├── test_cases/         # Test cases for benchmarking
│   ├── normal/         # Normal scenarios
│   │   ├── case1/      # Medium Urban Environment (GNSS NMEA + IMU)
│   │   ├── case2/      # Medium Urban Environment (GNSS OBS + IMU)
│   │   └── case3/      # Tunnel Environment (IMU only)
│   └── edge_cases/     # Edge cases for robustness testing
│       ├── missing_data/     # Data with missing fields
│       ├── corrupted_data/   # Data with corrupted values
│       └── format_variations/# Variations in data format
├── metadata/           # Dataset metadata
│   ├── dataset_info.json           # General information about the dataset
│   ├── sensor_specifications.json  # Specifications of sensors used
│   └── schema_documentation.json   # Documentation of the standardized schema
└── evaluation/         # Evaluation tools
    ├── metrics.py      # Script for evaluating conversion accuracy
    ├── benchmark.py    # Script for benchmarking conversion speed
    └── results_template/ # Templates for evaluation results
```

## Test Cases

### Normal Scenarios

1. Medium Urban Environment with NMEA (case1)
   - Complete GNSS (NMEA format) and IMU data
   - Typical urban canyon with high-rising buildings
   - Real data from UrbanNav Dataset

2. Medium Urban Environment with OBS (case2)
   - Complete GNSS (RINEX OBS format) and IMU data
   - Same environment as case1 but with different GNSS format
   - Real data from UrbanNav Dataset

3. Tunnel Environment (case3)
   - IMU data only (no GNSS)
   - Simulates tunnel environment with no GNSS reception
   - Uses real IMU data from UrbanNav Dataset

### Edge Cases

1. Missing Data
   - GNSS data with missing position
   - GNSS data with missing time
   - GNSS data with missing DOP
   - IMU data with missing linear acceleration
   - IMU data with missing angular velocity
   - IMU data with missing orientation

2. Corrupted Data
   - GNSS data with invalid coordinates
   - GNSS data with extreme DOP values
   - GNSS data with inconsistent timestamps
   - IMU data with outliers in acceleration
   - IMU data with NaN values
   - IMU data with inconsistent timestamps

3. Format Variations
   - NMEA data with different sentence types
   - RINEX observation data with varying satellite counts
   - IMU data with different field ordering
   - IMU data with extra fields
   - IMU data with different units
   - GNSS data with different position formats (ECEF vs. LLA)

## Scientific Evaluation Metrics

The benchmark employs a comprehensive set of scientific metrics to evaluate the accuracy, robustness, and efficiency of data transformation processes. These metrics are designed to provide a rigorous, scientific framework for evaluating transformation quality rather than positioning performance.

### 1. Data Field Accuracy Metrics

#### 1.1 Numerical Field Transformation Accuracy

- **Mean Absolute Error (MAE)**: Average absolute difference between original and transformed field values
  - ```
MAE = (1/n) * Σ|Xᵢᵗʳᵃⁿˢᶠᵒʳᵐᵉᵈ - Xᵢᵒʳᶦᵍᶦⁿᵃˡ|
```
where:
- n is the number of samples
- Xᵢᵗʳᵃⁿˢᶠᵒʳᵐᵉᵈ is the transformed value
- Xᵢᵒʳᶦᵍᶦⁿᵃˡ is the original value
  - Calculated separately for each critical numerical field (coordinates, timestamps, velocities, etc.)

- **Root Mean Square Error (RMSE)**: Square root of the average squared difference
  - Formula: RMSE = √[(1/n) * Σ(x_transformed - x_original)²]

- **Normalized RMSE**: RMSE normalized by the range of the original values
  - Formula: NRMSE = RMSE / (max(x_original) - min(x_original))

#### 1.2 Coordinate Transformation Accuracy

- **Coordinate Conversion Error**: Error in converting between coordinate systems (e.g., ECEF to LLA)
- **Datum Transformation Error**: Error when transforming between different geodetic datums
- **Projection Error**: Error when applying map projections

#### 1.3 Temporal Transformation Accuracy

- **Timestamp Conversion Error**: Error in converting between time formats/references (microseconds)
- **Temporal Alignment Error**: Error in aligning data from different sensors (microseconds)
- **Sampling Rate Preservation**: Accuracy in preserving original sampling rates

#### 1.4 Structural Transformation Accuracy

- **Schema Compliance Score**: Percentage of transformed data fields that comply with the target schema
- **Field Mapping Accuracy**: Percentage of fields correctly mapped from source to target format

### 2. Information Preservation Metrics

- **Information Entropy Ratio**: Ratio of information entropy in transformed vs. original data
- **Signal-to-Noise Ratio (SNR)**: Ratio of signal power to noise power after transformation
- **Dynamic Range Preservation**: How well the dynamic range of values is preserved
- **Round-Trip Error**: Error when converting data to standardized format and back

### 3. Robustness Metrics

#### 3.1 Input Variation Robustness

- **Format Variation Robustness**: Consistency of transformation across different input formats
- **Vendor Variation Robustness**: Consistency across data from different sensor manufacturers
- **Configuration Variation Robustness**: Consistency across different sensor configurations

#### 3.2 Data Quality Robustness

- **Missing Data Handling**: Transformation quality with varying percentages of missing data
- **Outlier Handling**: Transformation quality with varying percentages of outliers
- **Noise Handling**: Transformation quality with varying levels of noise

#### 3.3 Edge Case Handling

- **Boundary Value Handling**: Accuracy at extreme values (min/max of expected ranges)
- **Special Value Handling**: Correct handling of special values (NaN, infinity, null)
- **Discontinuity Handling**: Accuracy around discontinuities in data

### 4. Efficiency Metrics

- **Transformation Time**: Time required to transform data (seconds or milliseconds per data point)
- **CPU Usage**: Average and peak CPU utilization during transformation (percentage)
- **Memory Usage**: Average and peak memory consumption (MB)
- **Size Ratio**: Ratio of transformed data size to original data size

### 5. FGO Readiness Metrics

- **Factor Completeness**: Percentage of required FGO factors that can be directly derived from transformed data
- **Constraint Quality**: Quality of constraints derivable from transformed data
- **Uncertainty Representation**: Accuracy of covariance matrices and uncertainty propagation

### 6. Visualization and Reporting

- **Field-by-Field Comparison**: Visual comparison of original vs. transformed values for key fields
- **Error Distribution Plots**: Histograms and CDFs of various error metrics
- **Summary Statistics**: Mean, median, standard deviation, min, max for all metrics

## Usage Instructions

### Evaluating an AI Agent

1. Use the test cases in `test_cases/` to evaluate your AI agent

2. For each test case:
   - Input: Raw data files in the test case directory
   - Expected output: Standardized data following the schema in `metadata/schema_documentation.json`

3. Run the evaluation tools:

```bash
python evaluation/metrics.py --ground-truth benchmark_dataset/standardized/ --converted your_output_dir/
python evaluation/benchmark.py --input-dir test_cases/normal/case1/ --output-dir your_output_dir/
```

4. Analyze the results:
   - Conversion accuracy metrics
   - Conversion speed metrics
   - Robustness metrics

## References

1. Hsu, L-T., Huang, F., Ng, H-F., Zhang, G., Zhong, Y., Bai, X., & Wen, W. (2023). Hong Kong UrbanNav: An open-source multisensory dataset for benchmarking urban navigation algorithms. NAVIGATION, 70(4).
2. Hsu, Li-Ta, et al. "UrbanNav: An Open-Sourced Multisensory Dataset for Benchmarking Positioning Algorithms Designed for Urban Areas." Proceedings of the 34th International Technical Meeting of the Satellite Division of The Institute of Navigation (ION GNSS+ 2021).
3. Takasu, T., & Yasuda, A. (2009). Development of the low-cost RTK-GPS receiver with an open source program package RTKLIB. International Symposium on GPS/GNSS, 4-6.
4. Zhang, J., & Singh, S. (2017). Low-drift and real-time lidar odometry and mapping. Autonomous Robots, 41(2), 401-416.
5. Shan, T., Englot, B., Meyers, D., Wang, W., Ratti, C., & Rus, D. (2020). LIO-SAM: Tightly-coupled lidar inertial odometry via smoothing and mapping. IEEE/RSJ International Conference on Intelligent Robots and Systems (IROS), 5135-5142.
