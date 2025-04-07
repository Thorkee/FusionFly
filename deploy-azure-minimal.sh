#!/bin/bash

# Simplified Azure deployment script for FusionFly
# This script deploys a minimal diagnostic version to Azure App Service

echo "=== FusionFly Azure Minimal Deployment Helper ==="
echo "This script will deploy a minimal diagnostic version to Azure App Service"

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

# Create App Service Plan if it doesn't exist
echo "Creating App Service Plan if it doesn't exist..."
az appservice plan create --name $plan_name --resource-group $resource_group --sku B1 --is-linux || true

# Create Web App if it doesn't exist
echo "Creating Web App if it doesn't exist..."
az webapp create --name $app_name --resource-group $resource_group --plan $plan_name --runtime "NODE:18-lts" || true

# Set environment variables
echo "Setting environment variables..."
az webapp config appsettings set --name $app_name --resource-group $resource_group --settings "NODE_ENV=production" "PORT=8000" "WEBSITE_NODE_DEFAULT_VERSION=~18" > /dev/null

# Prepare deployment package
echo "Preparing deployment package..."
mkdir -p minimal-deployment

# Copy files to deployment directory
cp backend/azure-server.js minimal-deployment/
cp backend/azure-package.json minimal-deployment/package.json

# Create web.config for Azure App Service
echo "Creating web.config..."
cat > minimal-deployment/web.config << EOF
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <webSocket enabled="false" />
    <handlers>
      <add name="iisnode" path="azure-server.js" verb="*" modules="iisnode" />
    </handlers>
    <rewrite>
      <rules>
        <rule name="StaticContent">
          <action type="Rewrite" url="{REQUEST_URI}" />
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" />
          </conditions>
        </rule>
        <rule name="DynamicContent">
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="True" />
          </conditions>
          <action type="Rewrite" url="azure-server.js" />
        </rule>
      </rules>
    </rewrite>
    <iisnode
      nodeProcessCommandLine="node"
      watchedFiles="*.js;web.config"
      loggingEnabled="true"
      logDirectory="iisnode"
      debuggingEnabled="true" />
  </system.webServer>
</configuration>
EOF

# Create zip package
echo "Creating deployment package..."
cd minimal-deployment
zip -r ../minimal-deployment.zip .
cd ..

# Deploy code
echo "Deploying minimal diagnostic version..."
az webapp deployment source config-zip --resource-group $resource_group --name $app_name --src minimal-deployment.zip

# Configure logging
echo "Enabling detailed logging..."
az webapp log config --name $app_name --resource-group $resource_group --application-logging filesystem --level verbose --detailed-error-messages true --failed-request-tracing true --web-server-logging filesystem

# Configure health check
echo "Configuring health check..."
az webapp config set --name $app_name --resource-group $resource_group --generic-configurations '{"healthCheckPath": "/api/health"}' || true

# Configure scaling
echo "Configuring scaling options..."
az webapp scale --name $app_name --resource-group $resource_group --instance-count 2 || true

# Get the application URL
app_url=$(az webapp show --name $app_name --resource-group $resource_group --query defaultHostName -o tsv)
app_url="https://$app_url"

echo ""
echo "=== Deployment Summary ==="
echo "Your minimal diagnostic version is deployed to: $app_url"
echo "Health check endpoint: $app_url/api/health"
echo ""
echo "Note: It may take a few minutes for the application to fully start up."

# Restart the app to ensure all settings are applied
echo "Restarting the app to apply all settings..."
az webapp restart --name $app_name --resource-group $resource_group

# Clean up
echo "Cleaning up temporary files..."
rm -rf minimal-deployment
rm minimal-deployment.zip

echo "Deployment completed!"
echo "After confirming the minimal version works, you can deploy the full application." 