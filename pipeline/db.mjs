import pg from 'pg';

const { Pool } = pg;

export function getDbConfig() {
  return {
    host: String(process.env.DB_POSTGRESDB_HOST || process.env.POSTGRES_HOST || 'postgres').trim(),
    port: Number.parseInt(String(process.env.DB_POSTGRESDB_PORT || process.env.POSTGRES_PORT || '5432'), 10) || 5432,
    database: String(process.env.DB_POSTGRESDB_DATABASE || process.env.POSTGRES_DB || '').trim(),
    user: String(process.env.DB_POSTGRESDB_USER || process.env.POSTGRES_USER || '').trim(),
    password: String(process.env.DB_POSTGRESDB_PASSWORD || process.env.POSTGRES_PASSWORD || '').trim(),
  };
}

export function createPool() {
  return new Pool(getDbConfig());
}

export async function withClient(pool, fn) {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withTransaction(pool, fn) {
  return withClient(pool, async (client) => {
    await client.query('begin');
    try {
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    }
  });
}
