#!/bin/sh

# Ensure we are in the frontend directory
cd "$(dirname "$0")"

# Install dependencies
npm install

# Build the React app
npm run build

# Verify build directory exists
if [ -d "build" ]; then
  echo "✅ Build directory created successfully"
else
  echo "❌ Build directory not found - build may have failed"
  exit 1
fi

# List contents of build directory
echo "Contents of build directory:"
ls -la build/

exit 0 