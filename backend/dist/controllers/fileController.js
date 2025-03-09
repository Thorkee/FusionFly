"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
const fileProcessingService_1 = require("../services/fileProcessingService");
const blobStorageService = __importStar(require("../services/blobStorageService"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
// Get container names from environment variables
const uploadsContainer = process.env.AZURE_STORAGE_CONTAINER_UPLOADS || 'uploads';
const processedContainer = process.env.AZURE_STORAGE_CONTAINER_PROCESSED || 'processed';
const resultsContainer = process.env.AZURE_STORAGE_CONTAINER_RESULTS || 'results';
exports.fileController = {
    // Upload files (GNSS and/or IMU) and start processing
    uploadFile: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        try {
            const files = req.files;
            if (!files || ((!files.gnssFile || files.gnssFile.length === 0) &&
                (!files.imuFile || files.imuFile.length === 0))) {
                return res.status(400).json({ error: 'No files uploaded. Please upload at least one GNSS or IMU file.' });
            }
            const gnssFile = (_a = files.gnssFile) === null || _a === void 0 ? void 0 : _a[0];
            const imuFile = (_b = files.imuFile) === null || _b === void 0 ? void 0 : _b[0];
            // Upload files to Azure Blob Storage if they exist
            let gnssFileUrl, imuFileUrl;
            if (gnssFile) {
                gnssFileUrl = yield blobStorageService.uploadFile(gnssFile.path, gnssFile.filename, uploadsContainer);
            }
            if (imuFile) {
                imuFileUrl = yield blobStorageService.uploadFile(imuFile.path, imuFile.filename, uploadsContainer);
            }
            // Start processing the file(s)
            const jobId = yield fileProcessingService_1.fileProcessingService.processFiles({
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
        }
        catch (error) {
            console.error('Error uploading files:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to upload files';
            res.status(500).json({ error: errorMessage });
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
    downloadFile: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { filename } = req.params;
            console.log(`Download request for file: ${filename}`);
            // Try to find the file in each container
            let foundFile = false;
            // Check if file exists in any container and stream it
            try {
                console.log(`Attempting to download file: ${filename} from uploads container`);
                yield blobStorageService.streamToResponse(filename, res, uploadsContainer);
                console.log(`Successfully streamed file: ${filename} from uploads container`);
                foundFile = true;
                return;
            }
            catch (error) {
                console.log(`File ${filename} not found in uploads container, trying processed container...`);
            }
            if (!foundFile) {
                try {
                    console.log(`Attempting to download file: ${filename} from processed container`);
                    yield blobStorageService.streamToResponse(filename, res, processedContainer);
                    console.log(`Successfully streamed file: ${filename} from processed container`);
                    foundFile = true;
                    return;
                }
                catch (error) {
                    console.log(`File ${filename} not found in processed container, trying results container...`);
                }
            }
            if (!foundFile) {
                try {
                    console.log(`Attempting to download file: ${filename} from results container`);
                    yield blobStorageService.streamToResponse(filename, res, resultsContainer);
                    console.log(`Successfully streamed file: ${filename} from results container`);
                    foundFile = true;
                    return;
                }
                catch (error) {
                    console.log(`File ${filename} not found in results container either`);
                }
            }
            // If we reach here, we couldn't find the file in any container
            if (!foundFile) {
                console.log(`File ${filename} not found in any container`);
                res.status(404).json({ error: `File ${filename} not found` });
            }
        }
        catch (error) {
            console.error('Error downloading file:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to download file';
            res.status(500).json({ error: errorMessage });
        }
    }),
    // List all files in the uploads directory
    listFiles: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            // Get files from all containers
            const [uploadFiles, processedFiles, resultFiles] = yield Promise.all([
                blobStorageService.listFiles(uploadsContainer),
                blobStorageService.listFiles(processedContainer),
                blobStorageService.listFiles(resultsContainer)
            ]);
            // Combine files from all containers
            const combinedFiles = [
                ...uploadFiles.map(file => (Object.assign(Object.assign({}, file), { filename: file.name, container: uploadsContainer, size: file.properties.contentLength || 0, createdAt: file.properties.createdOn || new Date() }))),
                ...processedFiles.map(file => (Object.assign(Object.assign({}, file), { filename: file.name, container: processedContainer, size: file.properties.contentLength || 0, createdAt: file.properties.createdOn || new Date() }))),
                ...resultFiles.map(file => (Object.assign(Object.assign({}, file), { filename: file.name, container: resultsContainer, size: file.properties.contentLength || 0, createdAt: file.properties.createdOn || new Date() })))
            ];
            res.status(200).json(combinedFiles);
        }
        catch (error) {
            console.error('Error listing files:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to list files';
            res.status(500).json({ error: errorMessage });
        }
    }),
    // Clear cache (delete all files)
    clearCache: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            console.log('Clearing cache from all containers');
            // Delete all files from all containers
            const [uploadsCount, processedCount, resultsCount] = yield Promise.all([
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
        }
        catch (error) {
            console.error('Error clearing cache:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: `Failed to clear cache: ${errorMessage}` });
        }
    })
};
