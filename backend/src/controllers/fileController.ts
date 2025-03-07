import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileProcessingService } from '../services/fileProcessingService';

export const fileController = {
  // Upload a file and start processing
  uploadFile: async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { originalname, filename, path: filePath } = req.file;
      
      // Start processing the file
      const jobId = await fileProcessingService.processFile(filePath, originalname);
      
      res.status(200).json({
        message: 'File uploaded successfully',
        jobId,
        filename,
        originalname
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ error: 'Failed to upload file' });
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
  }
}; 