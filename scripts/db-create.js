#!/usr/bin/env node
/**
 * Crea la base de datos 'facturacion' si no existe.
 * Uso: node scripts/db-create.js
 * Variables de entorno desde .env en la raíz del monorepo.
 */
const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: 'postgres', // conectar a postgres para crear la BD
  });

  await client.connect();

  const dbName = process.env.DB_NAME || 'facturacion';
  const result = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`,
    [dbName],
  );

  if (result.rowCount === 0) {
    await client.query(`CREATE DATABASE "${dbName}" ENCODING 'UTF8'`);
    console.log(`✓ Base de datos '${dbName}' creada exitosamente`);
  } else {
    console.log(`✓ Base de datos '${dbName}' ya existe`);
  }

  await client.end();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
