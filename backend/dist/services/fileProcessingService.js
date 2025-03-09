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
                const jsonlUrl = yield blobStorageService.uploadFile(jsonlFilePath, jsonlBlobName, processedContainer);
                console.log(`Uploaded converted JSONL file to processed container: ${jsonlUrl}`);
            }
            yield job.progress(40);
            // Step 2: Extract location data
            yield job.update({ stage: 'extracting_location', message: 'Extracting location data from GNSS file...' });
            const baseName = path_1.default.basename(jsonlFilePath, '.jsonl');
            const locationFilePath = path_1.default.join(path_1.default.dirname(jsonlFilePath), `${baseName}.location.jsonl`);
            // Extract location data from JSONL
            yield extractLocationData(jsonlFilePath, locationFilePath);
            // Upload the location data file to processed container
            yield job.update({ stage: 'uploading_location', message: 'Uploading extracted location data...' });
            const locationBlobName = path_1.default.basename(locationFilePath);
            const locationUrl = yield blobStorageService.uploadFile(locationFilePath, locationBlobName, processedContainer);
            console.log(`Uploaded location data file to processed container: ${locationUrl}`);
            yield job.progress(60);
            // Step 3: Validate the extracted location data
            yield job.update({ stage: 'validating', message: 'Validating location data...' });
            const validationResult = yield validateLocationData(locationFilePath);
            // Create validation report if there are issues
            let validationReportPath = null;
            let validationUrl = null;
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
                validationUrl = yield blobStorageService.uploadFile(validationReportPath, validationBlobName, processedContainer);
                console.log(`Uploaded validation report to processed container: ${validationUrl}`);
            }
            // Step 4: AI-assisted schema conversion for GNSS data
            yield job.update({ stage: 'second_conversion', message: 'Converting to structured schema format...' });
            const schemaConversionPath = path_1.default.join(path_1.default.dirname(locationFilePath), `${baseName}.structured.json`);
            try {
                yield job.update({
                    stage: 'second_conversion_ai',
                    message: 'Generating AI-assisted conversion code for structured schema...'
                });
                const gnssConversionResult = yield (0, aiService_1.aiAssistedConversion)(locationFilePath, schemaConversionPath, 'gnss');
                if (gnssConversionResult.success && gnssConversionResult.output_path) {
                    // Upload the structured schema file to processed container
                    yield job.update({
                        stage: 'second_conversion_complete',
                        message: 'Schema conversion successful, uploading structured data...'
                    });
                    const schemaConversionBlobName = path_1.default.basename(gnssConversionResult.output_path);
                    const schemaConversionUrl = yield blobStorageService.uploadFile(gnssConversionResult.output_path, schemaConversionBlobName, processedContainer);
                    console.log(`Uploaded GNSS structured schema file to processed container: ${schemaConversionUrl}`);
                    result.files.gnss = {
                        original: path_1.default.basename(filePath),
                        jsonl: path_1.default.basename(jsonlFilePath),
                        location: path_1.default.basename(locationFilePath),
                        validation: validationReportPath ? path_1.default.basename(validationReportPath) : null,
                        structured: schemaConversionBlobName
                    };
                }
                else {
                    yield job.update({
                        stage: 'second_conversion_failed',
                        message: 'Schema conversion failed, continuing with basic data...',
                        details: { error: gnssConversionResult.error }
                    });
                    console.error(`GNSS schema conversion failed: ${gnssConversionResult.error}`);
                    result.files.gnss = {
                        original: path_1.default.basename(filePath),
                        jsonl: path_1.default.basename(jsonlFilePath),
                        location: path_1.default.basename(locationFilePath),
                        validation: validationReportPath ? path_1.default.basename(validationReportPath) : null,
                        structuredError: gnssConversionResult.error
                    };
                }
            }
            catch (schemaError) {
                yield job.update({
                    stage: 'second_conversion_error',
                    message: 'Schema conversion encountered an error, continuing with basic data...',
                    details: { error: schemaError instanceof Error ? schemaError.message : String(schemaError) }
                });
                result.files.gnss = {
                    original: path_1.default.basename(filePath),
                    jsonl: path_1.default.basename(jsonlFilePath),
                    location: path_1.default.basename(locationFilePath),
                    validation: validationReportPath ? path_1.default.basename(validationReportPath) : null,
                    structuredError: schemaError instanceof Error ? schemaError.message : String(schemaError)
                };
            }
            result.gnssValidation = {
                valid: validationResult.valid,
                issueCount: validationResult.issues.length
            };
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
                const jsonlUrl = yield blobStorageService.uploadFile(jsonlFilePath, jsonlBlobName, processedContainer);
                console.log(`Uploaded converted IMU file to processed container: ${jsonlUrl}`);
            }
            yield job.progress(80);
            // Step 2: AI-assisted schema conversion for IMU data
            yield job.update({ stage: 'second_conversion_imu', message: 'Converting IMU data to structured schema format...' });
            const baseName = path_1.default.basename(jsonlFilePath, '.jsonl');
            const schemaConversionPath = path_1.default.join(path_1.default.dirname(jsonlFilePath), `${baseName}.structured.json`);
            try {
                yield job.update({
                    stage: 'second_conversion_ai_imu',
                    message: 'Generating AI-assisted conversion code for IMU structured schema...'
                });
                const imuConversionResult = yield (0, aiService_1.aiAssistedConversion)(jsonlFilePath, schemaConversionPath, 'imu');
                if (imuConversionResult.success && imuConversionResult.output_path) {
                    // Upload the structured schema file to processed container
                    yield job.update({
                        stage: 'second_conversion_complete_imu',
                        message: 'IMU schema conversion successful, uploading structured data...'
                    });
                    const schemaConversionBlobName = path_1.default.basename(imuConversionResult.output_path);
                    const schemaConversionUrl = yield blobStorageService.uploadFile(imuConversionResult.output_path, schemaConversionBlobName, processedContainer);
                    console.log(`Uploaded IMU structured schema file to processed container: ${schemaConversionUrl}`);
                    result.files.imu = {
                        original: path_1.default.basename(filePath),
                        jsonl: path_1.default.basename(jsonlFilePath),
                        structured: schemaConversionBlobName
                    };
                }
                else {
                    yield job.update({
                        stage: 'second_conversion_failed_imu',
                        message: 'IMU schema conversion failed, continuing with basic data...',
                        details: { error: imuConversionResult.error }
                    });
                    console.error(`IMU schema conversion failed: ${imuConversionResult.error}`);
                    result.files.imu = {
                        original: path_1.default.basename(filePath),
                        jsonl: path_1.default.basename(jsonlFilePath),
                        structuredError: imuConversionResult.error
                    };
                }
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
        yield job.progress(100);
        yield job.update({ stage: 'complete', message: 'Processing completed successfully!' });
        return result;
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
        // Use AI-assisted conversion first
        console.log(`Using AI-assisted conversion for ${dataType} data`);
        try {
            console.log(`Calling aiAssistedConversion with dataType=${dataType}, inputPath=${inputPath}`);
            const conversionResult = yield (0, aiService_1.aiAssistedConversion)(inputPath, outputPath, dataType);
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
                // Don't throw an error here, just log it and continue to fallback
            }
        }
        catch (error) {
            console.error(`Error during AI conversion:`, error);
            // Don't throw an error here, just log it and continue to fallback
        }
        // Only use standard conversion as fallback
        console.log("AI-assisted conversion failed, falling back to standard conversion methods");
        try {
            // Fall back to standard conversion based on file extension
            switch (fileExtension) {
                case '.obs':
                case '.rnx':
                case '.21o':
                case '.22o':
                case '.23o':
                    yield convertRinexToJsonl(inputPath, outputPath);
                    break;
                case '.nmea':
                case '.gps':
                case '.txt':
                    yield convertNmeaToJsonl(inputPath, outputPath);
                    break;
                case '.ubx':
                    yield convertUbxToJsonl(inputPath, outputPath);
                    break;
                case '.json':
                    yield convertJsonToJsonl(inputPath, outputPath);
                    break;
                case '.csv':
                    yield basicFileToJsonl(inputPath, outputPath);
                    break;
                default:
                    // For unknown formats, try format detection
                    console.log(`No predefined converter for ${fileExtension}, attempting format detection...`);
                    yield detectAndConvertToJsonl(inputPath, outputPath);
            }
        }
        catch (error) {
            console.error(`Error in standard conversion process: ${error}`);
            throw new Error(`All conversion methods failed for ${inputPath}: ${error}`);
        }
    });
}
// Convert RINEX observation files to JSONL
function convertRinexToJsonl(inputPath, outputPath) {
    var _a, e_1, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
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
                for (var _d = true, rl_1 = __asyncValues(rl), rl_1_1; rl_1_1 = yield rl_1.next(), _a = rl_1_1.done, !_a;) {
                    _c = rl_1_1.value;
                    _d = false;
                    try {
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
                    finally {
                        _d = true;
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
    var _a, e_2, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Processing NMEA file');
        try {
            const writeStream = fs_1.default.createWriteStream(outputPath);
            const fileStream = fs_1.default.createReadStream(inputPath);
            const rl = readline_1.default.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });
            let lineCount = 0;
            let recordCount = 0;
            let parseErrors = 0;
            try {
                for (var _d = true, rl_2 = __asyncValues(rl), rl_2_1; rl_2_1 = yield rl_2.next(), _a = rl_2_1.done, !_a;) {
                    _c = rl_2_1.value;
                    _d = false;
                    try {
                        const line = _c;
                        lineCount++;
                        try {
                            // Parse NMEA sentence
                            const nmeaData = parseNmeaSentence(line.trim());
                            if (nmeaData) {
                                recordCount++;
                                const jsonlLine = JSON.stringify(nmeaData);
                                writeStream.write(jsonlLine + '\n');
                            }
                        }
                        catch (error) {
                            parseErrors++;
                            console.error(`Error parsing NMEA line ${lineCount}:`, error);
                        }
                    }
                    finally {
                        _d = true;
                    }
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = rl_2.return)) yield _b.call(rl_2);
                }
                finally { if (e_2) throw e_2.error; }
            }
            writeStream.end();
            console.log(`Processed ${lineCount} lines, created ${recordCount} records from NMEA file`);
            // If we had a high error rate or few records, try AI-assisted parsing
            const errorRate = parseErrors / lineCount;
            if (errorRate > 0.2 || recordCount === 0) {
                console.log('NMEA parsing had issues, trying AI-assisted parsing');
                const aiSuccess = yield aiAssistedParsing(inputPath, outputPath, 'NMEA');
                if (!aiSuccess) {
                    console.log('AI-assisted parsing failed, using basic parsing results');
                }
            }
        }
        catch (error) {
            console.error('Error converting NMEA to JSONL:', error);
            // Try AI-assisted parsing as a fallback
            try {
                console.log('Error in NMEA parsing, trying AI-assisted parsing');
                const aiSuccess = yield aiAssistedParsing(inputPath, outputPath, 'NMEA');
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
        // Create standardized output
        const timestamp = new Date().getTime(); // Default to current time
        let result = {
            timestamp_ms: timestamp,
            type: 'NMEA',
            message_type: parsedSentence.sentenceId
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
                break;
            }
            case 'RMC': {
                const rmc = parsedSentence;
                result.latitude = rmc.latitude;
                result.longitude = rmc.longitude;
                result.speed = rmc.speedKnots * 0.514444; // Convert knots to m/s
                result.course = rmc.trackTrue;
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
            default:
                // For other sentence types, include the raw data
                result.raw_data = parsedSentence;
                break;
        }
        return result;
    }
    catch (error) {
        console.error('Error parsing NMEA sentence:', error);
        // Fall back to basic parsing if nmea-simple fails
        const messageBody = sentence.substring(1, checksumIndex);
        const parts = messageBody.split(',');
        const messageType = parts[0];
        // Create a basic result with the message type
        return {
            timestamp_ms: new Date().getTime(),
            type: 'NMEA',
            message_type: messageType,
            raw_data: parts.slice(1)
        };
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
    var _a, e_3, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
        // Read the first few lines to determine format
        const fileStream = fs_1.default.createReadStream(inputPath, { encoding: 'utf8', highWaterMark: 1024 });
        let content = '';
        try {
            for (var _d = true, fileStream_1 = __asyncValues(fileStream), fileStream_1_1; fileStream_1_1 = yield fileStream_1.next(), _a = fileStream_1_1.done, !_a;) {
                _c = fileStream_1_1.value;
                _d = false;
                try {
                    const chunk = _c;
                    content += chunk;
                    if (content.length > 1000)
                        break;
                }
                finally {
                    _d = true;
                }
            }
        }
        catch (e_3_1) { e_3 = { error: e_3_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = fileStream_1.return)) yield _b.call(fileStream_1);
            }
            finally { if (e_3) throw e_3.error; }
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
    var _a, e_4, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
        const writeStream = fs_1.default.createWriteStream(outputPath);
        try {
            const fileStream = fs_1.default.createReadStream(inputPath);
            const rl = readline_1.default.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });
            let lineNumber = 0;
            try {
                for (var _d = true, rl_3 = __asyncValues(rl), rl_3_1; rl_3_1 = yield rl_3.next(), _a = rl_3_1.done, !_a;) {
                    _c = rl_3_1.value;
                    _d = false;
                    try {
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
                    finally {
                        _d = true;
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
    var _a, e_5, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`Extracting location data from ${inputPath}`);
        const writeStream = fs_1.default.createWriteStream(outputPath);
        try {
            const fileStream = fs_1.default.createReadStream(inputPath);
            const rl = readline_1.default.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });
            let recordCount = 0;
            let extractedCount = 0;
            try {
                for (var _d = true, rl_4 = __asyncValues(rl), rl_4_1; rl_4_1 = yield rl_4.next(), _a = rl_4_1.done, !_a;) {
                    _c = rl_4_1.value;
                    _d = false;
                    try {
                        const line = _c;
                        recordCount++;
                        try {
                            const record = JSON.parse(line);
                            const locationData = extractLocationFromRecord(record);
                            if (locationData) {
                                extractedCount++;
                                writeStream.write(JSON.stringify(locationData) + '\n');
                            }
                        }
                        catch (error) {
                            console.error(`Error parsing line ${recordCount}:`, error);
                        }
                    }
                    finally {
                        _d = true;
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
            console.log(`Processed ${recordCount} records, extracted ${extractedCount} location records`);
        }
        catch (error) {
            console.error('Error extracting location data:', error);
            throw error;
        }
        finally {
            writeStream.end();
        }
    });
}
// Extract location from a JSONL record
function extractLocationFromRecord(record) {
    if (!record || typeof record !== 'object') {
        return null;
    }
    const timestamp = record.timestamp_ms || new Date().getTime();
    let result = {
        timestamp_ms: timestamp
    };
    // Check record type
    if (record.type === 'NMEA') {
        // Extract from NMEA record
        if (record.message_type === 'GGA' || record.message_type === 'RMC') {
            if (record.latitude !== undefined && record.longitude !== undefined) {
                result.latitude = record.latitude;
                result.longitude = record.longitude;
                if (record.altitude !== undefined) {
                    result.altitude = record.altitude;
                }
                if (record.quality !== undefined) {
                    result.quality = record.quality;
                }
                if (record.hdop !== undefined) {
                    result.hdop = record.hdop;
                }
                if (record.num_satellites !== undefined) {
                    result.num_satellites = record.num_satellites;
                }
                if (record.speed !== undefined) {
                    result.speed = record.speed;
                }
                if (record.course !== undefined) {
                    result.course = record.course;
                }
                return result;
            }
        }
    }
    else if (record.type === 'RINEX') {
        // Extract from RINEX record
        if (record.data && typeof record.data === 'object') {
            // Count satellites
            const numSatellites = Object.keys(record.data).length;
            // For RINEX, we don't have direct position, just create a record with satellite count
            result.data_type = 'RINEX';
            result.num_satellites = numSatellites;
            return result;
        }
    }
    else if (record.type === 'UBX') {
        // Extract from UBX record
        if (record.latitude !== undefined && record.longitude !== undefined) {
            result.latitude = record.latitude;
            result.longitude = record.longitude;
            if (record.altitude !== undefined) {
                result.altitude = record.altitude;
            }
            if (record.num_satellites !== undefined) {
                result.num_satellites = record.num_satellites;
            }
            if (record.h_accuracy !== undefined) {
                result.h_accuracy = record.h_accuracy;
            }
            if (record.v_accuracy !== undefined) {
                result.v_accuracy = record.v_accuracy;
            }
            if (record.speed !== undefined) {
                result.speed = record.speed;
            }
            if (record.heading !== undefined) {
                result.heading = record.heading;
            }
            if (record.pdop !== undefined) {
                result.pdop = record.pdop;
            }
            if (record.fix_type !== undefined) {
                result.fix_type = record.fix_type;
            }
            return result;
        }
    }
    else {
        // Try to extract from unknown format
        if (record.latitude !== undefined && record.longitude !== undefined) {
            result.latitude = record.latitude;
            result.longitude = record.longitude;
            if (record.altitude !== undefined) {
                result.altitude = record.altitude;
            }
            return result;
        }
        else if (record.lat !== undefined && record.lon !== undefined) {
            result.latitude = record.lat;
            result.longitude = record.lon;
            if (record.alt !== undefined) {
                result.altitude = record.alt;
            }
            return result;
        }
        else if (record.data && record.data.lat !== undefined && record.data.lon !== undefined) {
            result.latitude = record.data.lat;
            result.longitude = record.data.lon;
            if (record.data.alt !== undefined) {
                result.altitude = record.data.alt;
            }
            return result;
        }
    }
    // No location data found
    return null;
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
            // Integrate with our new aiService, specifying this is a raw file (true as third parameter)
            const conversionResult = yield (0, aiService_1.aiAssistedConversion)(inputPath, outputPath, dataType);
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
    var _a, e_6, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
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
                for (var _d = true, rl_5 = __asyncValues(rl), rl_5_1; rl_5_1 = yield rl_5.next(), _a = rl_5_1.done, !_a;) {
                    _c = rl_5_1.value;
                    _d = false;
                    try {
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
                    finally {
                        _d = true;
                    }
                }
            }
            catch (e_6_1) { e_6 = { error: e_6_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = rl_5.return)) yield _b.call(rl_5);
                }
                finally { if (e_6) throw e_6.error; }
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
