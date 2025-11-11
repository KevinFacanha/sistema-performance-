/*
  # Create Google Sheets Cache Table

  1. New Tables
    - `sheets_cache`
      - `id` (uuid, primary key)
      - `sheet_data` (jsonb, stores the entire sheet data)
      - `last_fetched_at` (timestamp)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
  2. Indexes
    - Index on `updated_at` for efficient queries
  3. Note
    - This table stores cached data from Google Sheets
    - The cache is updated whenever the sheets-parser edge function is triggered
    - Data is public and can be read by anyone
*/

CREATE TABLE IF NOT EXISTS sheets_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_fetched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sheets_cache_updated_at 
  ON sheets_cache(updated_at DESC);

ALTER TABLE sheets_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read sheets cache"
  ON sheets_cache
  FOR SELECT
  TO authenticated, anon
  USING (true);
