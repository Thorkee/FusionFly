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
az webapp config appsettings set --name $app_name --resource-group $resource_group --settings "NODE_ENV=production" > /dev/null

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

# Build the frontend
echo "Building frontend..."
cd frontend
npm install
npm run build
cd ..

# Prepare deployment package
echo "Preparing deployment package..."
mkdir -p deployment
cp -r backend/* deployment/
mkdir -p deployment/frontend
cp -r frontend/build deployment/frontend/

# Create zip package
echo "Creating deployment package..."
cd deployment
zip -r ../deployment.zip . -x "node_modules/*" "uploads/*" "processed/*" "*.log"
cd ..

# Deploy code
echo "Deploying code..."
az webapp deployment source config-zip --resource-group $resource_group --name $app_name --src deployment.zip

# Get the application URL
app_url=$(az webapp show --name $app_name --resource-group $resource_group --query defaultHostName -o tsv)
app_url="https://$app_url"

echo ""
echo "=== Deployment Summary ==="
echo "Your application is deployed to: $app_url"
echo "API endpoints are accessible at: $app_url/api/*"
echo ""
echo "Note: It may take a few minutes for the application to fully start up."

# Cleanup
echo "Cleaning up temporary files..."
rm -rf deployment
rm deployment.zip

echo "Deployment process completed!" 