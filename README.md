# FusionFly - GNSS+IMU Data Processing Application

FusionFly is a web application that processes GNSS and IMU data files, allowing for file format conversion, visualization, and factor graph optimization (FGO).

## Project Structure

- `frontend/`: React application built with Tailwind CSS
- `backend/`: Express.js server with TypeScript
- Cosmos DB for user management
- Azure Blob Storage for file storage

## Deployment to Vercel

### Prerequisites

1. Azure Cosmos DB account
2. Azure Blob Storage account
3. Vercel account linked to your GitHub
4. (Optional) Azure OpenAI API for advanced parsing

### Backend Deployment

1. Clone the repository to your own GitHub account
2. Import the project in Vercel Dashboard
3. Configure environment variables:
   - All variables from `.env.example`
   - Set `USE_LOCAL_DB_FALLBACK=false` for production
   - Add your Cosmos DB, Blob Storage credentials
4. Deploy the backend service

### Frontend Deployment

1. Update `frontend/.env.production` with your backend URL
2. Import the frontend project in Vercel Dashboard
3. Deploy the frontend application

### Post-Deployment Steps

1. Create containers in Azure Blob Storage:
   - `uploads`
   - `processed`
   - `results`

2. Initialize Cosmos DB:
   - The application will automatically create the database and containers on first run
   - No manual initialization is required

## Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm run install:all
   ```
3. Copy `.env.example` to `.env` in the backend directory
4. Start the development server:
   ```bash
   npm run dev
   ```

## Environment Configuration

See `backend/.env.example` for required environment variables.

## Features

- Multi-format GNSS data processing (RINEX, NMEA, UBX)
- File conversion to standardized JSONL
- User authentication and file management
- AI-assisted parsing for complex formats
- Schema conversion and validation
- File upload, download, and listing functionality

## Troubleshooting

- If file uploads fail, check your Blob Storage connection string
- For authentication issues, verify your JWT secret
- If you encounter Cosmos DB errors, ensure your endpoint and key are correct
