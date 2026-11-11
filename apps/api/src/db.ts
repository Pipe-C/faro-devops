import mysql, { type Pool } from 'mysql2/promise';
import type { Config } from './config.js';

export function createPool(db: Config['db']): Pool {
  return mysql.createPool({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
    charset: 'utf8mb4',
    timezone: 'Z', // los TIMESTAMP se leen y escriben en UTC
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 3000,
    enableKeepAlive: true,
  });
}
