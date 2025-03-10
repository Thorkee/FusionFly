import fs from 'fs';
import path from 'path';
import { AzureKeyCredential, OpenAIClient, ChatRequestSystemMessage, ChatRequestUserMessage } from '@azure/openai';
import dotenv from 'dotenv';
import * as blobStorageService from './blobStorageService';
import axios from 'axios';  // Add axios for standard OpenAI API calls

// Load environment variables
dotenv.config();

// Check which API to use
const useOpenAIAPI = process.env.USE_OPENAI_API === 'true';

// Azure OpenAI configuration
const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
const azureApiKey = process.env.AZURE_OPENAI_API_KEY || '';
const azureDeploymentName = process.env.AZURE_OPENAI_ENGINE || '';
const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '';

// Standard OpenAI API configuration
const openaiApiKey = process.env.OPENAI_API_KEY || '';
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o';
const openaiEndpoint = 'https://api.openai.com/v1/chat/completions';

// Ensure endpoint has correct format for Azure OpenAI
// Azure OpenAI endpoint should be in format: https://{resource-name}.openai.azure.com
// Remove any trailing /openai or /completions from the endpoint URL
const formattedAzureEndpoint = azureEndpoint
  .replace(/\/openai\/completions$/, '')
  .replace(/\/openai$/, '')
  .replace(/\/$/, '');

// Flag to enable/disable AI features - Default to TRUE to override fileProcessingService standard conversion
const AI_ENABLED = true;

// Force using Azure services instead of local storage
const USE_LOCAL_STORAGE = false;

console.log(`AI-assisted conversion is ENABLED. ${useOpenAIAPI ? 'OpenAI' : 'Azure OpenAI'} will be used for conversions.`);

/**
 * Performs AI-assisted conversion of data files to JSONL format
 * 
 * @param inputPath Path to the input file
 * @param outputPath Path where the converted JSONL should be saved
 * @param format The format of the input file (e.g., 'RINEX', 'NMEA', 'UBX')
 * @returns Object with success status and additional information
 */
export async function aiAssistedConversion(
  inputPath: string, 
  outputPath: string, 
  format: string
): Promise<{ success: boolean, output_path?: string, error?: string }> {
  console.log(`Attempting AI-assisted conversion for ${format} format`);
  
  // First conversion will focus only on format conversion
  console.log('First conversion stage: Format conversion only');
  
  try {
    // Read a sample of the input file (first 30 lines or 2KB, whichever is smaller)
    const sample = await readFileSample(inputPath, 30, 2048);
    if (!sample) {
      console.error('Failed to read sample from input file');
      return { success: false, error: 'Failed to read input file' };
    }

    console.log(`Read ${sample.length} bytes from ${inputPath} for AI analysis`);

    // Create the prompt for AI conversion
    // Use the structured conversion prompt if the format indicates it's for the second conversion
    const isStructuredConversion = format.toLowerCase().includes('structured') || 
                                  format.toLowerCase().includes('schema') ||
                                  outputPath.toLowerCase().includes('structured');
    
    const messages = isStructuredConversion 
      ? createStructuredConversionPrompt(sample, format, inputPath, outputPath)
      : createConversionPrompt(sample, format, inputPath, outputPath);

    if (isStructuredConversion) {
      console.log('Using structured schema conversion prompt');
    }

    let conversionLogic = '';

    if (useOpenAIAPI) {
      // Use standard OpenAI API
      console.log('Calling standard OpenAI API for data conversion...');
      console.log(`Using model: ${openaiModel}`);
      
      try {
        // Create request payload based on model
        const requestPayload: any = {
          model: openaiModel,
          messages: messages.map(msg => ({ role: msg.role, content: msg.content })),
          max_completion_tokens: 4000
        };

        // Add temperature parameter only for models that support it
        // Known models that don't support temperature: o3-mini
        if (!openaiModel.includes('o3-mini')) {
          requestPayload.temperature = 0.3;
        }

        console.log(`Request payload for model ${openaiModel}:`, JSON.stringify(requestPayload, null, 2));

        const response = await axios.post(
          openaiEndpoint,
          requestPayload,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openaiApiKey}`
            }
          }
        );

        if (!response.data || !response.data.choices || response.data.choices.length === 0) {
          console.error('No response from OpenAI API');
          return { success: false, error: 'No response from AI service' };
        }

        // Extract the response content
        conversionLogic = response.data.choices[0].message.content || '';
      } catch (apiError: any) {
        console.error('OpenAI API error:', apiError);
        
        // Extract more specific error information if available
        let errorMessage = 'Unknown error';
        if (apiError && typeof apiError === 'object' && 'response' in apiError) {
          const axiosError = apiError as any;
          if (axiosError.response && axiosError.response.data) {
            console.error('Response data:', axiosError.response.data);
            errorMessage = axiosError.response.data.error?.message || 'API error';
          }
        }
        
        return { success: false, error: `OpenAI API error: ${errorMessage}` };
      }
    } else {
      // Use Azure OpenAI API
      console.log('Calling Azure OpenAI API for data conversion...');
      console.log(`Using endpoint: ${formattedAzureEndpoint}`);
      console.log(`Using deployment: ${azureDeploymentName}`);
      console.log(`Using API version: ${azureApiVersion}`);
      console.log(`Full API URL: ${formattedAzureEndpoint}/deployments/${azureDeploymentName}/chat/completions?api-version=${azureApiVersion}`);
      
      try {
        // Create Azure OpenAI client
        const client = new OpenAIClient(
          formattedAzureEndpoint,
          new AzureKeyCredential(azureApiKey)
        );

        const result = await client.getChatCompletions(azureDeploymentName, messages, {
          temperature: 0.3,
          maxTokens: 4000
        });

        if (!result || !result.choices || result.choices.length === 0) {
          console.error('No response from Azure OpenAI API');
          return { success: false, error: 'No response from AI service' };
        }

        // Extract and process the AI response
        conversionLogic = result.choices[0].message?.content || '';
      } catch (apiError: any) {
        console.error('Azure OpenAI API error:', JSON.stringify(apiError, null, 2));
        
        // Extract more specific error information if available
        let errorMessage = 'Unknown error';
        if (apiError && typeof apiError === 'object') {
          // Try to get detailed error information
          const errorObj = apiError as any;
          
          if (errorObj.code && errorObj.message) {
            errorMessage = `Code: ${errorObj.code}, Message: ${errorObj.message}`;
          } else if (errorObj.message) {
            errorMessage = errorObj.message;
          } else if (errorObj.toString) {
            errorMessage = errorObj.toString();
          }
          
          // Log additional diagnostic information
          if (errorObj.statusCode) {
            console.error(`API Status Code: ${errorObj.statusCode}`);
          }
          if (errorObj.headers) {
            console.error('Response Headers:', errorObj.headers);
          }
        }
        
        console.error(`OpenAI API error details: ${errorMessage}`);
        return { success: false, error: `OpenAI API error: ${errorMessage}` };
      }
    }

    // Check if we got a valid response
    if (!conversionLogic || conversionLogic.trim().length === 0) {
      console.error('Empty response from AI service');
      return { success: false, error: 'Empty response from AI service' };
    }

    console.log('Received conversion logic from AI');
    
    // Store the conversion guidance in a file
    const guidanceFilePath = `${outputPath}.guidance.txt`;
    fs.writeFileSync(guidanceFilePath, conversionLogic);
    
    // Upload the guidance to Azure Blob Storage
    const guidanceBlobName = `guidance/${path.basename(guidanceFilePath)}`;
    await blobStorageService.uploadFile(guidanceFilePath, guidanceBlobName, blobStorageService.containers.processed);
    
    // Now read the full input file and apply the conversion logic
    console.log(`Reading full input file: ${inputPath}`);
    
    try {
      const fullFileContent = fs.readFileSync(inputPath, 'utf8');
      console.log(`Read ${fullFileContent.length} bytes from the complete input file`);
      
      // Process the full file based on the format
      let jsonlLines: string[] = [];
      
      // Check if this is for structured schema conversion
      const isStructuredConversion = outputPath.includes('structured.jsonl') || 
                                   format.toLowerCase().includes('structured') || 
                                   format.toLowerCase().includes('schema');
                                   
      if (isStructuredConversion) {
        // For structured schema conversion, we'll handle the conversion directly in JavaScript
        console.log('Processing structured schema conversion to JSONL format');
        
        try {
          // Parse the input JSONL file line by line
          const inputLines = fullFileContent.split('\n').filter(line => line.trim());
          console.log(`Processing ${inputLines.length} lines from the input file for structured conversion`);
          
          if (inputLines.length === 0) {
            console.error('Input file is empty or invalid');
            return { success: false, error: 'Input file is empty or invalid' };
          }
          
          // Check the schema type (GNSS or IMU)
          const isImuData = format.toLowerCase().includes('imu');
          
          // Array to store the converted JSONL lines
          const outputLines: string[] = [];
          
          // Process each line in the input file
          for (let i = 0; i < inputLines.length; i++) {
            try {
              const inputLine = inputLines[i];
              // Parse the JSON object from the line
              const parsedLine = JSON.parse(inputLine);
              
              // Initialize the output object according to the target schema
              let outputObj: any = {};
              
              // Handle GNSS data
              if (!isImuData) {
                // Extract timestamp (time_unix)
                outputObj.time_unix = null;
                
                // Extract position_lla object
                outputObj.position_lla = {
                  latitude_deg: null,
                  longitude_deg: null,
                  altitude_m: null
                };
                
                // Extract other fields
                outputObj.clock_error_estimate = null;
                outputObj.dop = null;
                
                // Try to map fields from the input data
                if (parsedLine.timestamp_ms !== undefined) {
                  outputObj.time_unix = parsedLine.timestamp_ms;
                } else if (parsedLine.time_unix !== undefined) {
                  outputObj.time_unix = parsedLine.time_unix;
                }
                
                // Extract latitude
                if (parsedLine.latitude !== undefined) {
                  outputObj.position_lla.latitude_deg = parsedLine.latitude;
                } else if (parsedLine.lat !== undefined) {
                  outputObj.position_lla.latitude_deg = parsedLine.lat;
                } else if (parsedLine.position_lla && parsedLine.position_lla.latitude_deg !== undefined) {
                  outputObj.position_lla.latitude_deg = parsedLine.position_lla.latitude_deg;
                }
                
                // Extract longitude
                if (parsedLine.longitude !== undefined) {
                  outputObj.position_lla.longitude_deg = parsedLine.longitude;
                } else if (parsedLine.lon !== undefined) {
                  outputObj.position_lla.longitude_deg = parsedLine.lon;
                } else if (parsedLine.position_lla && parsedLine.position_lla.longitude_deg !== undefined) {
                  outputObj.position_lla.longitude_deg = parsedLine.position_lla.longitude_deg;
                }
                
                // Extract altitude
                if (parsedLine.altitude !== undefined) {
                  outputObj.position_lla.altitude_m = parsedLine.altitude;
                } else if (parsedLine.alt !== undefined) {
                  outputObj.position_lla.altitude_m = parsedLine.alt;
                } else if (parsedLine.position_lla && parsedLine.position_lla.altitude_m !== undefined) {
                  outputObj.position_lla.altitude_m = parsedLine.position_lla.altitude_m;
                }
                
                // Extract DOP
                if (parsedLine.dop !== undefined) {
                  outputObj.dop = parsedLine.dop;
                } else if (parsedLine.pdop !== undefined) {
                  outputObj.dop = parsedLine.pdop;
                }
                
                // Try to extract data from original_data field if it exists
                if (parsedLine.original_data) {
                  try {
                    // Sometimes original_data is a JSON string
                    const originalData = typeof parsedLine.original_data === 'string' 
                      ? JSON.parse(parsedLine.original_data.replace(/\\/g, '')) 
                      : parsedLine.original_data;
                    
                    // Apply mappings from original_data
                    if (originalData.timestamp_ms !== undefined && outputObj.time_unix === null) {
                      outputObj.time_unix = originalData.timestamp_ms;
                    }
                    
                    if (originalData.latitude !== undefined && outputObj.position_lla.latitude_deg === null) {
                      outputObj.position_lla.latitude_deg = originalData.latitude;
                    }
                    
                    if (originalData.longitude !== undefined && outputObj.position_lla.longitude_deg === null) {
                      outputObj.position_lla.longitude_deg = originalData.longitude;
                    }
                    
                    if (originalData.altitude !== undefined && outputObj.position_lla.altitude_m === null) {
                      outputObj.position_lla.altitude_m = originalData.altitude;
                    }
                  } catch (parseError: any) {
                    console.log(`Skipping original_data parsing for line ${i} due to error: ${parseError.message}`);
                  }
                }
              } else {
                // Handle IMU data
                outputObj = {
                  time_unix: null,
                  linear_acceleration: {
                    x: null,
                    y: null,
                    z: null
                  },
                  angular_velocity: {
                    x: null,
                    y: null,
                    z: null
                  },
                  orientation: {
                    w: null,
                    x: null,
                    y: null,
                    z: null
                  }
                };
                
                // Map timestamp
                if (parsedLine.timestamp_ms !== undefined) {
                  outputObj.time_unix = parsedLine.timestamp_ms;
                } else if (parsedLine.time_unix !== undefined) {
                  outputObj.time_unix = parsedLine.time_unix;
                }
                
                // Map linear acceleration
                if (parsedLine.linear_acceleration) {
                  outputObj.linear_acceleration = parsedLine.linear_acceleration;
                } else if (parsedLine.acc_x !== undefined) {
                  outputObj.linear_acceleration.x = parsedLine.acc_x;
                  outputObj.linear_acceleration.y = parsedLine.acc_y;
                  outputObj.linear_acceleration.z = parsedLine.acc_z;
                }
                
                // Map angular velocity
                if (parsedLine.angular_velocity) {
                  outputObj.angular_velocity = parsedLine.angular_velocity;
                } else if (parsedLine.gyro_x !== undefined) {
                  outputObj.angular_velocity.x = parsedLine.gyro_x;
                  outputObj.angular_velocity.y = parsedLine.gyro_y;
                  outputObj.angular_velocity.z = parsedLine.gyro_z;
                }
                
                // Map orientation
                if (parsedLine.orientation) {
                  outputObj.orientation = parsedLine.orientation;
                } else if (parsedLine.quat_w !== undefined) {
                  outputObj.orientation.w = parsedLine.quat_w;
                  outputObj.orientation.x = parsedLine.quat_x;
                  outputObj.orientation.y = parsedLine.quat_y;
                  outputObj.orientation.z = parsedLine.quat_z;
                }
              }
              
              // Add the converted line to the output
              outputLines.push(JSON.stringify(outputObj));
            } catch (lineError: any) {
              console.error(`Error processing line ${i}: ${lineError.message}`);
              // Continue with other lines on error
            }
          }
          
          console.log(`Successfully converted ${outputLines.length} lines to structured JSONL format`);
          
          // Write the output to the file
          fs.writeFileSync(outputPath, outputLines.join('\n'));
          console.log(`Wrote ${outputLines.length} lines to ${outputPath}`);
          
          // Upload to Azure Blob Storage
          const jsonlBlobName = `converted/${path.basename(outputPath)}`;
          const jsonlUrl = await blobStorageService.uploadFile(outputPath, jsonlBlobName, blobStorageService.containers.processed);
          
          console.log(`AI-assisted conversion created JSONL file: ${outputPath}`);
          console.log(`Processed ${jsonlLines.length} lines from the input file`);
          console.log(`Uploaded to Azure Blob: ${jsonlUrl}`);
          
          return { 
            success: true, 
            output_path: outputPath,
          };
        } catch (conversionError: any) {
          console.error('Error in structured schema conversion:', conversionError);
          return { 
            success: false, 
            error: `Error in structured schema conversion: ${conversionError instanceof Error ? conversionError.message : String(conversionError)}` 
          };
        }
      } else if (format.toLowerCase() === 'gnss' || format.toLowerCase() === 'nmea') {
        // Process NMEA or other GNSS data
        const lines = fullFileContent.split('\n').filter(line => line.trim().length > 0);
        
        // Apply more advanced parsing based on the data format
        jsonlLines = lines.map((line, index) => {
          const record: any = {
            original_data: line,
            record_number: index + 1,
            format: format,
            conversion_type: 'ai_assisted',
            timestamp: new Date().toISOString()
          };
          
          // For NMEA data, try to extract coordinates if present
          // This is a basic example - the actual implementation would use the AI guidance
          if (line.startsWith('$GP') || line.startsWith('$GN')) {
            // NMEA sentence
            const parts = line.split(',');
            
            if (line.startsWith('$GPGGA') || line.startsWith('$GNGGA')) {
              // GGA sentence typically has position data
              if (parts.length >= 10) {
                const lat = parts[2] ? parseFloat(parts[2].substring(0, 2)) + parseFloat(parts[2].substring(2)) / 60 : null;
                const lon = parts[4] ? parseFloat(parts[4].substring(0, 3)) + parseFloat(parts[4].substring(3)) / 60 : null;
                const alt = parts[9] ? parseFloat(parts[9]) : null;
                
                if (parts[3] === 'S' && lat !== null) record.latitude = -lat;
                else record.latitude = lat;
                
                if (parts[5] === 'W' && lon !== null) record.longitude = -lon;
                else record.longitude = lon;
                
                record.altitude = alt;
                record.quality = parts[6] ? parseInt(parts[6]) : null;
                record.satellites = parts[7] ? parseInt(parts[7]) : null;
              }
            } else if (line.startsWith('$GPRMC') || line.startsWith('$GNRMC')) {
              // RMC sentence has position and time
              if (parts.length >= 10) {
                // Extract time if available
                if (parts[1] && parts[9]) {
                  const time = parts[1];
                  const date = parts[9];
                  
                  // Format: HHMMSS.SSS and DDMMYY
                  if (time.length >= 6 && date.length === 6) {
                    const hours = time.substring(0, 2);
                    const minutes = time.substring(2, 4);
                    const seconds = time.substring(4, 6);
                    
                    const day = date.substring(0, 2);
                    const month = date.substring(2, 4);
                    const year = `20${date.substring(4, 6)}`;
                    
                    record.utc_time = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;
                  }
                }
                
                // Extract position
                const lat = parts[3] ? parseFloat(parts[3].substring(0, 2)) + parseFloat(parts[3].substring(2)) / 60 : null;
                const lon = parts[5] ? parseFloat(parts[5].substring(0, 3)) + parseFloat(parts[5].substring(3)) / 60 : null;
                
                if (parts[4] === 'S' && lat !== null) record.latitude = -lat;
                else record.latitude = lat;
                
                if (parts[6] === 'W' && lon !== null) record.longitude = -lon;
                else record.longitude = lon;
                
                record.speed = parts[7] ? parseFloat(parts[7]) * 1.852 : null; // Convert knots to km/h
                record.course = parts[8] ? parseFloat(parts[8]) : null;
              }
            }
          } else if (format.toLowerCase() === 'rinex') {
            // Basic RINEX handling logic - would be expanded based on AI guidance
            // This is placeholder logic
            if (line.includes('POSITION')) {
              const posMatch = line.match(/(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)/);
              if (posMatch) {
                record.x = parseFloat(posMatch[1]);
                record.y = parseFloat(posMatch[2]);
                record.z = parseFloat(posMatch[3]);
              }
            }
          }
          
          return JSON.stringify(record);
        });
      } else if (format.toLowerCase() === 'imu') {
        // Process IMU data - implement specific parsing based on your IMU format
        const lines = fullFileContent.split('\n').filter(line => line.trim().length > 0);
        
        jsonlLines = lines.map((line, index) => {
          const record: any = {
            original_data: line,
            record_number: index + 1,
            format: format,
            conversion_type: 'ai_assisted',
            timestamp: new Date().toISOString()
          };
          
          // Add IMU-specific parsing here based on your format
          
          return JSON.stringify(record);
        });
      } else {
        // Generic handling for other formats
        const lines = fullFileContent.split('\n').filter(line => line.trim().length > 0);
        
        jsonlLines = lines.map((line, index) => {
          return JSON.stringify({
            original_data: line,
            record_number: index + 1,
            format: format,
            conversion_type: 'ai_assisted',
            timestamp: new Date().toISOString()
          });
        });
      }
      
      // Write the JSONL file
      fs.writeFileSync(outputPath, jsonlLines.join('\n'));
      
      // Upload to Azure Blob Storage
      const jsonlBlobName = `converted/${path.basename(outputPath)}`;
      const jsonlUrl = await blobStorageService.uploadFile(outputPath, jsonlBlobName, blobStorageService.containers.processed);
      
      console.log(`AI-assisted conversion created JSONL file: ${outputPath}`);
      console.log(`Processed ${jsonlLines.length} lines from the input file`);
      console.log(`Uploaded to Azure Blob: ${jsonlUrl}`);
      
      return { 
        success: true, 
        output_path: outputPath,
      };
    } catch (conversionError: any) {
      console.error('Error in file conversion:', conversionError);
      return { 
        success: false, 
        error: `Error in file conversion: ${conversionError instanceof Error ? conversionError.message : String(conversionError)}` 
      };
    }
  } catch (error) {
    console.error(`Error in AI-assisted conversion:`, error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Reads a sample of the file for AI analysis
 */
async function readFileSample(
  filePath: string, 
  maxLines: number = 30,  // Increased from 10 to 30 for better sample representation
  maxBytes: number = 2048
): Promise<string | null> {
  try {
    // Check if file exists and is not too large
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) {
      return null;
    }

    // For very small files, just read the whole thing
    if (stats.size <= maxBytes) {
      return fs.readFileSync(filePath, 'utf8');
    }

    // For larger files, read a sample
    const buffer = Buffer.alloc(maxBytes);
    const fd = await fs.promises.open(filePath, 'r');
    const { bytesRead } = await fd.read(buffer, 0, maxBytes, 0);
    await fd.close();

    // Convert buffer to string and limit to max lines
    const sample = buffer.slice(0, bytesRead).toString('utf8');
    const lines = sample.split('\n').slice(0, maxLines);
    
    return lines.join('\n');
  } catch (error) {
    console.error(`Error reading file sample:`, error);
    return null;
  }
}

/**
 * Creates a prompt for the OpenAI API to generate conversion logic
 */
function createConversionPrompt(sample: string, format: string, inputPath: string, outputPath: string): (ChatRequestSystemMessage | ChatRequestUserMessage)[] {
  return [
    { 
      role: 'system', 
      content: `You are an expert in data format conversion.
Your task is to convert data from the specified format to JSONL format.
Focus on practical implementation details that can be directly used in JavaScript/TypeScript code.
Provide only the necessary code for the conversion with appropriate error handling.`
    } as ChatRequestSystemMessage,
    {
      role: 'user',
      content: `I need you to convert a ${format.toUpperCase()} format file to JSONL format.

IMPORTANT: This is the only task - convert the source format to JSONL using the original data entries.

Here's a sample of the file content (first few lines only):
\`\`\`
${sample}
\`\`\`

IMPORTANT INSTRUCTIONS:
1. The above is only a SAMPLE. The full file that needs to be converted is located at: ${inputPath}
2. The converted JSONL output should be written to: ${outputPath}
3. Your solution should process the ENTIRE file at the input path, not just the sample provided
4. Each line of the original file should be converted to a valid JSON object on a single line in the output file
5. Preserve all original data fields in their appropriate formats
6. DO NOT include any sample data in your response
7. Return the code only, no other text or comments

Your guidance will be used to implement the conversion process.`
    } as ChatRequestUserMessage
  ];
}

/**
 * Creates a prompt for the second conversion phase, specifically for structuring the data
 * according to the specified schema format
 */
function createStructuredConversionPrompt(sample: string, format: string, inputPath: string, outputPath: string): (ChatRequestSystemMessage | ChatRequestUserMessage)[] {
  // Define the exact schemas as specified
  const gnssSchema = `{"type":"object","properties":{"time_unix":{"type":"number"},"position_lla":{"type":"object","properties":{"latitude_deg":{"type":"number","minimum":-90,"maximum":90},"longitude_deg":{"type":"number","minimum":-180,"maximum":180},"altitude_m":{"type":"number"}},"required":["latitude_deg","longitude_deg","altitude_m"]},"clock_error_estimate":{"type":"number"},"dop":{"type":"number"}},"required":["time_unix","position_lla"]}`;
  
  const imuSchema = `{"type":"object","properties":{"time_unix":{"type":"number"},"linear_acceleration":{"type":"object","properties":{"x":{"type":"number"},"y":{"type":"number"},"z":{"type":"number"}},"required":["x","y","z"]},"angular_velocity":{"type":"object","properties":{"x":{"type":"number"},"y":{"type":"number"},"z":{"type":"number"}},"required":["x","y","z"]},"orientation":{"type":"object","properties":{"w":{"type":"number"},"x":{"type":"number"},"y":{"type":"number"},"z":{"type":"number"}},"required":["w","x","y","z"]}},"required":["time_unix","linear_acceleration","angular_velocity","orientation"]}}`;
  
  // Select the appropriate schema based on format
  const schemaToUse = format.toLowerCase().includes('imu') ? imuSchema : gnssSchema;
  const dataType = format.toLowerCase().includes('imu') ? 'IMU' : 'GNSS';
  
  return [
    { 
      role: 'system', 
      content: `You are an expert in data transformation and schema validation.
Your task is to transform input JSONL data into a PRECISELY structured JSONL format where each line EXACTLY follows the provided schema.
You must ensure that each output line strictly adheres to the schema requirements with no deviations.
Each line in the output JSONL must be a valid JSON object with the exact structure specified in the schema.
Do not include ANY additional fields that are not in the schema.
Any missing required fields must be set to null rather than omitted.
If data is embedded within an "original_data" field that contains JSON string, you must parse and extract only the relevant data from it.
Your primary focus should be on CORRECTLY MATCHING KEYS from the source data to the target schema.`
    } as ChatRequestSystemMessage,
    {
      role: 'user',
      content: `I need you to transform a JSONL file (output from a previous conversion) into a structured JSONL format where each line EXACTLY matches this schema:

${schemaToUse}

Here's a sample of the input JSONL file (which was created by the first conversion):
\`\`\`
${sample}
\`\`\`

CRITICAL REQUIREMENTS:
1. The full input file is located at: ${inputPath}
2. The transformed output file should be written to: ${outputPath}
3. The output MUST be a JSONL file (one JSON object per line), NOT a single JSON array
4. IMPORTANT: If each line contains an "original_data" field that includes a JSON string, YOU MUST PARSE THIS STRING and extract the actual data from it
5. DO NOT PRESERVE the original structure or field names - transform them to EXACTLY match the schema
6. DO NOT include metadata fields like "format", "conversion_type", "timestamp", "record_number", or "original_data" in the output
7. For ${dataType} data, transform the fields strictly referencing the schema
8. If any REQUIRED fields in the schema cannot be found in the source data, set them to null - DO NOT OMIT them
9. KEY MAPPING IS CRITICAL: You must correctly map source keys to target schema keys (e.g., "timestamp_ms" → "time_unix", "latitude" → "position_lla.latitude_deg")
10. Provide ONLY the conversion code that reads from inputPath and writes to outputPath

THE OUTPUT MUST BE JSONL FORMAT (ONE OBJECT PER LINE), NOT A SINGLE JSON OBJECT.

IMPORTANT PARSING EXAMPLE:
If an input line is:
{"original_data":"{\\\"timestamp_ms\\\":1741588971634,\\\"latitude\\\":22.3012325,\\\"longitude\\\":114.179033}","record_number":1,"format":"gnss","conversion_type":"ai_assisted","timestamp":"2025-03-10T06:43:07.012Z"}

You need to parse the "original_data" string to extract:
timestamp_ms: 1741588971634
latitude: 22.3012325
longitude: 114.179033

And transform it to the output format (as a single line in the JSONL):
{"time_unix":1741588971634,"position_lla":{"latitude_deg":22.3012325,"longitude_deg":114.179033,"altitude_m":null},"clock_error_estimate":null,"dop":null}

Each entry in the output file should be a separate line with this exact structure. The output file should contain multiple lines (one per input record), each line being a valid JSON object.`
    } as ChatRequestUserMessage
  ];
}

// Helper function to extract code from AI response
function extractCodeFromAIResponse(response: string): string | null {
  // Look for Python code blocks in the AI response
  const codeBlockRegex = /```(?:python)?\s*([\s\S]*?)```/g;
  const matches = response.matchAll(codeBlockRegex);
  
  for (const match of matches) {
    if (match[1] && match[1].trim().length > 0) {
      return match[1].trim();
    }
  }
  
  // If no code blocks found, try to find code without markers
  if (!response.includes('```')) {
    // Look for import statements which likely indicate the start of code
    const importRegex = /(?:^|\n)import\s+[a-zA-Z_][a-zA-Z0-9_]*/;
    const importMatch = response.match(importRegex);
    
    if (importMatch && importMatch.index !== undefined) {
      return response.substring(importMatch.index);
    }
  }
  
  return null;
}