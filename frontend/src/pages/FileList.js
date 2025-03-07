import React, { useState, useEffect } from 'react';
import axios from 'axios';

function FileList() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/files/list');
      
      // Group files by original name (removing extensions)
      const groupedFiles = {};
      
      response.data.forEach(file => {
        // Get base name without extension
        const baseName = file.filename.split('.')[0];
        
        if (!groupedFiles[baseName]) {
          groupedFiles[baseName] = {
            id: baseName,
            files: []
          };
        }
        
        groupedFiles[baseName].files.push(file);
      });
      
      // Convert grouped object to array and sort by creation date (most recent first)
      const groupedArray = Object.values(groupedFiles).sort((a, b) => {
        const aDate = Math.max(...a.files.map(f => new Date(f.createdAt)));
        const bDate = Math.max(...b.files.map(f => new Date(f.createdAt)));
        return bDate - aDate;
      });
      
      setFiles(groupedArray);
      setLoading(false);
    } catch (err) {
      setError('Error loading files: ' + (err.response?.data?.error || err.message));
      setLoading(false);
      console.error('Error fetching files:', err);
    }
  };

  const clearCache = async () => {
    try {
      setClearingCache(true);
      await axios.post('/api/files/clear-cache');
      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 3000); // Reset message after 3 seconds
      
      // Refresh files list
      fetchFiles();
      setClearingCache(false);
    } catch (err) {
      setError('Error clearing cache: ' + (err.response?.data?.error || err.message));
      setClearingCache(false);
    }
  };

  const handleDownload = async (filename) => {
    try {
      // Create a direct link to the file
      const downloadUrl = `/api/files/download/${filename}`;
      
      // Create a temporary anchor element to trigger the download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error downloading file:', err);
      setError('Error downloading file: ' + (err.response?.data?.error || err.message));
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getFileIcon = (filename) => {
    const extension = filename.split('.').pop().toLowerCase();
    
    if (['nmea', 'txt', 'csv'].includes(extension)) {
      return (
        <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
      );
    } else if (['json', 'jsonl'].includes(extension)) {
      return (
        <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
        </svg>
      );
    } else {
      return (
        <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
        </svg>
      );
    }
  };

  const handleFileClick = (fileGroup) => {
    setSelectedFile(selectedFile === fileGroup.id ? null : fileGroup.id);
  };

  const getFileTypeLabel = (filename) => {
    const extension = filename.split('.').pop().toLowerCase();
    
    if (['nmea', 'txt'].includes(extension)) {
      return 'NMEA File';
    } else if (['obs', 'rnx', '21o', '22o'].includes(extension)) {
      return 'RINEX File';
    } else if (extension === 'ubx') {
      return 'UBX Binary';
    } else if (extension === 'csv') {
      return 'CSV Data';
    } else if (['json', 'jsonl'].includes(extension)) {
      return 'JSON Data';
    } else if (extension === 'imu') {
      return 'IMU Data';
    } else {
      return 'Data File';
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Processed Files</h1>
        <div className="flex space-x-4">
          <button 
            onClick={fetchFiles}
            className="btn btn-secondary flex items-center"
            disabled={loading}
          >
            <svg className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          
          <button 
            onClick={clearCache}
            className="btn btn-secondary flex items-center text-red-600"
            disabled={clearingCache || files.length === 0}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear Cache
          </button>
        </div>
      </div>
      
      {cacheCleared && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 p-3 rounded-md flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          <span>Cache cleared successfully</span>
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded-md">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <svg className="animate-spin h-10 w-10 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      ) : files.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path>
          </svg>
          <h3 className="mt-2 text-lg font-medium text-gray-900">No files found</h3>
          <p className="mt-1 text-gray-500">Upload some files to get started.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <ul className="divide-y divide-gray-200">
            {files.map(fileGroup => (
              <li key={fileGroup.id} className="hover:bg-gray-50">
                <div 
                  className="px-4 py-4 sm:px-6 cursor-pointer"
                  onClick={() => handleFileClick(fileGroup)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {getFileIcon(fileGroup.files[0].filename)}
                      <p className="ml-3 text-lg font-medium text-gray-900 truncate">{fileGroup.id}</p>
                    </div>
                    <div className="flex items-center">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        {fileGroup.files.length} file{fileGroup.files.length !== 1 ? 's' : ''}
                      </span>
                      <svg className={`ml-2 h-5 w-5 text-gray-400 transition-transform ${selectedFile === fileGroup.id ? 'transform rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-between text-sm text-gray-500">
                    <div>
                      <p>Created: {formatDate(fileGroup.files[0].createdAt)}</p>
                    </div>
                    <div>
                      <p>Total size: {formatFileSize(fileGroup.files.reduce((total, f) => total + f.size, 0))}</p>
                    </div>
                  </div>
                </div>
                
                {selectedFile === fileGroup.id && (
                  <div className="px-4 py-3 sm:px-6 bg-gray-50 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Files in this group:</h4>
                    <ul className="space-y-2">
                      {fileGroup.files.map(file => (
                        <li key={file.filename} className="bg-white p-3 rounded border border-gray-200 shadow-sm">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center">
                              {getFileIcon(file.filename)}
                              <div className="ml-3">
                                <p className="text-sm font-medium text-gray-900">{file.filename}</p>
                                <p className="text-xs text-gray-500">{getFileTypeLabel(file.filename)}</p>
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownload(file.filename);
                                }}
                                className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                              >
                                <svg className="mr-1 h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Download
                              </button>
                            </div>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500">
                            <div>Size: {formatFileSize(file.size)}</div>
                            <div>Created: {formatDate(file.createdAt)}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default FileList; 