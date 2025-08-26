-- SEO Spider Database Setup
-- Run this in your Supabase SQL editor

-- Create crawls table
CREATE TABLE IF NOT EXISTS crawls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error_message TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create pages table
CREATE TABLE IF NOT EXISTS pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crawl_id UUID REFERENCES crawls(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  title TEXT,
  meta_description TEXT,
  text_length INTEGER DEFAULT 0,
  h1_count INTEGER DEFAULT 0,
  h2_count INTEGER DEFAULT 0,
  h3_count INTEGER DEFAULT 0,
  h4_count INTEGER DEFAULT 0,
  h5_count INTEGER DEFAULT 0,
  h6_count INTEGER DEFAULT 0,
  internal_links INTEGER DEFAULT 0,
  external_links INTEGER DEFAULT 0,
  nofollow_links INTEGER DEFAULT 0,
  schema_types TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create page_links table
CREATE TABLE IF NOT EXISTS page_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crawl_id UUID REFERENCES crawls(id) ON DELETE CASCADE,
  from_url TEXT NOT NULL,
  to_url TEXT NOT NULL,
  link_count INTEGER DEFAULT 1,
  is_nofollow BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique constraint for page_links
CREATE UNIQUE INDEX IF NOT EXISTS page_links_unique 
ON page_links (crawl_id, from_url, to_url);

-- Enable Row Level Security
ALTER TABLE crawls ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_links ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for crawls
CREATE POLICY "Allow all operations on crawls" ON crawls
  FOR ALL USING (true) WITH CHECK (true);

-- Create RLS policies for pages
CREATE POLICY "Allow all operations on pages" ON pages
  FOR ALL USING (true) WITH CHECK (true);

-- Create RLS policies for page_links
CREATE POLICY "Allow all operations on page_links" ON page_links
  FOR ALL USING (true) WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_crawls_domain ON crawls(domain);
CREATE INDEX IF NOT EXISTS idx_crawls_status ON crawls(status);
CREATE INDEX IF NOT EXISTS idx_crawls_created_at ON crawls(created_at);
CREATE INDEX IF NOT EXISTS idx_pages_crawl_id ON pages(crawl_id);
CREATE INDEX IF NOT EXISTS idx_pages_url ON pages(url);
CREATE INDEX IF NOT EXISTS idx_page_links_crawl_id ON page_links(crawl_id);
CREATE INDEX IF NOT EXISTS idx_page_links_from_url ON page_links(from_url);
CREATE INDEX IF NOT EXISTS idx_page_links_to_url ON page_links(to_url); 