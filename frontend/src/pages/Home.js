import React from 'react';
import { Link } from 'react-router-dom';

function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="pt-20 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-5xl font-light tracking-tight text-gray-900 sm:text-6xl md:text-7xl mb-4">
            Fusion<span className="font-medium text-primary-600">Fly</span>
          </h1>
          <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
            Precision GNSS+IMU data fusion with Factor Graph Optimization
          </p>
          <div className="mt-10">
            <Link
              to="/upload"
              className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-full text-white bg-primary-600 hover:bg-primary-700 shadow-sm hover:shadow transition-all duration-300 md:py-4 md:text-lg md:px-10"
            >
              Get Started
            </Link>
            <a
              href="https://github.com/Thorkee/LLMFGO"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-4 inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-full text-primary-700 bg-white hover:bg-gray-100 shadow-sm hover:shadow transition-all duration-300 md:py-4 md:text-lg md:px-10"
            >
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              GitHub
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-light tracking-tight text-gray-900">
              Advanced positioning technology, <span className="font-medium">simplified</span>
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-500">
              From complex sensor data to precision navigation in minutes
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {/* Feature 1 */}
            <div className="flex flex-col items-center text-center">
              <div className="flex items-center justify-center h-16 w-16 rounded-full bg-primary-100 text-primary-600 mb-4">
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                </svg>
              </div>
              <h3 className="text-xl font-medium text-gray-900 mb-2">Multi-Format Support</h3>
              <p className="text-gray-500">
                Process RINEX, NMEA, UBX and custom formats with automatic detection
              </p>
            </div>

            {/* Feature 2 */}
            <div className="flex flex-col items-center text-center">
              <div className="flex items-center justify-center h-16 w-16 rounded-full bg-primary-100 text-primary-600 mb-4">
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-medium text-gray-900 mb-2">Accelerated Processing</h3>
              <p className="text-gray-500">
                Optimized algorithms deliver fast results even with large datasets
              </p>
            </div>

            {/* Feature 3 */}
            <div className="flex flex-col items-center text-center">
              <div className="flex items-center justify-center h-16 w-16 rounded-full bg-primary-100 text-primary-600 mb-4">
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-xl font-medium text-gray-900 mb-2">Factor Graph Optimization</h3>
              <p className="text-gray-500">
                Advanced sensor fusion for superior positioning accuracy
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Terminal Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gray-900 rounded-xl shadow-xl overflow-hidden">
            <div className="p-2 bg-gray-800 border-b border-gray-700">
              <div className="flex items-center">
                <div className="flex space-x-1.5">
                  <div className="h-3 w-3 bg-red-500 rounded-full"></div>
                  <div className="h-3 w-3 bg-yellow-500 rounded-full"></div>
                  <div className="h-3 w-3 bg-green-500 rounded-full"></div>
                </div>
                <div className="ml-3 text-xs text-gray-400 font-mono">fusion-fly ~ terminal</div>
              </div>
            </div>
            <div className="p-4 font-mono text-sm text-gray-300 overflow-x-auto">
              <p className="mb-2"><span className="text-green-400">user@fusionfly</span>:<span className="text-blue-400">~</span>$ fusion-fly --help</p>
              <p className="text-gray-400 mb-1">Usage: fusion-fly [options] [command]</p>
              <p className="text-gray-400 mb-1">Options:</p>
              <p className="text-gray-400">  -v, --version                output the version number</p>
              <p className="text-gray-400">  -h, --help                   display help for command</p>
              <p className="text-gray-400 mb-1">Commands:</p>
              <p className="text-green-400">  process &lt;input&gt; [options]   Process GNSS/IMU data</p>
              <p className="text-green-400">  convert &lt;input&gt; [output]    Convert between formats</p>
              <p className="text-green-400">  fuse [inputs...] [options]   Fuse multiple data sources</p>
              <p className="text-green-400">  validate &lt;input&gt;           Validate data format</p>
              <p className="text-green-400 mb-3">  info                        Display system info</p>
              <p className="mb-2"><span className="text-green-400">user@fusionfly</span>:<span className="text-blue-400">~</span>$ fusion-fly process sample.rnx --imu sample.imu</p>
              <p className="text-blue-300">[INFO] Processing RINEX observation file</p>
              <p className="text-blue-300">[INFO] Detected IMU data format: JSON</p>
              <p className="text-blue-300">[INFO] Applying Factor Graph Optimization</p>
              <p className="text-green-300">[SUCCESS] Processing complete</p>
              <p className="text-green-300">[SUCCESS] Results saved to ./output/fusionfly_results.jsonl</p>
              <p><span className="text-green-400">user@fusionfly</span>:<span className="text-blue-400">~</span>$ _</p>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-16 bg-gradient-to-r from-primary-600 to-primary-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-medium text-white mb-4">
            Ready to transform your positioning data?
          </h2>
          <p className="text-xl text-primary-100 mb-8">
            Upload your files and experience the difference
          </p>
          <Link
            to="/upload"
            className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-full text-primary-700 bg-white hover:bg-gray-100 shadow-sm hover:shadow transition-all duration-300 md:py-4 md:text-lg md:px-10"
          >
            Start Processing
          </Link>
        </div>
      </section>
    </div>
  );
}

export default Home; 