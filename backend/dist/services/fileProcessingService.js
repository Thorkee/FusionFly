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
exports.fileProcessingService = void 0;
const bull_1 = __importDefault(require("bull"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
// Create a Bull queue for file processing
const fileProcessingQueue = new bull_1.default('file-processing', {
    redis: {
        port: parseInt(process.env.REDIS_PORT || '6383'),
        host: process.env.REDIS_HOST || 'localhost',
    }
});
// Process queue jobs
fileProcessingQueue.process((job) => __awaiter(void 0, void 0, void 0, function* () {
    const { filePath, originalFilename } = job.data;
    try {
        // Update job progress
        yield job.progress(10);
        // Step 1: Detect file format
        const fileExtension = path_1.default.extname(filePath).toLowerCase();
        yield job.progress(20);
        // Step 2: Convert to JSONL if needed
        let jsonlFilePath = filePath;
        if (fileExtension !== '.jsonl') {
            const baseName = path_1.default.basename(filePath, fileExtension);
            jsonlFilePath = path_1.default.join(path_1.default.dirname(filePath), `${baseName}.jsonl`);
            // Simulate conversion (in a real app, this would use actual conversion logic)
            yield simulateConversion(filePath, jsonlFilePath);
        }
        yield job.progress(60);
        // Step 3: Extract location data
        const baseName = path_1.default.basename(jsonlFilePath, '.jsonl');
        const locationFilePath = path_1.default.join(path_1.default.dirname(jsonlFilePath), `${baseName}.location.jsonl`);
        // Simulate location extraction (in a real app, this would use actual extraction logic)
        yield simulateLocationExtraction(jsonlFilePath, locationFilePath);
        yield job.progress(100);
        return {
            status: 'completed',
            message: 'File processing completed successfully',
            files: {
                original: path_1.default.basename(filePath),
                jsonl: path_1.default.basename(jsonlFilePath),
                location: path_1.default.basename(locationFilePath)
            }
        };
    }
    catch (error) {
        console.error('Error processing file:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to process file: ${errorMessage}`);
    }
}));
// Simulate file conversion (placeholder for actual conversion logic)
function simulateConversion(inputPath, outputPath) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            // In a real app, this would implement actual GNSS data conversion logic
            // For now, we'll just create a dummy JSONL file
            const dummyData = [
                { timestamp: new Date().toISOString(), type: 'GNSS', data: { lat: 22.3193, lon: 114.1694 } },
                { timestamp: new Date().toISOString(), type: 'GNSS', data: { lat: 22.3195, lon: 114.1696 } }
            ];
            fs_1.default.writeFileSync(outputPath, dummyData.map(item => JSON.stringify(item)).join('\n'));
            // Simulate processing time
            setTimeout(resolve, 1000);
        });
    });
}
// Simulate location extraction (placeholder for actual extraction logic)
function simulateLocationExtraction(inputPath, outputPath) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            // In a real app, this would implement actual location extraction logic
            // For now, we'll just create a dummy location file
            const dummyLocations = [
                { timestamp: new Date().toISOString(), lat: 22.3193, lon: 114.1694, alt: 100, accuracy: 5 },
                { timestamp: new Date().toISOString(), lat: 22.3195, lon: 114.1696, alt: 101, accuracy: 4 }
            ];
            fs_1.default.writeFileSync(outputPath, dummyLocations.map(item => JSON.stringify(item)).join('\n'));
            // Simulate processing time
            setTimeout(resolve, 1000);
        });
    });
}
exports.fileProcessingService = {
    // Start processing a file
    processFile: (filePath, originalFilename) => __awaiter(void 0, void 0, void 0, function* () {
        const jobId = (0, uuid_1.v4)();
        yield fileProcessingQueue.add({
            filePath,
            originalFilename
        }, {
            jobId,
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 1000
            }
        });
        return jobId;
    }),
    // Get the status of a processing job
    getJobStatus: (jobId) => __awaiter(void 0, void 0, void 0, function* () {
        const job = yield fileProcessingQueue.getJob(jobId);
        if (!job) {
            return null;
        }
        const state = yield job.getState();
        const progress = yield job.progress();
        const result = job.returnvalue;
        const failReason = job.failedReason;
        return {
            id: job.id,
            state,
            progress,
            result,
            failReason,
            createdAt: job.timestamp
        };
    })
};
