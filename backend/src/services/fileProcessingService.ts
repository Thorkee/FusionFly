import Queue from 'bull';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import readline from 'readline';
import { promisify } from 'util';
import * as nmeaSimple from 'nmea-simple';
import { UBXParser } from '@csllc/ubx-parser';

// Load environment variables
dotenv.config();

// Create a Bull queue for file processing
const fileProcessingQueue = new Queue('file-processing', {
  redis: {
    port: parseInt(process.env.REDIS_PORT || '6383'),
    host: process.env.REDIS_HOST || 'localhost',
  }
});

// Define file interface for processing
interface ProcessFile {
  originalname: string;
  filename: string;
  path: string;
}

interface ProcessFilesData {
  gnssFile?: ProcessFile;
  imuFile?: ProcessFile;
}

// Update the queue processor to handle multiple files
fileProcessingQueue.process(async (job) => {
  const { gnssFile, imuFile } = job.data;
  
  try {
    // Update job progress
    await job.progress(10);
    
    const result: any = {
      status: 'completed',
      message: 'File processing completed successfully',
      files: {}
    };
    
    // Process GNSS file if provided
    if (gnssFile) {
      const filePath = gnssFile.path;
      const fileExtension = path.extname(filePath).toLowerCase();
      
      // Step 1: Convert to JSONL if needed
      let jsonlFilePath = filePath;
      if (fileExtension !== '.jsonl') {
        const baseName = path.basename(filePath, fileExtension);
        jsonlFilePath = path.join(path.dirname(filePath), `${baseName}.jsonl`);
        
        // Perform real conversion based on file extension
        await convertToJsonl(filePath, jsonlFilePath, fileExtension);
      }
      await job.progress(40);
      
      // Step 2: Extract location data
      const baseName = path.basename(jsonlFilePath, '.jsonl');
      const locationFilePath = path.join(path.dirname(jsonlFilePath), `${baseName}.location.jsonl`);
      
      // Extract location data from JSONL
      await extractLocationData(jsonlFilePath, locationFilePath);
      await job.progress(60);
      
      // Step 3: Validate the extracted location data
      const validationResult = await validateLocationData(locationFilePath);
      
      // Create validation report if there are issues
      let validationReportPath = null;
      if (!validationResult.valid && validationResult.issues.length > 0) {
        validationReportPath = path.join(path.dirname(locationFilePath), `${baseName}.validation.json`);
        fs.writeFileSync(validationReportPath, JSON.stringify({
          timestamp: new Date().toISOString(),
          valid: validationResult.valid,
          issues: validationResult.issues
        }, null, 2));
      }
      
      result.files.gnss = {
        original: path.basename(filePath),
        jsonl: path.basename(jsonlFilePath),
        location: path.basename(locationFilePath),
        validation: validationReportPath ? path.basename(validationReportPath) : null
      };
      
      result.gnssValidation = {
        valid: validationResult.valid,
        issueCount: validationResult.issues.length
      };
    }
    
    // Process IMU file if provided
    if (imuFile) {
      const filePath = imuFile.path;
      const fileExtension = path.extname(filePath).toLowerCase();
      
      // Step 1: Convert to JSONL if needed
      let jsonlFilePath = filePath;
      if (fileExtension !== '.jsonl') {
        const baseName = path.basename(filePath, fileExtension);
        jsonlFilePath = path.join(path.dirname(filePath), `${baseName}.jsonl`);
        
        // Perform real conversion based on file extension
        await convertToJsonl(filePath, jsonlFilePath, fileExtension);
      }
      await job.progress(80);
      
      result.files.imu = {
        original: path.basename(filePath),
        jsonl: path.basename(jsonlFilePath)
      };
    }
    
    // If both GNSS and IMU data are provided, perform data fusion
    if (gnssFile && imuFile) {
      // Future enhancement: Implement GNSS+IMU data fusion with FGO
      result.fusion = {
        status: 'Planned for future release',
        message: 'GNSS+IMU fusion will be available in a future update'
      };
    }
    
    await job.progress(100);
    return result;
    
  } catch (error: unknown) {
    console.error('Error processing files:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to process files: ${errorMessage}`);
  }
});

// Convert various file formats to JSONL
async function convertToJsonl(inputPath: string, outputPath: string, fileExtension: string): Promise<void> {
  console.log(`Converting ${inputPath} to JSONL format`);
  
  switch (fileExtension) {
    case '.obs':
    case '.rnx':
    case '.21o':
    case '.22o':
    case '.23o':
      await convertRinexToJsonl(inputPath, outputPath);
      break;
    case '.nmea':
    case '.gps':
    case '.txt':
      // Try to detect format based on content
      await detectAndConvertToJsonl(inputPath, outputPath);
      break;
    case '.json':
      await convertJsonToJsonl(inputPath, outputPath);
      break;
    case '.ubx':
      await convertUbxToJsonl(inputPath, outputPath);
      break;
    case '.csv':
      // For CSV files, try to detect if it's a GPS/GNSS format
      await detectAndConvertToJsonl(inputPath, outputPath);
      break;
    default:
      // For unsupported formats, create a basic conversion with file content
      await basicFileToJsonl(inputPath, outputPath);
  }
}

// Convert RINEX observation files to JSONL
async function convertRinexToJsonl(inputPath: string, outputPath: string): Promise<void> {
  console.log('Processing RINEX file');
  
  try {
    // Since we can't use the georinex library directly in Node.js, 
    // we'll parse the RINEX file manually using basic rules
    const writeStream = fs.createWriteStream(outputPath);
    const fileStream = fs.createReadStream(inputPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    let headerEnded = false;
    let epochData: any = {};
    let epochTime = null;
    let lineCount = 0;
    let recordCount = 0;
    let parseError = false;
    
    for await (const line of rl) {
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
              const observations: any = {};
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
      } catch (error) {
        console.error(`Error parsing RINEX line ${lineCount}:`, error);
        parseError = true;
      }
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
      const aiSuccess = await aiAssistedParsing(inputPath, outputPath, 'RINEX');
      
      if (!aiSuccess) {
        console.log('AI-assisted parsing failed, using basic parsing results');
      }
    }
  } catch (error) {
    console.error('Error converting RINEX to JSONL:', error);
    
    // Try AI-assisted parsing as a fallback
    try {
      console.log('Error in basic RINEX parsing, trying AI-assisted parsing');
      const aiSuccess = await aiAssistedParsing(inputPath, outputPath, 'RINEX');
      
      if (!aiSuccess) {
        throw error; // Re-throw the original error if AI parsing also fails
      }
    } catch (aiError) {
      console.error('AI-assisted parsing also failed:', aiError);
      throw error; // Throw the original error
    }
  }
}

// Convert NMEA sentences to JSONL
async function convertNmeaToJsonl(inputPath: string, outputPath: string): Promise<void> {
  console.log('Processing NMEA file');
  
  try {
    const writeStream = fs.createWriteStream(outputPath);
    const fileStream = fs.createReadStream(inputPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    let lineCount = 0;
    let recordCount = 0;
    let parseErrors = 0;
    
    for await (const line of rl) {
      lineCount++;
      
      try {
        // Parse NMEA sentence
        const nmeaData = parseNmeaSentence(line.trim());
        if (nmeaData) {
          recordCount++;
          const jsonlLine = JSON.stringify(nmeaData);
          writeStream.write(jsonlLine + '\n');
        }
      } catch (error) {
        parseErrors++;
        console.error(`Error parsing NMEA line ${lineCount}:`, error);
      }
    }
    
    writeStream.end();
    
    console.log(`Processed ${lineCount} lines, created ${recordCount} records from NMEA file`);
    
    // If we had a high error rate or few records, try AI-assisted parsing
    const errorRate = parseErrors / lineCount;
    if (errorRate > 0.2 || recordCount === 0) {
      console.log('NMEA parsing had issues, trying AI-assisted parsing');
      const aiSuccess = await aiAssistedParsing(inputPath, outputPath, 'NMEA');
      
      if (!aiSuccess) {
        console.log('AI-assisted parsing failed, using basic parsing results');
      }
    }
  } catch (error) {
    console.error('Error converting NMEA to JSONL:', error);
    
    // Try AI-assisted parsing as a fallback
    try {
      console.log('Error in NMEA parsing, trying AI-assisted parsing');
      const aiSuccess = await aiAssistedParsing(inputPath, outputPath, 'NMEA');
      
      if (!aiSuccess) {
        throw error; // Re-throw the original error if AI parsing also fails
      }
    } catch (aiError) {
      console.error('AI-assisted parsing also failed:', aiError);
      throw error; // Throw the original error
    }
  }
}

// Parse NMEA sentence to data object
function parseNmeaSentence(sentence: string): any {
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
    let result: any = {
      timestamp_ms: timestamp,
      type: 'NMEA',
      message_type: parsedSentence.sentenceId
    };
    
    // Handle different message types
    switch (parsedSentence.sentenceId) {
      case 'GGA': {
        const gga = parsedSentence as nmeaSimple.GGAPacket;
        result.latitude = gga.latitude;
        result.longitude = gga.longitude;
        result.altitude = gga.altitudeMeters;
        result.quality = gga.fixType;
        result.num_satellites = gga.satellitesInView;
        result.hdop = gga.horizontalDilution;
        break;
      }
      case 'RMC': {
        const rmc = parsedSentence as nmeaSimple.RMCPacket;
        result.latitude = rmc.latitude;
        result.longitude = rmc.longitude;
        result.speed = rmc.speedKnots * 0.514444; // Convert knots to m/s
        result.course = rmc.trackTrue;
        break;
      }
      case 'GSA': {
        const gsa = parsedSentence as nmeaSimple.GSAPacket;
        result.hdop = gsa.HDOP;
        result.pdop = gsa.PDOP;
        result.vdop = gsa.VDOP;
        result.fix_type = gsa.fixMode;
        result.fix_mode = gsa.selectionMode;
        result.satellites_used = gsa.satellites;
        break;
      }
      case 'GSV': {
        const gsv = parsedSentence as nmeaSimple.GSVPacket;
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
  } catch (error) {
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
function convertNmeaCoordinate(coord: string, dir: string): number | null {
  if (!coord || !dir) return null;
  
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
  } catch (error) {
    console.error('Error converting NMEA coordinate:', error);
    return null;
  }
}

// Detect file format based on content and convert
async function detectAndConvertToJsonl(inputPath: string, outputPath: string): Promise<void> {
  // Read the first few lines to determine format
  const fileStream = fs.createReadStream(inputPath, { encoding: 'utf8', highWaterMark: 1024 });
  let content = '';
  
  for await (const chunk of fileStream) {
    content += chunk;
    if (content.length > 1000) break;
  }
  
  // Try to determine format based on content
  if (content.includes('$GP') || content.includes('$GN') || content.includes('$GL')) {
    // Looks like NMEA
    await convertNmeaToJsonl(inputPath, outputPath);
  } else if (content.includes('RINEX VERSION') || content.includes('END OF HEADER')) {
    // Looks like RINEX
    await convertRinexToJsonl(inputPath, outputPath);
  } else if (content.trim().startsWith('{') && content.includes('}')) {
    // Looks like JSON
    await convertJsonToJsonl(inputPath, outputPath);
  } else {
    // Check for UBX format (binary format)
    // UBX packets start with 0xB5 0x62 (µb in ASCII)
    try {
      const buffer = fs.readFileSync(inputPath);
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
        await convertUbxToJsonl(inputPath, outputPath);
      } else {
        // Unknown format, use basic conversion
        await basicFileToJsonl(inputPath, outputPath);
      }
    } catch (error) {
      console.error('Error detecting file format:', error);
      // Fall back to basic conversion
      await basicFileToJsonl(inputPath, outputPath);
    }
  }
}

// Convert JSON to JSONL
async function convertJsonToJsonl(inputPath: string, outputPath: string): Promise<void> {
  try {
    const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const writeStream = fs.createWriteStream(outputPath);
    
    if (Array.isArray(data)) {
      // If it's an array, each item becomes a line
      for (const item of data) {
        writeStream.write(JSON.stringify(item) + '\n');
      }
    } else {
      // If it's an object, the whole object becomes one line
      writeStream.write(JSON.stringify(data) + '\n');
    }
    
    writeStream.end();
  } catch (error) {
    console.error('Error converting JSON to JSONL:', error);
    throw error;
  }
}

// Basic conversion for unknown file formats
async function basicFileToJsonl(inputPath: string, outputPath: string): Promise<void> {
  const writeStream = fs.createWriteStream(outputPath);
  
  try {
    const fileStream = fs.createReadStream(inputPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    let lineNumber = 0;
    
    for await (const line of rl) {
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
  } catch (error) {
    console.error('Error converting file to JSONL:', error);
    throw error;
  } finally {
    writeStream.end();
  }
}

// Extract location data from JSONL
async function extractLocationData(inputPath: string, outputPath: string): Promise<void> {
  console.log(`Extracting location data from ${inputPath}`);
  
  const writeStream = fs.createWriteStream(outputPath);
  
  try {
    const fileStream = fs.createReadStream(inputPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    let recordCount = 0;
    let extractedCount = 0;
    
    for await (const line of rl) {
      recordCount++;
      try {
        const record = JSON.parse(line);
        const locationData = extractLocationFromRecord(record);
        
        if (locationData) {
          extractedCount++;
          writeStream.write(JSON.stringify(locationData) + '\n');
        }
      } catch (error) {
        console.error(`Error parsing line ${recordCount}:`, error);
      }
    }
    
    console.log(`Processed ${recordCount} records, extracted ${extractedCount} location records`);
  } catch (error) {
    console.error('Error extracting location data:', error);
    throw error;
  } finally {
    writeStream.end();
  }
}

// Extract location from a JSONL record
function extractLocationFromRecord(record: any): any {
  if (!record || typeof record !== 'object') {
    return null;
  }
  
  const timestamp = record.timestamp_ms || new Date().getTime();
  let result: any = {
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
  } else if (record.type === 'RINEX') {
    // Extract from RINEX record
    if (record.data && typeof record.data === 'object') {
      // Count satellites
      const numSatellites = Object.keys(record.data).length;
      
      // For RINEX, we don't have direct position, just create a record with satellite count
      result.data_type = 'RINEX';
      result.num_satellites = numSatellites;
      
      return result;
    }
  } else if (record.type === 'UBX') {
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
  } else {
    // Try to extract from unknown format
    if (record.latitude !== undefined && record.longitude !== undefined) {
      result.latitude = record.latitude;
      result.longitude = record.longitude;
      
      if (record.altitude !== undefined) {
        result.altitude = record.altitude;
      }
      
      return result;
    } else if (record.lat !== undefined && record.lon !== undefined) {
      result.latitude = record.lat;
      result.longitude = record.lon;
      
      if (record.alt !== undefined) {
        result.altitude = record.alt;
      }
      
      return result;
    } else if (record.data && record.data.lat !== undefined && record.data.lon !== undefined) {
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
async function convertUbxToJsonl(inputPath: string, outputPath: string): Promise<void> {
  console.log('Processing UBX file');
  
  const writeStream = fs.createWriteStream(outputPath);
  
  try {
    // Read the file as a binary buffer
    const fileBuffer = fs.readFileSync(inputPath);
    
    // Create a UBX parser
    const parser = new UBXParser();
    const packets: any[] = [];
    
    // Register parsers for specific message types
    try {
      const { UBX_NAV_PVT_Parser, UBX_NAV_SAT_Parser } = require('@csllc/ubx-parser');
      parser.registerParser(new UBX_NAV_PVT_Parser());
      parser.registerParser(new UBX_NAV_SAT_Parser());
    } catch (error) {
      console.warn('Could not register UBX parsers:', error);
    }
    
    // Register event handler for parsed packets
    parser.on('data', (packet: any) => {
      if (packet && packet.messageClass !== undefined && packet.messageId !== undefined) {
        // Convert to standardized format
        const timestamp = new Date().getTime();
        const jsonlRecord: any = {
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
                const pvtData = packet.payload as any;
                
                if (pvtData.lat !== undefined && pvtData.lon !== undefined) {
                  // Create a proper timestamp from the UBX time if available
                  if (pvtData.year && pvtData.month && pvtData.day && 
                      pvtData.hour !== undefined && pvtData.min !== undefined && pvtData.sec !== undefined) {
                    const date = new Date(Date.UTC(pvtData.year, pvtData.month - 1, pvtData.day, 
                                                  pvtData.hour, pvtData.min, pvtData.sec));
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
  } catch (error) {
    console.error('Error converting UBX to JSONL:', error);
    throw error;
  } finally {
    writeStream.end();
  }
}

// AI-assisted parsing for complex formats
async function aiAssistedParsing(inputPath: string, outputPath: string, format: string): Promise<boolean> {
  console.log(`Attempting AI-assisted parsing for ${format} format`);
  
  try {
    // This is a placeholder for AI-assisted parsing
    // In a real implementation, this would call an AI service to analyze the file
    // and generate appropriate parsing logic
    
    // For now, we'll just return false to indicate that AI parsing was not successful
    // and the system should fall back to basic parsing
    
    // In a real implementation, this function would:
    // 1. Send a sample of the file to an AI service
    // 2. Get back parsing instructions or a parsing function
    // 3. Apply the parsing logic to convert the file to JSONL
    // 4. Return true if successful
    
    return false;
  } catch (error) {
    console.error(`Error in AI-assisted parsing for ${format}:`, error);
    return false;
  }
}

// Validate standardized location data
async function validateLocationData(inputPath: string): Promise<{ valid: boolean, issues: string[] }> {
  console.log(`Validating location data in ${inputPath}`);
  
  const issues: string[] = [];
  let recordCount = 0;
  let validRecordCount = 0;
  
  try {
    const fileStream = fs.createReadStream(inputPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    let prevTimestamp: number | null = null;
    
    for await (const line of rl) {
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
      } catch (error) {
        issues.push(`Record ${recordCount}: Invalid JSON format`);
      }
    }
    
    console.log(`Validated ${recordCount} records, found ${validRecordCount} valid records and ${issues.length} issues`);
    
    return {
      valid: issues.length === 0,
      issues
    };
  } catch (error) {
    console.error('Error validating location data:', error);
    issues.push(`File error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    return {
      valid: false,
      issues
    };
  }
}

export const fileProcessingService = {
  // Process multiple files (GNSS and/or IMU)
  processFiles: async (files: ProcessFilesData): Promise<string> => {
    const jobId = uuidv4();
    
    await fileProcessingQueue.add(
      files,
      {
        jobId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        }
      }
    );
    
    return jobId;
  },
  
  // Original processFile function (for backward compatibility)
  processFile: async (filePath: string, originalFilename: string): Promise<string> => {
    return fileProcessingService.processFiles({
      gnssFile: {
        originalname: originalFilename,
        filename: path.basename(filePath),
        path: filePath
      }
    });
  },
  
  // Get the status of a processing job
  getJobStatus: async (jobId: string) => {
    const job = await fileProcessingQueue.getJob(jobId);
    
    if (!job) {
      return null;
    }
    
    const state = await job.getState();
    const progress = await job.progress();
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
  }
}; 