import React from 'react';

function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border py-6">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center mb-4 md:mb-0">
            <svg 
              className="w-5 h-5 text-primary-600 mr-2" 
              viewBox="0 0 24 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                d="M12 2L2 7L12 12L22 7L12 2Z" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
              <path 
                d="M2 17L12 22L22 17" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
              <path 
                d="M2 12L12 17L22 12" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Fusion<span className="text-primary-600">Fly</span> © {currentYear}
            </span>
          </div>
          
          <div className="flex space-x-6">
            <a 
              href="https://github.com/Thorkee/LLMFGO" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
            </a>
          </div>
        </div>
        
        <div className="mt-6 border-t border-gray-200 dark:border-dark-border pt-4">
          <div className="flex flex-wrap justify-center text-center text-xs text-gray-500 dark:text-gray-400">
            <div className="px-2 py-1">
              <a 
                href="https://www.polyu.edu.hk/aae/ipn-lab/us/index.html" 
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                IPN Lab
              </a>
            </div>
            <div className="px-2 py-1">•</div>
            <div className="px-2 py-1">
              <a 
                href="https://github.com/Thorkee/FusionFly/wiki" 
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                Documentation
              </a>
            </div>
            <div className="px-2 py-1">•</div>
            <div className="px-2 py-1">
              <a 
                href="https://github.com/Thorkee/LLMFGO/issues" 
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                Report Issues
              </a>
            </div>
            <div className="px-2 py-1">•</div>
            <div className="px-2 py-1">
              <a 
                href="https://github.com/Thorkee/FusionFly/wiki/Architecture" 
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                Architecture
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer; 