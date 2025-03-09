import { CosmosClient } from '@azure/cosmos';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

// Cosmos DB configuration
const endpoint = process.env.COSMOS_ENDPOINT || 'https://fusionfly.documents.azure.com:443/';
const key = process.env.COSMOS_KEY;
const databaseId = process.env.COSMOS_DATABASE || 'fusionfly-db';
const usersContainerId = 'users';
const useLocalFallback = process.env.USE_LOCAL_DB_FALLBACK === 'true';

console.log(`Cosmos DB Configuration: 
  Endpoint: ${endpoint}
  Database ID: ${databaseId}
  Container ID: ${usersContainerId}
  Key Present: ${!!key}
  Using Local Fallback: ${useLocalFallback}
`);

// Local fallback path
const localDbPath = path.join(__dirname, '../../localdb');
const usersPath = path.join(localDbPath, 'users.json');

// Initialize local fallback directories and files
if (useLocalFallback) {
  if (!fs.existsSync(localDbPath)) {
    fs.mkdirSync(localDbPath, { recursive: true });
  }
  
  if (!fs.existsSync(usersPath)) {
    fs.writeFileSync(usersPath, JSON.stringify([]));
  }
  
  console.log(`Using local DB fallback at ${localDbPath}`);
}

// Initialize the Cosmos client only if not using local fallback
let client: CosmosClient | null = null;
if (!useLocalFallback && key) {
  try {
    client = new CosmosClient({
      endpoint,
      key,
      connectionPolicy: {
        enableEndpointDiscovery: false
      }
    });
  } catch (error) {
    console.error('Error creating Cosmos client:', error);
    console.log('Falling back to local database');
  }
}

/**
 * Create the database if it does not exist
 */
async function createDatabase() {
  if (useLocalFallback || !client) {
    console.log(`Using local fallback for database: ${databaseId}`);
    return { id: databaseId };
  }
  
  const { database } = await client.databases.createIfNotExists({ id: databaseId });
  console.log(`Database '${databaseId}' created or already exists`);
  return database;
}

/**
 * Create container if it does not exist
 */
async function createContainer(database: any, containerId: string, partitionKey: string) {
  if (useLocalFallback || !client) {
    console.log(`Using local fallback for container: ${containerId}`);
    return { id: containerId };
  }
  
  const { container } = await database.containers.createIfNotExists({
    id: containerId,
    partitionKey: { paths: [partitionKey] }
  });
  console.log(`Container '${containerId}' created or already exists`);
  return container;
}

/**
 * Initialize the database and container
 */
export async function initializeCosmosDb() {
  try {
    console.log('Setting up Cosmos DB...');
    
    if (useLocalFallback) {
      console.log('Using local database fallback');
      return true;
    }
    
    // Create database
    const database = await createDatabase();
    
    // Create users container with email as partition key
    await createContainer(database, usersContainerId, '/email');
    
    console.log('Cosmos DB setup completed successfully');
    return true;
  } catch (error) {
    console.error('Error setting up Cosmos DB:', error);
    console.log('Falling back to local database');
    return true; // Return true so server can continue
  }
}

// Local database operations for fallback
export class LocalDatabase {
  static async readUsers() {
    try {
      const data = fs.readFileSync(usersPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading users from local database:', error);
      return [];
    }
  }
  
  static async writeUsers(users: any[]) {
    try {
      fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
    } catch (error) {
      console.error('Error writing users to local database:', error);
    }
  }
  
  static async queryUsers(query: Function) {
    const users = await this.readUsers();
    return users.filter(query);
  }
  
  static async createUser(user: any) {
    const users = await this.readUsers();
    users.push(user);
    await this.writeUsers(users);
    return user;
  }
  
  static async updateUser(userId: string, user: any) {
    const users = await this.readUsers();
    const index = users.findIndex((u: any) => u.id === userId);
    if (index !== -1) {
      users[index] = { ...users[index], ...user };
      await this.writeUsers(users);
      return users[index];
    }
    return null;
  }
  
  static async deleteUser(userId: string) {
    const users = await this.readUsers();
    const index = users.findIndex((u: any) => u.id === userId);
    if (index !== -1) {
      users.splice(index, 1);
      await this.writeUsers(users);
      return true;
    }
    return false;
  }
}

// Export database and container clients with fallback
export const database = client ? client.database(databaseId) : null;
export const usersContainer = database ? database.container(usersContainerId) : null; 