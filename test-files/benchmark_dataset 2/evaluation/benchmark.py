#!/usr/bin/env python3
"""
Benchmark script for measuring conversion speed of navigation data standardization.
"""

import os
import json
import time
import argparse
import subprocess
import psutil
import numpy as np
from datetime import datetime

def benchmark_conversion(input_dir, output_dir, conversion_script):
    """
    Benchmark conversion speed and resource usage
    
    Args:
        input_dir: Directory containing input data
        output_dir: Directory for output data
        conversion_script: Path to conversion script
        
    Returns:
        Dictionary with benchmark results
    """
    results = {
        "timestamp": datetime.now().isoformat(),
        "input_files": [],
        "total_time_seconds": 0,
        "average_time_per_file_seconds": 0,
        "peak_memory_usage_mb": 0,
        "average_cpu_percent": 0
    }
    
    # Get list of input files
    input_files = []
    for root, _, files in os.walk(input_dir):
        for filename in files:
            if filename.endswith(('.json', '.txt', '.nmea', '.obs', '.csv')):
                file_path = os.path.join(root, filename)
                rel_path = os.path.relpath(file_path, input_dir)
                file_size = os.path.getsize(file_path)
                
                input_files.append({
                    "path": rel_path,
                    "size_bytes": file_size
                })
    
    results["input_files"] = input_files
    
    # Create process to monitor
    start_time = time.time()
    process = subprocess.Popen(['python', conversion_script, '--input', input_dir, '--output', output_dir])
    
    # Monitor resource usage
    cpu_percentages = []
    peak_memory = 0
    
    try:
        process_psutil = psutil.Process(process.pid)
        
        while process.poll() is None:
            # Get CPU usage
            cpu_percent = process_psutil.cpu_percent(interval=0.1)
            cpu_percentages.append(cpu_percent)
            
            # Get memory usage
            memory_info = process_psutil.memory_info()
            memory_mb = memory_info.rss / (1024 * 1024)  # Convert to MB
            peak_memory = max(peak_memory, memory_mb)
            
            time.sleep(0.1)
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass
    
    end_time = time.time()
    
    # Calculate results
    results["total_time_seconds"] = end_time - start_time
    
    if len(input_files) > 0:
        results["average_time_per_file_seconds"] = results["total_time_seconds"] / len(input_files)
    
    results["peak_memory_usage_mb"] = peak_memory
    
    if cpu_percentages:
        results["average_cpu_percent"] = np.mean(cpu_percentages)
    
    return results

def main():
    parser = argparse.ArgumentParser(description='Benchmark navigation data standardization')
    parser.add_argument('--input', required=True, help='Directory containing input data')
    parser.add_argument('--output', required=True, help='Directory for output data')
    parser.add_argument('--script', required=True, help='Path to conversion script')
    parser.add_argument('--results', default='benchmark_results.json', help='Output file for benchmark results')
    
    args = parser.parse_args()
    
    # Ensure output directory exists
    os.makedirs(args.output, exist_ok=True)
    
    # Run benchmark
    results = benchmark_conversion(args.input, args.output, args.script)
    
    # Save results
    with open(args.results, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"Benchmark results saved to {args.results}")

if __name__ == "__main__":
    main()
