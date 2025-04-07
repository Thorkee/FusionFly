import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Base validator class that implements common validation logic
 */
abstract class BaseValidator {
  protected filePath: string;
  
  constructor(filePath: string) {
    this.filePath = filePath;
  }
  
  /**
   * Performs basic file validation
   */
  async validateFileExists(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!fs.existsSync(this.filePath)) {
      errors.push(`File does not exist: ${this.filePath}`);
      return { valid: false, errors, warnings };
    }
    
    const stats = fs.statSync(this.filePath);
    if (stats.size === 0) {
      errors.push(`File is empty (0 bytes): ${this.filePath}`);
      return { valid: false, errors, warnings };
    }
    
    return { valid: true, errors, warnings };
  }
  
  /**
   * Validates that a file contains valid JSONL (one JSON object per line)
   */
  async validateJsonlFormat(): Promise<ValidationResult> {
    const fileResult = await this.validateFileExists();
    if (!fileResult.valid) {
      return fileResult;
    }
    
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      const fileStream = fs.createReadStream(this.filePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      
      let lineNumber = 0;
      let validLines = 0;
      
      for await (const line of rl) {
        lineNumber++;
        
        // Skip empty lines
        if (!line.trim()) {
          warnings.push(`Line ${lineNumber}: Empty line`);
          continue;
        }
        
        // Validate JSON
        try {
          const parsed = JSON.parse(line);
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            errors.push(`Line ${lineNumber}: Not a valid JSON object`);
          } else {
            validLines++;
          }
        } catch (e) {
          errors.push(`Line ${lineNumber}: Invalid JSON - ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      
      if (lineNumber === 0) {
        warnings.push('File contains no lines');
      }
      
      if (validLines === 0) {
        errors.push('File contains no valid JSON objects');
      }
      
      return { 
        valid: errors.length === 0 && validLines > 0, 
        errors, 
        warnings 
      };
    } catch (e) {
      errors.push(`Error reading file: ${e instanceof Error ? e.message : String(e)}`);
      return { valid: false, errors, warnings };
    }
  }
  
  /**
   * Implement specific validation logic for each validator
   */
  abstract validate(): Promise<ValidationResult>;
}

/**
 * Validates the first LLM output (format conversion)
 * Checks that the JSONL has expected fields based on the input format
 */
export class FormatConversionValidator extends BaseValidator {
  private format: string;
  
  constructor(filePath: string, format: string) {
    super(filePath);
    this.format = format.toLowerCase();
  }
  
  async validate(): Promise<ValidationResult> {
    // First check basic JSONL validity
    const jsonlResult = await this.validateJsonlFormat();
    if (!jsonlResult.valid) {
      return jsonlResult;
    }
    
    const errors: string[] = [];
    const warnings: string[] = [...jsonlResult.warnings];
    
    try {
      const fileStream = fs.createReadStream(this.filePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      
      let lineNumber = 0;
      
      for await (const line of rl) {
        lineNumber++;
        
        if (!line.trim()) continue;
        
        try {
          const record = JSON.parse(line);
          
          // Common fields that should be present in any GNSS data
          if (this.format.includes('gnss') || this.format.includes('nmea')) {
            // Check for timestamp
            if (!('timestamp_ms' in record) && !('time' in record) && !('timestamp' in record)) {
              errors.push(`Line ${lineNumber}: Missing timestamp field`);
            }
            
            // For GNSS data, should have location information
            const hasLocationInfo = (
              ('latitude' in record && 'longitude' in record) ||
              ('lat' in record && 'lon' in record) ||
              ('position' in record && typeof record.position === 'object')
            );
            
            if (!hasLocationInfo) {
              errors.push(`Line ${lineNumber}: Missing location information`);
            }
            
            // Check type or format field
            if (!('type' in record) && !('format' in record) && !('message_type' in record)) {
              warnings.push(`Line ${lineNumber}: Missing type/format identifier`);
            }
          }
          
          // For IMU data
          if (this.format.includes('imu')) {
            // Check for timestamp
            if (!('timestamp_ms' in record) && !('time' in record) && !('timestamp' in record)) {
              errors.push(`Line ${lineNumber}: Missing timestamp field`);
            }
            
            // Should have accelerometer or gyroscope data
            const hasSensorData = (
              ('acceleration' in record) ||
              ('gyro' in record) ||
              ('linear_acceleration' in record) ||
              ('angular_velocity' in record) ||
              ('accel' in record) ||
              ('gyroscope' in record)
            );
            
            if (!hasSensorData) {
              errors.push(`Line ${lineNumber}: Missing sensor data (acceleration/gyroscope)`);
            }
          }
        } catch (e) {
          // Skip, already validated in validateJsonlFormat
        }
      }
      
      return { 
        valid: errors.length === 0, 
        errors, 
        warnings 
      };
    } catch (e) {
      errors.push(`Error validating content: ${e instanceof Error ? e.message : String(e)}`);
      return { valid: false, errors, warnings };
    }
  }
}

/**
 * Validates the second LLM output (location extraction)
 * Checks that the JSONL contains valid location data
 */
export class LocationExtractionValidator extends BaseValidator {
  async validate(): Promise<ValidationResult> {
    // First check basic JSONL validity
    const jsonlResult = await this.validateJsonlFormat();
    if (!jsonlResult.valid) {
      return jsonlResult;
    }
    
    const errors: string[] = [];
    const warnings: string[] = [...jsonlResult.warnings];
    
    try {
      const fileStream = fs.createReadStream(this.filePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      
      let lineNumber = 0;
      let prevTimestamp: number | null = null;
      
      for await (const line of rl) {
        lineNumber++;
        
        if (!line.trim()) continue;
        
        try {
          const record = JSON.parse(line);
          
          // Required fields
          if (!('timestamp_ms' in record)) {
            errors.push(`Line ${lineNumber}: Missing timestamp_ms field`);
          } else if (typeof record.timestamp_ms !== 'number') {
            errors.push(`Line ${lineNumber}: timestamp_ms must be a number`);
          } else {
            // Check timestamp sequence if we have a previous timestamp
            if (prevTimestamp !== null && record.timestamp_ms < prevTimestamp) {
              warnings.push(`Line ${lineNumber}: Timestamp out of sequence`);
            }
            prevTimestamp = record.timestamp_ms;
          }
          
          // Check for type field
          if (!('type' in record)) {
            warnings.push(`Line ${lineNumber}: Missing type field`);
          }
          
          // Check location data
          if (!('latitude' in record) || !('longitude' in record)) {
            errors.push(`Line ${lineNumber}: Missing latitude/longitude fields`);
          } else {
            // Validate latitude range (-90 to 90)
            if (typeof record.latitude !== 'number' || 
                record.latitude < -90 || 
                record.latitude > 90) {
              errors.push(`Line ${lineNumber}: Invalid latitude value (${record.latitude})`);
            }
            
            // Validate longitude range (-180 to 180)
            if (typeof record.longitude !== 'number' || 
                record.longitude < -180 || 
                record.longitude > 180) {
              errors.push(`Line ${lineNumber}: Invalid longitude value (${record.longitude})`);
            }
          }
          
          // Optional altitude
          if ('altitude' in record && record.altitude !== null) {
            if (typeof record.altitude !== 'number') {
              errors.push(`Line ${lineNumber}: altitude must be a number or null`);
            }
          }
          
          // Optional DOP (Dilution of Precision)
          if ('hdop' in record && record.hdop !== null) {
            if (typeof record.hdop !== 'number' || record.hdop < 0) {
              errors.push(`Line ${lineNumber}: hdop must be a non-negative number or null`);
            }
          }
        } catch (e) {
          // Skip, already validated in validateJsonlFormat
        }
      }
      
      return { 
        valid: errors.length === 0, 
        errors, 
        warnings 
      };
    } catch (e) {
      errors.push(`Error validating content: ${e instanceof Error ? e.message : String(e)}`);
      return { valid: false, errors, warnings };
    }
  }
}

/**
 * Validates the third LLM output (schema conversion)
 * Checks that the JSONL conforms to the specified schema format
 */
export class SchemaConversionValidator extends BaseValidator {
  private isGnss: boolean;
  
  constructor(filePath: string, isGnss: boolean = true) {
    super(filePath);
    this.isGnss = isGnss;
  }
  
  async validate(): Promise<ValidationResult> {
    // First check basic JSONL validity
    const jsonlResult = await this.validateJsonlFormat();
    if (!jsonlResult.valid) {
      return jsonlResult;
    }
    
    const errors: string[] = [];
    const warnings: string[] = [...jsonlResult.warnings];
    
    try {
      const fileStream = fs.createReadStream(this.filePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      
      let lineNumber = 0;
      
      for await (const line of rl) {
        lineNumber++;
        
        if (!line.trim()) continue;
        
        try {
          const record = JSON.parse(line);
          
          // Common requirements for both schemas
          if (!('time_unix' in record)) {
            errors.push(`Line ${lineNumber}: Missing required field 'time_unix'`);
          } else if (typeof record.time_unix !== 'number') {
            errors.push(`Line ${lineNumber}: 'time_unix' must be a number`);
          }
          
          if (this.isGnss) {
            // GNSS Schema validation
            if (!('position_lla' in record)) {
              errors.push(`Line ${lineNumber}: Missing required field 'position_lla'`);
            } else if (typeof record.position_lla !== 'object' || record.position_lla === null) {
              errors.push(`Line ${lineNumber}: 'position_lla' must be an object`);
            } else {
              // Validate position_lla structure
              const positionLla = record.position_lla;
              
              // Check latitude_deg
              if (!('latitude_deg' in positionLla)) {
                errors.push(`Line ${lineNumber}: Missing required field 'position_lla.latitude_deg'`);
              } else if (
                typeof positionLla.latitude_deg !== 'number' || 
                positionLla.latitude_deg < -90 || 
                positionLla.latitude_deg > 90
              ) {
                errors.push(`Line ${lineNumber}: Invalid 'position_lla.latitude_deg' value (${positionLla.latitude_deg})`);
              }
              
              // Check longitude_deg
              if (!('longitude_deg' in positionLla)) {
                errors.push(`Line ${lineNumber}: Missing required field 'position_lla.longitude_deg'`);
              } else if (
                typeof positionLla.longitude_deg !== 'number' || 
                positionLla.longitude_deg < -180 || 
                positionLla.longitude_deg > 180
              ) {
                errors.push(`Line ${lineNumber}: Invalid 'position_lla.longitude_deg' value (${positionLla.longitude_deg})`);
              }
              
              // Check altitude_m
              if (!('altitude_m' in positionLla)) {
                errors.push(`Line ${lineNumber}: Missing required field 'position_lla.altitude_m'`);
              } else if (positionLla.altitude_m !== null && typeof positionLla.altitude_m !== 'number') {
                errors.push(`Line ${lineNumber}: 'position_lla.altitude_m' must be a number or null`);
              }
            }
            
            // Optional fields
            if ('dop' in record && record.dop !== null && typeof record.dop !== 'number') {
              errors.push(`Line ${lineNumber}: 'dop' must be a number or null`);
            }
            
            if ('clock_error_estimate' in record && 
                record.clock_error_estimate !== null && 
                typeof record.clock_error_estimate !== 'number') {
              errors.push(`Line ${lineNumber}: 'clock_error_estimate' must be a number or null`);
            }
          } else {
            // IMU Schema validation
            // Validate linear_acceleration
            if (!('linear_acceleration' in record)) {
              errors.push(`Line ${lineNumber}: Missing required field 'linear_acceleration'`);
            } else if (typeof record.linear_acceleration !== 'object' || record.linear_acceleration === null) {
              errors.push(`Line ${lineNumber}: 'linear_acceleration' must be an object`);
            } else {
              const accel = record.linear_acceleration;
              // Check x, y, z components
              for (const component of ['x', 'y', 'z']) {
                if (!(component in accel)) {
                  errors.push(`Line ${lineNumber}: Missing required field 'linear_acceleration.${component}'`);
                } else if (typeof accel[component] !== 'number') {
                  errors.push(`Line ${lineNumber}: 'linear_acceleration.${component}' must be a number`);
                }
              }
            }
            
            // Validate angular_velocity
            if (!('angular_velocity' in record)) {
              errors.push(`Line ${lineNumber}: Missing required field 'angular_velocity'`);
            } else if (typeof record.angular_velocity !== 'object' || record.angular_velocity === null) {
              errors.push(`Line ${lineNumber}: 'angular_velocity' must be an object`);
            } else {
              const angVel = record.angular_velocity;
              // Check x, y, z components
              for (const component of ['x', 'y', 'z']) {
                if (!(component in angVel)) {
                  errors.push(`Line ${lineNumber}: Missing required field 'angular_velocity.${component}'`);
                } else if (typeof angVel[component] !== 'number') {
                  errors.push(`Line ${lineNumber}: 'angular_velocity.${component}' must be a number`);
                }
              }
            }
            
            // Validate orientation (quaternion)
            if (!('orientation' in record)) {
              errors.push(`Line ${lineNumber}: Missing required field 'orientation'`);
            } else if (typeof record.orientation !== 'object' || record.orientation === null) {
              errors.push(`Line ${lineNumber}: 'orientation' must be an object`);
            } else {
              const orient = record.orientation;
              // Check w, x, y, z components
              for (const component of ['w', 'x', 'y', 'z']) {
                if (!(component in orient)) {
                  errors.push(`Line ${lineNumber}: Missing required field 'orientation.${component}'`);
                } else if (typeof orient[component] !== 'number') {
                  errors.push(`Line ${lineNumber}: 'orientation.${component}' must be a number`);
                }
              }
            }
          }
        } catch (e) {
          // Skip, already validated in validateJsonlFormat
        }
      }
      
      return { 
        valid: errors.length === 0, 
        errors, 
        warnings 
      };
    } catch (e) {
      errors.push(`Error validating content: ${e instanceof Error ? e.message : String(e)}`);
      return { valid: false, errors, warnings };
    }
  }
}

/**
 * Factory function to create the appropriate validator based on format
 */
export function createValidator(filePath: string, format: string): BaseValidator {
  const lowerFormat = format.toLowerCase();
  
  if (lowerFormat.includes('_schema')) {
    // Third LLM - Schema Conversion
    const isGnss = !lowerFormat.includes('imu');
    return new SchemaConversionValidator(filePath, isGnss);
  } else if (lowerFormat.includes('_location')) {
    // Second LLM - Location Extraction
    return new LocationExtractionValidator(filePath);
  } else {
    // First LLM - Format Conversion
    return new FormatConversionValidator(filePath, format);
  }
}

/**
 * Main validation function to validate output from an LLM step
 */
export async function validateLlmOutput(
  filePath: string, 
  format: string
): Promise<ValidationResult> {
  const validator = createValidator(filePath, format);
  return await validator.validate();
} 