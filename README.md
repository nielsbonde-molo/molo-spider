# SEO Spider Tool

An internal SEO spider/crawler tool built with Next.js, Supabase, and Python.

## Features

- **Web Interface**: Clean UI for domain input and crawl initiation
- **Comprehensive SEO Analysis**: Extracts metadata, headings, links, and schema types
- **Dual Storage**: Saves data to both Supabase database and local CSV files
- **Internal Crawling**: Automatically discovers and crawls internal links
- **Real-time Feedback**: Progress updates during crawl execution

## Tech Stack

- **Frontend**: Next.js 14+ (App Router, TypeScript, Tailwind CSS)
- **Backend**: Next.js API routes with child_process for Python execution
- **Database**: Supabase (PostgreSQL)
- **Crawler**: Python with BeautifulSoup and requests
- **Authentication**: Supabase Auth (ready for implementation)

## Setup Instructions

### 1. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies
pip install -r requirements.txt
```

### 2. Environment Configuration

Create a `.env.local` file with your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 3. Database Setup

Run these SQL commands in your Supabase SQL editor:

```sql
-- Create crawls table
create table crawls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) null,
  domain text not null,
  created_at timestamp with time zone default now()
);

-- Create pages table
create table pages (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid references crawls(id) on delete cascade,
  url text not null,
  status_code int,
  title text,
  meta_description text,
  canonical text,
  schema_types text[],
  text_length int,
  full_text text,
  h1_count int default 0,
  h2_count int default 0,
  h3_count int default 0,
  h4_count int default 0,
  h5_count int default 0,
  h6_count int default 0,
  internal_links int default 0,
  external_links int default 0,
  nofollow_links int default 0,
  target_keyword text,
  created_at timestamp with time zone default now()
);

-- Create page_links table
create table page_links (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid references crawls(id) on delete cascade,
  from_url text not null,
  to_url text not null,
  link_count int default 1,
  is_nofollow boolean default false,
  created_at timestamp with time zone default now()
);

-- Create unique constraint for page_links
create unique index page_links_unique on page_links(crawl_id, from_url, to_url);

-- Enable Row Level Security
alter table crawls enable row level security;
alter table pages enable row level security;

-- Create RLS policies
create policy "Public read access" on crawls for select using (true);
create policy "Users can insert their own crawls" on crawls for insert with check (true);
create policy "Users can update their own crawls" on crawls for update using (auth.uid() = user_id);
create policy "Users can delete their own crawls" on crawls for delete using (auth.uid() = user_id);

create policy "Public read access" on pages for select using (true);
create policy "Users can insert pages for their crawls" on pages for insert with check (true);
create policy "Users can update pages for their crawls" on pages for update using (
  exists (select 1 from crawls where id = crawl_id and user_id = auth.uid())
);
create policy "Users can delete pages for their crawls" on pages for delete using (
  exists (select 1 from crawls where id = crawl_id and user_id = auth.uid())
);

-- Enable RLS for page_links
alter table page_links enable row level security;

-- Create RLS policies for page_links
create policy "Public read access" on page_links for select using (true);
create policy "Users can insert page links for their crawls" on page_links for insert with check (true);
create policy "Users can update page links for their crawls" on page_links for update using (
  exists (select 1 from crawls where id = crawl_id and user_id = auth.uid())
);
create policy "Users can delete page links for their crawls" on page_links for delete using (
  exists (select 1 from crawls where id = crawl_id and user_id = auth.uid())
);
```

### 4. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` to access the spider tool.

## Usage

1. **Enter Domain**: Input a domain (with or without protocol)
2. **Start Crawling**: Click the "Start Crawling" button
3. **Monitor Progress**: Watch real-time feedback in the UI
4. **View Results**: Data is saved to both Supabase and CSV files

## Data Collected

For each page, the crawler extracts:

- **Basic Metadata**: URL, status code, title, meta description, canonical URL
- **Content Analysis**: Full text content and character count
- **Heading Structure**: Count of H1-H6 headings
- **Link Analysis**: Internal, external, and nofollow link counts
- **Schema Types**: JSON-LD schema types detected
- **SEO Planning**: Target keyword field (for future use)

## File Structure

```
src/
├── app/
│   ├── spider/
│   │   ├── ui.tsx          # Spider UI component
│   │   └── route.ts        # API endpoint for crawl requests
│   ├── data/
│   │   └── results/        # CSV output files
│   └── page.tsx            # Main page with spider UI
├── lib/
│   └── supabase.ts         # Supabase client configuration
└── scripts/
    └── crawler.py          # Python crawler script
```

## Development Notes

- The crawler respects robots.txt and uses appropriate User-Agent
- Internal links are automatically discovered and queued for crawling
- All data is stored in both Supabase (structured) and CSV (portable)
- The system is ready for authentication integration
- Error handling includes network timeouts and malformed URLs

## Future Enhancements

- User authentication and crawl history
- Crawl scheduling and recurring jobs
- Advanced SEO metrics and scoring
- Export functionality for different formats
- Crawl depth and page limit controls
