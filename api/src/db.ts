import { Pool, QueryResultRow } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

// Sem esse listener, um erro em conexão ociosa (comum em poolers como o do Supabase)
// vira exceção não capturada e derruba o processo inteiro.
pool.on('error', (err) => {
  console.error('Unexpected PG pool error', err);
});

export const db = {
  query: <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => pool.query<T>(text, params),
};
