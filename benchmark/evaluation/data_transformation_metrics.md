# Scientific Evaluation Metrics for Navigation Data Transformation

This document defines comprehensive scientific evaluation metrics for the FusionFly benchmark, focusing specifically on evaluating the accuracy of data transformation from raw GNSS and IMU data into standardized formats ready for Factor Graph Optimization (FGO). These metrics are designed to provide a rigorous, scientific framework for evaluating transformation quality rather than positioning performance.

## 1. Data Field Accuracy Metrics

### 1.1 Numerical Field Transformation Accuracy

#### 1.1.1 Field-Specific Error Metrics
- **Mean Absolute Error (MAE)**: Average absolute difference between original and transformed field values
  - Formula: MAE = (1/n) * Σ|x_transformed - x_original|
  - Calculated separately for each critical numerical field (coordinates, timestamps, velocities, etc.)
- **Root Mean Square Error (RMSE)**: Square root of the average squared difference
  - Formula: RMSE = √[(1/n) * Σ(x_transformed - x_original)²]
- **Normalized RMSE**: RMSE normalized by the range of the original values
  - Formula: NRMSE = RMSE / (max(x_original) - min(x_original))
  - Useful for comparing errors across different types of measurements

#### 1.1.2 Coordinate Transformation Accuracy
- **Coordinate Conversion Error**: Error in converting between coordinate systems (e.g., ECEF to LLA)
  - Measured in appropriate units (meters, degrees, etc.)
- **Datum Transformation Error**: Error when transforming between different geodetic datums
- **Projection Error**: Error when applying map projections

#### 1.1.3 Unit Conversion Accuracy
- **Unit Conversion Error**: Error introduced during unit conversions
  - E.g., degrees to radians, m/s to km/h, etc.
- **Scaling Error**: Error in applying scaling factors

### 1.2 Temporal Transformation Accuracy

- **Timestamp Conversion Error**: Error in converting between time formats/references
  - Units: microseconds
- **Temporal Alignment Error**: Error in aligning data from different sensors
  - Units: microseconds
- **Sampling Rate Preservation**: Accuracy in preserving original sampling rates
  - Formula: |rate_transformed - rate_original| / rate_original

### 1.3 Structural Transformation Accuracy

- **Schema Compliance Score**: Percentage of transformed data fields that comply with the target schema
- **Field Mapping Accuracy**: Percentage of fields correctly mapped from source to target format
- **Hierarchical Structure Preservation**: Accuracy in preserving hierarchical relationships in data

## 2. Information Preservation Metrics

### 2.1 Information Content Metrics

- **Information Entropy Ratio**: Ratio of information entropy in transformed vs. original data
  - Formula: H(transformed) / H(original)
  - Values close to 1.0 indicate good information preservation
- **Mutual Information**: Measures shared information between original and transformed datasets
- **Kullback-Leibler Divergence**: Measures how transformed distribution diverges from original

### 2.2 Signal Fidelity Metrics

- **Signal-to-Noise Ratio (SNR)**: Ratio of signal power to noise power after transformation
  - Compared to original SNR
- **Frequency Response Preservation**: For IMU data, how well frequency components are preserved
  - Measured using spectral analysis
- **Dynamic Range Preservation**: How well the dynamic range of values is preserved
  - Formula: (max-min)_transformed / (max-min)_original

### 2.3 Reconstruction Metrics

- **Round-Trip Error**: Error when converting data to standardized format and back
  - Formula: |original - reconstructed|
- **Lossy Compression Metrics**: For transformations that intentionally reduce data size
  - Compression ratio vs. information loss trade-off

## 3. Robustness Metrics

### 3.1 Input Variation Robustness

- **Format Variation Robustness**: Consistency of transformation across different input formats
  - E.g., NMEA vs. RINEX for GNSS, different CSV formats for IMU
- **Vendor Variation Robustness**: Consistency across data from different sensor manufacturers
- **Configuration Variation Robustness**: Consistency across different sensor configurations

### 3.2 Data Quality Robustness

- **Missing Data Handling**: Transformation quality with varying percentages of missing data
  - Measured at: 5%, 10%, 20%, 30% missing data
- **Outlier Handling**: Transformation quality with varying percentages of outliers
  - Measured at: 5%, 10%, 20% outlier contamination
- **Noise Handling**: Transformation quality with varying levels of noise
  - Measured at: Low, medium, high noise levels

### 3.3 Edge Case Handling

- **Boundary Value Handling**: Accuracy at extreme values (min/max of expected ranges)
- **Special Value Handling**: Correct handling of special values (NaN, infinity, null)
- **Discontinuity Handling**: Accuracy around discontinuities in data

## 4. Efficiency Metrics

### 4.1 Computational Efficiency

- **Transformation Time**: Time required to transform data
  - Units: seconds or milliseconds per data point
- **CPU Usage**: Average and peak CPU utilization during transformation
  - Units: percentage
- **Memory Usage**: Average and peak memory consumption
  - Units: MB

### 4.2 Storage Efficiency

- **Size Ratio**: Ratio of transformed data size to original data size
  - Formula: Size_transformed / Size_original
- **Compression Efficiency**: For compressed formats, compression ratio vs. transformation accuracy
- **Storage Format Efficiency**: Efficiency of the chosen storage format (binary vs. text, etc.)

## 5. FGO Readiness Metrics

### 5.1 Factor Graph Compatibility

- **Factor Completeness**: Percentage of required FGO factors that can be directly derived from transformed data
- **Constraint Quality**: Quality of constraints derivable from transformed data
  - Measured by uncertainty representation accuracy
- **Graph Structure Preservation**: How well the transformed data preserves the structure needed for FGO

### 5.2 Uncertainty Representation

- **Covariance Matrix Accuracy**: Accuracy of covariance matrices in transformed data
  - Compared to original uncertainty information
- **Uncertainty Propagation**: Correctness of uncertainty propagation through transformations
- **Correlation Preservation**: How well correlations between variables are preserved

## 6. Standardization Quality Metrics

### 6.1 Schema Compliance

- **Field Compliance Rate**: Percentage of fields that comply with the standardized schema
- **Validation Success Rate**: Percentage of transformed data files that pass schema validation
- **Semantic Correctness**: Correctness of semantic meaning preservation during transformation

### 6.2 Interoperability

- **Cross-Platform Compatibility**: Number of platforms/systems that can correctly interpret the transformed data
- **Tool Compatibility**: Compatibility with common data processing tools
- **Version Compatibility**: Forward and backward compatibility with different schema versions

## 7. Visualization and Reporting

### 7.1 Standard Visualizations

- **Field-by-Field Comparison**: Visual comparison of original vs. transformed values for key fields
- **Error Distribution Plots**: Histograms and CDFs of various error metrics
- **Transformation Quality Heat Maps**: Visual representation of transformation quality across data ranges

### 7.2 Comprehensive Reporting

- **Summary Statistics**: Mean, median, standard deviation, min, max for all metrics
- **Format-Specific Reports**: Separate reporting for different input formats
- **Comparative Analysis**: Standardized comparison with previous benchmark results

## References

1. Hsu, L-T., Huang, F., Ng, H-F., Zhang, G., Zhong, Y., Bai, X., & Wen, W. (2023). Hong Kong UrbanNav: An open-source multisensory dataset for benchmarking urban navigation algorithms. NAVIGATION, 70(4).
2. Hsu, Li-Ta, et al. "UrbanNav: An Open-Sourced Multisensory Dataset for Benchmarking Positioning Algorithms Designed for Urban Areas." Proceedings of the 34th International Technical Meeting of the Satellite Division of The Institute of Navigation (ION GNSS+ 2021).
3. Takasu, T., & Yasuda, A. (2009). Development of the low-cost RTK-GPS receiver with an open source program package RTKLIB. International Symposium on GPS/GNSS, 4-6.
4. Zhang, J., & Singh, S. (2017). Low-drift and real-time lidar odometry and mapping. Autonomous Robots, 41(2), 401-416.
5. Shan, T., Englot, B., Meyers, D., Wang, W., Ratti, C., & Rus, D. (2020). LIO-SAM: Tightly-coupled lidar inertial odometry via smoothing and mapping. IEEE/RSJ International Conference on Intelligent Robots and Systems (IROS), 5135-5142.
