"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileController = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const fileProcessingService_1 = require("../services/fileProcessingService");
exports.fileController = {
    // Upload a file and start processing
    uploadFile: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }
            const { originalname, filename, path: filePath } = req.file;
            // Start processing the file
            const jobId = yield fileProcessingService_1.fileProcessingService.processFile(filePath, originalname);
            res.status(200).json({
                message: 'File uploaded successfully',
                jobId,
                filename,
                originalname
            });
        }
        catch (error) {
            console.error('Error uploading file:', error);
            res.status(500).json({ error: 'Failed to upload file' });
        }
    }),
    // Get the status of a processing job
    getProcessingStatus: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const status = yield fileProcessingService_1.fileProcessingService.getJobStatus(id);
            if (!status) {
                return res.status(404).json({ error: 'Job not found' });
            }
            res.status(200).json(status);
        }
        catch (error) {
            console.error('Error getting job status:', error);
            res.status(500).json({ error: 'Failed to get job status' });
        }
    }),
    // Download a processed file
    downloadFile: (req, res) => {
        try {
            const { filename } = req.params;
            const filePath = path_1.default.join(__dirname, '../../uploads', filename);
            if (!fs_1.default.existsSync(filePath)) {
                return res.status(404).json({ error: 'File not found' });
            }
            res.download(filePath);
        }
        catch (error) {
            console.error('Error downloading file:', error);
            res.status(500).json({ error: 'Failed to download file' });
        }
    },
    // List all files in the uploads directory
    listFiles: (req, res) => {
        try {
            const uploadsDir = path_1.default.join(__dirname, '../../uploads');
            const files = fs_1.default.readdirSync(uploadsDir)
                .filter(file => !file.startsWith('.')) // Filter out hidden files
                .map(file => {
                const filePath = path_1.default.join(uploadsDir, file);
                const stats = fs_1.default.statSync(filePath);
                return {
                    filename: file,
                    size: stats.size,
                    createdAt: stats.birthtime
                };
            });
            res.status(200).json(files);
        }
        catch (error) {
            console.error('Error listing files:', error);
            res.status(500).json({ error: 'Failed to list files' });
        }
    }
};
