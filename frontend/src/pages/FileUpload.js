import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function FileUpload() {
  const [files, setFiles] = useState({
    gnss: null,
    imu: null
  });
  const [activeTab, setActiveTab] = useState('gnss');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState(null);
  const [processingStage, setProcessingStage] = useState(null);
  const [processingDetails, setProcessingDetails] = useState(null);
  const [processingComplete, setProcessingComplete] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const statusIntervalRef = useRef(null);
  const navigate = useNavigate();

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFiles(prev => ({
        ...prev,
        [activeTab]: selectedFile
      }));
      setError(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      setFiles(prev => ({
        ...prev,
        [activeTab]: droppedFile
      }));
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!files.gnss && !files.imu) {
      setError('Please select at least one file (GNSS or IMU) to upload');
      return;
    }

    const gnssExtensions = ['.nmea', '.obs', '.rnx', '.json', '.txt', '.ubx', '.csv', '.21o', '.22o', '.23o'];
    const imuExtensions = ['.csv', '.json', '.txt', '.imu', '.bin'];
    
    if (files.gnss) {
      const gnssExtension = '.' + files.gnss.name.split('.').pop().toLowerCase();
      if (!gnssExtensions.includes(gnssExtension)) {
        setError(`Invalid GNSS file format. Supported formats: ${gnssExtensions.join(', ')}`);
        return;
      }
    }
    
    if (files.imu) {
      const imuExtension = '.' + files.imu.name.split('.').pop().toLowerCase();
      if (!imuExtensions.includes(imuExtension)) {
        setError(`Invalid IMU file format. Supported formats: ${imuExtensions.join(', ')}`);
        return;
      }
    }

    setIsUploading(true);
    setUploadProgress(0);
    setProcessingStatus('Uploading file(s)...');
    setProcessingStage('uploading');
    setProcessingDetails(null);
    setError(null);

    const formData = new FormData();
    if (files.gnss) formData.append('gnssFile', files.gnss);
    if (files.imu) formData.append('imuFile', files.imu);

    try {
      // Upload the file(s)
      const response = await axios.post('/api/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      });

      if (response.data.jobId) {
        // Start polling for processing status
        setProcessingStatus('Processing file(s)...');
        startPollingJobStatus(response.data.jobId);
      } else {
        setProcessingStatus('Upload complete');
        setIsUploading(false);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error uploading file. Please try again.');
      setIsUploading(false);
      setProcessingStatus(null);
      setProcessingStage(null);
    }
  };

  const startPollingJobStatus = (jobId) => {
    // Clear any existing interval
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
    }
    
    // Set up polling
    statusIntervalRef.current = setInterval(async () => {
      try {
        const statusResponse = await axios.get(`/api/files/status/${jobId}`);
        const status = statusResponse.data;
        
        // Update all status-related state
        setProcessingStatus(status.message || 'Processing data...');
        setProcessingStage(status.stage || 'processing');
        setProcessingDetails(status.details || null);
        setUploadProgress(status.progress || 0);
        
        // If processing is complete or failed, stop polling
        if (status.state === 'completed' || status.state === 'failed') {
          clearInterval(statusIntervalRef.current);
          setIsUploading(false);
          
          if (status.state === 'failed') {
            setError('Processing failed: ' + (status.failReason || 'Unknown error'));
          } else if (status.state === 'completed') {
            setProcessingComplete(true);
          }
        }
      } catch (err) {
        console.error('Error checking job status:', err);
        setError('Error checking processing status');
        clearInterval(statusIntervalRef.current);
        setIsUploading(false);
      }
    }, 2000);
  };

  // Get an appropriate icon for the current processing stage
  const getStageIcon = () => {
    const iconClasses = "w-5 h-5 mr-2";
    
    switch (processingStage) {
      case 'uploading':
      case 'uploading_converted':
      case 'uploading_location':
      case 'uploading_converted_imu':
        return (
          <svg className={`animate-bounce ${iconClasses}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
          </svg>
        );
        
      case 'first_conversion':
      case 'first_conversion_standard':
      case 'first_conversion_imu':
      case 'first_conversion_standard_imu':
        return (
          <svg className={`animate-spin ${iconClasses}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
        );
        
      case 'first_conversion_ai':
      case 'first_conversion_ai_imu':
      case 'second_conversion_ai':
      case 'second_conversion_ai_imu':
        return (
          <svg className={`animate-pulse ${iconClasses}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
          </svg>
        );
        
      case 'extracting_location':
      case 'validating':
      case 'validation_report':
        return (
          <svg className={`animate-spin ${iconClasses}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
          </svg>
        );
        
      case 'second_conversion':
      case 'second_conversion_imu':
        return (
          <svg className={`animate-spin ${iconClasses}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
          </svg>
        );
        
      case 'second_conversion_complete':
      case 'second_conversion_complete_imu':
        return (
          <svg className={`text-green-500 ${iconClasses}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        );
        
      case 'second_conversion_failed':
      case 'second_conversion_failed_imu':
      case 'second_conversion_error':
      case 'second_conversion_error_imu':
      case 'error':
        return (
          <svg className={`text-yellow-500 ${iconClasses}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
        );
        
      case 'fusion':
        return (
          <svg className={`animate-pulse ${iconClasses}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
          </svg>
        );
        
      case 'complete':
        return (
          <svg className={`text-green-500 ${iconClasses}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
          </svg>
        );
        
      default:
        return (
          <svg className={`animate-spin ${iconClasses}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        );
    }
  };

  // Get color for the progress bar based on the stage
  const getProgressBarColor = () => {
    if (processingStage?.includes('error') || processingStage === 'error') {
      return 'bg-red-500';
    }
    
    if (processingStage?.includes('failed')) {
      return 'bg-yellow-500';
    }
    
    if (processingStage === 'complete' || processingStage?.includes('complete')) {
      return 'bg-green-500';
    }
    
    if (processingStage?.includes('ai')) {
      return 'bg-purple-500';
    }
    
    return 'bg-primary-600';
  };

  // Clean up interval on component unmount
  useEffect(() => {
    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
      }
    };
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Upload Sensor Data</h1>
      
      {/* File Type Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('gnss')}
            className={`py-2 px-4 font-medium text-sm rounded-t-md transition-colors ${
              activeTab === 'gnss'
                ? 'bg-primary-100 text-primary-700 border-b-2 border-primary-500'
                : 'text-gray-600 hover:text-primary-600'
            }`}
          >
            GNSS Data
          </button>
          <button
            onClick={() => setActiveTab('imu')}
            className={`py-2 px-4 font-medium text-sm rounded-t-md transition-colors ${
              activeTab === 'imu'
                ? 'bg-primary-100 text-primary-700 border-b-2 border-primary-500'
                : 'text-gray-600 hover:text-primary-600'
            }`}
          >
            IMU Data
          </button>
        </div>
      </div>
      
      {/* File Upload Area */}
      <div className="mb-6">
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-300 hover:border-primary-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept={activeTab === 'gnss' 
              ? ".nmea,.obs,.rnx,.json,.txt,.ubx,.csv,.21o,.22o,.23o" 
              : ".csv,.json,.txt,.imu,.bin"}
          />
          
          <div className="max-w-xs mx-auto">
            <svg
              className="mx-auto h-12 w-12 text-gray-400 mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              ></path>
            </svg>
            
            {files[activeTab] ? (
              <div>
                <p className="text-sm text-gray-700 mb-1 font-medium">
                  Selected {activeTab.toUpperCase()} file:
                </p>
                <p className="text-sm text-primary-600 break-all font-mono">
                  {files[activeTab].name}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {(files[activeTab].size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-700 mb-1">
                  {activeTab === 'gnss' ? (
                    <>Drag & drop your <span className="font-medium">GNSS data file</span> here</>
                  ) : (
                    <>Drag & drop your <span className="font-medium">IMU data file</span> here</>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  {activeTab === 'gnss' ? (
                    <>Supports RINEX, NMEA, UBX, JSON, CSV, and more</>
                  ) : (
                    <>Supports CSV, JSON, TXT, and binary IMU formats</>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Selected Files Summary */}
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-800 mb-2">Selected Files</h3>
        <div className="bg-gray-50 rounded-md border border-gray-200 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded-md bg-white border border-gray-200">
              <div className="flex items-center mb-1">
                <svg className="w-4 h-4 text-primary-600 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="font-medium text-gray-700">GNSS Data</span>
              </div>
              {files.gnss ? (
                <div className="text-sm">
                  <p className="text-gray-800 font-mono truncate">{files.gnss.name}</p>
                  <p className="text-gray-500 text-xs mt-1">{(files.gnss.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">No GNSS file selected</p>
              )}
            </div>
            
            <div className="p-3 rounded-md bg-white border border-gray-200">
              <div className="flex items-center mb-1">
                <svg className="w-4 h-4 text-primary-600 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="font-medium text-gray-700">IMU Data</span>
              </div>
              {files.imu ? (
                <div className="text-sm">
                  <p className="text-gray-800 font-mono truncate">{files.imu.name}</p>
                  <p className="text-gray-500 text-xs mt-1">{(files.imu.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">No IMU file selected</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Upload Button */}
      <div className="flex items-center mb-6">
        <button
          onClick={handleUpload}
          disabled={isUploading || (!files.gnss && !files.imu)}
          className={`btn btn-primary flex items-center ${
            isUploading || (!files.gnss && !files.imu)
              ? 'opacity-50 cursor-not-allowed'
              : ''
          }`}
        >
          {isUploading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </>
          ) : (
            <>
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
              </svg>
              {files.gnss && files.imu ? 'Process Both Files' : 'Process File'}
            </>
          )}
        </button>
        
        {(files.gnss || files.imu) && !isUploading && (
          <button
            onClick={() => setFiles({ gnss: null, imu: null })}
            className="ml-3 btn btn-secondary flex items-center"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
            Clear
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 p-3 rounded-md text-sm">
          <div className="flex">
            <svg className="h-5 w-5 text-red-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Progress indicator with detailed status */}
      {isUploading && (
        <div className="mb-6">
          <div className="flex justify-between mb-2">
            <div className="flex items-center">
              {getStageIcon()}
              <span className="text-sm font-medium">{processingStatus}</span>
            </div>
            <span className="text-sm">{uploadProgress}%</span>
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div className={`${getProgressBarColor()} h-2 rounded-full transition-all duration-300`} style={{ width: `${uploadProgress}%` }}></div>
          </div>
          
          {/* Processing details if available */}
          {processingDetails && (
            <div className="text-xs text-gray-500 italic mt-1">
              {processingDetails.error && (
                <div>Error details: {processingDetails.error}</div>
              )}
            </div>
          )}
          
          {/* Processing history */}
          {processingStage && processingStage.includes('second_conversion') && (
            <div className="flex flex-col gap-1 mt-3 text-xs text-gray-600">
              <div className="flex items-center">
                <svg className="w-4 h-4 text-green-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>Upload completed</span>
              </div>
              <div className="flex items-center">
                <svg className="w-4 h-4 text-green-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>First format conversion completed</span>
              </div>
              <div className="flex items-center">
                <svg className="w-4 h-4 text-green-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>Data extraction completed</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Additional instructions */}
      <div className="mt-12 bg-gray-50 p-4 rounded-md border border-gray-200">
        <h3 className="text-lg font-medium mb-3">Processing Information</h3>
        <div className="text-sm text-gray-600 space-y-2">
          <p>
            <span className="font-medium">FusionFly</span> processes both GNSS and IMU data to provide accurate positioning using Factor Graph Optimization.
          </p>
          <p><strong>For best results:</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Ensure GNSS and IMU data have synchronized timestamps</li>
            <li>Upload both file types (when available) for the most accurate results</li>
            <li>Large files may take longer to process</li>
            <li>Supported GNSS formats: RINEX, NMEA, UBX, JSON, CSV, and more</li>
            <li>Supported IMU formats: CSV, JSON, TXT, and binary formats</li>
          </ul>
        </div>
      </div>

      {/* Add a "View Processed Files" button after the upload button */}
      {processingComplete && (
        <button
          onClick={() => navigate('/files')}
          className="btn btn-success ml-4 flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"></path>
          </svg>
          View Processed Files
        </button>
      )}
    </div>
  );
}

export default FileUpload; 