import { BlobServiceClient, ContainerClient, StorageSharedKeyCredential, BlockBlobUploadOptions } from '@azure/storage-blob';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

// Connection string from environment variable
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

// Flag to enable/disable local fallback
const useLocalFallback = true;

// Display a clear error if connection string is missing
if (!connectionString || connectionString === 'UseDevelopmentStorage=true') {
  console.error('ERROR: Azure Storage connection string is required but missing or invalid.');
  console.error('Please set AZURE_STORAGE_CONNECTION_STRING environment variable to a valid connection string.');
}

// Container names from environment variables (with defaults)
const uploadsContainer = process.env.AZURE_STORAGE_CONTAINER_UPLOADS || 'uploads';
const processedContainer = process.env.AZURE_STORAGE_CONTAINER_PROCESSED || 'processed';
const resultsContainer = process.env.AZURE_STORAGE_CONTAINER_RESULTS || 'results';

// Export container names for use in other services
export const containers = {
  uploads: uploadsContainer,
  processed: processedContainer,
  results: resultsContainer
};

// Local fallback paths (only used in case of emergency when Azure is down)
const uploadsFallbackDir = path.join(__dirname, '../../uploads');
const processedFallbackDir = path.join(__dirname, '../../processed');
const resultsFallbackDir = path.join(__dirname, '../../results');

// Initialize Azure Storage client
let blobServiceClient: BlobServiceClient | null = null;
let isUsingLocalFallback = false;

try {
  // Retrieve connection string
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  
  if (connectionString) {
    // Create BlobServiceClient
    blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    console.log('Azure Blob Storage client initialized successfully');
  } else if (useLocalFallback) {
    console.warn('Azure Storage connection string missing - using local filesystem fallback');
    isUsingLocalFallback = true;
  } else {
    console.error('ERROR: Azure Storage connection string is required but missing or invalid.');
    console.error('Please set AZURE_STORAGE_CONNECTION_STRING environment variable to a valid connection string.');
    throw new Error('Azure Storage connection string is required but missing.');
  }
} catch (error) {
  console.error('Error initializing Azure Blob Storage:', error);
  
  if (useLocalFallback) {
    console.warn('Using local filesystem fallback due to Azure Storage initialization error');
    isUsingLocalFallback = true;
  } else {
    throw error;
  }
}

/**
 * Initialize blob storage containers
 */
export async function initializeStorage(): Promise<void> {
  console.log('Initializing Azure Blob Storage...');
  
  if (!blobServiceClient) {
    throw new Error('BlobServiceClient is not initialized. Cannot continue.');
  }
  
  try {
    // Create containers if they don't exist
    await createContainerIfNotExists(uploadsContainer);
    await createContainerIfNotExists(processedContainer);
    await createContainerIfNotExists(resultsContainer);
    
    console.log('Azure Blob Storage containers initialized successfully.');
  } catch (error) {
    console.error('Error initializing Azure Blob Storage:', error);
    throw error;
  }
}

/**
 * Create container if it doesn't exist
 */
async function createContainerIfNotExists(containerName: string): Promise<ContainerClient | null> {
  if (!blobServiceClient) {
    throw new Error('BlobServiceClient is not initialized');
  }

  const containerClient = blobServiceClient.getContainerClient(containerName);
  const exists = await containerClient.exists();
  
  if (!exists) {
    console.log(`Creating container: ${containerName}`);
    await containerClient.create();
    console.log(`Container created: ${containerName}`);
  } else {
    console.log(`Container already exists: ${containerName}`);
  }
  
  return containerClient;
}

/**
 * Helper function to ensure a container exists
 */
async function ensureContainerExists(containerClient: ContainerClient): Promise<void> {
  if (!containerClient) return;
  
  try {
    const createIfNotExists = await containerClient.createIfNotExists();
    if (createIfNotExists.succeeded) {
      console.log(`Container ${containerClient.containerName} created`);
    }
  } catch (error) {
    console.error(`Error ensuring container ${containerClient.containerName} exists:`, error);
    throw error;
  }
}

/**
 * Upload a file to Azure Blob Storage (or local filesystem if fallback is enabled)
 */
export async function uploadFile(
  localFilePath: string,
  blobName: string,
  containerName: string,
  metadata?: any
): Promise<string> {
  try {
    // Local fallback if Azure is not available
    if (isUsingLocalFallback || !blobServiceClient) {
      const localStoragePath = path.join(__dirname, '../../local-storage', containerName);
      
      // Create local storage directory if it doesn't exist
      if (!fs.existsSync(localStoragePath)) {
        fs.mkdirSync(localStoragePath, { recursive: true });
      }
      
      // Copy file to local storage
      const destinationPath = path.join(localStoragePath, blobName);
      const destinationDir = path.dirname(destinationPath);
      
      // Create directory structure if needed
      if (!fs.existsSync(destinationDir)) {
        fs.mkdirSync(destinationDir, { recursive: true });
      }
      
      // Copy the file
      fs.copyFileSync(localFilePath, destinationPath);
      
      console.log(`File saved to local storage: ${destinationPath}`);
      return `local-storage://${containerName}/${blobName}`;
    }
    
    // If using Azure storage
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await ensureContainerExists(containerClient);
    
    const blobClient = containerClient.getBlockBlobClient(blobName);
    
    // Upload file
    const uploadOptions: BlockBlobUploadOptions = {};
    
    if (metadata) {
      uploadOptions.metadata = metadata;
    }
    
    await blobClient.uploadFile(localFilePath, uploadOptions);
    
    // Return the URL to the uploaded blob
    return blobClient.url;
  } catch (error) {
    console.error(`Error uploading file ${localFilePath} to blob ${blobName}:`, error);
    
    // If Azure upload failed but local fallback is enabled, try local storage
    if (!isUsingLocalFallback && useLocalFallback) {
      console.warn('Azure upload failed, falling back to local storage');
      isUsingLocalFallback = true;
      return uploadFile(localFilePath, blobName, containerName, metadata);
    }
    
    throw error;
  }
}

/**
 * Upload file content (string or buffer) to Azure Blob Storage
 */
export async function uploadContent(
  content: string | Buffer, 
  blobName: string, 
  containerName: string = processedContainer
): Promise<string> {
  if (!blobServiceClient) {
    throw new Error('BlobServiceClient is not initialized. Cannot upload content.');
  }

  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    
    // Upload the content
    if (typeof content === 'string') {
      await blockBlobClient.upload(content, content.length);
    } else {
      // It's a Buffer
      await blockBlobClient.upload(content, content.length);
    }
    
    console.log(`Content uploaded as ${blobName} to ${containerName} container`);
    
    // Return the URL of the blob
    return blockBlobClient.url;
  } catch (error) {
    console.error(`Error uploading content as ${blobName} to ${containerName}:`, error);
    throw error;
  }
}

/**
 * Download a file from Azure Blob Storage
 */
export async function downloadFile(
  blobName: string, 
  destinationPath: string, 
  containerName: string = processedContainer
): Promise<void> {
  if (!blobServiceClient) {
    throw new Error('BlobServiceClient is not initialized. Cannot download file.');
  }

  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    
    // Create directory if it doesn't exist
    const dir = path.dirname(destinationPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Download the file
    await blockBlobClient.downloadToFile(destinationPath);
    
    console.log(`File ${blobName} downloaded to ${destinationPath}`);
  } catch (error) {
    console.error(`Error downloading file ${blobName} from ${containerName}:`, error);
    throw error;
  }
}

/**
 * Stream a file to response object
 */
export async function streamToResponse(
  blobName: string, 
  response: any, 
  containerName: string = processedContainer
): Promise<void> {
  // Use local fallback if Azure Storage is not available
  if (useLocalFallback || !blobServiceClient) {
    const localDir = getLocalPathForContainer(containerName);
    const sourcePath = path.join(localDir, blobName);
    
    // Check if file exists
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`File ${blobName} not found in local fallback`);
    }
    
    // Get file stats
    const stats = fs.statSync(sourcePath);
    
    // Set headers
    response.setHeader('Content-Type', getContentType(sourcePath) || 'application/octet-stream');
    response.setHeader('Content-Length', stats.size);
    response.setHeader('Content-Disposition', `attachment; filename=${blobName}`);
    
    // Stream the file
    const fileStream = fs.createReadStream(sourcePath);
    fileStream.pipe(response);
    
    console.log(`File ${blobName} streamed from local path`);
    return;
  }

  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    
    // Check if blob exists
    const exists = await blockBlobClient.exists();
    if (!exists) {
      throw new Error(`File ${blobName} not found in container ${containerName}`);
    }
    
    // Get blob properties
    const properties = await blockBlobClient.getProperties();
    
    // Set headers
    response.setHeader('Content-Type', properties.contentType || 'application/octet-stream');
    response.setHeader('Content-Length', properties.contentLength);
    response.setHeader('Content-Disposition', `attachment; filename=${blobName}`);
    
    // Download the blob and pipe to response
    const downloadResponse = await blockBlobClient.download();
    downloadResponse.readableStreamBody!.pipe(response);
    
    console.log(`File ${blobName} streamed from ${containerName} container`);
  } catch (error) {
    console.error(`Error streaming file ${blobName} from ${containerName}:`, error);
    throw error;
  }
}

/**
 * List all files in a container
 */
export async function listFiles(containerName: string = uploadsContainer): Promise<Array<{name: string, properties: any}>> {
  // Add detailed logging
  console.log(`Listing files in container: ${containerName}`);
  
  // Use local fallback if Azure Storage is not available
  if (useLocalFallback || !blobServiceClient) {
    console.log('Using local fallback storage');
    const localDir = getLocalPathForContainer(containerName);
    
    // Check if directory exists
    if (!fs.existsSync(localDir)) {
      console.log(`Local directory ${localDir} does not exist`);
      return [];
    }
    
    // List files
    const fileList = fs.readdirSync(localDir);
    console.log(`Found ${fileList.length} files in local directory ${localDir}`);
    
    // Get file properties
    return fileList.map(fileName => {
      const filePath = path.join(localDir, fileName);
      const stats = fs.statSync(filePath);
      return {
        name: fileName,
        properties: {
          createdOn: stats.birthtime,
          lastModified: stats.mtime,
          contentLength: stats.size,
          contentType: getContentType(filePath),
          metadata: {} // Local fallback doesn't support metadata
        }
      };
    });
  }

  try {
    console.log(`Using Azure Blob Storage to list files in ${containerName}`);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // Check if container exists
    const containerExists = await containerClient.exists();
    if (!containerExists) {
      console.log(`Container ${containerName} does not exist in Azure Blob Storage`);
      return [];
    }
    
    const files = [];
    
    // List all blobs in the container
    for await (const blob of containerClient.listBlobsFlat()) {
      console.log(`Found blob: ${blob.name}`);
      
      try {
        // Get the blob client to access properties and metadata
        const blobClient = containerClient.getBlobClient(blob.name);
        const properties = await blobClient.getProperties();
        
        console.log(`Blob metadata for ${blob.name}:`, properties.metadata);
        
        files.push({
          name: blob.name,
          properties: {
            createdOn: blob.properties.createdOn,
            lastModified: blob.properties.lastModified,
            contentLength: blob.properties.contentLength,
            contentType: blob.properties.contentType,
            metadata: properties.metadata || {}
          }
        });
      } catch (blobError) {
        console.error(`Error retrieving properties for blob ${blob.name}:`, blobError);
        
        // Still include the blob with limited properties
        files.push({
          name: blob.name,
          properties: {
            createdOn: blob.properties.createdOn,
            lastModified: blob.properties.lastModified,
            contentLength: blob.properties.contentLength,
            contentType: blob.properties.contentType,
            metadata: {}
          }
        });
      }
    }
    
    console.log(`Retrieved ${files.length} files from container ${containerName}`);
    return files;
  } catch (error) {
    console.error(`Error listing files in ${containerName}:`, error);
    return []; // Return empty array instead of throwing
  }
}

/**
 * Delete a file from a container
 */
export async function deleteFile(
  blobName: string, 
  containerName: string
): Promise<void> {
  // Use local fallback if Azure Storage is not available
  if (useLocalFallback || !blobServiceClient) {
    const localDir = getLocalPathForContainer(containerName);
    const filePath = path.join(localDir, blobName);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(`File ${blobName} not found in local fallback, nothing to delete`);
      return;
    }
    
    // Delete the file
    fs.unlinkSync(filePath);
    console.log(`File ${blobName} deleted from local path`);
    return;
  }

  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    
    // Delete the blob
    await blockBlobClient.delete();
    
    console.log(`File ${blobName} deleted from ${containerName} container`);
  } catch (error) {
    console.error(`Error deleting file ${blobName} from ${containerName}:`, error);
    throw error;
  }
}

/**
 * Clear all files in a container
 */
export async function clearContainer(containerName: string): Promise<number> {
  // Use local fallback if Azure Storage is not available
  if (useLocalFallback || !blobServiceClient) {
    const localDir = getLocalPathForContainer(containerName);
    
    // Check if directory exists
    if (!fs.existsSync(localDir)) {
      return 0;
    }
    
    // List files
    const files = fs.readdirSync(localDir)
      .filter(file => !file.startsWith('.'));
    
    // Delete each file
    let deletedCount = 0;
    for (const file of files) {
      const filePath = path.join(localDir, file);
      try {
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (error) {
        console.error(`Error deleting file ${file} from local path:`, error);
      }
    }
    
    console.log(`Deleted ${deletedCount} files from local path`);
    return deletedCount;
  }

  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // Check if container exists first
    const containerExists = await containerClient.exists();
    if (!containerExists) {
      console.log(`Container ${containerName} does not exist - no files to delete`);
      return 0;
    }
    
    let deletedCount = 0;
    
    // Delete all blobs in the container
    for await (const blob of containerClient.listBlobsFlat()) {
      try {
        await containerClient.deleteBlob(blob.name);
        deletedCount++;
      } catch (error: any) {
        console.warn(`Error deleting blob ${blob.name}: ${error.message}`);
        // Continue with other blobs
      }
    }
    
    console.log(`Deleted ${deletedCount} files from ${containerName} container`);
    return deletedCount;
  } catch (error) {
    console.error(`Error clearing container ${containerName}:`, error);
    // Return 0 instead of throwing to make this operation more resilient
    return 0;
  }
}

/**
 * Get content type based on file extension
 */
function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  
  const contentTypes: Record<string, string> = {
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.csv': 'text/csv',
    '.xml': 'application/xml',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  };
  
  return contentTypes[ext] || 'application/octet-stream';
}

/**
 * Get local fallback path for container
 */
function getLocalPathForContainer(containerName: string): string {
  switch (containerName) {
    case uploadsContainer:
      return uploadsFallbackDir;
    case processedContainer:
      return processedFallbackDir;
    case resultsContainer:
      return resultsFallbackDir;
    default:
      return path.join(__dirname, '../../', containerName);
  }
}

// Export everything as a module
export const blobStorageService = {
  initializeStorage,
  uploadFile,
  uploadContent,
  downloadFile,
  streamToResponse,
  listFiles,
  deleteFile,
  clearContainer,
  containers: {
    uploads: uploadsContainer,
    processed: processedContainer,
    results: resultsContainer
  }
}; 