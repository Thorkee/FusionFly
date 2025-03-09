#!/bin/bash

# Azure deployment script for FusionFly project
# This script helps deploy both backend and frontend to Azure

echo "=== FusionFly Azure Deployment Helper ==="
echo "This script will help you deploy your application to Azure"

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
backend_app_name="fusionfly-api"
frontend_app_name="fusionfly-web"
backend_plan_name="fusionfly-apiplan"
frontend_plan_name="fusionfly-webplan"

# Ask user if they want to use these names or provide custom ones
echo ""
echo "Default deployment configuration:"
echo "Resource Group: $resource_group"
echo "Location: $location"
echo "Backend App Name: $backend_app_name"
echo "Frontend App Name: $frontend_app_name"

read -p "Do you want to use these default names? (y/n): " use_defaults

if [ "$use_defaults" != "y" ]; then
    read -p "Resource Group name: " resource_group
    read -p "Location: " location
    read -p "Backend App Name: " backend_app_name
    read -p "Frontend App Name: " frontend_app_name
    backend_plan_name="${backend_app_name}-plan"
    frontend_plan_name="${frontend_app_name}-plan"
fi

# Create Resource Group if it doesn't exist
echo "Creating Resource Group if it doesn't exist..."
az group create --name $resource_group --location $location

# Deploy Backend
echo ""
echo "=== Deploying Backend to Azure App Service ==="

# Create App Service Plan for backend
echo "Creating App Service Plan for backend..."
az appservice plan create --name $backend_plan_name --resource-group $resource_group --sku B1 --is-linux

# Create Web App for backend
echo "Creating Web App for backend..."
az webapp create --name $backend_app_name --resource-group $resource_group --plan $backend_plan_name --runtime "NODE:18-lts"

# Set environment variables from .env file
echo "Setting environment variables for backend..."
while IFS= read -r line; do
    # Skip comments and empty lines
    [[ $line =~ ^#.*$ ]] && continue
    [[ -z $line ]] && continue
    
    # Extract key and value
    key=$(echo $line | cut -d= -f1)
    value=$(echo $line | cut -d= -f2-)
    
    # Set environment variable in Azure
    echo "Setting $key"
    az webapp config appsettings set --name $backend_app_name --resource-group $resource_group --settings "$key=$value" > /dev/null
done < backend/.env

# Deploy code
echo "Deploying backend code..."
cd backend
zip -r ../backend-deploy.zip . -x "node_modules/*" "uploads/*" "processed/*" "*.log"
cd ..
az webapp deployment source config-zip --resource-group $resource_group --name $backend_app_name --src backend-deploy.zip

# Get the API URL
api_url=$(az webapp show --name $backend_app_name --resource-group $resource_group --query defaultHostName -o tsv)
api_url="https://$api_url"
echo "Backend deployed to: $api_url"

# Deploy Frontend
echo ""
echo "=== Deploying Frontend to Azure Static Web Apps ==="

# Update the API URL in the frontend environment
echo "Updating frontend API URL to point to deployed backend..."
echo "REACT_APP_API_URL=$api_url" > frontend/.env.production

# Build the frontend
echo "Building frontend..."
cd frontend
npm install
npm run build
cd ..

# Deploy to Static Web Apps
echo "Creating and deploying Static Web App..."
az staticwebapp create --name $frontend_app_name --resource-group $resource_group --location $location --source . --app-location frontend --output-location build --login-with-github

echo ""
echo "=== Deployment Summary ==="
echo "Backend API: $api_url"
echo "Frontend: https://$frontend_app_name.azurestaticapps.net"
echo ""
echo "Note: Static Web App deployment requires GitHub authentication and might take some time to complete."
echo "Check the Azure Portal for deployment status and the exact frontend URL."

# Cleanup
echo "Cleaning up temporary files..."
rm backend-deploy.zip

echo "Deployment process completed!" 