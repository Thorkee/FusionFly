#!/usr/bin/env python3
"""
Scientific metrics for evaluating data transformation accuracy of navigation data standardization.
Based on the UrbanNav dataset from PolyU.
"""

import os
import json
import time
import argparse
import numpy as np
from datetime import datetime
from scipy.stats import entropy
import matplotlib.pyplot as plt
import pandas as pd
from sklearn.metrics import mutual_info_score
import scipy.signal as signal

class DataTransformationEvaluator:
    """
    Evaluator for data transformation accuracy, robustness, and efficiency
    """
    
    def __init__(self, ground_truth_dir, converted_dir):
        """
        Initialize the evaluator
        
        Args:
            ground_truth_dir: Directory containing ground truth standardized data
            converted_dir: Directory containing converted data to evaluate
        """
        self.ground_truth_dir = ground_truth_dir
        self.converted_dir = converted_dir
        self.results = {
            "data_field_accuracy": {},
            "information_preservation": {},
            "robustness": {},
            "efficiency": {},
            "fgo_readiness": {},
            "summary": {}
        }
        
    def evaluate_all(self):
        """
        Run all evaluation metrics
        
        Returns:
            Dictionary with all evaluation results
        """
        self.evaluate_data_field_accuracy()
        self.evaluate_information_preservation()
        self.evaluate_robustness()
        self.evaluate_efficiency()
        self.evaluate_fgo_readiness()
        self.generate_summary()
        return self.results
    
    def evaluate_data_field_accuracy(self):
        """
        Evaluate data field accuracy metrics
        """
        # Numerical field accuracy
        self.results["data_field_accuracy"]["numerical"] = self._evaluate_numerical_field_accuracy()
        
        # Coordinate transformation accuracy
        self.results["data_field_accuracy"]["coordinate"] = self._evaluate_coordinate_transformation_accuracy()
        
        # Temporal transformation accuracy
        self.results["data_field_accuracy"]["temporal"] = self._evaluate_temporal_transformation_accuracy()
        
        # Structural transformation accuracy
        self.results["data_field_accuracy"]["structural"] = self._evaluate_structural_transformation_accuracy()
    
    def _evaluate_numerical_field_accuracy(self):
        """
        Evaluate numerical field transformation accuracy
        
        Returns:
            Dictionary with numerical field accuracy metrics
        """
        results = {
            "gnss": {},
            "imu": {}
        }
        
        # Process GNSS files
        for filename in os.listdir(self.ground_truth_dir):
            if filename.endswith('.json') and "gnss" in filename.lower():
                gt_file = os.path.join(self.ground_truth_dir, filename)
                conv_file = os.path.join(self.converted_dir, filename)
                
                if os.path.exists(conv_file):
                    with open(gt_file, 'r') as f:
                        ground_truth = json.load(f)
                    with open(conv_file, 'r') as f:
                        converted = json.load(f)
                    
                    # Calculate field-specific errors
                    results["gnss"][filename] = self._calculate_field_errors(
                        ground_truth.get("gnss_data", []),
                        converted.get("gnss_data", []),
                        ["position_lla.latitude_deg", "position_lla.longitude_deg", "position_lla.altitude_m", 
                         "velocity.x", "velocity.y", "velocity.z", "dop.hdop", "dop.vdop", "dop.pdop"]
                    )
        
        # Process IMU files
        for filename in os.listdir(self.ground_truth_dir):
            if filename.endswith('.json') and "imu" in filename.lower():
                gt_file = os.path.join(self.ground_truth_dir, filename)
                conv_file = os.path.join(self.converted_dir, filename)
                
                if os.path.exists(conv_file):
                    with open(gt_file, 'r') as f:
                        ground_truth = json.load(f)
                    with open(conv_file, 'r') as f:
                        converted = json.load(f)
                    
                    # Calculate field-specific errors
                    results["imu"][filename] = self._calculate_field_errors(
                        ground_truth.get("imu_data", []),
                        converted.get("imu_data", []),
                        ["linear_acceleration.x", "linear_acceleration.y", "linear_acceleration.z",
                         "angular_velocity.x", "angular_velocity.y", "angular_velocity.z",
                         "orientation.w", "orientation.x", "orientation.y", "orientation.z"]
                    )
        
        return results
    
    def _calculate_field_errors(self, ground_truth_data, converted_data, fields):
        """
        Calculate errors for specific fields
        
        Args:
            ground_truth_data: List of ground truth data entries
            converted_data: List of converted data entries
            fields: List of fields to evaluate (using dot notation for nested fields)
            
        Returns:
            Dictionary with error metrics for each field
        """
        results = {}
        
        for field in fields:
            errors = []
            
            # Match entries by timestamp
            for gt_entry in ground_truth_data:
                gt_time = gt_entry.get("time_unix")
                
                # Find closest timestamp in converted data
                closest_entry = None
                min_time_diff = float('inf')
                
                for conv_entry in converted_data:
                    conv_time = conv_entry.get("time_unix")
                    if conv_time is not None and gt_time is not None:
                        time_diff = abs(gt_time - conv_time)
                        if time_diff < min_time_diff:
                            min_time_diff = time_diff
                            closest_entry = conv_entry
                
                # If matching entry found and time difference is small enough
                if closest_entry is not None and min_time_diff < 0.1:  # Within 0.1 seconds
                    # Get field value using dot notation
                    gt_value = self._get_nested_field(gt_entry, field)
                    conv_value = self._get_nested_field(closest_entry, field)
                    
                    if gt_value is not None and conv_value is not None:
                        # Calculate error
                        error = abs(gt_value - conv_value)
                        errors.append(error)
            
            if errors:
                # Calculate error metrics
                mae = np.mean(errors)
                rmse = np.sqrt(np.mean(np.array(errors) ** 2))
                
                # Calculate normalized RMSE if possible
                gt_values = [self._get_nested_field(entry, field) for entry in ground_truth_data]
                gt_values = [v for v in gt_values if v is not None]
                
                if gt_values:
                    gt_range = max(gt_values) - min(gt_values)
                    if gt_range > 0:
                        nrmse = rmse / gt_range
                    else:
                        nrmse = None
                else:
                    nrmse = None
                
                results[field] = {
                    "mae": mae,
                    "rmse": rmse,
                    "nrmse": nrmse,
                    "max_error": np.max(errors),
                    "min_error": np.min(errors),
                    "std_error": np.std(errors),
                    "num_matched_points": len(errors),
                    "matched_percentage": len(errors) / len(ground_truth_data) * 100
                }
            else:
                results[field] = {
                    "mae": None,
                    "rmse": None,
                    "nrmse": None,
                    "max_error": None,
                    "min_error": None,
                    "std_error": None,
                    "num_matched_points": 0,
                    "matched_percentage": 0
                }
        
        return results
    
    def _get_nested_field(self, data, field_path):
        """
        Get value of a nested field using dot notation
        
        Args:
            data: Dictionary containing the data
            field_path: Path to the field using dot notation (e.g., "position_lla.latitude_deg")
            
        Returns:
            Field value or None if not found
        """
        fields = field_path.split('.')
        value = data
        
        for field in fields:
            if isinstance(value, dict) and field in value:
                value = value[field]
            else:
                return None
        
        return value if isinstance(value, (int, float)) else None
    
    def _evaluate_coordinate_transformation_accuracy(self):
        """
        Evaluate coordinate transformation accuracy
        
        Returns:
            Dictionary with coordinate transformation accuracy metrics
        """
        results = {
            "coordinate_conversion_error": {},
            "datum_transformation_error": {},
            "projection_error": {}
        }
        
        # Process GNSS files
        for filename in os.listdir(self.ground_truth_dir):
            if filename.endswith('.json') and "gnss" in filename.lower():
                gt_file = os.path.join(self.ground_truth_dir, filename)
                conv_file = os.path.join(self.converted_dir, filename)
                
                if os.path.exists(conv_file):
                    with open(gt_file, 'r') as f:
                        ground_truth = json.load(f)
                    with open(conv_file, 'r') as f:
                        converted = json.load(f)
                    
                    # Check if both LLA and ECEF coordinates are available
                    has_both_coords = False
                    for gt_entry in ground_truth.get("gnss_data", []):
                        if "position_lla" in gt_entry and "position_ecef" in gt_entry:
                            has_both_coords = True
                            break
                    
                    if has_both_coords:
                        # Calculate coordinate conversion error (LLA to ECEF)
                        lla_to_ecef_errors = []
                        
                        for gt_entry in ground_truth.get("gnss_data", []):
                            gt_time = gt_entry.get("time_unix")
                            
                            # Find closest timestamp in converted data
                            closest_entry = None
                            min_time_diff = float('inf')
                            
                            for conv_entry in converted.get("gnss_data", []):
                                conv_time = conv_entry.get("time_unix")
                                if conv_time is not None and gt_time is not None:
                                    time_diff = abs(gt_time - conv_time)
                                    if time_diff < min_time_diff:
                                        min_time_diff = time_diff
                                        closest_entry = conv_entry
                            
                            # If matching entry found and time difference is small enough
                            if closest_entry is not None and min_time_diff < 0.1:  # Within 0.1 seconds
                                gt_lla = gt_entry.get("position_lla")
                                gt_ecef = gt_entry.get("position_ecef")
                                conv_lla = closest_entry.get("position_lla")
                                conv_ecef = closest_entry.get("position_ecef")
                                
                                if gt_lla and gt_ecef and conv_lla and conv_ecef:
                                    # Calculate expected ECEF from converted LLA
                                    expected_ecef = self._lla_to_ecef(
                                        conv_lla.get("latitude_deg"),
                                        conv_lla.get("longitude_deg"),
                                        conv_lla.get("altitude_m")
                                    )
                                    
                                    # Calculate error between expected and actual ECEF
                                    if expected_ecef and "x" in conv_ecef and "y" in conv_ecef and "z" in conv_ecef:
                                        error = np.sqrt(
                                            (expected_ecef[0] - conv_ecef.get("x"))**2 +
                                            (expected_ecef[1] - conv_ecef.get("y"))**2 +
                                            (expected_ecef[2] - conv_ecef.get("z"))**2
                                        )
                                        lla_to_ecef_errors.append(error)
                        
                        if lla_to_ecef_errors:
                            results["coordinate_conversion_error"][filename] = {
                                "mean_error_m": np.mean(lla_to_ecef_errors),
                                "max_error_m": np.max(lla_to_ecef_errors),
                                "min_error_m": np.min(lla_to_ecef_errors),
                                "std_error_m": np.std(lla_to_ecef_errors)
                            }
        
        return results
    
    def _lla_to_ecef(self, lat, lon, alt):
        """
        Convert LLA coordinates to ECEF
        
        Args:
            lat: Latitude in degrees
            lon: Longitude in degrees
            alt: Altitude in meters
            
        Returns:
            Tuple (x, y, z) in ECEF coordinates
        """
        if lat is None or lon is None or alt is None:
            return None
        
        # WGS84 parameters
        a = 6378137.0  # semi-major axis
        f = 1/298.257223563  # flattening
        e_sq = 2*f - f**2  # eccentricity squared
        
        # Convert to radians
        lat_rad = np.radians(lat)
        lon_rad = np.radians(lon)
        
        # Calculate N (radius of curvature in the prime vertical)
        N = a / np.sqrt(1 - e_sq * np.sin(lat_rad)**2)
        
        # Calculate ECEF coordinates
        x = (N + alt) * np.cos(lat_rad) * np.cos(lon_rad)
        y = (N + alt) * np.cos(lat_rad) * np.sin(lon_rad)
        z = (N * (1 - e_sq) + alt) * np.sin(lat_rad)
        
        return (x, y, z)
    
    def _evaluate_temporal_transformation_accuracy(self):
        """
        Evaluate temporal transformation accuracy
        
        Returns:
            Dictionary with temporal transformation accuracy metrics
        """
        results = {
            "timestamp_conversion_error": {},
            "temporal_alignment_error": {},
            "sampling_rate_preservation": {}
        }
        
        # Process all data files
        for filename in os.listdir(self.ground_truth_dir):
            if filename.endswith('.json'):
                gt_file = os.path.join(self.ground_truth_dir, filename)
                conv_file = os.path.join(self.converted_dir, filename)
                
                if os.path.exists(conv_file):
                    with open(gt_file, 'r') as f:
                        ground_truth = json.load(f)
                    with open(conv_file, 'r') as f:
                        converted = json.load(f)
                    
                    # Determine data type (GNSS or IMU)
                    if "gnss" in filename.lower():
                        data_type = "gnss_data"
                    elif "imu" in filename.lower():
                        data_type = "imu_data"
                    else:
                        continue
                    
                    # Extract timestamps
                    gt_timestamps = [entry.get("time_unix") for entry in ground_truth.get(data_type, [])]
                    gt_timestamps = [t for t in gt_timestamps if t is not None]
                    
                    conv_timestamps = [entry.get("time_unix") for entry in converted.get(data_type, [])]
                    conv_timestamps = [t for t in conv_timestamps if t is not None]
                    
                    if gt_timestamps and conv_timestamps:
                        # Calculate timestamp conversion error
                        timestamp_errors = []
                        
                        for gt_time in gt_timestamps:
                            # Find closest timestamp in converted data
                            closest_time = min(conv_timestamps, key=lambda t: abs(t - gt_time))
                            error = abs(gt_time - closest_time) * 1e6  # Convert to microseconds
                            timestamp_errors.append(error)
                        
                        # Calculate sampling rate
                        if len(gt_timestamps) > 1:
                            gt_intervals = np.diff(gt_timestamps)
                            gt_sampling_rate = 1 / np.mean(gt_intervals)
                        else:
                            gt_sampling_rate = None
                        
                        if len(conv_timestamps) > 1:
                            conv_intervals = np.diff(conv_timestamps)
                            conv_sampling_rate = 1 / np.mean(conv_intervals)
                        else:
                            conv_sampling_rate = None
                        
                        # Calculate sampling rate preservation error
                        if gt_sampling_rate is not None and conv_sampling_rate is not None:
                            sampling_rate_error = abs(gt_sampling_rate - conv_sampling_rate) / gt_sampling_rate
                        else:
                            sampling_rate_error = None
                        
                        results["timestamp_conversion_error"][filename] = {
                            "mean_error_us": np.mean(timestamp_errors),
                            "max_error_us": np.max(timestamp_errors),
                            "min_error_us": np.min(timestamp_errors),
                            "std_error_us": np.std(timestamp_errors)
                        }
                        
                        results["sampling_rate_preservation"][filename] = {
                            "ground_truth_rate_hz": gt_sampling_rate,
                            "converted_rate_hz": conv_sampling_rate,
                            "relative_error": sampling_rate_error
                        }
        
        # Calculate temporal alignment error between GNSS and IMU
        gnss_files = [f for f in os.listdir(self.ground_truth_dir) if f.endswith('.json') and "gnss" in f.lower()]
        imu_files = [f for f in os.listdir(self.ground_truth_dir) if f.endswith('.json') and "imu" in f.lower()]
        
        if gnss_files and imu_files:
            # Use first files of each type
            gt_gnss_file = os.path.join(self.ground_truth_dir, gnss_files[0])
            gt_imu_file = os.path.join(self.ground_truth_dir, imu_files[0])
            conv_gnss_file = os.path.join(self.converted_dir, gnss_files[0])
            conv_imu_file = os.path.join(self.converted_dir, imu_files[0])
            
            if os.path.exists(gt_gnss_file) and os.path.exists(gt_imu_file) and \
               os.path.exists(conv_gnss_file) and os.path.exists(conv_imu_file):
                # Load data
                with open(gt_gnss_file, 'r') as f:
                    gt_gnss = json.load(f)
                with open(gt_imu_file, 'r') as f:
                    gt_imu = json.load(f)
                with open(conv_gnss_file, 'r') as f:
                    conv_gnss = json.load(f)
                with open(conv_imu_file, 'r') as f:
                    conv_imu = json.load(f)
                
                # Extract timestamps
                gt_gnss_timestamps = [entry.get("time_unix") for entry in gt_gnss.get("gnss_data", [])]
                gt_gnss_timestamps = [t for t in gt_gnss_timestamps if t is not None]
                
                gt_imu_timestamps = [entry.get("time_unix") for entry in gt_imu.get("imu_data", [])]
                gt_imu_timestamps = [t for t in gt_imu_timestamps if t is not None]
                
                conv_gnss_timestamps = [entry.get("time_unix") for entry in conv_gnss.get("gnss_data", [])]
                conv_gnss_timestamps = [t for t in conv_gnss_timestamps if t is not None]
                
                conv_imu_timestamps = [entry.get("time_unix") for entry in conv_imu.get("imu_data", [])]
                conv_imu_timestamps = [t for t in conv_imu_timestamps if t is not None]
                
                if gt_gnss_timestamps and gt_imu_timestamps and conv_gnss_timestamps and conv_imu_timestamps:
                    # Calculate alignment errors
                    gt_alignment_errors = []
                    conv_alignment_errors = []
                    
                    # For ground truth data
                    for gt_gnss_time in gt_gnss_timestamps:
                        closest_imu_time = min(gt_imu_timestamps, key=lambda t: abs(t - gt_gnss_time))
                        error = abs(gt_gnss_time - closest_imu_time) * 1e6  # Convert to microseconds
                        gt_alignment_errors.append(error)
                    
                    # For converted data
                    for conv_gnss_time in conv_gnss_timestamps:
                        closest_imu_time = min(conv_imu_timestamps, key=lambda t: abs(t - conv_gnss_time))
                        error = abs(conv_gnss_time - closest_imu_time) * 1e6  # Convert to microseconds
                        conv_alignment_errors.append(error)
                    
                    # Calculate alignment error difference
                    alignment_error_diff = abs(np.mean(gt_alignment_errors) - np.mean(conv_alignment_errors))
                    
                    results["temporal_alignment_error"]["gnss_imu"] = {
                        "ground_truth_mean_error_us": np.mean(gt_alignment_errors),
                        "converted_mean_error_us": np.mean(conv_alignment_errors),
                        "alignment_error_difference_us": alignment_error_diff
                    }
        
        return results
    
    def _evaluate_structural_transformation_accuracy(self):
        """
        Evaluate structural transformation accuracy
        
        Returns:
            Dictionary with structural transformation accuracy metrics
        """
        results = {
            "schema_compliance_score": {},
            "field_mapping_accuracy": {}
        }
        
        # Load schema documentation if available
        schema_doc_path = os.path.join(os.path.dirname(self.ground_truth_dir), "metadata", "schema_documentation.json")
        if os.path.exists(schema_doc_path):
            with open(schema_doc_path, 'r') as f:
                schema = json.load(f)
        else:
            # If schema documentation not available, infer schema from ground truth data
            schema = self._infer_schema_from_data()
        
        # Process all data files
        for filename in os.listdir(self.ground_truth_dir):
            if filename.endswith('.json'):
                gt_file = os.path.join(self.ground_truth_dir, filename)
                conv_file = os.path.join(self.converted_dir, filename)
                
                if os.path.exists(conv_file):
                    with open(gt_file, 'r') as f:
                        ground_truth = json.load(f)
                    with open(conv_file, 'r') as f:
                        converted = json.load(f)
                    
                    # Determine data type (GNSS or IMU)
                    if "gnss" in filename.lower():
                        data_type = "gnss_data"
                        schema_type = "gnss"
                    elif "imu" in filename.lower():
                        data_type = "imu_data"
                        schema_type = "imu"
                    else:
                        continue
                    
                    # Calculate schema compliance score
                    if schema and schema_type in schema:
                        required_fields = self._get_required_fields(schema, schema_type)
                        
                        if required_fields:
                            # Check each entry in converted data
                            total_fields = 0
                            compliant_fields = 0
                            
                            for entry in converted.get(data_type, []):
                                for field in required_fields:
                                    total_fields += 1
                                    if self._get_nested_field(entry, field) is not None:
                                        compliant_fields += 1
                            
                            if total_fields > 0:
                                compliance_score = compliant_fields / total_fields * 100
                            else:
                                compliance_score = 0
                            
                            results["schema_compliance_score"][filename] = {
                                "compliance_score": compliance_score,
                                "compliant_fields": compliant_fields,
                                "total_fields": total_fields
                            }
                    
                    # Calculate field mapping accuracy
                    mapped_fields = 0
                    total_fields = 0
                    
                    # Get all fields in ground truth data
                    gt_fields = set()
                    for entry in ground_truth.get(data_type, []):
                        self._collect_fields(entry, "", gt_fields)
                    
                    # Check if fields are correctly mapped in converted data
                    for field in gt_fields:
                        total_fields += 1
                        
                        # Check if field exists in converted data
                        field_exists = False
                        for entry in converted.get(data_type, []):
                            if self._get_nested_field(entry, field) is not None:
                                field_exists = True
                                break
                        
                        if field_exists:
                            mapped_fields += 1
                    
                    if total_fields > 0:
                        mapping_accuracy = mapped_fields / total_fields * 100
                    else:
                        mapping_accuracy = 0
                    
                    results["field_mapping_accuracy"][filename] = {
                        "mapping_accuracy": mapping_accuracy,
                        "mapped_fields": mapped_fields,
                        "total_fields": total_fields
                    }
        
        return results
    
    def _infer_schema_from_data(self):
        """
        Infer schema from ground truth data
        
        Returns:
            Dictionary with inferred schema
        """
        schema = {
            "gnss": {"required_fields": []},
            "imu": {"required_fields": []}
        }
        
        # Process GNSS files
        gnss_fields = set()
        for filename in os.listdir(self.ground_truth_dir):
            if filename.endswith('.json') and "gnss" in filename.lower():
                with open(os.path.join(self.ground_truth_dir, filename), 'r') as f:
                    data = json.load(f)
                
                for entry in data.get("gnss_data", []):
                    self._collect_fields(entry, "", gnss_fields)
        
        # Process IMU files
        imu_fields = set()
        for filename in os.listdir(self.ground_truth_dir):
            if filename.endswith('.json') and "imu" in filename.lower():
                with open(os.path.join(self.ground_truth_dir, filename), 'r') as f:
                    data = json.load(f)
                
                for entry in data.get("imu_data", []):
                    self._collect_fields(entry, "", imu_fields)
        
        schema["gnss"]["required_fields"] = list(gnss_fields)
        schema["imu"]["required_fields"] = list(imu_fields)
        
        return schema
    
    def _collect_fields(self, data, prefix, fields):
        """
        Recursively collect all fields in a data structure
        
        Args:
            data: Dictionary containing the data
            prefix: Prefix for field names
            fields: Set to collect field names
        """
        if isinstance(data, dict):
            for key, value in data.items():
                field_name = f"{prefix}.{key}" if prefix else key
                
                if isinstance(value, (dict, list)):
                    self._collect_fields(value, field_name, fields)
                else:
                    fields.add(field_name)
    
    def _get_required_fields(self, schema, schema_type):
        """
        Get required fields from schema
        
        Args:
            schema: Schema dictionary
            schema_type: Type of schema (gnss or imu)
            
        Returns:
            List of required fields
        """
        if schema_type in schema and "required_fields" in schema[schema_type]:
            return schema[schema_type]["required_fields"]
        return []
    
    def evaluate_information_preservation(self):
        """
        Evaluate information preservation metrics
        """
        # Information content metrics
        self.results["information_preservation"]["content"] = self._evaluate_information_content()
        
        # Signal fidelity metrics
        self.results["information_preservation"]["signal_fidelity"] = self._evaluate_signal_fidelity()
        
        # Reconstruction metrics
        self.results["information_preservation"]["reconstruction"] = self._evaluate_reconstruction_metrics()
    
    def _evaluate_information_content(self):
        """
        Evaluate information content metrics
        
        Returns:
            Dictionary with information content metrics
        """
        results = {
            "entropy_ratio": {},
            "mutual_information": {}
        }
        
        # Process all data files
        for filename in os.listdir(self.ground_truth_dir):
            if filename.endswith('.json'):
                gt_file = os.path.join(self.ground_truth_dir, filename)
                conv_file = os.path.join(self.converted_dir, filename)
                
                if os.path.exists(conv_file):
                    with open(gt_file, 'r') as f:
                        ground_truth = json.load(f)
                    with open(conv_file, 'r') as f:
                        converted = json.load(f)
                    
                    # Determine data type (GNSS or IMU)
                    if "gnss" in filename.lower():
                        data_type = "gnss_data"
                    elif "imu" in filename.lower():
                        data_type = "imu_data"
                    else:
                        continue
                    
                    # Calculate entropy for each numerical field
                    field_entropy_ratios = {}
                    field_mutual_info = {}
                    
                    # Get all numerical fields in ground truth data
                    gt_fields = {}
                    for entry in ground_truth.get(data_type, []):
                        for field in self._get_numerical_fields(entry):
                            if field not in gt_fields:
                                gt_fields[field] = []
                            
                            value = self._get_nested_field(entry, field)
                            if value is not None:
                                gt_fields[field].append(value)
                    
                    # Get corresponding fields in converted data
                    conv_fields = {}
                    for entry in converted.get(data_type, []):
                        for field in gt_fields.keys():
                            if field not in conv_fields:
                                conv_fields[field] = []
                            
                            value = self._get_nested_field(entry, field)
                            if value is not None:
                                conv_fields[field].append(value)
                    
                    # Calculate entropy ratio and mutual information for each field
                    for field in gt_fields.keys():
                        if field in conv_fields and len(gt_fields[field]) > 0 and len(conv_fields[field]) > 0:
                            # Calculate entropy
                            gt_entropy = self._calculate_entropy(gt_fields[field])
                            conv_entropy = self._calculate_entropy(conv_fields[field])
                            
                            if gt_entropy > 0:
                                entropy_ratio = conv_entropy / gt_entropy
                            else:
                                entropy_ratio = None
                            
                            # Calculate mutual information
                            # Need to align data points first
                            aligned_gt = []
                            aligned_conv = []
                            
                            # Match entries by timestamp
                            for i, gt_entry in enumerate(ground_truth.get(data_type, [])):
                                if i < len(gt_fields[field]):
                                    gt_time = gt_entry.get("time_unix")
                                    
                                    # Find closest timestamp in converted data
                                    closest_idx = -1
                                    min_time_diff = float('inf')
                                    
                                    for j, conv_entry in enumerate(converted.get(data_type, [])):
                                        if j < len(conv_fields[field]):
                                            conv_time = conv_entry.get("time_unix")
                                            if conv_time is not None and gt_time is not None:
                                                time_diff = abs(gt_time - conv_time)
                                                if time_diff < min_time_diff:
                                                    min_time_diff = time_diff
                                                    closest_idx = j
                                    
                                    # If matching entry found and time difference is small enough
                                    if closest_idx >= 0 and min_time_diff < 0.1:  # Within 0.1 seconds
                                        aligned_gt.append(gt_fields[field][i])
                                        aligned_conv.append(conv_fields[field][closest_idx])
                            
                            if len(aligned_gt) > 0 and len(aligned_conv) > 0:
                                # Discretize data for mutual information calculation
                                bins = min(20, len(aligned_gt) // 5)  # Heuristic for bin count
                                if bins > 1:
                                    gt_hist, gt_edges = np.histogram(aligned_gt, bins=bins)
                                    conv_hist, conv_edges = np.histogram(aligned_conv, bins=bins)
                                    
                                    # Create joint histogram
                                    joint_hist, _, _ = np.histogram2d(
                                        aligned_gt, aligned_conv, 
                                        bins=[gt_edges, conv_edges]
                                    )
                                    
                                    # Calculate mutual information
                                    mutual_info = mutual_info_score(None, None, contingency=joint_hist)
                                else:
                                    mutual_info = None
                            else:
                                mutual_info = None
                            
                            field_entropy_ratios[field] = entropy_ratio
                            field_mutual_info[field] = mutual_info
                    
                    # Calculate average metrics across all fields
                    valid_ratios = [r for r in field_entropy_ratios.values() if r is not None]
                    valid_mi = [mi for mi in field_mutual_info.values() if mi is not None]
                    
                    if valid_ratios:
                        avg_entropy_ratio = np.mean(valid_ratios)
                    else:
                        avg_entropy_ratio = None
                    
                    if valid_mi:
                        avg_mutual_info = np.mean(valid_mi)
                    else:
                        avg_mutual_info = None
                    
                    results["entropy_ratio"][filename] = {
                        "average_entropy_ratio": avg_entropy_ratio,
                        "field_entropy_ratios": field_entropy_ratios
                    }
                    
                    results["mutual_information"][filename] = {
                        "average_mutual_information": avg_mutual_info,
                        "field_mutual_information": field_mutual_info
                    }
        
        return results
    
    def _calculate_entropy(self, values):
        """
        Calculate entropy of a list of values
        
        Args:
            values: List of numerical values
            
        Returns:
            Entropy value
        """
        if not values:
            return 0
        
        # Discretize data for entropy calculation
        bins = min(20, len(values) // 5)  # Heuristic for bin count
        if bins < 2:
            return 0
        
        hist, _ = np.histogram(values, bins=bins)
        hist = hist / np.sum(hist)  # Normalize
        
        # Calculate entropy
        return entropy(hist)
    
    def _get_numerical_fields(self, data, prefix=""):
        """
        Get all numerical fields in a data structure
        
        Args:
            data: Dictionary containing the data
            prefix: Prefix for field names
            
        Returns:
            List of numerical field names
        """
        fields = []
        
        if isinstance(data, dict):
            for key, value in data.items():
                field_name = f"{prefix}.{key}" if prefix else key
                
                if isinstance(value, dict):
                    fields.extend(self._get_numerical_fields(value, field_name))
                elif isinstance(value, (int, float)):
                    fields.append(field_name)
        
        return fields
    
    def _evaluate_signal_fidelity(self):
        """
        Evaluate signal fidelity metrics
        
        Returns:
            Dictionary with signal fidelity metrics
        """
        results = {
            "snr": {},
            "frequency_response": {},
            "dynamic_range": {}
        }
        
        # Process all data files
        for filename in os.listdir(self.ground_truth_dir):
            if filename.endswith('.json'):
                gt_file = os.path.join(self.ground_truth_dir, filename)
                conv_file = os.path.join(self.converted_dir, filename)
                
                if os.path.exists(conv_file):
                    with open(gt_file, 'r') as f:
                        ground_truth = json.load(f)
                    with open(conv_file, 'r') as f:
                        converted = json.load(f)
                    
                    # Determine data type (GNSS or IMU)
                    if "gnss" in filename.lower():
                        data_type = "gnss_data"
                    elif "imu" in filename.lower():
                        data_type = "imu_data"
                    else:
                        continue
                    
                    # Get all numerical fields in ground truth data
                    gt_fields = {}
                    for entry in ground_truth.get(data_type, []):
                        for field in self._get_numerical_fields(entry):
                            if field not in gt_fields:
                                gt_fields[field] = []
                            
                            value = self._get_nested_field(entry, field)
                            if value is not None:
                                gt_fields[field].append(value)
                    
                    # Get corresponding fields in converted data
                    conv_fields = {}
                    for entry in converted.get(data_type, []):
                        for field in gt_fields.keys():
                            if field not in conv_fields:
                                conv_fields[field] = []
                            
                            value = self._get_nested_field(entry, field)
                            if value is not None:
                                conv_fields[field].append(value)
                    
                    # Calculate signal fidelity metrics for each field
                    field_snr = {}
                    field_freq_response = {}
                    field_dynamic_range = {}
                    
                    for field in gt_fields.keys():
                        if field in conv_fields and len(gt_fields[field]) > 0 and len(conv_fields[field]) > 0:
                            # Calculate SNR
                            gt_signal = np.array(gt_fields[field])
                            conv_signal = np.array(conv_fields[field])
                            
                            # Align signals if different lengths
                            min_len = min(len(gt_signal), len(conv_signal))
                            gt_signal = gt_signal[:min_len]
                            conv_signal = conv_signal[:min_len]
                            
                            if min_len > 0:
                                # Calculate noise as difference between signals
                                noise = gt_signal - conv_signal
                                
                                # Calculate SNR
                                signal_power = np.mean(gt_signal ** 2)
                                noise_power = np.mean(noise ** 2)
                                
                                if noise_power > 0:
                                    snr = 10 * np.log10(signal_power / noise_power)
                                else:
                                    snr = float('inf')
                                
                                field_snr[field] = snr
                                
                                # Calculate frequency response preservation (for IMU data)
                                if "imu" in filename.lower() and min_len > 10:
                                    # Calculate power spectral density
                                    gt_psd = self._calculate_psd(gt_signal)
                                    conv_psd = self._calculate_psd(conv_signal)
                                    
                                    # Calculate correlation between PSDs
                                    if len(gt_psd) > 0 and len(conv_psd) > 0:
                                        min_psd_len = min(len(gt_psd), len(conv_psd))
                                        corr = np.corrcoef(gt_psd[:min_psd_len], conv_psd[:min_psd_len])[0, 1]
                                        field_freq_response[field] = corr
                                
                                # Calculate dynamic range preservation
                                gt_range = np.max(gt_signal) - np.min(gt_signal)
                                conv_range = np.max(conv_signal) - np.min(conv_signal)
                                
                                if gt_range > 0:
                                    range_ratio = conv_range / gt_range
                                else:
                                    range_ratio = None
                                
                                field_dynamic_range[field] = range_ratio
                    
                    # Calculate average metrics across all fields
                    valid_snr = [s for s in field_snr.values() if s is not None and not np.isinf(s)]
                    valid_freq = [f for f in field_freq_response.values() if f is not None]
                    valid_range = [r for r in field_dynamic_range.values() if r is not None]
                    
                    if valid_snr:
                        avg_snr = np.mean(valid_snr)
                    else:
                        avg_snr = None
                    
                    if valid_freq:
                        avg_freq_response = np.mean(valid_freq)
                    else:
                        avg_freq_response = None
                    
                    if valid_range:
                        avg_range_ratio = np.mean(valid_range)
                    else:
                        avg_range_ratio = None
                    
                    results["snr"][filename] = {
                        "average_snr_db": avg_snr,
                        "field_snr_db": field_snr
                    }
                    
                    if "imu" in filename.lower():
                        results["frequency_response"][filename] = {
                            "average_frequency_correlation": avg_freq_response,
                            "field_frequency_correlation": field_freq_response
                        }
                    
                    results["dynamic_range"][filename] = {
                        "average_range_ratio": avg_range_ratio,
                        "field_range_ratio": field_dynamic_range
                    }
        
        return results
    
    def _calculate_psd(self, signal):
        """
        Calculate power spectral density of a signal
        
        Args:
            signal: Signal array
            
        Returns:
            Power spectral density array
        """
        if len(signal) < 10:
            return []
        
        # Calculate PSD using Welch's method
        f, psd = signal.welch(signal, nperseg=min(256, len(signal)//2))
        return psd
    
    def _evaluate_reconstruction_metrics(self):
        """
        Evaluate reconstruction metrics
        
        Returns:
            Dictionary with reconstruction metrics
        """
        # This would require a reverse transformation function to convert standardized data back to raw format
        # Since we don't have that, we'll return a placeholder
        return {
            "round_trip_error": "Not implemented - requires reverse transformation function",
            "lossy_compression_metrics": "Not implemented - requires reverse transformation function"
        }
    
    def evaluate_robustness(self):
        """
        Evaluate robustness metrics
        """
        # Input variation robustness
        self.results["robustness"]["input_variation"] = self._evaluate_input_variation_robustness()
        
        # Data quality robustness
        self.results["robustness"]["data_quality"] = self._evaluate_data_quality_robustness()
        
        # Edge case handling
        self.results["robustness"]["edge_case"] = self._evaluate_edge_case_handling()
    
    def _evaluate_input_variation_robustness(self):
        """
        Evaluate input variation robustness
        
        Returns:
            Dictionary with input variation robustness metrics
        """
        # This would require testing with different input formats
        # Since we don't have that, we'll return a placeholder
        return {
            "format_variation_robustness": "Not implemented - requires testing with different input formats",
            "vendor_variation_robustness": "Not implemented - requires testing with data from different vendors",
            "configuration_variation_robustness": "Not implemented - requires testing with different configurations"
        }
    
    def _evaluate_data_quality_robustness(self):
        """
        Evaluate data quality robustness
        
        Returns:
            Dictionary with data quality robustness metrics
        """
        # This would require testing with artificially degraded data
        # Since we don't have that, we'll return a placeholder
        return {
            "missing_data_handling": "Not implemented - requires testing with missing data",
            "outlier_handling": "Not implemented - requires testing with outliers",
            "noise_handling": "Not implemented - requires testing with noisy data"
        }
    
    def _evaluate_edge_case_handling(self):
        """
        Evaluate edge case handling
        
        Returns:
            Dictionary with edge case handling metrics
        """
        # This would require testing with edge cases
        # Since we don't have that, we'll return a placeholder
        return {
            "boundary_value_handling": "Not implemented - requires testing with boundary values",
            "special_value_handling": "Not implemented - requires testing with special values",
            "discontinuity_handling": "Not implemented - requires testing with discontinuities"
        }
    
    def evaluate_efficiency(self):
        """
        Evaluate efficiency metrics
        """
        # This would require measuring performance during transformation
        # Since we don't have that, we'll return a placeholder
        self.results["efficiency"] = {
            "transformation_time": "Not implemented - requires measuring transformation time",
            "cpu_usage": "Not implemented - requires measuring CPU usage",
            "memory_usage": "Not implemented - requires measuring memory usage",
            "size_ratio": self._evaluate_size_ratio()
        }
    
    def _evaluate_size_ratio(self):
        """
        Evaluate size ratio
        
        Returns:
            Dictionary with size ratio metrics
        """
        results = {}
        
        # Process all data files
        for filename in os.listdir(self.ground_truth_dir):
            if filename.endswith('.json'):
                gt_file = os.path.join(self.ground_truth_dir, filename)
                conv_file = os.path.join(self.converted_dir, filename)
                
                if os.path.exists(conv_file):
                    gt_size = os.path.getsize(gt_file)
                    conv_size = os.path.getsize(conv_file)
                    
                    if gt_size > 0:
                        size_ratio = conv_size / gt_size
                    else:
                        size_ratio = None
                    
                    results[filename] = {
                        "ground_truth_size_bytes": gt_size,
                        "converted_size_bytes": conv_size,
                        "size_ratio": size_ratio
                    }
        
        return results
    
    def evaluate_fgo_readiness(self):
        """
        Evaluate FGO readiness metrics
        """
        # This would require knowledge of FGO requirements
        # Since we don't have that, we'll return a placeholder
        self.results["fgo_readiness"] = {
            "factor_completeness": "Not implemented - requires knowledge of FGO requirements",
            "constraint_quality": "Not implemented - requires knowledge of FGO requirements",
            "uncertainty_representation": "Not implemented - requires knowledge of FGO requirements"
        }
    
    def generate_summary(self):
        """
        Generate summary of all metrics
        """
        summary = {}
        
        # Summarize data field accuracy
        if "data_field_accuracy" in self.results:
            numerical_summary = {}
            
            # Summarize numerical field accuracy
            if "numerical" in self.results["data_field_accuracy"]:
                for data_type in ["gnss", "imu"]:
                    if data_type in self.results["data_field_accuracy"]["numerical"]:
                        mae_values = []
                        rmse_values = []
                        nrmse_values = []
                        
                        for filename, file_results in self.results["data_field_accuracy"]["numerical"][data_type].items():
                            for field, field_results in file_results.items():
                                if field_results["mae"] is not None:
                                    mae_values.append(field_results["mae"])
                                if field_results["rmse"] is not None:
                                    rmse_values.append(field_results["rmse"])
                                if field_results["nrmse"] is not None:
                                    nrmse_values.append(field_results["nrmse"])
                        
                        if mae_values:
                            numerical_summary[f"{data_type}_avg_mae"] = np.mean(mae_values)
                        if rmse_values:
                            numerical_summary[f"{data_type}_avg_rmse"] = np.mean(rmse_values)
                        if nrmse_values:
                            numerical_summary[f"{data_type}_avg_nrmse"] = np.mean(nrmse_values)
            
            summary["numerical_field_accuracy"] = numerical_summary
        
        # Summarize information preservation
        if "information_preservation" in self.results and "content" in self.results["information_preservation"]:
            info_summary = {}
            
            # Summarize entropy ratio
            if "entropy_ratio" in self.results["information_preservation"]["content"]:
                entropy_ratios = []
                
                for filename, file_results in self.results["information_preservation"]["content"]["entropy_ratio"].items():
                    if file_results["average_entropy_ratio"] is not None:
                        entropy_ratios.append(file_results["average_entropy_ratio"])
                
                if entropy_ratios:
                    info_summary["avg_entropy_ratio"] = np.mean(entropy_ratios)
            
            # Summarize SNR
            if "signal_fidelity" in self.results["information_preservation"] and "snr" in self.results["information_preservation"]["signal_fidelity"]:
                snr_values = []
                
                for filename, file_results in self.results["information_preservation"]["signal_fidelity"]["snr"].items():
                    if file_results["average_snr_db"] is not None:
                        snr_values.append(file_results["average_snr_db"])
                
                if snr_values:
                    info_summary["avg_snr_db"] = np.mean(snr_values)
            
            summary["information_preservation"] = info_summary
        
        # Summarize efficiency
        if "efficiency" in self.results and "size_ratio" in self.results["efficiency"]:
            size_ratios = []
            
            for filename, file_results in self.results["efficiency"]["size_ratio"].items():
                if file_results["size_ratio"] is not None:
                    size_ratios.append(file_results["size_ratio"])
            
            if size_ratios:
                summary["avg_size_ratio"] = np.mean(size_ratios)
        
        self.results["summary"] = summary

def main():
    parser = argparse.ArgumentParser(description='Evaluate data transformation accuracy')
    parser.add_argument('--ground-truth', required=True, help='Directory containing ground truth data')
    parser.add_argument('--converted', required=True, help='Directory containing converted data')
    parser.add_argument('--output', help='Output file for results (JSON)')
    
    args = parser.parse_args()
    
    evaluator = DataTransformationEvaluator(args.ground_truth, args.converted)
    results = evaluator.evaluate_all()
    
    if args.output:
        with open(args.output, 'w') as f:
            json.dump(results, f, indent=2)
    else:
        print(json.dumps(results, indent=2))

if __name__ == '__main__':
    main()
