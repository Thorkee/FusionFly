import Queue from 'bull';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import readline from 'readline';
import { promisify } from 'util';

// Load environment variables
dotenv.config();

// Create a Bull queue for file processing
const fileProcessingQueue = new Queue('file-processing', {
  redis: {
    port: parseInt(process.env.REDIS_PORT || '6383'),
    host: process.env.REDIS_HOST || 'localhost',
  }
});

// Process queue jobs
fileProcessingQueue.process(async (job) => {
  const { filePath, originalFilename } = job.data;
  
  try {
    // Update job progress
    await job.progress(10);
    
    // Step 1: Detect file format
    const fileExtension = path.extname(filePath).toLowerCase();
    await job.progress(20);
    
    // Step 2: Convert to JSONL if needed
    let jsonlFilePath = filePath;
    if (fileExtension !== '.jsonl') {
      const baseName = path.basename(filePath, fileExtension);
      jsonlFilePath = path.join(path.dirname(filePath), `${baseName}.jsonl`);
      
      // Perform real conversion based on file extension
      await convertToJsonl(filePath, jsonlFilePath, fileExtension);
    }
    await job.progress(60);
    
    // Step 3: Extract location data
    const baseName = path.basename(jsonlFilePath, '.jsonl');
    const locationFilePath = path.join(path.dirname(jsonlFilePath), `${baseName}.location.jsonl`);
    
    // Extract location data from JSONL
    await extractLocationData(jsonlFilePath, locationFilePath);
    await job.progress(100);
    
    return {
      status: 'completed',
      message: 'File processing completed successfully',
      files: {
        original: path.basename(filePath),
        jsonl: path.basename(jsonlFilePath),
        location: path.basename(locationFilePath)
      }
    };
  } catch (error: unknown) {
    console.error('Error processing file:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to process file: ${errorMessage}`);
  }
});

// Convert various file formats to JSONL
async function convertToJsonl(inputPath: string, outputPath: string, fileExtension: string): Promise<void> {
  console.log(`Converting ${inputPath} to JSONL format`);
  
  switch (fileExtension) {
    case '.obs':
      await convertRinexToJsonl(inputPath, outputPath);
      break;
    case '.nmea':
      await convertNmeaToJsonl(inputPath, outputPath);
      break;
    case '.txt':
      // Try to detect format based on content
      await detectAndConvertToJsonl(inputPath, outputPath);
      break;
    case '.json':
      await convertJsonToJsonl(inputPath, outputPath);
      break;
    default:
      // For unsupported formats, create a basic conversion with file content
      await basicFileToJsonl(inputPath, outputPath);
  }
}

// Convert RINEX observation files to JSONL
async function convertRinexToJsonl(inputPath: string, outputPath: string): Promise<void> {
  console.log('Processing RINEX file');
  
  const writeStream = fs.createWriteStream(outputPath);
  
  try {
    // Since we can't use the georinex library directly in Node.js, 
    // we'll parse the RINEX file manually using basic rules
    const fileStream = fs.createReadStream(inputPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    let headerEnded = false;
    let epochData: any = {};
    let epochTime = null;
    let lineCount = 0;
    
    for await (const line of rl) {
      lineCount++;
      
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
    }
    
    // Write the last epoch if there's data
    if (epochTime && Object.keys(epochData).length > 0) {
      const jsonlLine = JSON.stringify({
        timestamp_ms: epochTime,
        type: 'RINEX',
        data: epochData
      });
      writeStream.write(jsonlLine + '\n');
    }
    
    console.log(`Processed ${lineCount} lines from RINEX file`);
  } catch (error) {
    console.error('Error converting RINEX to JSONL:', error);
    throw error;
  } finally {
    writeStream.end();
  }
}

// Convert NMEA sentences to JSONL
async function convertNmeaToJsonl(inputPath: string, outputPath: string): Promise<void> {
  console.log('Processing NMEA file');
  
  const writeStream = fs.createWriteStream(outputPath);
  
  try {
    const fileStream = fs.createReadStream(inputPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    let lineCount = 0;
    let recordCount = 0;
    
    for await (const line of rl) {
      lineCount++;
      
      // Parse NMEA sentence
      const nmeaData = parseNmeaSentence(line.trim());
      if (nmeaData) {
        recordCount++;
        const jsonlLine = JSON.stringify(nmeaData);
        writeStream.write(jsonlLine + '\n');
      }
    }
    
    console.log(`Processed ${lineCount} lines, created ${recordCount} records from NMEA file`);
  } catch (error) {
    console.error('Error converting NMEA to JSONL:', error);
    throw error;
  } finally {
    writeStream.end();
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
  
  const messageBody = sentence.substring(1, checksumIndex);
  const providedChecksum = sentence.substring(checksumIndex + 1);
  
  // Calculate checksum (XOR of all characters between $ and *)
  let calculatedChecksum = 0;
  for (let i = 0; i < messageBody.length; i++) {
    calculatedChecksum ^= messageBody.charCodeAt(i);
  }
  
  const calculatedChecksumHex = calculatedChecksum.toString(16).toUpperCase().padStart(2, '0');
  
  // Check if checksum matches
  if (providedChecksum !== calculatedChecksumHex) {
    return null;
  }
  
  // Parse the sentence parts
  const parts = messageBody.split(',');
  const messageType = parts[0];
  
  const timestamp = new Date().getTime(); // Default to current time
  
  // Handle different message types
  switch (messageType) {
    case 'GPGGA': // Global Positioning System Fix Data
      if (parts.length < 15) return null;
      
      const time = parts[1];
      const lat = parts[2];
      const latDir = parts[3];
      const lon = parts[4];
      const lonDir = parts[5];
      const quality = parts[6];
      const numSatellites = parts[7];
      const hdop = parts[8];
      const altitude = parts[9];
      const altitudeUnit = parts[10];
      
      if (!lat || !lon) return null;
      
      const latDec = convertNmeaCoordinate(lat, latDir);
      const lonDec = convertNmeaCoordinate(lon, lonDir);
      
      return {
        timestamp_ms: timestamp,
        type: 'NMEA',
        message_type: 'GGA',
        latitude: latDec,
        longitude: lonDec,
        altitude: altitude ? parseFloat(altitude) : null,
        quality: quality ? parseInt(quality) : null,
        num_satellites: numSatellites ? parseInt(numSatellites) : null,
        hdop: hdop ? parseFloat(hdop) : null
      };
      
    case 'GPRMC': // Recommended Minimum Specific GNSS Data
      if (parts.length < 12) return null;
      
      const rmc_time = parts[1];
      const status = parts[2]; // A=active, V=void
      const rmc_lat = parts[3];
      const rmc_latDir = parts[4];
      const rmc_lon = parts[5];
      const rmc_lonDir = parts[6];
      const speed = parts[7]; // in knots
      const course = parts[8]; // in degrees
      const date = parts[9]; // DDMMYY
      
      if (status !== 'A' || !rmc_lat || !rmc_lon) return null;
      
      const rmc_latDec = convertNmeaCoordinate(rmc_lat, rmc_latDir);
      const rmc_lonDec = convertNmeaCoordinate(rmc_lon, rmc_lonDir);
      
      return {
        timestamp_ms: timestamp,
        type: 'NMEA',
        message_type: 'RMC',
        latitude: rmc_latDec,
        longitude: rmc_lonDec,
        speed: speed ? parseFloat(speed) * 0.514444 : null, // Convert knots to m/s
        course: course ? parseFloat(course) : null
      };
      
    default:
      // Other NMEA sentence types - just store type and parts
      return {
        timestamp_ms: timestamp,
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
    // Unknown format, use basic conversion
    await basicFileToJsonl(inputPath, outputPath);
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

export const fileProcessingService = {
  // Start processing a file
  processFile: async (filePath: string, originalFilename: string): Promise<string> => {
    const jobId = uuidv4();
    
    await fileProcessingQueue.add(
      {
        filePath,
        originalFilename
      },
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