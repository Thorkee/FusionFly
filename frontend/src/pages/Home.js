import React from 'react';
import { Link } from 'react-router-dom';

function Home() {
  return (
    <div className="py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl sm:tracking-tight">
            FusionFly
          </h1>
          <p className="max-w-xl mt-5 mx-auto text-xl text-gray-500">
            Precision GNSS+IMU data fusion with Factor Graph Optimization
          </p>
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h2 className="text-lg font-medium text-gray-900 mb-4">Powerful Data Processing</h2>
                <p className="text-gray-600 mb-4">
                  FusionFly combines GNSS and IMU data to provide accurate positioning, even in challenging environments.
                </p>
                <ul className="list-disc pl-5 text-gray-600 space-y-2">
                  <li>Automatic format detection</li>
                  <li>Support for RINEX, NMEA, UBX and custom formats</li>
                  <li>Advanced data fusion with Factor Graph Optimization</li>
                  <li>Fast and efficient processing</li>
                </ul>
                
                <div className="mt-6">
                  <Link 
                    to="/upload" 
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Upload Files
                  </Link>
                </div>
              </div>
              
              <div className="bg-gray-800 rounded-md p-4 text-white font-mono text-sm overflow-hidden">
                <div className="flex items-center mb-2">
                  <div className="flex space-x-1">
                    <div className="h-3 w-3 bg-red-500 rounded-full"></div>
                    <div className="h-3 w-3 bg-yellow-500 rounded-full"></div>
                    <div className="h-3 w-3 bg-green-500 rounded-full"></div>
                  </div>
                  <div className="ml-4 text-white text-sm font-mono">fusion-fly</div>
                </div>
                <div className="border-t border-gray-700 pt-2">
                  <p className="mb-2">$ fusion-fly --help</p>
                  <p className="text-gray-400">Usage: fusion-fly [options] [command]</p>
                  <p className="text-gray-400 mb-1">Options:</p>
                  <p className="text-gray-400">-v, --version                output the version number</p>
                  <p className="text-gray-400">-h, --help                   display help for command</p>
                  <p className="text-gray-400 mb-1">Commands:</p>
                  <p className="text-green-400">process &lt;input&gt; [options]   Process GNSS/IMU data</p>
                  <p className="text-green-400">convert &lt;input&gt; [output]    Convert between formats</p>
                  <p className="text-green-400">fuse [inputs...] [options]   Fuse multiple data sources</p>
                  <p className="text-green-400">validate &lt;input&gt;           Validate data format</p>
                  <p className="text-green-400 mb-3">info                        Display system info</p>
                  <p className="text-gray-300">$ _</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 bg-indigo-700 text-white rounded-lg shadow-xl overflow-hidden">
          <div className="px-6 py-12 max-w-7xl mx-auto">
            <div className="text-center">
              <h2 className="text-3xl font-extrabold tracking-tight">Focus on what matters</h2>
              <p className="text-gray-300 dark:text-gray-400 mb-6">FusionFly - An open-source toolkit for GNSS+IMU data fusion with FGO</p>
            </div>
            <div className="mt-10">
              <div className="flex flex-wrap justify-center space-y-4 sm:space-y-0 sm:space-x-6 text-center">
                <div className="bg-indigo-800 bg-opacity-50 px-6 py-4 rounded-lg text-white max-w-xs">
                  <div className="flex justify-center">
                    <svg className="h-10 w-10 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h3 className="mt-2 text-lg font-medium">Reliable</h3>
                  <p className="mt-1 text-sm text-indigo-200">Robust processing with error detection and validation at every step.</p>
                </div>
                <div className="bg-indigo-800 bg-opacity-50 px-6 py-4 rounded-lg text-white max-w-xs">
                  <div className="flex justify-center">
                    <svg className="h-10 w-10 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="mt-2 text-lg font-medium">Fast</h3>
                  <p className="mt-1 text-sm text-indigo-200">Optimized algorithms and parallel processing for quick results.</p>
                </div>
                <div className="bg-indigo-800 bg-opacity-50 px-6 py-4 rounded-lg text-white max-w-xs">
                  <div className="flex justify-center">
                    <svg className="h-10 w-10 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <h3 className="mt-2 text-lg font-medium">Open</h3>
                  <p className="mt-1 text-sm text-indigo-200">Open-source, extensible architecture with well-documented APIs.</p>
                </div>
              </div>
            </div>
            <div className="mt-10 text-center">
              <p className="text-primary-100">Unlock precision positioning with GNSS+IMU fusion.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home; 