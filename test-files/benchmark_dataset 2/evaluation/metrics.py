#!/usr/bin/env python3
"""
Metrics for evaluating conversion accuracy of navigation data standardization.
"""

import os
import json
import time
import argparse
import numpy as np
from datetime import datetime

def calculate_position_error(ground_truth, converted):
    """
    Calculate position error between ground truth and converted GNSS data
    
    Args:
        ground_truth: Ground truth GNSS data
        converted: Converted GNSS data
        
    Returns:
        Dictionary with error metrics
    """
    errors = []
    
    # Match entries by timestamp
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
        if closest_entry is not None and min_time_diff < 1.0:  # Within 1 second
            gt_pos = gt_entry.get("position_lla")
            conv_pos = closest_entry.get("position_lla")
            
            if gt_pos is not None and conv_pos is not None:
                # Calculate position error (simplified, not accounting for Earth curvature)
                lat_error = abs(gt_pos.get("latitude_deg", 0) - conv_pos.get("latitude_deg", 0))
                lon_error = abs(gt_pos.get("longitude_deg", 0) - conv_pos.get("longitude_deg", 0))
                alt_error = abs(gt_pos.get("altitude_m", 0) - conv_pos.get("altitude_m", 0))
                
                # Approximate conversion to meters (very rough approximation)
                lat_m_error = lat_error * 111000  # 1 degree latitude is approximately 111 km
                lon_m_error = lon_error * 111000 * np.cos(np.radians(gt_pos.get("latitude_deg", 0)))
                
                # Calculate 3D position error
                pos_error = np.sqrt(lat_m_error**2 + lon_m_error**2 + alt_error**2)
                
                errors.append(pos_error)
    
    if errors:
        return {
            "mean_position_error_m": np.mean(errors),
            "max_position_error_m": np.max(errors),
            "min_position_error_m": np.min(errors),
            "std_position_error_m": np.std(errors),
            "num_matched_points": len(errors),
            "matched_percentage": len(errors) / len(ground_truth.get("gnss_data", [])) * 100
        }
    else:
        return {
            "mean_position_error_m": None,
            "max_position_error_m": None,
            "min_position_error_m": None,
            "std_position_error_m": None,
            "num_matched_points": 0,
            "matched_percentage": 0
        }

def calculate_orientation_error(ground_truth, converted):
    """
    Calculate orientation error between ground truth and converted IMU data
    
    Args:
        ground_truth: Ground truth IMU data
        converted: Converted IMU data
        
    Returns:
        Dictionary with error metrics
    """
    errors = []
    
    # Match entries by timestamp
    for gt_entry in ground_truth.get("imu_data", []):
        gt_time = gt_entry.get("time_unix")
        
        # Find closest timestamp in converted data
        closest_entry = None
        min_time_diff = float('inf')
        
        for conv_entry in converted.get("imu_data", []):
            conv_time = conv_entry.get("time_unix")
            if conv_time is not None and gt_time is not None:
                time_diff = abs(gt_time - conv_time)
                if time_diff < min_time_diff:
                    min_time_diff = time_diff
                    closest_entry = conv_entry
        
        # If matching entry found and time difference is small enough
        if closest_entry is not None and min_time_diff < 0.1:  # Within 0.1 seconds
            gt_orient = gt_entry.get("orientation")
            conv_orient = closest_entry.get("orientation")
            
            if gt_orient is not None and conv_orient is not None:
                # Calculate quaternion difference (simplified)
                w1, x1, y1, z1 = (
                    gt_orient.get("w", 0),
                    gt_orient.get("x", 0),
                    gt_orient.get("y", 0),
                    gt_orient.get("z", 0)
                )
                
                w2, x2, y2, z2 = (
                    conv_orient.get("w", 0),
                    conv_orient.get("x", 0),
                    conv_orient.get("y", 0),
                    conv_orient.get("z", 0)
                )
                
                # Calculate dot product
                dot_product = w1*w2 + x1*x2 + y1*y2 + z1*z2
                
                # Clamp to valid range for acos
                dot_product = max(min(dot_product, 1.0), -1.0)
                
                # Calculate angle difference in degrees
                angle_diff = np.degrees(2 * np.arccos(abs(dot_product)))
                
                errors.append(angle_diff)
    
    if errors:
        return {
            "mean_orientation_error_deg": np.mean(errors),
            "max_orientation_error_deg": np.max(errors),
            "min_orientation_error_deg": np.min(errors),
            "std_orientation_error_deg": np.std(errors),
            "num_matched_points": len(errors),
            "matched_percentage": len(errors) / len(ground_truth.get("imu_data", [])) * 100
        }
    else:
        return {
            "mean_orientation_error_deg": None,
            "max_orientation_error_deg": None,
            "min_orientation_error_deg": None,
            "std_orientation_error_deg": None,
            "num_matched_points": 0,
            "matched_percentage": 0
        }

def calculate_acceleration_error(ground_truth, converted):
    """
    Calculate acceleration error between ground truth and converted IMU data
    
    Args:
        ground_truth: Ground truth IMU data
        converted: Converted IMU data
        
    Returns:
        Dictionary with error metrics
    """
    errors = []
    
    # Match entries by timestamp
    for gt_entry in ground_truth.get("imu_data", []):
        gt_time = gt_entry.get("time_unix")
        
        # Find closest timestamp in converted data
        closest_entry = None
        min_time_diff = float('inf')
        
        for conv_entry in converted.get("imu_data", []):
            conv_time = conv_entry.get("time_unix")
            if conv_time is not None and gt_time is not None:
                time_diff = abs(gt_time - conv_time)
                if time_diff < min_time_diff:
                    min_time_diff = time_diff
                    closest_entry = conv_entry
        
        # If matching entry found and time difference is small enough
        if closest_entry is not None and min_time_diff < 0.1:  # Within 0.1 seconds
            gt_acc = gt_entry.get("linear_acceleration")
            conv_acc = closest_entry.get("linear_acceleration")
            
            if gt_acc is not None and conv_acc is not None:
                # Calculate acceleration error
                x_error = abs(gt_acc.get("x", 0) - conv_acc.get("x", 0))
                y_error = abs(gt_acc.get("y", 0) - conv_acc.get("y", 0))
                z_error = abs(gt_acc.get("z", 0) - conv_acc.get("z", 0))
                
                # Calculate 3D acceleration error
                acc_error = np.sqrt(x_error**2 + y_error**2 + z_error**2)
                
                errors.append(acc_error)
    
    if errors:
        return {
            "mean_acceleration_error_mps2": np.mean(errors),
            "max_acceleration_error_mps2": np.max(errors),
            "min_acceleration_error_mps2": np.min(errors),
            "std_acceleration_error_mps2": np.std(errors),
            "num_matched_points": len(errors),
            "matched_percentage": len(errors) / len(ground_truth.get("imu_data", [])) * 100
        }
    else:
        return {
            "mean_acceleration_error_mps2": None,
            "max_acceleration_error_mps2": None,
            "min_acceleration_error_mps2": None,
            "std_acceleration_error_mps2": None,
            "num_matched_points": 0,
            "matched_percentage": 0
        }

def evaluate_conversion_accuracy(ground_truth_dir, converted_dir):
    """
    Evaluate conversion accuracy by comparing converted data with ground truth
    
    Args:
        ground_truth_dir: Directory containing ground truth data
        converted_dir: Directory containing converted data
        
    Returns:
        Dictionary with accuracy metrics
    """
    results = {
        "gnss": {},
        "imu": {
            "orientation": {},
            "acceleration": {}
        }
    }
    
    # Evaluate GNSS data
    for filename in os.listdir(ground_truth_dir):
        if filename.endswith('.json') and "gnss" in filename.lower():
            gt_file = os.path.join(ground_truth_dir, filename)
            conv_file = os.path.join(converted_dir, filename)
            
            if os.path.exists(conv_file):
                with open(gt_file, 'r') as f:
                    ground_truth = json.load(f)
                
                with open(conv_file, 'r') as f:
                    converted = json.load(f)
                
                results["gnss"][filename] = calculate_position_error(ground_truth, converted)
    
    # Evaluate IMU data
    for filename in os.listdir(ground_truth_dir):
        if filename.endswith('.json') and "imu" in filename.lower():
            gt_file = os.path.join(ground_truth_dir, filename)
            conv_file = os.path.join(converted_dir, filename)
            
            if os.path.exists(conv_file):
                with open(gt_file, 'r') as f:
                    ground_truth = json.load(f)
                
                with open(conv_file, 'r') as f:
                    converted = json.load(f)
                
                results["imu"]["orientation"][filename] = calculate_orientation_error(ground_truth, converted)
                results["imu"]["acceleration"][filename] = calculate_acceleration_error(ground_truth, converted)
    
    return results

def benchmark_conversion_speed(input_dir, script_path):
    """
    Benchmark conversion speed
    
    Args:
        input_dir: Directory containing input data
        script_path: Path to conversion script
        
    Returns:
        Dictionary with performance metrics
    """
    results = {
        "total_time_seconds": 0,
        "files_processed": 0,
        "average_time_per_file_seconds": 0
    }
    
    start_time = time.time()
    
    # Run conversion script
    os.system(f"python {script_path} --input {input_dir}")
    
    end_time = time.time()
    
    # Count files processed
    file_count = 0
    for root, _, files in os.walk(input_dir):
        for filename in files:
            if filename.endswith(('.json', '.txt', '.nmea', '.obs', '.csv')):
                file_count += 1
    
    results["total_time_seconds"] = end_time - start_time
    results["files_processed"] = file_count
    
    if file_count > 0:
        results["average_time_per_file_seconds"] = results["total_time_seconds"] / file_count
    
    return results

def main():
    parser = argparse.ArgumentParser(description='Evaluate navigation data standardization')
    parser.add_argument('--ground-truth', required=True, help='Directory containing ground truth data')
    parser.add_argument('--converted', required=True, help='Directory containing converted data')
    parser.add_argument('--benchmark', action='store_true', help='Benchmark conversion speed')
    parser.add_argument('--script', help='Path to conversion script (required for benchmarking)')
    parser.add_argument('--output', default='evaluation_results.json', help='Output file for results')
    
    args = parser.parse_args()
    
    results = {
        "timestamp": datetime.now().isoformat(),
        "accuracy": None,
        "performance": None
    }
    
    # Evaluate accuracy
    results["accuracy"] = evaluate_conversion_accuracy(args.ground_truth, args.converted)
    
    # Benchmark performance if requested
    if args.benchmark and args.script:
        results["performance"] = benchmark_conversion_speed(args.ground_truth, args.script)
    
    # Save results
    with open(args.output, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"Evaluation results saved to {args.output}")

if __name__ == "__main__":
    main()
