// Local MongoDB for development without installing anything: `npm run db`. Data persists in ./.data
import { mkdirSync } from 'fs';
import { MongoMemoryServer } from 'mongodb-memory-server';

mkdirSync('.data', { recursive: true });
MongoMemoryServer.create({ instance: { port: 27017, dbPath: '.data', storageEngine: 'wiredTiger' } }).then((m) => console.log('MongoDB running:', m.getUri()));
