#!/bin/bash

# Azure deployment script for FusionFly - All-in-One approach
# This script deploys both frontend and backend as a single application

echo "=== FusionFly Azure All-in-One Deployment Helper ==="
echo "This script will deploy your entire application to a single Azure App Service"

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "Azure CLI not found. Please install it first:"
    echo "https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if logged in to Azure
az account show &> /dev/null
if [ $? -ne 0 ]; then
    echo "You need to log in to Azure first"
    az login
fi

# Set variables
resource_group="FusionFlyRG"
location="eastus"
app_name="fusionfly-app"
plan_name="fusionfly-plan"

# Ask user if they want to use these names or provide custom ones
echo ""
echo "Default deployment configuration:"
echo "Resource Group: $resource_group"
echo "Location: $location"
echo "App Name: $app_name"

read -p "Do you want to use these default names? (y/n): " use_defaults

if [ "$use_defaults" != "y" ]; then
    read -p "Resource Group name: " resource_group
    read -p "Location: " location
    read -p "App Name: " app_name
    plan_name="${app_name}-plan"
fi

# Create Resource Group if it doesn't exist
echo "Creating Resource Group if it doesn't exist..."
az group create --name $resource_group --location $location

# Create App Service Plan
echo "Creating App Service Plan..."
az appservice plan create --name $plan_name --resource-group $resource_group --sku B1 --is-linux

# Create Web App
echo "Creating Web App..."
az webapp create --name $app_name --resource-group $resource_group --plan $plan_name --runtime "NODE:18-lts"

# Set environment variables from .env file
echo "Setting environment variables..."
az webapp config appsettings set --name $app_name --resource-group $resource_group --settings "NODE_ENV=production" "PORT=8000" > /dev/null

# Check if .env file exists
if [ -f backend/.env ]; then
    while IFS= read -r line; do
        # Skip comments and empty lines
        [[ $line =~ ^#.*$ ]] && continue
        [[ -z $line ]] && continue
        
        # Extract key and value
        key=$(echo $line | cut -d= -f1)
        value=$(echo $line | cut -d= -f2-)
        
        # Set environment variable in Azure
        echo "Setting $key"
        az webapp config appsettings set --name $app_name --resource-group $resource_group --settings "$key=$value" > /dev/null
    done < backend/.env
else
    echo "Warning: .env file not found. Using default environment variables."
    # Set fallback environment values
    az webapp config appsettings set --name $app_name --resource-group $resource_group --settings "USE_LOCAL_DB_FALLBACK=true" > /dev/null
fi

# Build the backend
echo "Building backend..."
cd backend
npm install
npm run build
if [ $? -ne 0 ]; then
    echo "Backend build failed. Check for TypeScript errors."
    exit 1
fi
cd ..

# Build the frontend
echo "Building frontend..."
cd frontend
npm install
npm run build
if [ $? -ne 0 ]; then
    echo "Frontend build failed."
    exit 1
fi
cd ..

# Prepare deployment package
echo "Preparing deployment package..."
mkdir -p deployment
mkdir -p deployment/uploads
mkdir -p deployment/results
mkdir -p deployment/localdb

# Copy backend files
cp -r backend/dist deployment/
cp -r backend/*.js deployment/
cp -r backend/package*.json deployment/

# Add placeholder for users.json if needed
if [ ! -f backend/localdb/users.json ]; then
    echo '{"users":[]}' > deployment/localdb/users.json
fi

# Copy frontend build files
mkdir -p deployment/frontend
cp -r frontend/build/* deployment/frontend/

# Ensure web.config is properly included
if [ ! -f backend/web.config ]; then
    echo "web.config not found in backend. This is needed for Azure App Service."
    echo "Creating default web.config..."
    
    cat > deployment/web.config << EOF
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <webSocket enabled="false" />
    <handlers>
      <add name="iisnode" path="server.js" verb="*" modules="iisnode" />
    </handlers>
    <rewrite>
      <rules>
        <!-- First allow requests to the API directly -->
        <rule name="API" patternSyntax="ECMAScript">
          <match url="api/(.*)" />
          <action type="Rewrite" url="server.js" />
        </rule>
        
        <!-- For uploads and direct server access -->
        <rule name="StaticContent">
          <action type="Rewrite" url="{REQUEST_URI}" />
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" pattern="" />
          </conditions>
        </rule>

        <!-- All other requests go to Node.js server -->
        <rule name="DynamicContent">
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="True" />
          </conditions>
          <action type="Rewrite" url="server.js" />
        </rule>
      </rules>
    </rewrite>
    <iisnode
      nodeProcessCommandLine="node"
      watchedFiles="*.js;iisnode.yml"
      loggingEnabled="true"
      logDirectory="iisnode"
      debuggingEnabled="true"
      maxNamedPipeConnectionRetry="3"
      namedPipeConnectionRetryDelay="2000" />
    <security>
      <requestFiltering>
        <hiddenSegments>
          <add segment="node_modules" />
        </hiddenSegments>
      </requestFiltering>
    </security>
    <httpErrors existingResponse="PassThrough" />
  </system.webServer>
</configuration>
EOF
else
    cp backend/web.config deployment/
fi

# Create package.json for deployment if not included
if [ ! -f deployment/package.json ]; then
    echo "Creating package.json for deployment..."
    cat > deployment/package.json << EOF
{
  "name": "fusionfly-app",
  "version": "1.0.0",
  "description": "FusionFly GNSS+IMU Data Processing",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "engines": {
    "node": ">=18.x"
  }
}
EOF
fi

# Create zip package
echo "Creating deployment package..."
cd deployment
zip -r ../deployment.zip . -x "node_modules/*" "*.log"
cd ..

# Deploy code
echo "Deploying code..."
az webapp deployment source config-zip --resource-group $resource_group --name $app_name --src deployment.zip

# Turn on logging
echo "Enabling detailed logging..."
az webapp log config --name $app_name --resource-group $resource_group --application-logging filesystem --detailed-error-messages true --failed-request-tracing true --web-server-logging filesystem

# Get the application URL
app_url=$(az webapp show --name $app_name --resource-group $resource_group --query defaultHostName -o tsv)
app_url="https://$app_url"

echo ""
echo "=== Deployment Summary ==="
echo "Your application is deployed to: $app_url"
echo "API endpoints are accessible at: $app_url/api/*"
echo ""
echo "Note: It may take a few minutes for the application to fully start up."

# Restart the app to ensure all settings are applied
echo "Restarting the app to apply all settings..."
az webapp restart --name $app_name --resource-group $resource_group

# View logs
echo "Viewing logs to check for startup issues (press Ctrl+C to exit)..."
az webapp log tail --name $app_name --resource-group $resource_group

# Cleanup
echo "Cleaning up temporary files..."
rm -rf deployment
rm deployment.zip

echo "Deployment process completed!" 