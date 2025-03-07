import React from 'react';
import { Link } from 'react-router-dom';

function Home() {
  return (
    <div className="py-6">
      {/* Hero Section */}
      <div className="mb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-blue-500">
          FusionAgent
        </h1>
        <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto mb-8">
          An open-source toolkit for fusing GNSS and IMU data with Factor Graph Optimization (FGO)
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link 
            to="/upload" 
            className="btn btn-primary flex items-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 8L12 3L7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Upload Data
          </Link>
          <Link 
            to="/files" 
            className="btn btn-secondary flex items-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22 19C22 19.5304 21.7893 20.0391 21.4142 20.4142C21.0391 20.7893 20.5304 21 20 21H4C3.46957 21 2.96086 20.7893 2.58579 20.4142C2.21071 20.0391 2 19.5304 2 19V5C2 4.46957 2.21071 3.96086 2.58579 3.58579C2.96086 3.21071 3.46957 3 4 3H9L11 6H20C20.5304 6 21.0391 6.21071 21.4142 6.58579C21.7893 6.96086 22 7.46957 22 8V19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Browse Results
          </Link>
        </div>
      </div>
      
      {/* Terminal-like Feature Overview */}
      <div className="max-w-4xl mx-auto mb-16">
        <div className="card overflow-hidden">
          <div className="bg-gray-900 dark:bg-black p-3 flex items-center">
            <div className="flex space-x-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
            <div className="ml-4 text-white text-sm font-mono">fusion-agent</div>
          </div>
          <div className="bg-gray-800 dark:bg-black p-6 font-mono text-sm text-green-400 overflow-x-auto">
            <p className="mb-2">$ fusion-agent --help</p>
            <p className="text-gray-300 dark:text-gray-400 mb-6">FusionAgent - An open-source toolkit for GNSS+IMU data fusion with FGO</p>
            
            <p className="mb-1">Supported sensor types:</p>
            <ul className="mb-3 pl-4">
              <li>• GNSS: RINEX, NMEA, UBX, JSON</li>
              <li>• IMU: Raw IMU data, CSV, JSON</li>
              <li>• Wheel odometry (optional)</li>
              <li>• Camera data (future support)</li>
            </ul>
            
            <p className="mb-1">Processing pipeline:</p>
            <ul className="mb-3 pl-4">
              <li>• Data synchronization</li>
              <li>• Factor Graph construction</li>
              <li>• FGO optimization</li>
              <li>• Trajectory output</li>
            </ul>
            
            <p className="mt-4 animate-pulse">$ _</p>
          </div>
        </div>
      </div>
      
      {/* Features Grid */}
      <div className="mb-16">
        <h2 className="text-2xl font-bold text-center mb-8 text-gray-800 dark:text-dark-text">Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* Feature 1 */}
          <div className="card p-6 hover:shadow-md dark:shadow-primary-900/10">
            <div className="rounded-full bg-primary-100 dark:bg-primary-900/30 w-12 h-12 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 16.5L12 21.5L17 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 12.5V21.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M20.39 18.39C21.3653 17.8583 22.1358 17.0169 22.5799 15.9986C23.0239 14.9804 23.1162 13.8432 22.8422 12.7667C22.5682 11.6901 21.9435 10.7355 21.0667 10.0534C20.1899 9.37138 19.1109 9.00073 18 9.00001H16.74C16.4373 7.82926 15.8731 6.74235 15.09 5.82101C14.3069 4.89967 13.3249 4.16785 12.2181 3.68061C11.1114 3.19337 9.90856 2.96583 8.70012 3.01435C7.49169 3.06288 6.31379 3.38535 5.24149 3.95814C4.16918 4.53093 3.23165 5.33818 2.49978 6.32357C1.7679 7.30896 1.26019 8.4489 1.01531 9.6614C0.770428 10.8739 0.795033 12.1272 1.08701 13.3272C1.37898 14.5272 1.92737 15.6438 2.69 16.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="font-semibold text-lg mb-2 text-gray-800 dark:text-dark-text">Multi-Sensor Fusion</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Seamlessly fuse GNSS and IMU data to provide more accurate positioning, even in challenging environments with poor GNSS signal.
            </p>
          </div>
          
          {/* Feature 2 */}
          <div className="card p-6 hover:shadow-md dark:shadow-primary-900/10">
            <div className="rounded-full bg-primary-100 dark:bg-primary-900/30 w-12 h-12 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 9V5C14 4.46957 13.7893 3.96086 13.4142 3.58579C13.0391 3.21071 12.5304 3 12 3H5C4.46957 3 3.96086 3.21071 3.58579 3.58579C3.21071 3.96086 3 4.46957 3 5V19C3 19.5304 3.21071 20.0391 3.58579 20.4142C3.96086 20.7893 4.46957 21 5 21H12C12.5304 21 13.0391 20.7893 13.4142 20.4142C13.7893 20.0391 14 19.5304 14 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 13L20 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M17 10L20 13L17 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="font-semibold text-lg mb-2 text-gray-800 dark:text-dark-text">Factor Graph Optimization</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Leverages FGO to create a globally consistent trajectory by optimizing over all available measurements and constraints.
            </p>
          </div>
          
          {/* Feature 3 */}
          <div className="card p-6 hover:shadow-md dark:shadow-primary-900/10">
            <div className="rounded-full bg-primary-100 dark:bg-primary-900/30 w-12 h-12 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 11L12 14L22 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 12V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="font-semibold text-lg mb-2 text-gray-800 dark:text-dark-text">Advanced Analysis</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Generate accurate trajectories, uncertainty estimates, and performance metrics for navigation and mapping applications.
            </p>
          </div>
        </div>
      </div>
      
      {/* Process Flow */}
      <div className="mb-12 max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-8 text-gray-800 dark:text-dark-text">How It Works</h2>
        <div className="relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-1/2 left-0 right-0 h-0.5 bg-gray-200 dark:bg-dark-border -translate-y-1/2 z-0"></div>
          
          {/* Steps */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative z-10">
            <div className="flex flex-col items-center text-center">
              <div className="bg-white dark:bg-dark-surface rounded-full w-12 h-12 flex items-center justify-center border-2 border-primary-500 mb-4 shadow-md shadow-primary-100 dark:shadow-primary-900/20">
                <span className="text-primary-600 font-bold">1</span>
              </div>
              <h3 className="font-medium mb-1 text-gray-800 dark:text-dark-text">Upload</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Upload GNSS and IMU data files</p>
            </div>
            
            <div className="flex flex-col items-center text-center">
              <div className="bg-white dark:bg-dark-surface rounded-full w-12 h-12 flex items-center justify-center border-2 border-primary-500 mb-4 shadow-md shadow-primary-100 dark:shadow-primary-900/20">
                <span className="text-primary-600 font-bold">2</span>
              </div>
              <h3 className="font-medium mb-1 text-gray-800 dark:text-dark-text">Preprocess</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Synchronize and prepare data</p>
            </div>
            
            <div className="flex flex-col items-center text-center">
              <div className="bg-white dark:bg-dark-surface rounded-full w-12 h-12 flex items-center justify-center border-2 border-primary-500 mb-4 shadow-md shadow-primary-100 dark:shadow-primary-900/20">
                <span className="text-primary-600 font-bold">3</span>
              </div>
              <h3 className="font-medium mb-1 text-gray-800 dark:text-dark-text">Optimize</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Run Factor Graph Optimization</p>
            </div>
            
            <div className="flex flex-col items-center text-center">
              <div className="bg-white dark:bg-dark-surface rounded-full w-12 h-12 flex items-center justify-center border-2 border-primary-500 mb-4 shadow-md shadow-primary-100 dark:shadow-primary-900/20">
                <span className="text-primary-600 font-bold">4</span>
              </div>
              <h3 className="font-medium mb-1 text-gray-800 dark:text-dark-text">Visualize</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Analyze trajectory and results</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Floating CTA */}
      <div className="bg-gradient-to-r from-primary-600 to-blue-600 rounded-lg p-6 text-white max-w-3xl mx-auto shadow-lg shadow-primary-100 dark:shadow-none">
        <div className="flex flex-col md:flex-row items-center justify-between">
          <div className="mb-4 md:mb-0">
            <h3 className="text-xl font-semibold mb-2">Ready to fuse your sensor data?</h3>
            <p className="text-primary-100">Unlock precision positioning with GNSS+IMU fusion.</p>
          </div>
          <Link 
            to="/upload" 
            className="bg-white text-primary-700 hover:bg-primary-50 px-6 py-2 rounded-md font-semibold transition-colors whitespace-nowrap flex items-center gap-2"
          >
            Start Processing
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 5L19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Home; 