import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileProcessingService } from '../services/fileProcessingService';
import { blobStorageService } from '../services/blobStorageService';

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
          blobStorageService.containers.uploads
        );
      }
      
      if (imuFile) {
        imuFileUrl = await blobStorageService.uploadFile(
          imuFile.path,
          imuFile.filename,
          blobStorageService.containers.uploads
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
      
      // Try to find the file in each container
      let containerName;
      
      // Check if file exists in any container and stream it
      try {
        console.log(`Attempting to download file: ${filename} from uploads container`);
        await blobStorageService.streamToResponse(filename, res, blobStorageService.containers.uploads);
        return;
      } catch (error) {
        console.log(`File ${filename} not found in uploads container, trying processed container...`);
      }
      
      try {
        console.log(`Attempting to download file: ${filename} from processed container`);
        await blobStorageService.streamToResponse(filename, res, blobStorageService.containers.processed);
        return;
      } catch (error) {
        console.log(`File ${filename} not found in processed container, trying results container...`);
      }
      
      try {
        console.log(`Attempting to download file: ${filename} from results container`);
        await blobStorageService.streamToResponse(filename, res, blobStorageService.containers.results);
        return;
      } catch (error) {
        // If we get here, the file wasn't found in any container
        console.log(`File ${filename} not found in any container`);
        
        // Try local filesystem as fallback
        const uploadsDir = path.resolve(__dirname, '../../uploads');
        const filePath = path.join(uploadsDir, filename);
        
        if (fs.existsSync(filePath)) {
          console.log(`File found in local filesystem: ${filePath}`);
          return res.download(filePath);
        }
        
        // File not found anywhere
        return res.status(404).json({ error: 'File not found' });
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
        blobStorageService.listFiles(blobStorageService.containers.uploads),
        blobStorageService.listFiles(blobStorageService.containers.processed),
        blobStorageService.listFiles(blobStorageService.containers.results)
      ]);
      
      // Combine files from all containers
      const combinedFiles = [
        ...uploadFiles.map(file => ({
          ...file,
          filename: file.name,
          container: blobStorageService.containers.uploads,
          size: file.properties.contentLength || 0,
          createdAt: file.properties.createdOn || new Date()
        })),
        ...processedFiles.map(file => ({
          ...file,
          filename: file.name,
          container: blobStorageService.containers.processed,
          size: file.properties.contentLength || 0,
          createdAt: file.properties.createdOn || new Date()
        })),
        ...resultFiles.map(file => ({
          ...file,
          filename: file.name,
          container: blobStorageService.containers.results,
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
        blobStorageService.clearContainer(blobStorageService.containers.uploads),
        blobStorageService.clearContainer(blobStorageService.containers.processed),
        blobStorageService.clearContainer(blobStorageService.containers.results)
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