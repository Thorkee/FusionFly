import fs from 'fs';
import path from 'path';
import { AzureKeyCredential, OpenAIClient, ChatRequestSystemMessage, ChatRequestUserMessage } from '@azure/openai';
import dotenv from 'dotenv';
import * as blobStorageService from './blobStorageService';
import axios from 'axios';  // Add axios for standard OpenAI API calls
import readline from 'readline';
import { validateLlmOutput } from './validationService';

// Load environment variables
dotenv.config();

// Check which API to use
const useOpenAIAPI = false;

// Azure OpenAI configuration
const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
const azureApiKey = process.env.AZURE_OPENAI_API_KEY || '';
const azureDeploymentName = process.env.AZURE_OPENAI_ENGINE || 'gpt-4.5-preview';
const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '';

// Standard OpenAI API configuration
const openaiApiKey = process.env.OPENAI_API_KEY || '';
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o';
const openaiEndpoint = 'https://api.openai.com/v1/chat/completions';

// Retry configuration
const MAX_RETRIES = 10;
const INITIAL_RETRY_DELAY = 1000; // 1 second

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
 * Sleep function for retry delay
 * @param ms Milliseconds to sleep
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Performs API request with retry logic
 * @param apiCallFn Function that makes the API call
 * @param retryOptions Options for retry logic
 * @returns The API response
 */
async function withRetry<T>(
  apiCallFn: () => Promise<T>,
  options: { 
    maxRetries?: number, 
    initialDelay?: number, 
    retryableErrors?: string[],
    onRetry?: (error: any, attempt: number) => void 
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries || MAX_RETRIES;
  const initialDelay = options.initialDelay || INITIAL_RETRY_DELAY;
  const retryableErrors = options.retryableErrors || [
    'ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNABORTED', 'ENETUNREACH', 
    'socket hang up', 'connect ETIMEDOUT', 'timeout', 'rate_limit_exceeded', 
    'insufficient_quota', 'internal_server_error'
  ];
  
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Attempt the API call
      return await apiCallFn();
    } catch (error: any) {
      lastError = error;
      
      // Check if we should retry this error
      const errorMessage = JSON.stringify(error).toLowerCase();
      const shouldRetry = retryableErrors.some(retryableError => 
        errorMessage.includes(retryableError.toLowerCase())
      );
      
      if (!shouldRetry || attempt === maxRetries - 1) {
        // Don't retry this error or we've run out of attempts
        throw error;
      }
      
      // Calculate backoff delay with exponential backoff and jitter
      const delay = initialDelay * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5);
      
      // Log retry information
      console.log(`API call failed (attempt ${attempt + 1}/${maxRetries}). Retrying after ${delay}ms...`);
      console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
      
      if (options.onRetry) {
        options.onRetry(error, attempt + 1);
      }
      
      // Wait before retrying
      await sleep(delay);
    }
  }
  
  // This should never be reached due to the throw in the loop, but TypeScript needs it
  throw lastError;
}

/**
 * Trims the sample content to reduce token usage for API calls
 */
function trimSampleContent(sample: string, maxSize: number = 32768): string {
  if (sample.length <= maxSize) {
    return sample;
  }
  
  console.log(`Trimming sample from ${sample.length} to max ${maxSize} bytes to reduce tokens`);
  
  // Split by the sample separator if it exists
  if (sample.includes('---SAMPLE SEPARATOR---')) {
    const parts = sample.split('---SAMPLE SEPARATOR---');
    const trimmedParts = [];
    
    // Keep the beginning and end parts (most important for understanding file format)
    if (parts.length >= 3) {
      // Keep first part (beginning of file)
      trimmedParts.push(parts[0]);
      
      // Add indication that content was removed
      trimmedParts.push('\n[... additional content trimmed to reduce token usage ...]\n');
      
      // Keep last part (end of file and information section)
      trimmedParts.push(parts[parts.length - 1]);
      
      return trimmedParts.join('\n---SAMPLE SEPARATOR---\n');
    }
  }
  
  // If no separator or simpler structure, just trim the middle
  const thirdSize = Math.floor(maxSize / 3);
  const beginning = sample.substring(0, thirdSize);
  const ending = sample.substring(sample.length - thirdSize);
  
  return beginning + 
    '\n\n[... middle content trimmed to reduce token usage ...]\n\n' +
    ending;
}

/**
 * Performs AI-assisted conversion of data files to JSONL format
 * 
 * @param inputPath Path to the input file
 * @param outputPath Path where the converted JSONL should be saved
 * @param format The format of the input file (e.g., 'RINEX', 'NMEA', 'UBX')
 * @param retryCount Number of retry attempts
 * @returns Object with success status and additional information
 */
export async function aiAssistedConversion(
  inputPath: string, 
  outputPath: string, 
  format: string,
  retryCount: number = 0
): Promise<{ success: boolean, output_path?: string, error?: string }> {
  console.log(`---------------------------------------------------`);
  console.log(`Attempting AI-assisted conversion for ${format} format${retryCount > 0 ? ` (retry #${retryCount})` : ''}`);
  console.log(`INPUT PATH: ${inputPath}`);
  console.log(`OUTPUT PATH: ${outputPath}`);
  
  // Maximum retry attempts
  const MAX_RETRIES = 2;
  
  // Verify input file exists
  if (!fs.existsSync(inputPath)) {
    const errorMsg = `ERROR: Input file ${inputPath} does not exist!`;
    console.error(errorMsg);
    return { success: false, error: errorMsg };
  }
  
  // Verify input file has content
  const inputStats = fs.statSync(inputPath);
  if (inputStats.size === 0) {
    const errorMsg = `ERROR: Input file ${inputPath} is empty (0 bytes)!`;
    console.error(errorMsg);
    return { success: false, error: errorMsg };
  }
  
  console.log(`Confirmed input file exists with ${inputStats.size} bytes`);
  
  // Determine which step we're doing based on format suffix
  const isFormatConversion = format.toLowerCase().includes('_format');
  const isLocationExtraction = format.toLowerCase().includes('_location');
  const isSchemaConversion = format.toLowerCase().includes('_schema');
  const isNmea = format.toLowerCase().includes('nmea');
  
  // Log which step is being performed
  if (isFormatConversion) {
    console.log('First conversion step: Format conversion only');
  } else if (isLocationExtraction) {
    console.log('Second conversion step: Location data extraction');
  } else if (isSchemaConversion) {
    console.log('Final conversion step: Schema-based conversion');
  } else {
    // Legacy behavior for backward compatibility
    console.log('Using default conversion behavior');
  }
  
  try {
    // Check file size to determine if we can read the entire file
    const stats = await fs.promises.stat(inputPath);
    
    let sample: string | null;
    // For small files, read the entire file
    const isSmallFile = stats.size < 512 * 1024; // Reduced from 1MB to 512KB
    const isVerySmallFile = stats.size < 64 * 1024; // Only read entire NMEA files if under 64KB
    
    if ((isNmea && isVerySmallFile) || (isSmallFile && !isNmea)) {
      // For very small NMEA files or other small files, read the entire file
      if (isNmea) {
        console.log(`Small NMEA file detected (${(stats.size/1024).toFixed(2)} KB). Reading ENTIRE file.`);
      } else {
        console.log(`File size is ${stats.size} bytes (${(stats.size/1024).toFixed(2)} KB). Reading entire file.`);
      }
      sample = fs.readFileSync(inputPath, 'utf8');
    } else {
      // For larger files or larger NMEA files, read a sample
      if (isNmea) {
        console.log(`Large NMEA file detected (${(stats.size/1024).toFixed(2)} KB). Reading sample only.`);
        // For NMEA, use smaller sample with more lines to capture sentence variety
        sample = await readFileSample(inputPath, 50, 6144);
      } else {
        console.log(`File size is ${stats.size} bytes (${(stats.size/1024).toFixed(2)} KB). Reading sample only.`);
        sample = await readFileSample(inputPath, 50, 8192);
      }
    }
    
    if (!sample) {
      const errorMsg = 'Failed to read sample from input file';
      console.error(errorMsg);
      return { success: false, error: errorMsg };
    }

    // Trim the sample if it's too large to reduce token count
    if (sample.length > 32768) {
      sample = trimSampleContent(sample);
    }

    console.log(`Read ${sample.length} bytes from ${inputPath} for AI analysis${(isNmea && isVerySmallFile) || (isSmallFile && !isNmea) ? ' (entire file)' : ''}`);

    // Create the prompt based on which step we're performing
    let messages: (ChatRequestSystemMessage | ChatRequestUserMessage)[];
    
    // If this is a retry, include the error information in the prompt
    let errorFeedback = '';
    if (retryCount > 0) {
      const jsonlErrors = await validateJsonlOutput(outputPath, format);
      // Limit error feedback length to reduce token usage
      const maxErrorLength = 2000;
      const combinedErrors = jsonlErrors.join('\n');
      errorFeedback = combinedErrors.length > maxErrorLength ? 
        `CONVERSION ERRORS: ${combinedErrors.substring(0, maxErrorLength)}... (truncated)` :
        `CONVERSION ERRORS: ${combinedErrors}`;
      console.log(`Including error feedback for retry #${retryCount} (${errorFeedback.length} chars)`);
    }
    
    if (isSchemaConversion) {
      // Schema conversion (third step)
      console.log('Using structured schema conversion prompt');
      messages = createStructuredConversionPrompt(sample, format, inputPath, outputPath, errorFeedback);
    } else if (isLocationExtraction) {
      // Location extraction (second step)
      console.log('Using location extraction prompt');
      // Use the structured prompt but with location extraction focus
      messages = createStructuredConversionPrompt(sample, format, inputPath, outputPath, errorFeedback);
    } else {
      // Format conversion (first step) or legacy behavior
      console.log('Using format conversion prompt');
      messages = createConversionPrompt(sample, format, inputPath, outputPath, errorFeedback);
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
          max_tokens: 8000, // Reduced from 15000
          stream: false // Explicitly disable streaming to avoid load issues
        };

        // Add temperature parameter only for models that support it
        // Known models that don't support temperature: o3-mini
        if (!openaiModel.includes('o3-mini')) {
          requestPayload.temperature = 0.3;
        }

        console.log(`Request payload for model ${openaiModel}:`, JSON.stringify(requestPayload, null, 2));

        // Make OpenAI API request with retry logic
        const response = await withRetry(
          async () => axios.post(
            openaiEndpoint,
            requestPayload,
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
              },
              timeout: 60000 // 60 second timeout
            }
          ),
          {
            onRetry: (error, attempt) => {
              console.log(`Retrying OpenAI API call (attempt ${attempt}/${MAX_RETRIES})...`);
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

        // Make Azure OpenAI API request with retry logic
        const result = await withRetry(
          async () => client.getChatCompletions(azureDeploymentName, messages, {
            temperature: 0.3,
            maxTokens: 8000 // Reduced from 15000
          }),
          {
            onRetry: (error, attempt) => {
              console.log(`Retrying Azure OpenAI API call (attempt ${attempt}/${MAX_RETRIES})...`);
            }
          }
        );

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
    
    // Log the complete raw response from the AI for debugging
    console.log('---------- COMPLETE AI RESPONSE START ----------');
    console.log(conversionLogic);
    console.log('---------- COMPLETE AI RESPONSE END ----------');
    
    // Store the conversion guidance in a file (optional, keep for debugging)
    const guidanceFilePath = `${outputPath}.guidance.txt`;
    fs.writeFileSync(guidanceFilePath, conversionLogic);
    
    // Upload the guidance to Azure Blob Storage (optional, keep for debugging)
    const guidanceBlobName = `guidance/${path.basename(guidanceFilePath)}`;
    await blobStorageService.uploadFile(guidanceFilePath, guidanceBlobName, blobStorageService.containers.processed);
    
    // For all LLM types, generate and execute code
    try {
      // Extract code from the LLM response, removing any markdown formatting
      let code = conversionLogic;
      
      // First, check if the entire response is wrapped in a code block and extract just the content
      const codeBlockMatch = code.match(/```(?:javascript|typescript|js|ts)?\s*([\s\S]*?)```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        code = codeBlockMatch[1];
        console.log('Extracted content from code block');
      } else {
        // Otherwise remove any markdown code blocks that might be present
        code = code.replace(/```(?:javascript|typescript|js|ts)?\s*([\s\S]*?)```/g, '$1');
        console.log('Removed markdown code blocks');
      }
      
      // Create a temporary file to hold the conversion code
      const tempScriptPath = `${outputPath}.conversion.js`;
      fs.writeFileSync(tempScriptPath, code);
      console.log(`Wrote conversion script to: ${tempScriptPath}`);
      
      // Execute the script using child_process
      console.log('Executing conversion script...');
      const { execSync } = require('child_process');
      try {
        execSync(`node ${tempScriptPath}`, { stdio: 'inherit' });
        console.log('Conversion script executed successfully');
      } catch (execError) {
        console.error('Error executing conversion script:', execError);
        
        // If execution fails, try again with a retry and more guidance
        if (retryCount < MAX_RETRIES) {
          console.log(`Conversion script execution failed. Attempting retry #${retryCount + 1} with feedback.`);
          const errorMsg = execError instanceof Error ? execError.message : String(execError);
          return await aiAssistedConversion(
            inputPath, 
            outputPath, 
            format, 
            retryCount + 1
          );
        } else {
          console.error(`Failed to execute conversion script after ${MAX_RETRIES} retries.`);
          return { 
            success: false, 
            error: `Failed to execute conversion script: ${execError instanceof Error ? execError.message : String(execError)}` 
          };
        }
      }
      
      // Check if the output file was created by the script
      if (!fs.existsSync(outputPath)) {
        const errorMsg = `ERROR: Output file ${outputPath} was not created by the conversion script!`;
        console.error(errorMsg);
        
        // Try again with more explicit guidance
        if (retryCount < MAX_RETRIES) {
          console.log(`Output file not created. Attempting retry #${retryCount + 1} with feedback.`);
          return await aiAssistedConversion(inputPath, outputPath, format, retryCount + 1);
        } else {
          return { success: false, error: errorMsg };
        }
      }
    } catch (codeError) {
      console.error('Error processing or executing conversion code:', codeError);
      
      // Try again with error feedback if not exceeded max retries
      if (retryCount < MAX_RETRIES) {
        console.log(`Attempting retry #${retryCount + 1} after code execution error`);
        return await aiAssistedConversion(inputPath, outputPath, format, retryCount + 1);
      }
      
      return { 
        success: false, 
        error: `Error executing conversion code: ${codeError instanceof Error ? codeError.message : String(codeError)}` 
      };
    }

    // Verify the output file was created successfully (regardless of approach used)
    if (!fs.existsSync(outputPath)) {
      const errorMsg = `ERROR: Output file ${outputPath} was not created!`;
      console.error(errorMsg);
      return { success: false, error: errorMsg };
    }
    
    // Verify the output file has content
    const outputStats = fs.statSync(outputPath);
    if (outputStats.size === 0) {
      const errorMsg = `ERROR: Output file ${outputPath} is empty (0 bytes)!`;
      console.error(errorMsg);
      return { success: false, error: errorMsg };
    }
    
    // Validate the output JSONL content
    const validationErrors = await validateJsonlOutput(outputPath, format);
    if (validationErrors.length > 0) {
      console.error(`Found ${validationErrors.length} validation errors in JSONL output`);
      
      // Try again with error feedback if not exceeded max retries
      if (retryCount < MAX_RETRIES) {
        console.log(`Attempting retry #${retryCount + 1} with validation feedback`);
        return await aiAssistedConversion(inputPath, outputPath, format, retryCount + 1);
      } else {
        console.error(`Failed to produce valid JSONL after ${MAX_RETRIES} retries.`);
        // Continue with best effort result
      }
    }
    
    console.log(`Confirmed output file exists with ${outputStats.size} bytes at ${outputPath}`);
    
    // Upload the final JSONL to Azure Blob Storage
    const jsonlBlobName = `converted/${path.basename(outputPath)}`;
    const jsonlUrl = await blobStorageService.uploadFile(outputPath, jsonlBlobName, blobStorageService.containers.processed);
    console.log(`Uploaded AI-generated JSONL to Azure Blob: ${jsonlUrl}`);
    console.log(`---------------------------------------------------`);

    return { 
      success: true, 
      output_path: outputPath,
    };
  } catch (error) {
    console.error(`Error in AI-assisted conversion:`, error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Validates the JSONL output file for correctness
 * @param outputPath Path to the JSONL file to validate
 * @param format The format of the validation to perform
 * @returns Array of error messages (empty if valid)
 */
async function validateJsonlOutput(outputPath: string, format: string = ''): Promise<string[]> {
  // If file doesn't exist or is empty, return appropriate error
  if (!fs.existsSync(outputPath)) {
    return ['Output file does not exist'];
  }
  
  const stats = fs.statSync(outputPath);
  if (stats.size === 0) {
    return ['Output file is empty (0 bytes)'];
  }
  
  try {
    // Use the comprehensive validation service
    const validationResult = await validateLlmOutput(outputPath, format);
    
    // Return just the errors for backward compatibility with retry mechanism
    if (!validationResult.valid) {
      // Log warnings too, but only return errors for feedback to LLM
      if (validationResult.warnings.length > 0) {
        console.log(`Validation warnings for ${outputPath}:`, validationResult.warnings);
      }
      
      return validationResult.errors;
    }
    
    return []; // No errors
  } catch (e) {
    return [`Error validating file: ${e instanceof Error ? e.message : String(e)}`];
  }
}

/**
 * Reads a sample from a file to use for conversion
 */
export async function readFileSample(
  filePath: string, 
  maxLines: number = 50,  // Reduced from 100 to 50 lines total
  maxBytes: number = 8192  // Reduced from 16384 to 8192 bytes for smaller samples
): Promise<string | null> {
  try {
    // Check if file exists
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) {
      return null;
    }

    // For very small files, just read the whole thing
    if (stats.size <= maxBytes) {
      return fs.readFileSync(filePath, 'utf8');
    }

    // For larger files, read samples from different parts of the file
    let samples: string[] = [];
    
    // Sample from beginning (first 20 lines) - reduced from 35
    const beginBuffer = Buffer.alloc(Math.floor(maxBytes / 3));
    const beginFd = await fs.promises.open(filePath, 'r');
    const beginResult = await beginFd.read(beginBuffer, 0, Math.floor(maxBytes / 3), 0);
    await beginFd.close();
    const beginSample = beginBuffer.slice(0, beginResult.bytesRead).toString('utf8');
    const beginLines = beginSample.split('\n').slice(0, 20);
    samples.push(beginLines.join('\n'));
    
    // Sample from middle (15 lines from middle) - reduced from 35
    const middleOffset = Math.floor(stats.size / 2);
    const middleBuffer = Buffer.alloc(Math.floor(maxBytes / 3));
    const middleFd = await fs.promises.open(filePath, 'r');
    const middleResult = await middleFd.read(middleBuffer, 0, Math.floor(maxBytes / 3), middleOffset);
    await middleFd.close();
    const middleSample = middleBuffer.slice(0, middleResult.bytesRead).toString('utf8');
    const middleLines = middleSample.split('\n');
    if (middleLines.length > 0) {
      // Skip first line which might be partial
      samples.push(middleLines.slice(1, 16).join('\n'));
    }
    
    // Sample from end (last 15 lines) - reduced from 30
    const endOffset = Math.max(0, stats.size - Math.floor(maxBytes / 3));
    const endBuffer = Buffer.alloc(Math.floor(maxBytes / 3));
    const endFd = await fs.promises.open(filePath, 'r');
    const endResult = await endFd.read(endBuffer, 0, Math.floor(maxBytes / 3), endOffset);
    await endFd.close();
    const endSample = endBuffer.slice(0, endResult.bytesRead).toString('utf8');
    const endLines = endSample.split('\n');
    if (endLines.length > 0) {
      // Skip first line which might be partial
      samples.push(endLines.slice(-15).join('\n'));
    }
    
    // Add file size information to help AI understand this is just a sample
    samples.push(`\n---INFORMATION---\nThis is a sample from a file that is ${stats.size} bytes (${(stats.size/1024).toFixed(2)} KB) total. Process the ENTIRE file, not just these samples.`);
    
    // Join samples with a clear separator
    return samples.join('\n\n---SAMPLE SEPARATOR---\n\n');
  } catch (error) {
    console.error(`Error reading file sample:`, error);
    return null;
  }
}

/**
 * Creates a prompt for the OpenAI API to generate conversion logic
 */
function createConversionPrompt(
  sample: string, 
  format: string, 
  inputPath: string, 
  outputPath: string,
  errorFeedback: string = ''
): (ChatRequestSystemMessage | ChatRequestUserMessage)[] {
  // Customized prompt for NMEA format
  const isNmea = format.toLowerCase().includes('nmea');
  
  let systemContent = `You are a JavaScript developer tasked with writing NODE.JS CODE to convert data files.
Write a complete, executable Node.js script that will:
1. Read the input file from "${inputPath}"
2. Parse the data based on the format
3. Convert to JSONL format (one JSON object per line)
4. Write the result to "${outputPath}"

YOUR RESPONSE MUST BE *ONLY* THE JAVASCRIPT CODE WITH NO EXPLANATIONS OR DESCRIPTIONS OUTSIDE THE CODE.
NO markdown formatting or code blocks.`;

  // Add specific instructions for NMEA data
  if (isNmea) {
    systemContent += `\n\nNMEA Parsing Rules:
1. Parse each NMEA sentence based on type (GGA, RMC, GSV, etc.)
2. Extract timestamps from data
3. Convert coordinates to decimal degrees
4. Extract all available data from each sentence`;
  }

  // Add error feedback to system content if provided
  if (errorFeedback) {
    systemContent += `\n\n${errorFeedback}`;
  }

  let userContent = `JAVASCRIPT CODE GENERATION TASK:
Write a Node.js script to:
1. Read the file: "${inputPath}"
2. Parse each line of the ${format.toUpperCase()} format data
3. Convert each line to a JSON object
4. Write the resulting JSONL to: "${outputPath}"

Requirements:
- Use Node.js fs module
- Handle the entire file processing
- Include error handling
- BE COMPLETELY SELF-CONTAINED AND EXECUTABLE`;

  // Add file content section
  if (isNmea) {
    userContent += `\n\nHere's a sample of the NMEA file content:
\`\`\`
${sample}
\`\`\``;
  } else {
    userContent += `\n\nINPUT SAMPLES:
\`\`\`
${sample}
\`\`\``;
  }

  // Add NMEA-specific instructions to the user message
  if (isNmea) {
    userContent += `\n\nParsing guidelines:
- Parse each valid NMEA line to a JSON object
- Extract all relevant data
- Convert coordinates to decimal degrees
- Include timestamp information when available`;
  }

  // Prepare the messages array
  const messages: (ChatRequestSystemMessage | ChatRequestUserMessage)[] = [
    {
      role: 'system',
      content: systemContent
    },
    {
      role: 'user',
      content: userContent
    }
  ];

  return messages;
}

/**
 * Creates a prompt for the second conversion phase, specifically for structuring the data
 * according to the specified schema format
 */
function createStructuredConversionPrompt(
  sample: string, 
  format: string, 
  inputPath: string, 
  outputPath: string,
  errorFeedback: string = ''
): (ChatRequestSystemMessage | ChatRequestUserMessage)[] {
  // Define the exact schemas as specified - FIXED BACKSLASHES
  const gnssSchema = `{\"type\":\"object\",\"properties\":{\"time_unix\":{\"type\":\"number\"},\"position_lla\":{\"type\":\"object\",\"properties\":{\"latitude_deg\":{\"type\":\"number\",\"minimum\":-90,\"maximum\":90},\"longitude_deg\":{\"type\":\"number\",\"minimum\":-180,\"maximum\":180},\"altitude_m\":{\"type\":\"number\"}},\"required\":[\"latitude_deg\",\"longitude_deg\",\"altitude_m\"]},\"clock_error_estimate\":{\"type\":\"number\"},\"dop\":{\"type\":\"number\"}},\"required\":[\"time_unix\",\"position_lla\"]}`;
  
  const imuSchema = `{\"type\":\"object\",\"properties\":{\"time_unix\":{\"type\":\"number\"},\"linear_acceleration\":{\"type\":\"object\",\"properties\":{\"x\":{\"type\":\"number\"},\"y\":{\"type\":\"number\"},\"z\":{\"type\":\"number\"}},\"required\":[\"x\",\"y\",\"z\"]},\"angular_velocity\":{\"type\":\"object\",\"properties\":{\"x\":{\"type\":\"number\"},\"y\":{\"type\":\"number\"},\"z\":{\"type\":\"number\"}},\"required\":[\"x\",\"y\",\"z\"]},\"orientation\":{\"type\":\"object\",\"properties\":{\"w\":{\"type\":\"number\"},\"x\":{\"type\":\"number\"},\"y\":{\"type\":\"number\"},\"z\":{\"type\":\"number\"}},\"required\":[\"w\",\"x\",\"y\",\"z\"]}},\"required\":[\"time_unix\",\"linear_acceleration\",\"angular_velocity\",\"orientation\"]}}`;
  
  // Select the appropriate schema based on format
  const schemaToUse = format.toLowerCase().includes('imu') ? imuSchema : gnssSchema;
  const dataType = format.toLowerCase().includes('imu') ? 'IMU' : 'GNSS';
  
  // Check if this is just location extraction or full schema conversion
  const isLocationExtraction = format.toLowerCase().includes('_location');
  const isFullSchemaConversion = format.toLowerCase().includes('_schema');
  
  let systemContent: string;
  let userContent: string;
  
  if (isLocationExtraction) {
    // Location extraction prompt - now generating a script instead of direct JSONL
    systemContent = `You are a JavaScript developer tasked with writing NODE.JS CODE to extract location data.
Write a complete, executable Node.js script that will:
1. Read the ENTIRE input JSONL file from "${inputPath}"
2. Extract ONLY location-related information from each JSON object
3. Convert to JSONL format (one JSON object per line)
4. Write the result to "${outputPath}"

YOUR RESPONSE MUST BE *ONLY* THE JAVASCRIPT CODE WITH NO EXPLANATIONS OR DESCRIPTIONS OUTSIDE THE CODE.
NO markdown formatting or code blocks.`;

    userContent = `JAVASCRIPT CODE GENERATION TASK:
Write a Node.js script to:
1. Read the ENTIRE file: "${inputPath}"
2. Extract location data from each JSON object
3. Transform each line to a new JSON object with location data
4. Write the resulting JSONL to: "${outputPath}"

Requirements:
- Use Node.js fs module
- Handle the entire file processing (potentially thousands of records)
- Include error handling
- BE COMPLETELY SELF-CONTAINED AND EXECUTABLE

CRITICAL INSTRUCTION: I am showing you only SAMPLES from the input file below. Your script must process the ENTIRE FILE, not just these samples.

INPUT SAMPLE:
\`\`\`
${sample}
\`\`\`

REQUIRED OUTPUT FIELDS PER LINE:
- type: string (data source type, use "gnss" if source type cannot be determined)
- timestamp_ms: number (Unix timestamp in milliseconds)
- latitude: number (decimal degrees, between -90 and 90)
- longitude: number (decimal degrees, between -180 and 180)
- altitude: number (meters, if available, otherwise null)
- hdop: number (horizontal dilution of precision, if available, otherwise null)`;
  } else {
    // Full schema conversion prompt - now generating a script instead of direct JSONL
    systemContent = `You are a JavaScript developer tasked with writing NODE.JS CODE to transform data according to a specific schema.
Write a complete, executable Node.js script that will:
1. Read the ENTIRE input JSONL file from "${inputPath}"
2. Transform each JSON object to match the required schema structure
3. Convert to JSONL format (one JSON object per line)
4. Write the result to "${outputPath}"

YOUR RESPONSE MUST BE *ONLY* THE JAVASCRIPT CODE WITH NO EXPLANATIONS OR DESCRIPTIONS OUTSIDE THE CODE.
NO markdown formatting or code blocks.`;

    userContent = `JAVASCRIPT CODE GENERATION TASK:
Write a Node.js script to:
1. Read the ENTIRE file: "${inputPath}"
2. Transform each JSON object to match the target schema
3. Write the resulting JSONL to: "${outputPath}"

Requirements:
- Use Node.js fs module
- Handle the entire file processing (potentially thousands of records)
- Include error handling
- BE COMPLETELY SELF-CONTAINED AND EXECUTABLE

TARGET SCHEMA:
\`\`\`json
${schemaToUse}
\`\`\`

CRITICAL INSTRUCTION: I am showing you only SAMPLES from the input file below. Your script must process the ENTIRE FILE, not just these samples.

INPUT SAMPLE:
\`\`\`
${sample}
\`\`\`

FIELD MAPPING:
- 'time_unix': Map from 'timestamp_ms' (milliseconds since epoch)
${dataType === 'GNSS' ? `
- 'position_lla.latitude_deg': Map from 'latitude' (in degrees)
- 'position_lla.longitude_deg': Map from 'longitude' (in degrees)
- 'position_lla.altitude_m': Map from 'altitude' (in meters)
- 'dop': Map from 'hdop' or similar field
- 'clock_error_estimate': Set to null if not available` : `
- 'linear_acceleration.x/y/z': Map from acceleration data
- 'angular_velocity.x/y/z': Map from gyroscope data
- 'orientation.w/x/y/z': Map from quaternion data`}`;
  }
  
  // Add error feedback to system content if provided
  if (errorFeedback) {
    systemContent += `\n\n${errorFeedback}`;
  }
  
  return [
    { 
      role: 'system', 
      content: systemContent
    } as ChatRequestSystemMessage,
    {
      role: 'user',
      content: userContent
    } as ChatRequestUserMessage
  ];
}

/**
 * Creates a prompt for generating a transformation script
 * Uses both the raw input data and a manually converted example to guide the LLM
 */
function createTransformationScriptPrompt(
  inputSample: string,
  convertedSample: string,
  inputPath: string, 
  outputPath: string,
  format: string,
  errorFeedback: string = ''
): (ChatRequestSystemMessage | ChatRequestUserMessage)[] {
  // Determine if this is GNSS or IMU data
  const isGnss = !format.toLowerCase().includes('imu');
  
  // Define the exact schemas as specified
  const gnssSchema = `{\"type\":\"object\",\"properties\":{\"time_unix\":{\"type\":\"number\"},\"position_lla\":{\"type\":\"object\",\"properties\":{\"latitude_deg\":{\"type\":\"number\",\"minimum\":-90,\"maximum\":90},\"longitude_deg\":{\"type\":\"number\",\"minimum\":-180,\"maximum\":180},\"altitude_m\":{\"type\":\"number\"}},\"required\":[\"latitude_deg\",\"longitude_deg\",\"altitude_m\"]},\"clock_error_estimate\":{\"type\":\"number\"},\"dop\":{\"type\":\"number\"}},\"required\":[\"time_unix\",\"position_lla\"]}`;
  
  const imuSchema = `{\"type\":\"object\",\"properties\":{\"time_unix\":{\"type\":\"number\"},\"linear_acceleration\":{\"type\":\"object\",\"properties\":{\"x\":{\"type\":\"number\"},\"y\":{\"type\":\"number\"},\"z\":{\"type\":\"number\"}},\"required\":[\"x\",\"y\",\"z\"]},\"angular_velocity\":{\"type\":\"object\",\"properties\":{\"x\":{\"type\":\"number\"},\"y\":{\"type\":\"number\"},\"z\":{\"type\":\"number\"}},\"required\":[\"x\",\"y\",\"z\"]},\"orientation\":{\"type\":\"object\",\"properties\":{\"w\":{\"type\":\"number\"},\"x\":{\"type\":\"number\"},\"y\":{\"type\":\"number\"},\"z\":{\"type\":\"number\"}},\"required\":[\"w\",\"x\",\"y\",\"z\"]}},\"required\":[\"time_unix\",\"linear_acceleration\",\"angular_velocity\",\"orientation\"]}}`;
  
  // Select the appropriate schema based on format
  const schemaToUse = isGnss ? gnssSchema : imuSchema;
  const dataType = isGnss ? 'GNSS' : 'IMU';
  
  const systemContent = `You are a JavaScript developer tasked with writing a NODE.JS TRANSFORMATION SCRIPT to convert data according to a specific schema.
Write a complete, executable Node.js script that will:
1. Read the ENTIRE input JSONL file from "${inputPath}"
2. Transform each JSON object to match the required schema structure
3. Convert to JSONL format (one JSON object per line)
4. Write the result to "${outputPath}"

YOUR RESPONSE MUST BE *ONLY* THE JAVASCRIPT CODE WITH NO EXPLANATIONS OR DESCRIPTIONS OUTSIDE THE CODE.
NO markdown formatting or code blocks.

You have been provided with both raw input data and an example of how it should be transformed.
Analyze both to understand the transformation pattern, then create a script to apply this pattern to all records.`;

  // Add error feedback to system content if provided
  const finalSystemContent = errorFeedback 
    ? `${systemContent}\n\n${errorFeedback}` 
    : systemContent;

  const userContent = `JAVASCRIPT CODE GENERATION TASK:
Write a Node.js transformation script to:
1. Read the ENTIRE file: "${inputPath}"
2. Transform each JSON object to match the target schema
3. Write the resulting JSONL to: "${outputPath}"

Requirements:
- Use Node.js fs module
- Handle the entire file processing (potentially thousands of records)
- Include error handling
- BE COMPLETELY SELF-CONTAINED AND EXECUTABLE

TARGET SCHEMA:
\`\`\`json
${schemaToUse}
\`\`\`

CRITICAL INSTRUCTION: I am showing you sample data below. Your script must process the ENTIRE FILE, not just these samples.

INPUT SAMPLE (raw data):
\`\`\`
${inputSample}
\`\`\`

CONVERTED SAMPLE (how the data should look after transformation):
\`\`\`
${convertedSample}
\`\`\`

FIELD MAPPING:
${isGnss ? `
- 'time_unix': Map from 'timestamp_ms' (milliseconds since epoch)
- 'position_lla.latitude_deg': Map from 'latitude' (in degrees)
- 'position_lla.longitude_deg': Map from 'longitude' (in degrees)
- 'position_lla.altitude_m': Map from 'altitude' (in meters)
- 'dop': Map from 'hdop' or similar field
- 'clock_error_estimate': Set to null if not available` : `
- 'time_unix': Map from timestamp field
- 'linear_acceleration.x/y/z': Map from acceleration data
- 'angular_velocity.x/y/z': Map from gyroscope data
- 'orientation.w/x/y/z': Map from quaternion data`}`;

  // Prepare the messages array
  const messages: (ChatRequestSystemMessage | ChatRequestUserMessage)[] = [
    {
      role: 'system',
      content: finalSystemContent
    },
    {
      role: 'user',
      content: userContent
    }
  ];

  return messages;
}

/**
 * Generates a transformation script using an LLM to convert from location data to a specified schema
 * 
 * @param inputPath Path to the input file (location data)
 * @param outputPath Path where the transformed data should be saved
 * @param format The format for the output data (e.g., 'gnss_schema', 'imu_schema')
 * @param retryCount Number of retry attempts
 * @param convertedSample Optional pre-converted sample to use as an example
 * @returns Object with success status and additional information
 */
export async function generateTransformationScript(
  inputPath: string, 
  outputPath: string, 
  format: string,
  retryCount: number = 0,
  convertedSample?: string
): Promise<{ success: boolean, output_path?: string, error?: string, script_path?: string }> {
  console.log(`---------------------------------------------------`);
  console.log(`Generating transformation script for ${format} format${retryCount > 0 ? ` (retry #${retryCount})` : ''}`);
  console.log(`INPUT PATH: ${inputPath}`);
  console.log(`OUTPUT PATH: ${outputPath}`);
  
  // Maximum retry attempts
  const MAX_RETRIES = 2;
  
  // Verify input file exists
  if (!fs.existsSync(inputPath)) {
    const errorMsg = `ERROR: Input file ${inputPath} does not exist!`;
    console.error(errorMsg);
    return { success: false, error: errorMsg };
  }
  
  // Verify input file has content
  const inputStats = fs.statSync(inputPath);
  if (inputStats.size === 0) {
    const errorMsg = `ERROR: Input file ${inputPath} is empty (0 bytes)!`;
    console.error(errorMsg);
    return { success: false, error: errorMsg };
  }
  
  console.log(`Confirmed input file exists with ${inputStats.size} bytes`);
  
  try {
    // 1. Read a sample from input file
    let inputSample: string | null;
    const isSmallFile = inputStats.size < 512 * 1024;
    
    if (isSmallFile) {
      console.log(`File size is ${inputStats.size} bytes (${(inputStats.size/1024).toFixed(2)} KB). Reading entire file.`);
      inputSample = fs.readFileSync(inputPath, 'utf8');
    } else {
      console.log(`File size is ${inputStats.size} bytes (${(inputStats.size/1024).toFixed(2)} KB). Reading sample only.`);
      inputSample = await readFileSample(inputPath, 20, 8192);
    }
    
    if (!inputSample) {
      const errorMsg = 'Failed to read sample from input file';
      console.error(errorMsg);
      return { success: false, error: errorMsg };
    }
    
    // 2. Manually convert a small sample (1-3 records) to required schema format
    console.log(`Manually converting a small sample to ${format} format`);
    const isGnss = !format.toLowerCase().includes('imu');
    let sampleConversion = convertedSample || '';
    
    try {
      // Parse input sample to extract a few lines
      const sampleLines = inputSample.trim().split('\n').slice(0, 3);
      
      // Convert each line to the required format
      sampleLines.forEach(line => {
        try {
          const inputData = JSON.parse(line);
          
          if (isGnss) {
            // Convert to GNSS schema
            const convertedData = {
              time_unix: inputData.timestamp_ms,
              position_lla: {
                latitude_deg: inputData.latitude,
                longitude_deg: inputData.longitude,
                altitude_m: inputData.altitude,
              },
              clock_error_estimate: null,
              dop: inputData.hdop || null,
            };
            sampleConversion += JSON.stringify(convertedData) + '\n';
          } else {
            // Convert to IMU schema (sample conversion - adjust based on your data)
            const convertedData = {
              time_unix: inputData.timestamp || inputData.timestamp_ms,
              linear_acceleration: {
                x: inputData.accel_x || 0,
                y: inputData.accel_y || 0,
                z: inputData.accel_z || 0,
              },
              angular_velocity: {
                x: inputData.gyro_x || 0,
                y: inputData.gyro_y || 0,
                z: inputData.gyro_z || 0,
              },
              orientation: {
                w: inputData.quat_w || 1,
                x: inputData.quat_x || 0,
                y: inputData.quat_y || 0,
                z: inputData.quat_z || 0,
              },
            };
            sampleConversion += JSON.stringify(convertedData) + '\n';
          }
        } catch (parseError) {
          console.error(`Error parsing sample line: ${parseError}`);
        }
      });
    } catch (conversionError) {
      console.error(`Error during manual sample conversion: ${conversionError}`);
      // Continue even if manual conversion fails, but use a template
      if (isGnss) {
        sampleConversion = '{"time_unix":1620000000000,"position_lla":{"latitude_deg":37.7749,"longitude_deg":-122.4194,"altitude_m":10},"clock_error_estimate":null,"dop":1.2}\n';
      } else {
        sampleConversion = '{"time_unix":1620000000000,"linear_acceleration":{"x":0.1,"y":0.2,"z":9.8},"angular_velocity":{"x":0.01,"y":0.02,"z":0.03},"orientation":{"w":1,"x":0,"y":0,"z":0}}\n';
      }
    }
    
    if (!sampleConversion || sampleConversion.trim().length === 0) {
      const errorMsg = 'Failed to create converted sample';
      console.error(errorMsg);
      return { success: false, error: errorMsg };
    }
    
    console.log(`Successfully created sample conversions`);
    console.log(`Input sample (truncated): ${inputSample.substring(0, 100)}...`);
    console.log(`Converted sample (truncated): ${sampleConversion.substring(0, 100)}...`);
    
    // 3. Use LLM to generate transformation script
    let errorFeedback = retryCount > 0 ? `Previous attempt failed. Please ensure your script correctly processes all lines and handles errors gracefully.` : '';
    
    // Create the prompt with both input and converted samples
    const messages = createTransformationScriptPrompt(
      inputSample, 
      sampleConversion, 
      inputPath, 
      outputPath, 
      format, 
      errorFeedback
    );
    
    let transformationScript = '';
    
    if (useOpenAIAPI) {
      // Use standard OpenAI API for script generation
      console.log('Calling standard OpenAI API to generate transformation script...');
      console.log(`Using model: ${openaiModel}`);
      
      try {
        const requestPayload: any = {
          model: openaiModel,
          messages: messages.map(msg => ({ role: msg.role, content: msg.content })),
          max_tokens: 8000,
          stream: false
        };
        
        if (!openaiModel.includes('o3-mini')) {
          requestPayload.temperature = 0.3;
        }
        
        const response = await withRetry(
          async () => axios.post(
            openaiEndpoint,
            requestPayload,
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
              },
              timeout: 60000
            }
          ),
          {
            onRetry: (error, attempt) => {
              console.log(`Retrying OpenAI API call (attempt ${attempt}/${MAX_RETRIES})...`);
            }
          }
        );
        
        if (!response.data || !response.data.choices || response.data.choices.length === 0) {
          console.error('No response from OpenAI API');
          return { success: false, error: 'No response from AI service' };
        }
        
        transformationScript = response.data.choices[0].message.content || '';
      } catch (apiError: any) {
        console.error('OpenAI API error:', apiError);
        
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
      // Use Azure OpenAI API for script generation
      console.log('Calling Azure OpenAI API to generate transformation script...');
      console.log(`Using endpoint: ${formattedAzureEndpoint}`);
      console.log(`Using deployment: ${azureDeploymentName}`);
      console.log(`Using API version: ${azureApiVersion}`);
      
      try {
        const client = new OpenAIClient(
          formattedAzureEndpoint,
          new AzureKeyCredential(azureApiKey)
        );
        
        const result = await withRetry(
          async () => client.getChatCompletions(azureDeploymentName, messages, {
            temperature: 0.3,
            maxTokens: 8000
          }),
          {
            onRetry: (error, attempt) => {
              console.log(`Retrying Azure OpenAI API call (attempt ${attempt}/${MAX_RETRIES})...`);
            }
          }
        );
        
        if (!result || !result.choices || result.choices.length === 0) {
          console.error('No response from Azure OpenAI API');
          return { success: false, error: 'No response from AI service' };
        }
        
        transformationScript = result.choices[0].message?.content || '';
      } catch (apiError: any) {
        console.error('Azure OpenAI API error:', JSON.stringify(apiError, null, 2));
        
        let errorMessage = 'Unknown error';
        if (apiError && typeof apiError === 'object') {
          const errorObj = apiError as any;
          
          if (errorObj.code && errorObj.message) {
            errorMessage = `Code: ${errorObj.code}, Message: ${errorObj.message}`;
          } else if (errorObj.message) {
            errorMessage = errorObj.message;
          } else if (errorObj.toString) {
            errorMessage = errorObj.toString();
          }
        }
        
        return { success: false, error: `OpenAI API error: ${errorMessage}` };
      }
    }
    
    // Check if we got a valid response
    if (!transformationScript || transformationScript.trim().length === 0) {
      console.error('Empty response from AI service');
      return { success: false, error: 'Empty response from AI service' };
    }
    
    console.log('Received transformation script from AI');
    
    // Store the script in a file
    const scriptFilePath = `${outputPath}.transformation.js`;
    fs.writeFileSync(scriptFilePath, transformationScript);
    console.log(`Wrote transformation script to: ${scriptFilePath}`);
    
    // 4. Execute the transformation script
    console.log('Executing transformation script...');
    const { execSync } = require('child_process');
    try {
      execSync(`node ${scriptFilePath}`, { stdio: 'inherit' });
      console.log('Transformation script executed successfully');
    } catch (execError) {
      console.error('Error executing transformation script:', execError);
      
      // If execution fails, try again with more guidance
      if (retryCount < MAX_RETRIES) {
        console.log(`Transformation script execution failed. Attempting retry #${retryCount + 1} with feedback.`);
        return await generateTransformationScript(
          inputPath, 
          outputPath, 
          format, 
          retryCount + 1
        );
      } else {
        console.error(`Failed to execute transformation script after ${MAX_RETRIES} retries.`);
        return { 
          success: false, 
          error: `Failed to execute transformation script: ${execError instanceof Error ? execError.message : String(execError)}` 
        };
      }
    }
    
    // 5. Verify the transformed output file exists
    if (!fs.existsSync(outputPath)) {
      const errorMsg = `ERROR: Output file ${outputPath} was not created by the transformation script!`;
      console.error(errorMsg);
      
      // Try again with more explicit feedback
      if (retryCount < MAX_RETRIES) {
        console.log(`Output file not created. Attempting retry #${retryCount + 1} with feedback.`);
        return await generateTransformationScript(inputPath, outputPath, format, retryCount + 1);
      } else {
        return { success: false, error: errorMsg };
      }
    }
    
    // 6. Verify the output file has content
    const outputStats = fs.statSync(outputPath);
    if (outputStats.size === 0) {
      const errorMsg = `ERROR: Output file ${outputPath} is empty (0 bytes)!`;
      console.error(errorMsg);
      return { success: false, error: errorMsg };
    }
    
    // 7. Validate the output content
    const validationErrors = await validateJsonlOutput(outputPath, format);
    if (validationErrors.length > 0) {
      console.error(`Found ${validationErrors.length} validation errors in JSONL output`);
      
      // Try again with error feedback if not exceeded max retries
      if (retryCount < MAX_RETRIES) {
        console.log(`Attempting retry #${retryCount + 1} with validation feedback`);
        return await generateTransformationScript(inputPath, outputPath, format, retryCount + 1);
      } else {
        console.error(`Failed to produce valid JSONL after ${MAX_RETRIES} retries.`);
        // Continue with best effort result
      }
    }
    
    console.log(`Confirmed output file exists with ${outputStats.size} bytes at ${outputPath}`);
    console.log(`---------------------------------------------------`);
    
    // Return success with paths to both the output file and the transformation script
    return { 
      success: true, 
      output_path: outputPath,
      script_path: scriptFilePath
    };
  } catch (error) {
    console.error(`Error in transformation script generation:`, error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Directly converts a sample of data to the target schema format
 * This is the first submodule of the 3rd LLM pipeline
 * 
 * @param inputSample Sample data from Module 2 (location data)
 * @param format The format for the output data (e.g., 'gnss_schema', 'imu_schema')
 * @returns Object with success status, converted sample, and any error information
 */
export async function directSchemaConversion(
  inputSample: string,
  format: string
): Promise<{ success: boolean, convertedSample?: string, error?: string }> {
  console.log(`---------------------------------------------------`);
  console.log(`Directly converting sample data to ${format} schema`);
  
  try {
    // Determine if this is GNSS or IMU data
    const isGnss = !format.toLowerCase().includes('imu');
    
    // Define the exact schemas as specified
    const gnssSchema = `{\"type\":\"object\",\"properties\":{\"time_unix\":{\"type\":\"number\"},\"position_lla\":{\"type\":\"object\",\"properties\":{\"latitude_deg\":{\"type\":\"number\",\"minimum\":-90,\"maximum\":90},\"longitude_deg\":{\"type\":\"number\",\"minimum\":-180,\"maximum\":180},\"altitude_m\":{\"type\":\"number\"}},\"required\":[\"latitude_deg\",\"longitude_deg\",\"altitude_m\"]},\"clock_error_estimate\":{\"type\":\"number\"},\"dop\":{\"type\":\"number\"}},\"required\":[\"time_unix\",\"position_lla\"]}`;
    
    const imuSchema = `{\"type\":\"object\",\"properties\":{\"time_unix\":{\"type\":\"number\"},\"linear_acceleration\":{\"type\":\"object\",\"properties\":{\"x\":{\"type\":\"number\"},\"y\":{\"type\":\"number\"},\"z\":{\"type\":\"number\"}},\"required\":[\"x\",\"y\",\"z\"]},\"angular_velocity\":{\"type\":\"object\",\"properties\":{\"x\":{\"type\":\"number\"},\"y\":{\"type\":\"number\"},\"z\":{\"type\":\"number\"}},\"required\":[\"x\",\"y\",\"z\"]},\"orientation\":{\"type\":\"object\",\"properties\":{\"w\":{\"type\":\"number\"},\"x\":{\"type\":\"number\"},\"y\":{\"type\":\"number\"},\"z\":{\"type\":\"number\"}},\"required\":[\"w\",\"x\",\"y\",\"z\"]}},\"required\":[\"time_unix\",\"linear_acceleration\",\"angular_velocity\",\"orientation\"]}}`;
    
    // Select the appropriate schema based on format
    const schemaToUse = isGnss ? gnssSchema : imuSchema;
    const dataType = isGnss ? 'GNSS' : 'IMU';
    
    // Create the messages for direct conversion
    const systemContent = `You are a data format conversion specialist.
Your task is to directly convert the input JSON data to match the target schema.
DO NOT write code or explanations.
ONLY return the converted JSON objects, one per line.
Each converted object must strictly conform to the target schema.`;

    const userContent = `Convert these input JSON objects to match the target schema:

TARGET SCHEMA:
\`\`\`json
${schemaToUse}
\`\`\`

INPUT JSON (one object per line):
\`\`\`
${inputSample}
\`\`\`

FIELD MAPPING:
${isGnss ? `
- 'time_unix': Map from 'timestamp_ms' (milliseconds since epoch)
- 'position_lla.latitude_deg': Map from 'latitude' (in degrees)
- 'position_lla.longitude_deg': Map from 'longitude' (in degrees)
- 'position_lla.altitude_m': Map from 'altitude' (in meters)
- 'dop': Map from 'hdop' or similar field
- 'clock_error_estimate': Set to null if not available` : `
- 'time_unix': Map from timestamp field
- 'linear_acceleration.x/y/z': Map from acceleration data
- 'angular_velocity.x/y/z': Map from gyroscope data
- 'orientation.w/x/y/z': Map from quaternion data`}

RESPOND ONLY with the converted JSON objects, one per line. No explanations or code.`;

    // Prepare the messages array
    const messages: (ChatRequestSystemMessage | ChatRequestUserMessage)[] = [
      {
        role: 'system',
        content: systemContent
      },
      {
        role: 'user',
        content: userContent
      }
    ];

    // Call the LLM API
    let convertedSample = '';
    
    if (useOpenAIAPI) {
      // Use standard OpenAI API
      console.log('Calling standard OpenAI API for direct schema conversion...');
      console.log(`Using model: ${openaiModel}`);
      
      try {
        const requestPayload: any = {
          model: openaiModel,
          messages: messages.map(msg => ({ role: msg.role, content: msg.content })),
          max_tokens: 4000,
          stream: false
        };
        
        if (!openaiModel.includes('o3-mini')) {
          requestPayload.temperature = 0.1; // Lower temperature for more deterministic output
        }
        
        const response = await withRetry(
          async () => axios.post(
            openaiEndpoint,
            requestPayload,
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
              },
              timeout: 30000
            }
          ),
          {
            onRetry: (error, attempt) => {
              console.log(`Retrying OpenAI API call (attempt ${attempt}/3)...`);
            }
          }
        );
        
        if (!response.data || !response.data.choices || response.data.choices.length === 0) {
          console.error('No response from OpenAI API');
          return { success: false, error: 'No response from AI service' };
        }
        
        convertedSample = response.data.choices[0].message.content || '';
      } catch (apiError: any) {
        console.error('OpenAI API error:', apiError);
        
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
      console.log('Calling Azure OpenAI API for direct schema conversion...');
      console.log(`Using endpoint: ${formattedAzureEndpoint}`);
      console.log(`Using deployment: ${azureDeploymentName}`);
      
      try {
        const client = new OpenAIClient(
          formattedAzureEndpoint,
          new AzureKeyCredential(azureApiKey)
        );
        
        const result = await withRetry(
          async () => client.getChatCompletions(azureDeploymentName, messages, {
            temperature: 0.1,
            maxTokens: 4000
          }),
          {
            onRetry: (error, attempt) => {
              console.log(`Retrying Azure OpenAI API call (attempt ${attempt}/3)...`);
            }
          }
        );
        
        if (!result || !result.choices || result.choices.length === 0) {
          console.error('No response from Azure OpenAI API');
          return { success: false, error: 'No response from AI service' };
        }
        
        convertedSample = result.choices[0].message?.content || '';
      } catch (apiError: any) {
        console.error('Azure OpenAI API error:', JSON.stringify(apiError, null, 2));
        
        let errorMessage = 'Unknown error';
        if (apiError && typeof apiError === 'object') {
          const errorObj = apiError as any;
          
          if (errorObj.code && errorObj.message) {
            errorMessage = `Code: ${errorObj.code}, Message: ${errorObj.message}`;
          } else if (errorObj.message) {
            errorMessage = errorObj.message;
          } else if (errorObj.toString) {
            errorMessage = errorObj.toString();
          }
        }
        
        return { success: false, error: `OpenAI API error: ${errorMessage}` };
      }
    }
    
    // Validate the converted sample
    if (!convertedSample || convertedSample.trim().length === 0) {
      console.error('Empty response from AI service');
      return { success: false, error: 'Empty response from AI service' };
    }
    
    console.log('Received converted sample from AI');
    
    // Clean up the response - remove code blocks if present
    convertedSample = convertedSample.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
    
    // Validate the converted sample
    try {
      // Check if each line is valid JSON and matches the schema
      const lines = convertedSample.split('\n').filter(line => line.trim() !== '');
      
      for (const line of lines) {
        try {
          const parsedObj = JSON.parse(line);
          
          // Basic schema validation
          if (isGnss) {
            if (!parsedObj.time_unix || !parsedObj.position_lla) {
              return { 
                success: false, 
                error: 'Converted sample is missing required fields (time_unix or position_lla)' 
              };
            }
            
            const positionLla = parsedObj.position_lla;
            if (!positionLla.latitude_deg || !positionLla.longitude_deg || positionLla.altitude_m === undefined) {
              return { 
                success: false, 
                error: 'Converted sample position_lla is missing required fields' 
              };
            }
          } else {
            if (!parsedObj.time_unix || 
                !parsedObj.linear_acceleration || 
                !parsedObj.angular_velocity || 
                !parsedObj.orientation) {
              return { 
                success: false, 
                error: 'Converted sample is missing required IMU fields' 
              };
            }
          }
        } catch (parseError) {
          console.error('Error parsing converted sample line:', parseError);
          return { 
            success: false, 
            error: `Converted sample contains invalid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}` 
          };
        }
      }
      
      console.log(`Successfully validated ${lines.length} converted sample lines`);
    } catch (validationError) {
      console.error('Error validating converted sample:', validationError);
      return { 
        success: false, 
        error: `Failed to validate converted sample: ${validationError instanceof Error ? validationError.message : String(validationError)}` 
      };
    }
    
    console.log(`---------------------------------------------------`);
    
    return {
      success: true,
      convertedSample
    };
  } catch (error) {
    console.error(`Error in direct schema conversion:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}