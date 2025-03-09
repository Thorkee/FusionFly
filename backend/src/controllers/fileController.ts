import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileProcessingService } from '../services/fileProcessingService';
import * as blobStorageService from '../services/blobStorageService';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get container names from environment variables
const uploadsContainer = process.env.AZURE_STORAGE_CONTAINER_UPLOADS || 'uploads';
const processedContainer = process.env.AZURE_STORAGE_CONTAINER_PROCESSED || 'processed';
const resultsContainer = process.env.AZURE_STORAGE_CONTAINER_RESULTS || 'results';

export const fileController = {
  // Upload files (GNSS and/or IMU) and start processing
  uploadFile: async (req: Request, res: Response) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      if (!files || ((!files.gnssFile || files.gnssFile.length === 0) && 
                   (!files.imuFile || files.imuFile.length === 0))) {
        return res.status(400).json({ error: 'No files uploaded. Please upload at least one GNSS or IMU file.' });
      }

      const gnssFile = files.gnssFile?.[0];
      const imuFile = files.imuFile?.[0];
      
      // Upload files to Azure Blob Storage if they exist
      let gnssFileUrl, imuFileUrl;
      
      if (gnssFile) {
        gnssFileUrl = await blobStorageService.uploadFile(
          gnssFile.path,
          gnssFile.filename,
          uploadsContainer
        );
      }
      
      if (imuFile) {
        imuFileUrl = await blobStorageService.uploadFile(
          imuFile.path,
          imuFile.filename,
          uploadsContainer
        );
      }
      
      // Start processing the file(s)
      const jobId = await fileProcessingService.processFiles({
        gnssFile: gnssFile ? {
          originalname: gnssFile.originalname,
          filename: gnssFile.filename,
          path: gnssFile.path,
          url: gnssFileUrl
        } : undefined,
        imuFile: imuFile ? {
          originalname: imuFile.originalname,
          filename: imuFile.filename,
          path: imuFile.path,
          url: imuFileUrl
        } : undefined
      });
      
      res.status(200).json({
        message: 'Files uploaded successfully',
        jobId,
        gnssFile: gnssFile ? {
          filename: gnssFile.filename,
          originalname: gnssFile.originalname,
          url: gnssFileUrl
        } : null,
        imuFile: imuFile ? {
          filename: imuFile.filename,
          originalname: imuFile.originalname,
          url: imuFileUrl
        } : null
      });
    } catch (error) {
      console.error('Error uploading files:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload files';
      res.status(500).json({ error: errorMessage });
    }
  },

  // Get the status of a processing job
  getProcessingStatus: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const status = await fileProcessingService.getJobStatus(id);
      
      if (!status) {
        return res.status(404).json({ error: 'Job not found' });
      }
      
      res.status(200).json(status);
    } catch (error) {
      console.error('Error getting job status:', error);
      res.status(500).json({ error: 'Failed to get job status' });
    }
  },

  // Download a processed file
  downloadFile: async (req: Request, res: Response) => {
    try {
      const { filename } = req.params;
      
      console.log(`Download request for file: ${filename}`);
      
      // Try to find the file in each container
      let foundFile = false;
      
      // Check if file exists in any container and stream it
      try {
        console.log(`Attempting to download file: ${filename} from uploads container`);
        await blobStorageService.streamToResponse(filename, res, uploadsContainer);
        console.log(`Successfully streamed file: ${filename} from uploads container`);
        foundFile = true;
        return;
      } catch (error) {
        console.log(`File ${filename} not found in uploads container, trying processed container...`);
      }
      
      if (!foundFile) {
        try {
          console.log(`Attempting to download file: ${filename} from processed container`);
          await blobStorageService.streamToResponse(filename, res, processedContainer);
          console.log(`Successfully streamed file: ${filename} from processed container`);
          foundFile = true;
          return;
        } catch (error) {
          console.log(`File ${filename} not found in processed container, trying results container...`);
        }
      }
      
      if (!foundFile) {
        try {
          console.log(`Attempting to download file: ${filename} from results container`);
          await blobStorageService.streamToResponse(filename, res, resultsContainer);
          console.log(`Successfully streamed file: ${filename} from results container`);
          foundFile = true;
          return;
        } catch (error) {
          console.log(`File ${filename} not found in results container either`);
        }
      }
      
      // If we reach here, we couldn't find the file in any container
      if (!foundFile) {
        console.log(`File ${filename} not found in any container`);
        res.status(404).json({ error: `File ${filename} not found` });
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to download file';
      res.status(500).json({ error: errorMessage });
    }
  },

  // List all files in the uploads directory
  listFiles: async (req: Request, res: Response) => {
    try {
      // Get files from all containers
      const [uploadFiles, processedFiles, resultFiles] = await Promise.all([
        blobStorageService.listFiles(uploadsContainer),
        blobStorageService.listFiles(processedContainer),
        blobStorageService.listFiles(resultsContainer)
      ]);
      
      // Combine files from all containers
      const combinedFiles = [
        ...uploadFiles.map(file => ({
          ...file,
          filename: file.name,
          container: uploadsContainer,
          size: file.properties.contentLength || 0,
          createdAt: file.properties.createdOn || new Date()
        })),
        ...processedFiles.map(file => ({
          ...file,
          filename: file.name,
          container: processedContainer,
          size: file.properties.contentLength || 0,
          createdAt: file.properties.createdOn || new Date()
        })),
        ...resultFiles.map(file => ({
          ...file,
          filename: file.name,
          container: resultsContainer,
          size: file.properties.contentLength || 0,
          createdAt: file.properties.createdOn || new Date()
        }))
      ];
      
      res.status(200).json(combinedFiles);
    } catch (error) {
      console.error('Error listing files:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to list files';
      res.status(500).json({ error: errorMessage });
    }
  },
  
  // Clear cache (delete all files)
  clearCache: async (req: Request, res: Response) => {
    try {
      console.log('Clearing cache from all containers');
      
      // Delete all files from all containers
      const [uploadsCount, processedCount, resultsCount] = await Promise.all([
        blobStorageService.clearContainer(uploadsContainer),
        blobStorageService.clearContainer(processedContainer),
        blobStorageService.clearContainer(resultsContainer)
      ]);
      
      const totalCount = uploadsCount + processedCount + resultsCount;
      
      res.status(200).json({ 
        message: 'Cache cleared successfully', 
        deletedCount: totalCount,
        details: {
          uploads: uploadsCount,
          processed: processedCount,
          results: resultsCount
        }
      });
    } catch (error) {
      console.error('Error clearing cache:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: `Failed to clear cache: ${errorMessage}` });
    }
  }
}; 