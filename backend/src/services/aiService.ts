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
    // For NMEA files, or small files, read the entire file
    const isSmallFile = stats.size < 1024 * 1024; // Less than 1MB
    
    if (isNmea || isSmallFile) {
      // For NMEA files, read the entire file regardless of size
      if (isNmea) {
        console.log(`NMEA file detected (${(stats.size/1024).toFixed(2)} KB). Reading ENTIRE file.`);
      } else {
        console.log(`File size is ${stats.size} bytes (${(stats.size/1024).toFixed(2)} KB). Reading entire file.`);
      }
      sample = fs.readFileSync(inputPath, 'utf8');
    } else {
      // For larger non-NMEA files, read a sample
      console.log(`File size is ${stats.size} bytes (${(stats.size/1024).toFixed(2)} KB). Reading sample only.`);
      sample = await readFileSample(inputPath, 100, 16384);
    }
    
    if (!sample) {
      const errorMsg = 'Failed to read sample from input file';
      console.error(errorMsg);
      return { success: false, error: errorMsg };
    }

    console.log(`Read ${sample.length} bytes from ${inputPath} for AI analysis${isNmea || isSmallFile ? ' (entire file)' : ''}`);

    // Create the prompt based on which step we're performing
    let messages: (ChatRequestSystemMessage | ChatRequestUserMessage)[];
    
    // If this is a retry, include the error information in the prompt
    let errorFeedback = '';
    if (retryCount > 0) {
      const jsonlErrors = await validateJsonlOutput(outputPath, format);
      errorFeedback = `
CONVERSION ERRORS FROM PREVIOUS ATTEMPT:
${jsonlErrors.join('\n')}

PLEASE FIX THESE ERRORS IN YOUR NEW RESPONSE.
`;
      console.log(`Including error feedback for retry #${retryCount}`);
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
          max_tokens: 15000,
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
            maxTokens: 15000
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
    
    // For non-location extraction and non-schema conversion, we now generate and execute code
    if (!isLocationExtraction && !isSchemaConversion) {
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
    } else {
      // For location extraction and schema conversion, continue with the current approach
      // since those expect direct JSONL output, not code
      try {
        // More aggressive cleaning of the LLM response to ensure it's valid JSONL
        // Remove any markdown code blocks, comments, and explanatory text
        let cleanJsonl = conversionLogic;
        
        // First, check if the entire response is wrapped in a code block and extract just the content
        const codeBlockMatch = cleanJsonl.match(/```(?:jsonl|json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
          cleanJsonl = codeBlockMatch[1];
          console.log('Extracted content from code block');
        } else {
          // Otherwise remove any markdown code blocks that might be present
          cleanJsonl = cleanJsonl.replace(/```(?:jsonl|json)?\s*([\s\S]*?)```/g, '$1');
          console.log('Removed markdown code blocks');
        }
        
        // Split into lines and process each line
        const lines = cleanJsonl.split('\n');
        const jsonLines: string[] = [];
        
        for (const line of lines) {
          const trimmed = line.trim();
          
          // Skip empty lines
          if (!trimmed) continue;
          
          // Skip lines that look like explanatory text or comments
          if (
            trimmed.startsWith('//') || 
            trimmed.startsWith('#') || 
            trimmed.startsWith('/*') ||
            trimmed.startsWith('Note:') || 
            trimmed.startsWith('Here') ||
            trimmed.startsWith('This') ||
            trimmed.startsWith('The ') ||
            trimmed.startsWith('Each') ||
            trimmed.startsWith('For ') ||
            trimmed.startsWith('I ') ||
            trimmed.startsWith('JSON') ||
            trimmed.startsWith('JSONL')
          ) {
            continue;
          }
          
          // Only keep lines that look like they contain JSON objects
          if (trimmed.startsWith('{') && (trimmed.endsWith('}') || trimmed.includes('}'))) {
            // Try to validate it's actually valid JSON
            try {
              // Make sure it's a complete object (may end with a comma for arrays)
              let jsonStr = trimmed;
              if (jsonStr.endsWith(',')) {
                jsonStr = jsonStr.slice(0, -1);
              }
              
              // If we can parse it, it's valid JSON
              JSON.parse(jsonStr);
              jsonLines.push(jsonStr);
            } catch (e) {
              // If it can't be parsed, skip this line
              console.log(`Skipping invalid JSON line: ${trimmed.substring(0, 50)}...`);
            }
          }
        }
        
        // Join the valid JSON lines
        cleanJsonl = jsonLines.join('\n');
        
        // If no valid JSON objects found, retry with more explicit error feedback
        if (jsonLines.length === 0) {
          if (retryCount < MAX_RETRIES) {
            console.error('AI returned no valid JSON content after cleaning. Attempting retry with feedback.');
            fs.writeFileSync(outputPath, ""); // Create empty file for validation
            return await aiAssistedConversion(inputPath, outputPath, format, retryCount + 1);
          } else {
            console.error(`AI returned no valid JSON content after ${retryCount} retries.`);
            return { success: false, error: 'AI returned no valid JSON objects after multiple attempts.' };
          }
        }

        console.log(`Cleaned JSON lines: ${jsonLines.length} valid lines extracted`);
        fs.writeFileSync(outputPath, cleanJsonl);
        console.log(`Wrote AI-generated JSONL content to: ${outputPath}`);
      } catch (writeError: any) {
        console.error('Error writing AI output to file:', writeError);
        
        // Try again with error feedback if not exceeded max retries
        if (retryCount < MAX_RETRIES) {
          console.log(`Attempting retry #${retryCount + 1} after write error`);
          return await aiAssistedConversion(inputPath, outputPath, format, retryCount + 1);
        }
        
        return { 
          success: false, 
          error: `Error writing AI output: ${writeError instanceof Error ? writeError.message : String(writeError)}` 
        };
      }
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
 * Reads a sample of the file for AI analysis
 */
async function readFileSample(
  filePath: string, 
  maxLines: number = 100,  // Increased from 60 to 100 lines total
  maxBytes: number = 16384  // Increased from 8192 to 16KB for larger samples
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
    
    // Sample from beginning (first 35 lines) - increased from 20
    const beginBuffer = Buffer.alloc(Math.floor(maxBytes / 3));
    const beginFd = await fs.promises.open(filePath, 'r');
    const beginResult = await beginFd.read(beginBuffer, 0, Math.floor(maxBytes / 3), 0);
    await beginFd.close();
    const beginSample = beginBuffer.slice(0, beginResult.bytesRead).toString('utf8');
    const beginLines = beginSample.split('\n').slice(0, 35);
    samples.push(beginLines.join('\n'));
    
    // Sample from middle (35 lines from middle) - increased from 20
    const middleOffset = Math.floor(stats.size / 2);
    const middleBuffer = Buffer.alloc(Math.floor(maxBytes / 3));
    const middleFd = await fs.promises.open(filePath, 'r');
    const middleResult = await middleFd.read(middleBuffer, 0, Math.floor(maxBytes / 3), middleOffset);
    await middleFd.close();
    const middleSample = middleBuffer.slice(0, middleResult.bytesRead).toString('utf8');
    const middleLines = middleSample.split('\n');
    if (middleLines.length > 0) {
      // Skip first line which might be partial
      samples.push(middleLines.slice(1, 36).join('\n'));
    }
    
    // Sample from end (last 30 lines) - increased from 20
    const endOffset = Math.max(0, stats.size - Math.floor(maxBytes / 3));
    const endBuffer = Buffer.alloc(Math.floor(maxBytes / 3));
    const endFd = await fs.promises.open(filePath, 'r');
    const endResult = await endFd.read(endBuffer, 0, Math.floor(maxBytes / 3), endOffset);
    await endFd.close();
    const endSample = endBuffer.slice(0, endResult.bytesRead).toString('utf8');
    const endLines = endSample.split('\n');
    if (endLines.length > 0) {
      // Skip first line which might be partial
      samples.push(endLines.slice(-30).join('\n'));
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
I need you to write a complete, executable Node.js script that will:
1. Read the input file from "${inputPath}"
2. Parse the data appropriately based on the format
3. Convert it to JSONL format (one JSON object per line)
4. Write the result to "${outputPath}"

YOUR ENTIRE RESPONSE MUST BE *ONLY* THE JAVASCRIPT CODE - NO EXPLANATIONS OR DESCRIPTIONS OUTSIDE THE CODE.
DO NOT include any markdown formatting like \`\`\`javascript or \`\`\` around your code.
Include comments inside the code to explain your logic.

YOU ARE NOT BEING ASKED TO PERFORM THE CONVERSION YOURSELF. YOU ARE BEING ASKED TO WRITE CODE THAT WILL PERFORM THE CONVERSION.`;

  // Add specific instructions for NMEA data
  if (isNmea) {
    systemContent += `\n\nNMEA Parsing Rules for your code:
1. Your code should parse each NMEA sentence based on the message type (GGA, RMC, GSV, GSA, VTG, etc.)
2. Extract timestamp information:
   - Look for appended timestamps after the checksum
   - Extract time and date fields from the NMEA data when available
3. Convert coordinates to decimal degrees format
4. Extract all available data from each sentence type
5. Process EVERY line in the file to JSONL format`;
  }

  // Add error feedback to system content if provided
  if (errorFeedback) {
    systemContent += `\n\n${errorFeedback}`;
  }

  let userContent = `JAVASCRIPT CODE GENERATION TASK:
Write a complete Node.js script that will:
1. Read the file: "${inputPath}"
2. Parse each line of the ${format.toUpperCase()} format data
3. Convert each line to a JSON object
4. Write the resulting JSONL to: "${outputPath}"

Your code must:
- Use Node.js fs module for file operations
- Handle the entire file processing, not just samples
- Include proper error handling
- Be completely self-contained and executable
- DO NOT use template literals (with backticks) for string concatenation to avoid potential compatibility issues
- USE DOUBLE QUOTES for strings where possible

THE EXACT CODE YOU PROVIDE WILL BE SAVED TO A .JS FILE AND EXECUTED DIRECTLY WITH NODE.JS, WITH NO MODIFICATIONS.

For example, your code might start like this:
\`\`\`javascript
const fs = require('fs');
const readline = require('readline');
const path = require('path');

// Function to convert ${format.toUpperCase()} to JSONL
async function convert${format.toUpperCase()}ToJsonl(inputPath, outputPath) {
  try {
    // Create read stream and interface
    const fileStream = fs.createReadStream(inputPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    // Open output file for writing
    const outputStream = fs.createWriteStream(outputPath);
    
    // Process each line
    for await (const line of rl) {
      // Parse line based on format
      // ...
      
      // Convert to JSON and write to output
      // ...
    }
    
    // Close the output stream
    outputStream.end();
    console.log("Conversion complete. Output written to " + outputPath);
  } catch (error) {
    console.error("Error during conversion: " + error.message);
  }
}

// Execute the conversion
convert${format.toUpperCase()}ToJsonl('${inputPath}', '${outputPath}');
\`\`\``;

  // Add file content section
  if (isNmea) {
    userContent += `\n\nHere's a sample of the NMEA file content to help you write the parsing code:
\`\`\`
${sample}
\`\`\``;
  } else {
    userContent += `\n\nINPUT SAMPLES (from different parts of the file):
\`\`\`
${sample}
\`\`\``;
  }

  // Add NMEA-specific instructions to the user message
  if (isNmea) {
    userContent += `\n\nYour parsing code should:
- Parse each valid NMEA line to a JSON object
- Each NMEA sentence should become one JSON object
- Extract all relevant data from each sentence
- Convert coordinates to decimal degrees
- Include timestamp information when available

For example, a line like "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47" might be converted to:
\`\`\`json
{"type":"GGA","timestamp_ms":1621218775000,"latitude":48.1173,"longitude":11.5166,"altitude":545.4,"quality":1,"satellites":8,"hdop":0.9}
\`\`\`

Remember, your entire response should be ONLY JavaScript code with no markdown formatting.`;
  } else {
     // Basic fields for non-NMEA or unknown formats
     userContent += `\n\nYour parsing code should extract as many original fields as possible in a clean JSON structure. Include at minimum:
- timestamp_ms: number (if available in the source data)
- Any coordinates or position data (if available)
- All other relevant data fields from the source format

Remember, your entire response should be ONLY JavaScript code with no markdown formatting.`;
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
    // Location extraction prompt
    systemContent = `You are a precise location data extractor.
Your task is to extract ONLY location-related information from the ENTIRE JSONL input file at "${inputPath}" and write JSONL output to "${outputPath}".
CRITICAL: Your ENTIRE RESPONSE must be ONLY valid JSONL content with one JSON object per line.
DO NOT include ANY explanatory text, markdown code blocks, comments, or notes.
DO NOT wrap the output in \`\`\` code blocks.

EXTREMELY IMPORTANT: You are only being shown a SAMPLE of the file contents. Your extraction logic must process the ENTIRE input file, not just the sample shown. The actual file may contain thousands of records.

I REPEAT: RESPOND ONLY WITH VALID JSON OBJECTS, ONE PER LINE - NOTHING ELSE!

YOUR OUTPUT WILL BE DIRECTLY SAVED TO "${outputPath}" AND USED AS THE EXTRACTION RESULT FOR THE ENTIRE INPUT FILE.`;

    userContent = `EXTRACTION TASK:
1. Read the ENTIRE input file at: "${inputPath}"
2. Write output file to: "${outputPath}"
3. Extract location data from the input JSONL file and output VALID JSONL with location data
4. Your ENTIRE RESPONSE must be ONLY valid JSONL - one JSON object per line, nothing else
5. DO NOT include markdown, code blocks, notes, or explanations in your response
6. DO NOT use \`\`\` or any other wrapping markers
7. Your output MUST represent the extraction of data from EVERY line in the input file, not just the samples

CRITICAL INSTRUCTION: I am showing you only SAMPLES from the input file below. You must extract location data from the ENTIRE FILE, not just these samples.

INPUT SAMPLE:
\`\`\`
${sample}
\`\`\`

REQUIRED OUTPUT FIELDS PER LINE:
- timestamp_ms: number (Unix timestamp in milliseconds)
- latitude: number (decimal degrees, between -90 and 90)
- longitude: number (decimal degrees, between -180 and 180)
- altitude: number (meters, if available, otherwise null)
- hdop: number (horizontal dilution of precision, if available, otherwise null)

CRITICAL REMINDER: YOUR ENTIRE RESPONSE MUST BE VALID JSONL ONLY!
If your response includes anything other than valid JSON objects (one per line), it will cause errors.

YOUR OUTPUT MUST PROCESS THE ENTIRE FILE AT "${inputPath}", NOT JUST THE SAMPLES SHOWN ABOVE.`;
  } else {
    // Full schema conversion prompt
    systemContent = `You are a hyper-precise data transformation expert.
Your task is to transform the ENTIRE input JSONL data at "${inputPath}" into a new JSONL format at "${outputPath}" where each line STRICTLY follows the provided target schema.
CRITICAL: Your ENTIRE RESPONSE must be ONLY valid JSONL content with one JSON object per line.
DO NOT include ANY explanatory text, markdown code blocks, comments, or notes.
DO NOT wrap the output in \`\`\` code blocks.

EXTREMELY IMPORTANT: You are only being shown a SAMPLE of the file contents. Your transformation must be applied to the ENTIRE input file, not just the sample shown. The actual file may contain thousands of records.

I REPEAT: RESPOND ONLY WITH VALID JSON OBJECTS, ONE PER LINE - NOTHING ELSE!

YOUR OUTPUT WILL BE DIRECTLY SAVED TO "${outputPath}" AND USED AS THE TRANSFORMATION RESULT FOR THE ENTIRE INPUT FILE.`;

    userContent = `TRANSFORMATION TASK:
1. Read the ENTIRE input file at: "${inputPath}"
2. Write output file to: "${outputPath}"
3. Transform the input JSONL file into a structured JSONL file where each line matches the schema below
4. Your ENTIRE RESPONSE must be ONLY valid JSONL - one JSON object per line, nothing else
5. DO NOT include markdown, code blocks, notes, or explanations in your response
6. DO NOT use \`\`\` or any other wrapping markers
7. Your output MUST represent the transformation of EVERY line in the input file, not just the samples

TARGET SCHEMA:
\`\`\`json
${schemaToUse}
\`\`\`

CRITICAL INSTRUCTION: I am showing you only SAMPLES from the input file below. You must transform the ENTIRE FILE, not just these samples.

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
- 'orientation.w/x/y/z': Map from quaternion data`}

CRITICAL REMINDER: YOUR ENTIRE RESPONSE MUST BE VALID JSONL ONLY!
If your response includes anything other than valid JSON objects (one per line), it will cause errors.

YOUR OUTPUT MUST TRANSFORM THE ENTIRE FILE AT "${inputPath}", NOT JUST THE SAMPLES SHOWN ABOVE.`;
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