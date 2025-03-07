import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileProcessingService } from '../services/fileProcessingService';

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
      
      // Start processing the file(s)
      const jobId = await fileProcessingService.processFiles({
        gnssFile: gnssFile ? {
          originalname: gnssFile.originalname,
          filename: gnssFile.filename,
          path: gnssFile.path
        } : undefined,
        imuFile: imuFile ? {
          originalname: imuFile.originalname,
          filename: imuFile.filename,
          path: imuFile.path
        } : undefined
      });
      
      res.status(200).json({
        message: 'Files uploaded successfully',
        jobId,
        gnssFile: gnssFile ? {
          filename: gnssFile.filename,
          originalname: gnssFile.originalname
        } : null,
        imuFile: imuFile ? {
          filename: imuFile.filename,
          originalname: imuFile.originalname
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
  downloadFile: (req: Request, res: Response) => {
    try {
      const { filename } = req.params;
      const filePath = path.join(__dirname, '../../uploads', filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      res.download(filePath);
    } catch (error) {
      console.error('Error downloading file:', error);
      res.status(500).json({ error: 'Failed to download file' });
    }
  },

  // List all files in the uploads directory
  listFiles: (req: Request, res: Response) => {
    try {
      const uploadsDir = path.join(__dirname, '../../uploads');
      
      // Create the directory if it doesn't exist
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      const files = fs.readdirSync(uploadsDir)
        .filter(file => !file.startsWith('.')) // Filter out hidden files
        .map(file => {
          const filePath = path.join(uploadsDir, file);
          const stats = fs.statSync(filePath);
          return {
            filename: file,
            size: stats.size,
            createdAt: stats.birthtime
          };
        });
      
      res.status(200).json(files);
    } catch (error) {
      console.error('Error listing files:', error);
      res.status(500).json({ error: 'Failed to list files' });
    }
  },
  
  // Clear cache (delete all files in uploads directory)
  clearCache: (req: Request, res: Response) => {
    try {
      const uploadsDir = path.join(__dirname, '../../uploads');
      
      // Check if directory exists
      if (!fs.existsSync(uploadsDir)) {
        return res.status(200).json({ message: 'No cache to clear' });
      }
      
      const files = fs.readdirSync(uploadsDir)
        .filter(file => !file.startsWith('.'));  // Filter out hidden files
      
      // Delete each file
      let deletedCount = 0;
      for (const file of files) {
        const filePath = path.join(uploadsDir, file);
        fs.unlinkSync(filePath);
        deletedCount++;
      }
      
      res.status(200).json({ 
        message: 'Cache cleared successfully', 
        deletedCount 
      });
    } catch (error) {
      console.error('Error clearing cache:', error);
      res.status(500).json({ error: 'Failed to clear cache' });
    }
  }
}; 