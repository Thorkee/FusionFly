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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
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
const readline_1 = __importDefault(require("readline"));
const nmeaSimple = __importStar(require("nmea-simple"));
const ubx_parser_1 = require("@csllc/ubx-parser");
const blobStorageService = __importStar(require("./blobStorageService"));
const aiService_1 = require("./aiService");
const validationService_1 = require("./validationService");
// Load environment variables
dotenv_1.default.config();
// Get container names from environment variables
const processedContainer = process.env.AZURE_STORAGE_CONTAINER_PROCESSED || 'processed';
const uploadsContainer = process.env.AZURE_STORAGE_CONTAINER_UPLOADS || 'uploads';
const resultsContainer = process.env.AZURE_STORAGE_CONTAINER_RESULTS || 'results';
// Flag to force AI-based conversion (for testing/development)
const FORCE_AI_CONVERSION = process.env.FORCE_AI_CONVERSION === 'true';
// Create a Bull queue for file processing
const fileProcessingQueue = new bull_1.default('file-processing', {
    redis: {
        port: parseInt(process.env.REDIS_PORT || '6379'),
        host: process.env.REDIS_HOST || 'localhost',
    }
});
// Process files job handler
fileProcessingQueue.process((job) => __awaiter(void 0, void 0, void 0, function* () {
    const data = job.data;
    const { gnssFile, imuFile } = data;
    try {
        yield job.progress(10);
        yield job.update({ stage: 'uploading', message: 'Starting processing...' });
        console.log(`Starting to process files: GNSS=${gnssFile === null || gnssFile === void 0 ? void 0 : gnssFile.filename}, IMU=${imuFile === null || imuFile === void 0 ? void 0 : imuFile.filename}`);
        // Extract user metadata if available
        const userMetadata = {
            userId: data.userId || 'anonymous',
            uploadedBy: data.userEmail || 'anonymous'
        };
        // Initialize result object
        const result = {
            message: 'File processing completed successfully',
            files: {}
        };
        // Process GNSS file if provided
        if (gnssFile) {
            const filePath = gnssFile.path;
            const fileExtension = path_1.default.extname(filePath).toLowerCase();
            // Step 1: Convert to JSONL if needed
            let jsonlFilePath = filePath;
            let jsonlUrl = null;
            let locationUrl = null;
            let validationUrl = null;
            if (fileExtension !== '.jsonl') {
                const baseName = path_1.default.basename(filePath, fileExtension);
                jsonlFilePath = path_1.default.join(path_1.default.dirname(filePath), `${baseName}.jsonl`);
                yield job.update({
                    stage: 'first_conversion',
                    message: FORCE_AI_CONVERSION
                        ? 'Converting GNSS file using AI-assisted conversion (FORCED)...'
                        : 'Converting GNSS file to intermediate format...'
                });
                try {
                    // Attempt standard conversion based on file extension
                    yield job.update({
                        stage: 'first_conversion_standard',
                        message: `Converting GNSS file using standard processor for ${fileExtension} format...`
                    });
                    // Perform real conversion based on file extension
                    yield convertToJsonl(filePath, jsonlFilePath, fileExtension);
                }
                catch (conversionError) {
                    // If standard conversion fails, try AI-assisted conversion
                    yield job.update({
                        stage: 'first_conversion_ai',
                        message: 'Standard conversion failed, attempting AI-assisted conversion...',
                        details: { error: conversionError instanceof Error ? conversionError.message : String(conversionError) }
                    });
                    // The convertToJsonl function will handle AI fallback internally
                    yield convertToJsonl(filePath, jsonlFilePath, fileExtension);
                }
                // Upload the converted JSONL file to processed container
                yield job.update({ stage: 'uploading_converted', message: 'Uploading converted GNSS file...' });
                const jsonlBlobName = path_1.default.basename(jsonlFilePath);
                jsonlUrl = yield blobStorageService.uploadFile(jsonlFilePath, jsonlBlobName, processedContainer, userMetadata);
                console.log(`Uploaded converted JSONL file to processed container: ${jsonlUrl}`);
            }
            yield job.progress(40);
            // Step 2: Extract location data
            yield job.update({ stage: 'extracting_location', message: 'Extracting location data using AI...' });
            const baseName = path_1.default.basename(jsonlFilePath, '.jsonl');
            const locationFilePath = path_1.default.join(path_1.default.dirname(jsonlFilePath), `${baseName}.location.jsonl`);
            // Determine data type from file name if not already known
            const fileName = path_1.default.basename(jsonlFilePath).toLowerCase();
            const dataType = fileName.includes('gnss') || fileName.includes('gps') ||
                fileName.includes('rinex') || fileName.includes('nmea') ? 'gnss' :
                fileName.includes('imu') || fileName.includes('ins') ? 'imu' : 'gnss';
            // Verify first LLM output file exists before passing to second LLM
            if (!fs_1.default.existsSync(jsonlFilePath)) {
                console.error(`ERROR: First LLM output file ${jsonlFilePath} does not exist! Cannot proceed to location extraction.`);
                throw new Error(`First conversion output file not found at ${jsonlFilePath}`);
            }
            // Check if first LLM output file has content
            const firstLlmStats = fs_1.default.statSync(jsonlFilePath);
            if (firstLlmStats.size === 0) {
                console.error(`ERROR: First LLM output file ${jsonlFilePath} is empty (0 bytes)! Cannot proceed to location extraction.`);
                throw new Error(`First conversion output file is empty at ${jsonlFilePath}`);
            }
            // Validate the first LLM output for quality before proceeding
            const firstLlmValidation = yield (0, validationService_1.validateLlmOutput)(jsonlFilePath, dataType);
            if (!firstLlmValidation.valid) {
                console.warn(`First LLM output has ${firstLlmValidation.errors.length} validation issues. Proceeding with caution.`);
                yield job.update({
                    stage: 'first_conversion_validation_issues',
                    message: `Proceeding with caution: First conversion has ${firstLlmValidation.errors.length} validation issues`,
                    details: { validation: firstLlmValidation }
                });
            }
            console.log(`PATH VERIFICATION: First LLM output file ${jsonlFilePath} exists with ${firstLlmStats.size} bytes`);
            console.log(`PATH FLOW: FIRST LLM OUTPUT → ${jsonlFilePath} → SECOND LLM INPUT`);
            // Always use AI for location extraction (second LLM call)
            console.log(`Using AI-assisted location extraction for ${dataType} data`);
            const locationFormat = `${dataType}_location`;
            // Make up to 3 attempts for location extraction
            let locationResult;
            let locationAttempts = 0;
            const MAX_LOCATION_ATTEMPTS = 3;
            while (locationAttempts < MAX_LOCATION_ATTEMPTS) {
                locationAttempts++;
                yield job.update({
                    stage: 'extracting_location',
                    message: `Extracting location data using AI${locationAttempts > 1 ? ` (attempt ${locationAttempts})` : ''}...`
                });
                console.log(`\n========== SECOND LLM: LOCATION EXTRACTION (ATTEMPT ${locationAttempts}/${MAX_LOCATION_ATTEMPTS}) ==========\n`);
                locationResult = yield (0, aiService_1.aiAssistedConversion)(jsonlFilePath, locationFilePath, locationFormat);
                console.log(`\n========== SECOND LLM COMPLETE ==========\n`);
                if (locationResult.success) {
                    break; // Success, no need for further attempts
                }
                else if (locationAttempts < MAX_LOCATION_ATTEMPTS) {
                    console.error(`Location extraction failed on attempt ${locationAttempts}. Retrying...`);
                    yield job.update({
                        stage: 'extracting_location_retry',
                        message: `Location extraction failed. Retrying (${locationAttempts}/${MAX_LOCATION_ATTEMPTS})...`,
                        details: { error: locationResult.error }
                    });
                }
            }
            if (!locationResult || !locationResult.success) {
                console.error(`Location extraction failed after ${MAX_LOCATION_ATTEMPTS} attempts: ${locationResult === null || locationResult === void 0 ? void 0 : locationResult.error}`);
                throw new Error(`Failed to extract location data after ${MAX_LOCATION_ATTEMPTS} attempts: ${locationResult === null || locationResult === void 0 ? void 0 : locationResult.error}`);
            }
            // Verify second LLM output file exists before proceeding
            if (!fs_1.default.existsSync(locationFilePath)) {
                console.error(`ERROR: Second LLM output file ${locationFilePath} does not exist!`);
                throw new Error(`Location extraction output file not found at ${locationFilePath}`);
            }
            // Check if second LLM output file has content
            const secondLlmStats = fs_1.default.statSync(locationFilePath);
            if (secondLlmStats.size === 0) {
                console.error(`ERROR: Second LLM output file ${locationFilePath} is empty (0 bytes)!`);
                throw new Error(`Location extraction output file is empty at ${locationFilePath}`);
            }
            // Validate the second LLM output before proceeding
            const secondLlmValidation = yield (0, validationService_1.validateLlmOutput)(locationFilePath, locationFormat);
            if (!secondLlmValidation.valid) {
                console.warn(`Second LLM output has ${secondLlmValidation.errors.length} validation issues.`);
                yield job.update({
                    stage: 'second_conversion_validation_issues',
                    message: `Location data has ${secondLlmValidation.errors.length} validation issues.`,
                    details: { validation: secondLlmValidation }
                });
            }
            console.log(`PATH VERIFICATION: Second LLM output file ${locationFilePath} exists with ${secondLlmStats.size} bytes`);
            // Upload the location data to Azure Blob Storage
            const locationBlobName = path_1.default.basename(locationFilePath);
            locationUrl = yield blobStorageService.uploadFile(locationFilePath, locationBlobName, processedContainer, userMetadata);
            console.log(`Uploaded location data file to processed container: ${locationUrl}`);
            // Step 3: Validate the extracted location data
            yield job.update({ stage: 'validating', message: 'Validating location data...' });
            const validationResult = {
                valid: secondLlmValidation.valid,
                issues: secondLlmValidation.errors.concat(secondLlmValidation.warnings)
            };
            // Create validation report
            let validationReportPath = null;
            if (!validationResult.valid && validationResult.issues.length > 0) {
                yield job.update({
                    stage: 'validation_report',
                    message: `Creating validation report (${validationResult.issues.length} issues found)...`
                });
                validationReportPath = path_1.default.join(path_1.default.dirname(locationFilePath), `${baseName}.validation.json`);
                fs_1.default.writeFileSync(validationReportPath, JSON.stringify({
                    timestamp: new Date().toISOString(),
                    valid: validationResult.valid,
                    issues: validationResult.issues
                }, null, 2));
                // Upload validation report to processed container
                const validationBlobName = path_1.default.basename(validationReportPath);
                validationUrl = yield blobStorageService.uploadFile(validationReportPath, validationBlobName, processedContainer, userMetadata);
                console.log(`Uploaded validation report to processed container: ${validationUrl}`);
            }
            // Step 4: AI-assisted schema conversion for GNSS data
            yield job.update({ stage: 'second_conversion', message: 'Converting to structured schema format...' });
            try {
                const structuredFilePath = path_1.default.join(path_1.default.dirname(locationFilePath), `${baseName}.structured.jsonl`);
                // Always use AI for schema conversion (third LLM call)
                const schemaFormat = `${dataType}_schema`;
                console.log(`Attempting AI-assisted conversion for ${schemaFormat} format`);
                // Verify second LLM output file exists before passing to third LLM
                if (!fs_1.default.existsSync(locationFilePath)) {
                    console.error(`ERROR: Second LLM output file ${locationFilePath} does not exist! Cannot proceed to schema conversion.`);
                    throw new Error(`Location extraction output file not found at ${locationFilePath}`);
                }
                console.log(`PATH FLOW: SECOND LLM OUTPUT → ${locationFilePath} → THIRD LLM INPUT`);
                // Use AI conversion for this step with multiple attempts
                yield job.update({
                    stage: 'second_conversion_ai',
                    message: 'Using AI to convert location data to structured schema format...'
                });
                console.log(`THIRD LLM: Input Path: ${locationFilePath}, Output Path: ${structuredFilePath}`);
                // Make up to 3 attempts for schema conversion
                let schemaResult;
                let schemaAttempts = 0;
                const MAX_SCHEMA_ATTEMPTS = 3;
                while (schemaAttempts < MAX_SCHEMA_ATTEMPTS) {
                    schemaAttempts++;
                    yield job.update({
                        stage: 'schema_conversion',
                        message: `Converting to schema format${schemaAttempts > 1 ? ` (attempt ${schemaAttempts})` : ''}...`
                    });
                    console.log(`\n========== THIRD LLM: SCHEMA CONVERSION (ATTEMPT ${schemaAttempts}/${MAX_SCHEMA_ATTEMPTS}) ==========\n`);
                    schemaResult = yield (0, aiService_1.aiAssistedConversion)(locationFilePath, structuredFilePath, schemaFormat);
                    console.log(`\n========== THIRD LLM COMPLETE ==========\n`);
                    if (schemaResult.success) {
                        break; // Success, no need for further attempts
                    }
                    else if (schemaAttempts < MAX_SCHEMA_ATTEMPTS) {
                        console.error(`Schema conversion failed on attempt ${schemaAttempts}. Retrying...`);
                        yield job.update({
                            stage: 'schema_conversion_retry',
                            message: `Schema conversion failed. Retrying (${schemaAttempts}/${MAX_SCHEMA_ATTEMPTS})...`,
                            details: { error: schemaResult.error }
                        });
                    }
                }
                if (!schemaResult || !schemaResult.success) {
                    console.error(`Schema conversion failed after ${MAX_SCHEMA_ATTEMPTS} attempts: ${schemaResult === null || schemaResult === void 0 ? void 0 : schemaResult.error}`);
                    yield job.update({
                        stage: 'second_conversion_failed',
                        message: `GNSS schema conversion failed after ${MAX_SCHEMA_ATTEMPTS} attempts: ${schemaResult === null || schemaResult === void 0 ? void 0 : schemaResult.error}`,
                        details: { error: schemaResult === null || schemaResult === void 0 ? void 0 : schemaResult.error }
                    });
                    throw new Error(`GNSS schema conversion failed after ${MAX_SCHEMA_ATTEMPTS} attempts: ${schemaResult === null || schemaResult === void 0 ? void 0 : schemaResult.error}`);
                }
                // Verify third LLM output file exists
                if (!fs_1.default.existsSync(structuredFilePath)) {
                    console.error(`ERROR: Third LLM output file ${structuredFilePath} does not exist!`);
                    throw new Error(`Schema conversion output file not found at ${structuredFilePath}`);
                }
                // Validate the third LLM output
                const thirdLlmStats = fs_1.default.statSync(structuredFilePath);
                const thirdLlmValidation = yield (0, validationService_1.validateLlmOutput)(structuredFilePath, schemaFormat);
                if (!thirdLlmValidation.valid) {
                    console.warn(`Third LLM output has ${thirdLlmValidation.errors.length} validation issues.`);
                    yield job.update({
                        stage: 'third_conversion_validation_issues',
                        message: `Schema data has ${thirdLlmValidation.errors.length} validation issues.`,
                        details: { validation: thirdLlmValidation }
                    });
                }
                console.log(`PATH VERIFICATION: Third LLM output file ${structuredFilePath} exists with ${thirdLlmStats.size} bytes`);
                // Upload the structured schema to Azure Blob Storage
                const structuredBlobName = path_1.default.basename(structuredFilePath);
                const structuredUrl = yield blobStorageService.uploadFile(structuredFilePath, structuredBlobName, processedContainer, userMetadata);
                console.log(`Uploaded GNSS structured schema file to processed container: ${structuredUrl}`);
                // Add to result object
                result.files.gnss = {
                    original: gnssFile.filename,
                    jsonl: path_1.default.basename(jsonlFilePath),
                    location: path_1.default.basename(locationFilePath),
                    structured: structuredBlobName,
                    urls: {
                        jsonl: jsonlUrl,
                        location: locationUrl,
                        structured: structuredUrl,
                        validation: validationUrl
                    }
                };
                result.gnssValidation = {
                    valid: validationResult.valid,
                    issueCount: validationResult.issues.length
                };
            }
            catch (schemaError) {
                console.error('Error during schema conversion:', schemaError);
                yield job.update({
                    stage: 'second_conversion_error',
                    message: 'Error during schema conversion',
                    details: { error: schemaError instanceof Error ? schemaError.message : String(schemaError) }
                });
                // We'll still continue with the overall process but mark this step as failed
                result.message = 'File processing completed with some issues';
                result.files.gnss = {
                    original: gnssFile.filename,
                    jsonl: path_1.default.basename(jsonlFilePath),
                    location: path_1.default.basename(locationFilePath),
                    structured: null,
                    urls: {
                        jsonl: jsonlUrl,
                        location: locationUrl,
                        validation: validationUrl
                    }
                };
            }
        }
        // Process IMU file if provided
        if (imuFile) {
            const filePath = imuFile.path;
            const fileExtension = path_1.default.extname(filePath).toLowerCase();
            // Step 1: Convert to JSONL if needed
            let jsonlFilePath = filePath;
            if (fileExtension !== '.jsonl') {
                const baseName = path_1.default.basename(filePath, fileExtension);
                jsonlFilePath = path_1.default.join(path_1.default.dirname(filePath), `${baseName}.jsonl`);
                yield job.update({
                    stage: 'first_conversion_imu',
                    message: FORCE_AI_CONVERSION
                        ? 'Converting IMU file using AI-assisted conversion (FORCED)...'
                        : 'Converting IMU file to intermediate format...'
                });
                try {
                    // Attempt standard conversion based on file extension
                    yield job.update({
                        stage: 'first_conversion_standard_imu',
                        message: `Converting IMU file using standard processor for ${fileExtension} format...`
                    });
                    // Perform real conversion based on file extension
                    yield convertToJsonl(filePath, jsonlFilePath, fileExtension);
                }
                catch (conversionError) {
                    // If standard conversion fails, try AI-assisted conversion
                    yield job.update({
                        stage: 'first_conversion_ai_imu',
                        message: 'Standard conversion failed, attempting AI-assisted conversion for IMU data...',
                        details: { error: conversionError instanceof Error ? conversionError.message : String(conversionError) }
                    });
                    // The convertToJsonl function will handle AI fallback internally
                    yield convertToJsonl(filePath, jsonlFilePath, fileExtension);
                }
                // Upload the converted JSONL file to processed container
                yield job.update({ stage: 'uploading_converted_imu', message: 'Uploading converted IMU file...' });
                const jsonlBlobName = path_1.default.basename(jsonlFilePath);
                const jsonlUrl = yield blobStorageService.uploadFile(jsonlFilePath, jsonlBlobName, processedContainer, userMetadata);
                console.log(`Uploaded converted IMU file to processed container: ${jsonlUrl}`);
            }
            yield job.progress(80);
            // Step 2: AI-assisted schema conversion for IMU data
            yield job.update({ stage: 'second_conversion_imu', message: 'Converting IMU data to structured schema format...' });
            const baseName = path_1.default.basename(jsonlFilePath, '.jsonl');
            const schemaConversionPath = path_1.default.join(path_1.default.dirname(jsonlFilePath), `${baseName}.structured.jsonl`);
            try {
                yield job.update({
                    stage: 'second_conversion_ai_imu',
                    message: 'Generating AI-assisted conversion code for IMU structured schema...'
                });
                // Verify first LLM output file exists before passing to schema conversion
                if (!fs_1.default.existsSync(jsonlFilePath)) {
                    console.error(`ERROR: IMU first LLM output file ${jsonlFilePath} does not exist! Cannot proceed to schema conversion.`);
                    throw new Error(`IMU conversion output file not found at ${jsonlFilePath}`);
                }
                // Check if first LLM output file has content
                const imuFirstLlmStats = fs_1.default.statSync(jsonlFilePath);
                if (imuFirstLlmStats.size === 0) {
                    console.error(`ERROR: IMU first LLM output file ${jsonlFilePath} is empty (0 bytes)! Cannot proceed.`);
                    throw new Error(`IMU conversion output file is empty at ${jsonlFilePath}`);
                }
                console.log(`PATH VERIFICATION: IMU first LLM output file ${jsonlFilePath} exists with ${imuFirstLlmStats.size} bytes`);
                console.log(`PATH FLOW: IMU FIRST LLM OUTPUT → ${jsonlFilePath} → IMU SECOND LLM INPUT`);
                console.log(`IMU SECOND LLM: Input Path: ${jsonlFilePath}, Output Path: ${schemaConversionPath}`);
                const imuConversionResult = yield (0, aiService_1.aiAssistedConversion)(jsonlFilePath, schemaConversionPath, 'imu');
                if (!imuConversionResult.success) {
                    console.error(`IMU schema conversion failed: ${imuConversionResult.error}`);
                    yield job.update({
                        stage: 'second_conversion_failed_imu',
                        message: `IMU schema conversion failed: ${imuConversionResult.error}`,
                        details: { error: imuConversionResult.error }
                    });
                    throw new Error(`IMU schema conversion failed: ${imuConversionResult.error}`);
                }
                // Verify IMU second LLM output file exists
                if (!fs_1.default.existsSync(schemaConversionPath)) {
                    console.error(`ERROR: IMU second LLM output file ${schemaConversionPath} does not exist!`);
                    throw new Error(`IMU schema conversion output file not found at ${schemaConversionPath}`);
                }
                // Check if IMU second LLM output file has content
                const imuSecondLlmStats = fs_1.default.statSync(schemaConversionPath);
                if (imuSecondLlmStats.size === 0) {
                    console.error(`ERROR: IMU second LLM output file ${schemaConversionPath} is empty (0 bytes)!`);
                    throw new Error(`IMU schema conversion output file is empty at ${schemaConversionPath}`);
                }
                console.log(`PATH VERIFICATION: IMU second LLM output file ${schemaConversionPath} exists with ${imuSecondLlmStats.size} bytes`);
                // Upload the structured schema file to processed container
                yield job.update({
                    stage: 'second_conversion_complete_imu',
                    message: 'IMU schema conversion completed successfully',
                    progress: 95
                });
                const schemaConversionBlobName = path_1.default.basename(schemaConversionPath);
                const schemaUrl = yield blobStorageService.uploadFile(schemaConversionPath, schemaConversionBlobName, processedContainer, userMetadata);
                console.log(`Uploaded IMU structured schema file to processed container: ${schemaUrl}`);
                // Add to result object
                result.files.imu = {
                    original: imuFile.filename,
                    jsonl: path_1.default.basename(jsonlFilePath),
                    structured: schemaConversionBlobName,
                    urls: {
                        jsonl: null, // Will be set if we had to convert
                        structured: schemaUrl
                    }
                };
            }
            catch (schemaError) {
                yield job.update({
                    stage: 'second_conversion_error_imu',
                    message: 'IMU schema conversion encountered an error, continuing with basic data...',
                    details: { error: schemaError instanceof Error ? schemaError.message : String(schemaError) }
                });
                result.files.imu = {
                    original: path_1.default.basename(filePath),
                    jsonl: path_1.default.basename(jsonlFilePath),
                    structuredError: schemaError instanceof Error ? schemaError.message : String(schemaError)
                };
            }
        }
        // If both GNSS and IMU data are provided, perform data fusion
        if (gnssFile && imuFile) {
            yield job.update({ stage: 'fusion', message: 'Preparing for GNSS+IMU data fusion...' });
            // Future enhancement: Implement GNSS+IMU data fusion with FGO
            result.fusion = {
                status: 'Planned for future release',
                message: 'GNSS+IMU fusion will be available in a future update'
            };
        }
        // Final steps - mark as complete
        yield job.progress(100);
        yield job.update({
            stage: 'complete',
            message: 'Processing completed successfully',
            progress: 100,
            state: 'completed'
        });
        return {
            success: true,
            message: result.message,
            result
        };
    }
    catch (error) {
        console.error('Error processing files:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        yield job.update({ stage: 'error', message: `Processing failed: ${errorMessage}` });
        throw new Error(`Failed to process files: ${errorMessage}`);
    }
}));
// Convert various file formats to JSONL
function convertToJsonl(inputPath, outputPath, fileExtension) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`Converting ${inputPath} to JSONL format`);
        console.log(`Output path: ${outputPath}`);
        console.log(`File extension: ${fileExtension}`);
        // Determine if this is likely GNSS or IMU data based on file name or extension
        const fileName = path_1.default.basename(inputPath).toLowerCase();
        let dataType = 'unknown';
        // Simple heuristic - can be improved with more complex detection
        if (fileName.includes('gnss') || fileName.includes('gps') ||
            fileName.includes('rinex') || fileName.includes('nmea') ||
            fileExtension === '.obs' || fileExtension === '.rnx' ||
            fileExtension === '.nmea' || fileExtension === '.gps') {
            dataType = 'gnss';
        }
        else if (fileName.includes('imu') || fileName.includes('ins') ||
            fileName.includes('accel') || fileName.includes('gyro')) {
            dataType = 'imu';
        }
        console.log(`Detected data type: ${dataType}`);
        // Use only AI-assisted conversion
        console.log(`Using AI-assisted conversion for ${dataType} data`);
        try {
            console.log(`\n========== FIRST LLM: FORMAT CONVERSION ==========\n`);
            console.log(`Calling aiAssistedConversion with dataType=${dataType}, inputPath=${inputPath}`);
            const conversionResult = yield (0, aiService_1.aiAssistedConversion)(inputPath, outputPath, dataType);
            console.log(`\n========== FIRST LLM COMPLETE ==========\n`);
            console.log(`AI-assisted conversion result:`, conversionResult);
            if (conversionResult.success && conversionResult.output_path) {
                // If AI conversion succeeded, copy the result to the expected output path
                console.log(`AI conversion succeeded, copying from ${conversionResult.output_path} to ${outputPath}`);
                fs_1.default.copyFileSync(conversionResult.output_path, outputPath);
                console.log(`AI-assisted conversion successfully converted ${inputPath} to JSONL`);
                return;
            }
            else {
                console.error(`AI-assisted conversion failed: ${conversionResult.error}`);
                throw new Error(`AI-assisted conversion failed: ${conversionResult.error}`);
            }
        }
        catch (error) {
            console.error(`Error during AI conversion:`, error);
            throw new Error(`AI-assisted conversion failed for ${inputPath}: ${error}`);
        }
    });
}
// Convert RINEX observation files to JSONL
function convertRinexToJsonl(inputPath, outputPath) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_1, _b, _c;
        console.log('Processing RINEX file');
        try {
            // Since we can't use the georinex library directly in Node.js, 
            // we'll parse the RINEX file manually using basic rules
            const writeStream = fs_1.default.createWriteStream(outputPath);
            const fileStream = fs_1.default.createReadStream(inputPath);
            const rl = readline_1.default.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });
            let headerEnded = false;
            let epochData = {};
            let epochTime = null;
            let lineCount = 0;
            let recordCount = 0;
            let parseError = false;
            try {
                for (var _d = true, rl_1 = __asyncValues(rl), rl_1_1; rl_1_1 = yield rl_1.next(), _a = rl_1_1.done, !_a; _d = true) {
                    _c = rl_1_1.value;
                    _d = false;
                    const line = _c;
                    lineCount++;
                    try {
                        // Process header
                        if (!headerEnded) {
                            if (line.includes('END OF HEADER')) {
                                headerEnded = true;
                            }
                            continue;
                        }
                        // Epoch line starts with '>'
                        if (line.trim().startsWith('>')) {
                            // If we have epoch data from a previous epoch, write it
                            if (epochTime && Object.keys(epochData).length > 0) {
                                const jsonlLine = JSON.stringify({
                                    timestamp_ms: epochTime,
                                    type: 'RINEX',
                                    data: epochData
                                });
                                writeStream.write(jsonlLine + '\n');
                                recordCount++;
                            }
                            // Parse epoch time
                            const parts = line.trim().split(/\s+/);
                            if (parts.length >= 7) {
                                const year = parseInt(parts[1]);
                                const month = parseInt(parts[2]);
                                const day = parseInt(parts[3]);
                                const hour = parseInt(parts[4]);
                                const minute = parseInt(parts[5]);
                                const second = parseFloat(parts[6]);
                                const date = new Date(Date.UTC(year, month - 1, day, hour, minute, Math.floor(second)));
                                epochTime = date.getTime() + (second % 1) * 1000;
                                epochData = {};
                            }
                        }
                        // Observation data lines
                        else if (headerEnded && epochTime) {
                            // RINEX data is space-delimited
                            const parts = line.trim().split(/\s+/);
                            if (parts.length >= 2) {
                                const satSystem = parts[0].charAt(0);
                                const satNumber = parseInt(parts[0].substring(1));
                                if (!isNaN(satNumber)) {
                                    // Process observation values
                                    const observations = {};
                                    for (let i = 1; i < parts.length; i++) {
                                        const value = parseFloat(parts[i]);
                                        if (!isNaN(value)) {
                                            observations[`obs${i}`] = value;
                                        }
                                    }
                                    epochData[`${satSystem}${satNumber}`] = observations;
                                }
                            }
                        }
                    }
                    catch (error) {
                        console.error(`Error parsing RINEX line ${lineCount}:`, error);
                        parseError = true;
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = rl_1.return)) yield _b.call(rl_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
            // Write the last epoch if there's data
            if (epochTime && Object.keys(epochData).length > 0) {
                const jsonlLine = JSON.stringify({
                    timestamp_ms: epochTime,
                    type: 'RINEX',
                    data: epochData
                });
                writeStream.write(jsonlLine + '\n');
                recordCount++;
            }
            writeStream.end();
            console.log(`Processed ${lineCount} lines from RINEX file, created ${recordCount} records`);
            // If we encountered parsing errors or didn't extract any records, try AI-assisted parsing
            if (parseError || recordCount === 0) {
                console.log('Basic RINEX parsing had issues, trying AI-assisted parsing');
                const aiSuccess = yield aiAssistedParsing(inputPath, outputPath, 'RINEX');
                if (!aiSuccess) {
                    console.log('AI-assisted parsing failed, using basic parsing results');
                }
            }
        }
        catch (error) {
            console.error('Error converting RINEX to JSONL:', error);
            // Try AI-assisted parsing as a fallback
            try {
                console.log('Error in basic RINEX parsing, trying AI-assisted parsing');
                const aiSuccess = yield aiAssistedParsing(inputPath, outputPath, 'RINEX');
                if (!aiSuccess) {
                    throw error; // Re-throw the original error if AI parsing also fails
                }
            }
            catch (aiError) {
                console.error('AI-assisted parsing also failed:', aiError);
                throw error; // Throw the original error
            }
        }
    });
}
// Convert NMEA sentences to JSONL
function convertNmeaToJsonl(inputPath, outputPath) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Processing NMEA file');
        try {
            // ALWAYS use AI-assisted conversion for NMEA data, never use the default parser
            console.log('Using AI-assisted conversion for NMEA data - bypassing default parser');
            const aiResult = yield (0, aiService_1.aiAssistedConversion)(inputPath, outputPath, 'NMEA');
            if (!aiResult.success) {
                console.error(`AI-assisted NMEA conversion failed: ${aiResult.error}`);
                throw new Error(`AI-assisted conversion failed: ${aiResult.error}`);
            }
            console.log('AI-assisted NMEA conversion completed successfully');
        }
        catch (error) {
            console.error('Error converting NMEA to JSONL:', error);
            throw error;
        }
    });
}
// Parse NMEA sentence to data object
function parseNmeaSentence(sentence) {
    if (!sentence || !sentence.startsWith('$')) {
        return null;
    }
    // Basic checksum validation
    const checksumIndex = sentence.lastIndexOf('*');
    if (checksumIndex === -1 || checksumIndex === sentence.length - 1) {
        return null;
    }
    try {
        // Use nmea-simple library for parsing
        const parsedSentence = nmeaSimple.parseNmeaSentence(sentence);
        // Initialize result with original sentence data
        let result = {
            timestamp_ms: null,
            type: 'NMEA',
            message_type: parsedSentence.sentenceId,
            original_data: sentence
        };
        // Handle different message types
        switch (parsedSentence.sentenceId) {
            case 'GGA': {
                const gga = parsedSentence;
                result.latitude = gga.latitude;
                result.longitude = gga.longitude;
                result.altitude = gga.altitudeMeters;
                result.quality = gga.fixType;
                result.num_satellites = gga.satellitesInView;
                result.hdop = gga.horizontalDilution;
                // Extract time from GGA
                const timeValue = gga.time;
                if (timeValue && typeof timeValue === 'string') {
                    const today = new Date();
                    const timeStr = timeValue;
                    const hours = parseInt(timeStr.substring(0, 2));
                    const minutes = parseInt(timeStr.substring(2, 4));
                    const seconds = parseFloat(timeStr.substring(4));
                    today.setUTCHours(hours);
                    today.setUTCMinutes(minutes);
                    today.setUTCSeconds(seconds);
                    result.timestamp_ms = today.getTime();
                    result.timestamp = today.toISOString(); // Add ISO string timestamp
                }
                break;
            }
            case 'RMC': {
                const rmc = parsedSentence;
                result.latitude = rmc.latitude;
                result.longitude = rmc.longitude;
                result.speed = rmc.speedKnots * 0.514444; // Convert knots to m/s
                result.course = rmc.trackTrue;
                // Extract date and time from RMC
                if (rmc.datetime) {
                    result.timestamp_ms = rmc.datetime.getTime();
                    result.timestamp = rmc.datetime.toISOString(); // Add ISO string timestamp
                }
                break;
            }
            case 'GSA': {
                const gsa = parsedSentence;
                result.hdop = gsa.HDOP;
                result.pdop = gsa.PDOP;
                result.vdop = gsa.VDOP;
                result.fix_type = gsa.fixMode;
                result.fix_mode = gsa.selectionMode;
                result.satellites_used = gsa.satellites;
                break;
            }
            case 'GSV': {
                const gsv = parsedSentence;
                result.num_satellites_in_view = gsv.satellitesInView;
                result.satellite_data = gsv.satellites;
                break;
            }
        }
        // If we couldn't extract a timestamp, try to parse from the raw sentence
        if (!result.timestamp_ms) {
            const parts = sentence.split(',');
            // For other sentence types, check if they have time field (typically the 2nd field)
            if (parts.length >= 2 && parts[1] && parts[1].length >= 6) {
                const timeStr = parts[1];
                try {
                    const hours = parseInt(timeStr.substring(0, 2));
                    const minutes = parseInt(timeStr.substring(2, 4));
                    const seconds = parseFloat(timeStr.substring(4));
                    if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
                        const today = new Date();
                        today.setUTCHours(hours, minutes, Math.floor(seconds), Math.round((seconds % 1) * 1000));
                        result.timestamp_ms = today.getTime();
                        result.timestamp = today.toISOString();
                    }
                }
                catch (error) {
                    console.error('Error parsing time from NMEA sentence:', error);
                }
            }
        }
        return result;
    }
    catch (error) {
        console.error('Error parsing NMEA sentence:', error);
        return null;
    }
}
// Convert NMEA coordinate format to decimal degrees
function convertNmeaCoordinate(coord, dir) {
    if (!coord || !dir)
        return null;
    try {
        // NMEA lat format: DDMM.MMMM
        // NMEA lon format: DDDMM.MMMM
        const isLat = (dir === 'N' || dir === 'S');
        const degreeDigits = isLat ? 2 : 3;
        const degrees = parseFloat(coord.substring(0, degreeDigits));
        const minutes = parseFloat(coord.substring(degreeDigits));
        let decimal = degrees + (minutes / 60.0);
        // Apply direction
        if (dir === 'S' || dir === 'W') {
            decimal = -decimal;
        }
        return decimal;
    }
    catch (error) {
        console.error('Error converting NMEA coordinate:', error);
        return null;
    }
}
// Detect file format based on content and convert
function detectAndConvertToJsonl(inputPath, outputPath) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_2, _b, _c;
        // Read the first few lines to determine format
        const fileStream = fs_1.default.createReadStream(inputPath, { encoding: 'utf8', highWaterMark: 1024 });
        let content = '';
        try {
            for (var _d = true, fileStream_1 = __asyncValues(fileStream), fileStream_1_1; fileStream_1_1 = yield fileStream_1.next(), _a = fileStream_1_1.done, !_a; _d = true) {
                _c = fileStream_1_1.value;
                _d = false;
                const chunk = _c;
                content += chunk;
                if (content.length > 1000)
                    break;
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = fileStream_1.return)) yield _b.call(fileStream_1);
            }
            finally { if (e_2) throw e_2.error; }
        }
        // Try to determine format based on content
        if (content.includes('$GP') || content.includes('$GN') || content.includes('$GL')) {
            // Looks like NMEA
            yield convertNmeaToJsonl(inputPath, outputPath);
        }
        else if (content.includes('RINEX VERSION') || content.includes('END OF HEADER')) {
            // Looks like RINEX
            yield convertRinexToJsonl(inputPath, outputPath);
        }
        else if (content.trim().startsWith('{') && content.includes('}')) {
            // Looks like JSON
            yield convertJsonToJsonl(inputPath, outputPath);
        }
        else {
            // Check for UBX format (binary format)
            // UBX packets start with 0xB5 0x62 (µb in ASCII)
            try {
                const buffer = fs_1.default.readFileSync(inputPath);
                let isUbx = false;
                // Check for UBX header in the first 1000 bytes
                for (let i = 0; i < Math.min(buffer.length - 1, 1000); i++) {
                    if (buffer[i] === 0xB5 && buffer[i + 1] === 0x62) {
                        isUbx = true;
                        break;
                    }
                }
                if (isUbx) {
                    // Looks like UBX
                    yield convertUbxToJsonl(inputPath, outputPath);
                }
                else {
                    // Unknown format, use basic conversion
                    yield basicFileToJsonl(inputPath, outputPath);
                }
            }
            catch (error) {
                console.error('Error detecting file format:', error);
                // Fall back to basic conversion
                yield basicFileToJsonl(inputPath, outputPath);
            }
        }
    });
}
// Convert JSON to JSONL
function convertJsonToJsonl(inputPath, outputPath) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const data = JSON.parse(fs_1.default.readFileSync(inputPath, 'utf8'));
            const writeStream = fs_1.default.createWriteStream(outputPath);
            if (Array.isArray(data)) {
                // If it's an array, each item becomes a line
                for (const item of data) {
                    writeStream.write(JSON.stringify(item) + '\n');
                }
            }
            else {
                // If it's an object, the whole object becomes one line
                writeStream.write(JSON.stringify(data) + '\n');
            }
            writeStream.end();
        }
        catch (error) {
            console.error('Error converting JSON to JSONL:', error);
            throw error;
        }
    });
}
// Basic conversion for unknown file formats
function basicFileToJsonl(inputPath, outputPath) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_3, _b, _c;
        const writeStream = fs_1.default.createWriteStream(outputPath);
        try {
            const fileStream = fs_1.default.createReadStream(inputPath);
            const rl = readline_1.default.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });
            let lineNumber = 0;
            try {
                for (var _d = true, rl_2 = __asyncValues(rl), rl_2_1; rl_2_1 = yield rl_2.next(), _a = rl_2_1.done, !_a; _d = true) {
                    _c = rl_2_1.value;
                    _d = false;
                    const line = _c;
                    lineNumber++;
                    if (line.trim()) {
                        const record = {
                            timestamp_ms: new Date().getTime(),
                            type: 'unknown',
                            line_number: lineNumber,
                            content: line.trim()
                        };
                        writeStream.write(JSON.stringify(record) + '\n');
                    }
                }
            }
            catch (e_3_1) { e_3 = { error: e_3_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = rl_2.return)) yield _b.call(rl_2);
                }
                finally { if (e_3) throw e_3.error; }
            }
        }
        catch (error) {
            console.error('Error converting file to JSONL:', error);
            throw error;
        }
        finally {
            writeStream.end();
        }
    });
}
// Extract location data from JSONL
function extractLocationData(inputPath, outputPath) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_4, _b, _c;
        console.log(`Extracting location data from ${inputPath}`);
        try {
            const writeStream = fs_1.default.createWriteStream(outputPath);
            const fileStream = fs_1.default.createReadStream(inputPath);
            const rl = readline_1.default.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });
            let recordCount = 0;
            let extractedCount = 0;
            let firstFewRecords = [];
            try {
                for (var _d = true, rl_3 = __asyncValues(rl), rl_3_1; rl_3_1 = yield rl_3.next(), _a = rl_3_1.done, !_a; _d = true) {
                    _c = rl_3_1.value;
                    _d = false;
                    const line = _c;
                    try {
                        recordCount++;
                        if (line.trim() === '')
                            continue;
                        const record = JSON.parse(line);
                        // Keep track of the first few records for diagnostic purposes
                        if (recordCount <= 5) {
                            // Store record info for analysis
                            firstFewRecords.push({
                                record_number: recordCount,
                                type: record.type || record.format || 'unknown',
                                fields_present: Object.keys(record),
                                has_coords: record.latitude !== undefined && record.longitude !== undefined
                            });
                        }
                        // Log progress and analyze sample records
                        if (recordCount % 1000 === 0 || recordCount <= 10) {
                            const hasCoords = record.latitude !== undefined && record.longitude !== undefined;
                            console.log(`${hasCoords ? 'Location data extracted from' : 'No location data extracted from'} record ${recordCount}: ${record.type || record.format || 'unknown'} has coordinates: ${hasCoords}`);
                            if (!hasCoords && (recordCount <= 3 || recordCount % 5000 === 0)) {
                                // Detailed logging of problematic records to diagnose conversion issues
                                console.log(`Record #${recordCount} fields: ${Object.keys(record).join(', ')}`);
                                // Check if this is a GGA or RMC sentence that should have coordinates
                                if (record.original_data &&
                                    (record.original_data.includes('GGA') || record.original_data.includes('RMC'))) {
                                    console.log(`Record #${recordCount} contains GGA/RMC data but coordinates weren't extracted`);
                                    console.log(`Original data: ${record.original_data}`);
                                }
                            }
                        }
                        // Extract location from the record
                        const locationData = extractLocationFromRecord(record);
                        if (locationData &&
                            locationData.latitude !== undefined &&
                            locationData.longitude !== undefined &&
                            !isNaN(locationData.latitude) &&
                            !isNaN(locationData.longitude)) {
                            writeStream.write(JSON.stringify(locationData) + '\n');
                            extractedCount++;
                        }
                    }
                    catch (error) {
                        console.error(`Error processing record ${recordCount}:`, error);
                    }
                }
            }
            catch (e_4_1) { e_4 = { error: e_4_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = rl_3.return)) yield _b.call(rl_3);
                }
                finally { if (e_4) throw e_4.error; }
            }
            writeStream.end();
            // Print summary of first few records for analysis
            console.log('JSONL Record Analysis: First few records:', JSON.stringify(firstFewRecords, null, 2));
            // Diagnose extraction issues
            if (extractedCount === 0) {
                console.warn('WARNING: No location data was extracted - analyzing records to diagnose issue');
                // Check first few records to understand the data structure
                for (let i = 1; i <= 3; i++) {
                    try {
                        const content = fs_1.default.readFileSync(inputPath, 'utf8');
                        const lines = content.split('\n');
                        if (lines.length >= i) {
                            const recordData = JSON.parse(lines[i - 1]);
                            console.log(`Record #${i} of type ${recordData.type || recordData.format || 'unknown'} has keys: ${Object.keys(recordData).join(', ')}`);
                            // Check for GGA or RMC data that should have coordinates
                            if (recordData.original_data &&
                                (recordData.original_data.includes('GGA') || recordData.original_data.includes('RMC'))) {
                                console.log(`Record #${i} contains GGA/RMC data that should have coordinates:`);
                                console.log(`Original data: ${recordData.original_data}`);
                                // Try to manually extract coordinates from the data
                                try {
                                    const parts = recordData.original_data.split(',');
                                    let lat, latDir, lon, lonDir;
                                    if (recordData.original_data.includes('GGA')) {
                                        // GGA format: $--GGA,time,lat,N/S,lon,E/W,...
                                        lat = parts[2];
                                        latDir = parts[3];
                                        lon = parts[4];
                                        lonDir = parts[5];
                                        console.log(`GGA coords: lat=${lat} ${latDir}, lon=${lon} ${lonDir}`);
                                    }
                                    else if (recordData.original_data.includes('RMC')) {
                                        // RMC format: $--RMC,time,status,lat,N/S,lon,E/W,...
                                        lat = parts[3];
                                        latDir = parts[4];
                                        lon = parts[5];
                                        lonDir = parts[6];
                                        console.log(`RMC coords: lat=${lat} ${latDir}, lon=${lon} ${lonDir}`);
                                    }
                                }
                                catch (parseError) {
                                    console.error('Error parsing NMEA coordinates:', parseError);
                                }
                            }
                        }
                    }
                    catch (error) {
                        console.error(`Error analyzing record ${i}:`, error);
                    }
                }
                console.log('Check if the AI-assisted conversion extracted and formatted latitude/longitude correctly.');
                console.log('Consider modifying the createConversionPrompt to emphasize coordinate extraction and formatting.');
            }
            console.log(`Processed ${recordCount} records, extracted ${extractedCount} location records`);
        }
        catch (error) {
            console.error(`Error extracting location data:`, error);
            throw error;
        }
    });
}
// Extract location from a JSONL record
function extractLocationFromRecord(record) {
    var _a;
    // Check if the record has valid location data directly provided
    const hasValidCoords = record &&
        typeof record === 'object' &&
        'latitude' in record &&
        'longitude' in record &&
        typeof record.latitude === 'number' &&
        typeof record.longitude === 'number' &&
        !isNaN(record.latitude) &&
        !isNaN(record.longitude) &&
        record.latitude >= -90 &&
        record.latitude <= 90 &&
        record.longitude >= -180 &&
        record.longitude <= 180;
    if (!hasValidCoords) {
        // If coordinates are not directly present and valid, return null.
        // We rely on the aiAssistedConversion step (using the LLM prompt)
        // to have already extracted coordinates into top-level fields.
        return null;
    }
    // Record has valid coordinates, return a clean location record
    // Ensure timestamp_ms is present, otherwise use fallback or null
    const timestamp_ms = record.timestamp_ms || record.time_unix || null;
    return {
        type: record.type || 'gnss',
        timestamp_ms: timestamp_ms,
        timestamp: timestamp_ms ? new Date(timestamp_ms).toISOString() : (record.timestamp || null),
        latitude: record.latitude,
        longitude: record.longitude,
        altitude: record.altitude || ((_a = record.position_lla) === null || _a === void 0 ? void 0 : _a.altitude_m) || null,
        speed: record.speed || null,
        course: record.course || null,
        hdop: record.hdop || record.dop || null,
        original_record: record.original_data || null // Keep for potential debugging
    };
}
// Convert UBX format to JSONL
function convertUbxToJsonl(inputPath, outputPath) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Processing UBX file');
        const writeStream = fs_1.default.createWriteStream(outputPath);
        try {
            // Read the file as a binary buffer
            const fileBuffer = fs_1.default.readFileSync(inputPath);
            // Create a UBX parser
            const parser = new ubx_parser_1.UBXParser();
            const packets = [];
            // Register parsers for specific message types
            try {
                const { UBX_NAV_PVT_Parser, UBX_NAV_SAT_Parser } = require('@csllc/ubx-parser');
                parser.registerParser(new UBX_NAV_PVT_Parser());
                parser.registerParser(new UBX_NAV_SAT_Parser());
            }
            catch (error) {
                console.warn('Could not register UBX parsers:', error);
            }
            // Register event handler for parsed packets
            parser.on('data', (packet) => {
                if (packet && packet.messageClass !== undefined && packet.messageId !== undefined) {
                    // Convert to standardized format
                    const timestamp = new Date().getTime();
                    const jsonlRecord = {
                        timestamp_ms: timestamp,
                        type: 'UBX',
                        message_class: `0x${packet.messageClass.toString(16).padStart(2, '0')}`,
                        message_id: `0x${packet.messageId.toString(16).padStart(2, '0')}`,
                        data: packet.payload
                    };
                    // Extract location data if available
                    if (packet.messageClass === 0x01) {
                        // NAV class messages
                        switch (packet.messageId) {
                            case 0x02: // NAV-POSLLH
                                if (packet.payload && packet.payload.length >= 28) {
                                    // Extract position data
                                    const view = new DataView(packet.payload.buffer);
                                    const iTOW = view.getUint32(0, true); // GPS time of week (ms)
                                    const lon = view.getInt32(4, true) * 1e-7; // Longitude (deg)
                                    const lat = view.getInt32(8, true) * 1e-7; // Latitude (deg)
                                    const height = view.getInt32(12, true); // Height above ellipsoid (mm)
                                    const hMSL = view.getInt32(16, true); // Height above mean sea level (mm)
                                    const hAcc = view.getUint32(20, true); // Horizontal accuracy (mm)
                                    const vAcc = view.getUint32(24, true); // Vertical accuracy (mm)
                                    jsonlRecord.latitude = lat;
                                    jsonlRecord.longitude = lon;
                                    jsonlRecord.altitude = hMSL / 1000; // Convert mm to m
                                    jsonlRecord.h_accuracy = hAcc / 1000; // Convert mm to m
                                    jsonlRecord.v_accuracy = vAcc / 1000; // Convert mm to m
                                }
                                break;
                            case 0x07: // NAV-PVT
                                if (packet.payload && typeof packet.payload === 'object') {
                                    // For NAV-PVT, the payload might be parsed by a registered parser
                                    const pvtData = packet.payload;
                                    if (pvtData.lat !== undefined && pvtData.lon !== undefined) {
                                        // Create a proper timestamp from the UBX time if available
                                        if (pvtData.year && pvtData.month && pvtData.day &&
                                            pvtData.hour !== undefined && pvtData.min !== undefined && pvtData.sec !== undefined) {
                                            const date = new Date(Date.UTC(pvtData.year, pvtData.month - 1, pvtData.day, pvtData.hour, pvtData.min, pvtData.sec));
                                            jsonlRecord.timestamp_ms = date.getTime();
                                        }
                                        jsonlRecord.latitude = pvtData.lat * 1e-7; // Convert to degrees
                                        jsonlRecord.longitude = pvtData.lon * 1e-7; // Convert to degrees
                                        jsonlRecord.altitude = pvtData.hMSL / 1000; // Convert mm to m
                                        jsonlRecord.num_satellites = pvtData.numSV;
                                        jsonlRecord.h_accuracy = pvtData.hAcc / 1000; // Convert mm to m
                                        jsonlRecord.v_accuracy = pvtData.vAcc / 1000; // Convert mm to m
                                        jsonlRecord.speed = pvtData.gSpeed / 1000; // Convert mm/s to m/s
                                        jsonlRecord.heading = pvtData.headMot;
                                        jsonlRecord.pdop = pvtData.pDOP;
                                        jsonlRecord.fix_type = pvtData.fixType;
                                    }
                                }
                                break;
                        }
                    }
                    // Write the record to JSONL
                    writeStream.write(JSON.stringify(jsonlRecord) + '\n');
                    packets.push(jsonlRecord);
                }
            });
            // Parse the buffer
            parser.parse(fileBuffer);
            console.log(`Processed UBX file, found ${packets.length} packets`);
        }
        catch (error) {
            console.error('Error converting UBX to JSONL:', error);
            throw error;
        }
        finally {
            writeStream.end();
        }
    });
}
// AI-assisted parsing for complex formats
function aiAssistedParsing(inputPath, outputPath, format) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`Attempting AI-assisted parsing for ${format} format`);
        try {
            // Determine if this is likely GNSS or IMU data
            const fileName = path_1.default.basename(inputPath).toLowerCase();
            let dataType = 'unknown';
            // Simple heuristic - can be improved
            if (format === 'RINEX' || format === 'NMEA' || format === 'GPS') {
                dataType = 'gnss';
            }
            else if (format === 'IMU' || format === 'INS') {
                dataType = 'imu';
            }
            else if (fileName.includes('gnss') || fileName.includes('gps')) {
                dataType = 'gnss';
            }
            else if (fileName.includes('imu') || fileName.includes('ins')) {
                dataType = 'imu';
            }
            // For NMEA files, always use the format directly as NMEA - this ensures we get NMEA-specific handling
            if (format === 'NMEA') {
                console.log('NMEA file detected - using dedicated NMEA processing');
                console.log(`\n========== FIRST LLM: NMEA FORMAT CONVERSION ==========\n`);
                const conversionResult = yield (0, aiService_1.aiAssistedConversion)(inputPath, outputPath, 'NMEA');
                console.log(`\n========== FIRST LLM COMPLETE ==========\n`);
                if (conversionResult.success && conversionResult.output_path) {
                    // If AI conversion succeeded, copy the result to the expected output path if needed
                    if (conversionResult.output_path !== outputPath) {
                        fs_1.default.copyFileSync(conversionResult.output_path, outputPath);
                    }
                    return true;
                }
                // For NMEA files, we don't want to fall back to basic parsing
                console.log(`AI-assisted parsing for NMEA was not successful`);
                console.log(`Error: ${conversionResult.error}`);
                return false;
            }
            // Non-NMEA file processing
            console.log(`\n========== FIRST LLM: ${dataType.toUpperCase()} FORMAT CONVERSION ==========\n`);
            const conversionResult = yield (0, aiService_1.aiAssistedConversion)(inputPath, outputPath, dataType);
            console.log(`\n========== FIRST LLM COMPLETE ==========\n`);
            if (conversionResult.success && conversionResult.output_path) {
                // If AI conversion succeeded, copy the result to the expected output path
                fs_1.default.copyFileSync(conversionResult.output_path, outputPath);
                return true;
            }
            // If AI conversion failed, return false to fallback to basic parsing
            console.log(`AI-assisted parsing for ${format} was not successful, falling back to basic parsing`);
            console.log(`Error: ${conversionResult.error}`);
            return false;
        }
        catch (error) {
            console.error(`Error in AI-assisted parsing for ${format}:`, error);
            return false;
        }
    });
}
// Validate standardized location data
function validateLocationData(inputPath) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_5, _b, _c;
        console.log(`Validating location data in ${inputPath}`);
        const issues = [];
        let recordCount = 0;
        let validRecordCount = 0;
        try {
            const fileStream = fs_1.default.createReadStream(inputPath);
            const rl = readline_1.default.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });
            let prevTimestamp = null;
            try {
                for (var _d = true, rl_4 = __asyncValues(rl), rl_4_1; rl_4_1 = yield rl_4.next(), _a = rl_4_1.done, !_a; _d = true) {
                    _c = rl_4_1.value;
                    _d = false;
                    const line = _c;
                    recordCount++;
                    try {
                        const record = JSON.parse(line);
                        // Check required fields
                        if (!record.timestamp_ms) {
                            issues.push(`Record ${recordCount}: Missing timestamp`);
                            continue;
                        }
                        // Validate timestamp
                        if (typeof record.timestamp_ms !== 'number' || isNaN(record.timestamp_ms)) {
                            issues.push(`Record ${recordCount}: Invalid timestamp format`);
                            continue;
                        }
                        // Check timestamp sequence
                        if (prevTimestamp !== null && record.timestamp_ms < prevTimestamp) {
                            issues.push(`Record ${recordCount}: Timestamp out of sequence`);
                        }
                        prevTimestamp = record.timestamp_ms;
                        // Validate coordinates if present
                        if (record.latitude !== undefined && record.longitude !== undefined) {
                            // Check latitude range (-90 to 90)
                            if (typeof record.latitude !== 'number' ||
                                isNaN(record.latitude) ||
                                record.latitude < -90 ||
                                record.latitude > 90) {
                                issues.push(`Record ${recordCount}: Invalid latitude value ${record.latitude}`);
                                continue;
                            }
                            // Check longitude range (-180 to 180)
                            if (typeof record.longitude !== 'number' ||
                                isNaN(record.longitude) ||
                                record.longitude < -180 ||
                                record.longitude > 180) {
                                issues.push(`Record ${recordCount}: Invalid longitude value ${record.longitude}`);
                                continue;
                            }
                        }
                        // Validate altitude if present
                        if (record.altitude !== undefined) {
                            if (typeof record.altitude !== 'number' || isNaN(record.altitude)) {
                                issues.push(`Record ${recordCount}: Invalid altitude value ${record.altitude}`);
                                continue;
                            }
                        }
                        // Validate num_satellites if present
                        if (record.num_satellites !== undefined) {
                            if (typeof record.num_satellites !== 'number' ||
                                !Number.isInteger(record.num_satellites) ||
                                record.num_satellites < 0) {
                                issues.push(`Record ${recordCount}: Invalid num_satellites value ${record.num_satellites}`);
                                continue;
                            }
                        }
                        // Validate hdop if present
                        if (record.hdop !== undefined) {
                            if (typeof record.hdop !== 'number' || isNaN(record.hdop) || record.hdop < 0) {
                                issues.push(`Record ${recordCount}: Invalid hdop value ${record.hdop}`);
                                continue;
                            }
                        }
                        // Record is valid
                        validRecordCount++;
                    }
                    catch (error) {
                        issues.push(`Record ${recordCount}: Invalid JSON format`);
                    }
                }
            }
            catch (e_5_1) { e_5 = { error: e_5_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = rl_4.return)) yield _b.call(rl_4);
                }
                finally { if (e_5) throw e_5.error; }
            }
            console.log(`Validated ${recordCount} records, found ${validRecordCount} valid records and ${issues.length} issues`);
            return {
                valid: issues.length === 0,
                issues
            };
        }
        catch (error) {
            console.error('Error validating location data:', error);
            issues.push(`File error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return {
                valid: false,
                issues
            };
        }
    });
}
exports.fileProcessingService = {
    // Process multiple files (GNSS and/or IMU)
    processFiles: (files) => __awaiter(void 0, void 0, void 0, function* () {
        const jobId = (0, uuid_1.v4)();
        yield fileProcessingQueue.add(files, {
            jobId,
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 1000
            }
        });
        return jobId;
    }),
    // Original processFile function (for backward compatibility)
    processFile: (filePath, originalFilename) => __awaiter(void 0, void 0, void 0, function* () {
        return exports.fileProcessingService.processFiles({
            gnssFile: {
                originalname: originalFilename,
                filename: path_1.default.basename(filePath),
                path: filePath
            }
        });
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
        // Get detailed status info if available
        let stage = 'processing';
        let message = 'Processing file(s)...';
        let details = null;
        if (job.data && job.data.stage) {
            stage = job.data.stage;
        }
        if (job.data && job.data.message) {
            message = job.data.message;
        }
        if (job.data && job.data.details) {
            details = job.data.details;
        }
        // If job is completed but we have no custom message
        if (state === 'completed' && stage === 'processing') {
            stage = 'complete';
            message = 'Processing complete! Your files are ready.';
        }
        // If job failed but we have no custom message
        if (state === 'failed' && stage === 'processing') {
            stage = 'error';
            message = failReason || 'Processing failed due to an unknown error.';
        }
        return {
            id: job.id,
            state,
            progress,
            stage,
            message,
            details,
            result,
            failReason,
            createdAt: job.timestamp
        };
    })
};
