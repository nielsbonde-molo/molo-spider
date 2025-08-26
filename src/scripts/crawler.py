import sys, os
import requests, json
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import csv
import re
import uuid

# Load environment variables from .env.local
try:
    from dotenv import load_dotenv
    # Get the path to the .env.local file (two directories up from scripts)
    env_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env.local')
    load_dotenv(env_path)
    print(f"✅ Loaded environment variables from {env_path}")
except ImportError:
    print("⚠️  python-dotenv not installed, using system environment variables")
except Exception as e:
    print(f"⚠️  Could not load .env.local: {e}")

# Read Supabase service role key
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

# Initialize Supabase client only if credentials are available
supabase = None
if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
    try:
        from supabase import create_client, Client
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        print("✅ Supabase client initialized")
    except Exception as e:
        print(f"⚠️  Supabase client initialization failed: {e}")
        print("📝 Continuing without database operations...")
else:
    print("⚠️  Supabase credentials not found in environment variables")
    print("📝 Continuing without database operations...")

def check_crawl_status(crawl_id):
    """Check if the crawl has been cancelled"""
    if not supabase:
        return "running"  # Assume running if no database connection
    
    try:
        result = supabase.table("crawls").select("status").eq("id", crawl_id).execute()
        if result.data and len(result.data) > 0:
            return result.data[0].get("status", "running")
        return "running"
    except Exception as e:
        print(f"⚠️  Could not check crawl status: {e}")
        return "running"  # Assume running if we can't check

def create_crawl_record(crawl_id, domain):
    """Create crawl record in database if it doesn't exist"""
    if not supabase:
        return False
    
    try:
        # Check if crawl record already exists
        result = supabase.table("crawls").select("id").eq("id", crawl_id).execute()
        
        if result.data and len(result.data) > 0:
            print(f"✅ Crawl record already exists: {crawl_id}")
            return True
        
        # Create new crawl record
        result = supabase.table("crawls").insert({
            "id": crawl_id,
            "domain": domain,
            "user_id": None,
            "status": "running"
        }).execute()
        
        if hasattr(result, 'error') and result.error:
            print(f"❌ Error creating crawl record: {result.error}")
            return False
        
        print(f"✅ Created crawl record: {crawl_id}")
        return True
        
    except Exception as e:
        print(f"❌ Error creating crawl record: {e}")
        return False

def extract_schema_types(soup):
    """Extract JSON-LD schema types from the page"""
    schema_types = []
    
    # Find all script tags with JSON-LD
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            data = json.loads(script.string)
            if isinstance(data, dict):
                if '@type' in data:
                    schema_types.append(data['@type'])
                # Handle arrays of schemas
                if '@graph' in data:
                    for item in data['@graph']:
                        if isinstance(item, dict) and '@type' in item:
                            schema_types.append(item['@type'])
        except (json.JSONDecodeError, AttributeError):
            continue
    
    return list(set(schema_types))  # Remove duplicates

def extract_image_data(soup, current_url):
    """Extract image data from the page"""
    images = []
    seen_srcs = set()  # For deduplication
    
    print(f"🔍 Looking for images on: {current_url}")
    
    for img in soup.find_all('img', src=True):
        src = img.get('src', '').strip()
        if not src:
            continue
            
        # Skip if we've already seen this src on this page
        if src in seen_srcs:
            continue
        seen_srcs.add(src)
        
        # Resolve relative URLs to absolute
        try:
            absolute_src = urljoin(current_url, src)
        except:
            absolute_src = src
            
        # Extract alt text
        alt = img.get('alt', '').strip()
        
        # Extract format from src
        format_ext = ''
        if '.' in absolute_src:
            format_ext = absolute_src.split('.')[-1].lower()
            # Clean up format (remove query params, etc.)
            if '?' in format_ext:
                format_ext = format_ext.split('?')[0]
            if '#' in format_ext:
                format_ext = format_ext.split('#')[0]
        
        image_data = {
            'src': absolute_src,
            'alt': alt,
            'format': format_ext
        }
        
        images.append(image_data)
        print(f"🖼️  Found image: {absolute_src} (alt: '{alt}', format: {format_ext})")
    
    print(f"📊 Total images found: {len(images)}")
    return images

def count_headings(soup):
    """Count H1-H6 headings"""
    counts = {}
    for i in range(1, 7):
        tag = f'h{i}'
        counts[f'{tag}_count'] = len(soup.find_all(tag))
    return counts

def analyze_links(soup, base_url):
    """Analyze internal, external, and nofollow links"""
    internal_links = 0
    external_links = 0
    nofollow_links = 0
    
    for link in soup.find_all('a', href=True):
        href = link.get('href')
        rel = link.get('rel', [])
        
        # Skip empty or javascript links
        if not href or href.startswith('javascript:'):
            continue
            
        # Check if nofollow
        if 'nofollow' in rel:
            nofollow_links += 1
            
        # Determine if internal or external
        try:
            absolute_url = urljoin(base_url, href)
            parsed_base = urlparse(base_url)
            parsed_link = urlparse(absolute_url)
            
            if parsed_base.netloc == parsed_link.netloc:
                internal_links += 1
            else:
                external_links += 1
        except:
            # If we can't parse, assume external
            external_links += 1
    
    return {
        'internal_links': internal_links,
        'external_links': external_links,
        'nofollow_links': nofollow_links
    }

def process_links(soup, current_url, domain, crawl_id, visited, to_visit):
    """Process all links on the current page and track them in page_links"""
    internal_links_found = []
    all_links_processed = 0
    
    print(f"🔍 Analyzing links on: {current_url}")
    
    for link in soup.find_all('a', href=True):
        href = link.get('href')
        rel = link.get('rel', [])
        
        # Skip empty or problematic links
        if not href or href.startswith(('javascript:', 'mailto:', 'tel:', '#')):
            continue
            
        try:
            # Normalize the URL
            resolved_href = urljoin(current_url, href)
            
            # Parse URLs for comparison
            parsed_domain = urlparse(domain)
            parsed_link = urlparse(resolved_href)
            
            # Check if it's an internal link
            is_internal = parsed_domain.netloc == parsed_link.netloc
            
            if is_internal:
                # Add to internal links found
                internal_links_found.append(resolved_href)
                
                # Add to crawl queue if not already visited or queued
                if resolved_href not in visited and resolved_href not in to_visit:
                    to_visit.append(resolved_href)
                    print(f"📋 Added to queue: {resolved_href}")
            
            # Insert into page_links table for ALL links (internal and external)
            if supabase:
                is_nofollow = 'nofollow' in rel
                
                try:
                    # Use simple insert instead of upsert for now
                    supabase.table("page_links").insert({
                        "crawl_id": crawl_id,
                        "from_url": current_url,
                        "to_url": resolved_href,
                        "is_nofollow": is_nofollow,
                        "link_count": 1
                    }).execute()
                    
                    all_links_processed += 1
                    link_type = "internal" if is_internal else "external"
                    print(f"🔗 Link tracked ({link_type}): {current_url} → {resolved_href}")
                    
                except Exception as e:
                    # If insert fails, try to handle duplicate gracefully
                    if "duplicate key" in str(e).lower() or "unique" in str(e).lower():
                        print(f"⚠️  Link already exists: {current_url} → {resolved_href}")
                    else:
                        print(f"❌ Error inserting link {current_url} → {resolved_href}: {e}")
            else:
                all_links_processed += 1
                link_type = "internal" if is_internal else "external"
                print(f"🔗 Link found ({link_type}): {current_url} → {resolved_href}")
                    
        except Exception as e:
            print(f"❌ Error processing link {href}: {e}")
            continue
    
    print(f"📊 Found {len(internal_links_found)} internal links and {all_links_processed} total links on {current_url}")
    return internal_links_found

def crawl(domain, output_file, crawl_id):
    visited = set()
    to_visit = [domain]
    
    # Ensure domain has protocol
    if not domain.startswith(('http://', 'https://')):
        domain = 'https://' + domain
        to_visit = [domain]

    print(f"🚀 Starting recursive crawl for {domain}")
    print(f"📁 Output file: {output_file}")
    print(f"🆔 Crawl ID: {crawl_id}")
    print(f"📋 Initial queue: {len(to_visit)} pages")

    # Create crawl record if it doesn't exist
    if not create_crawl_record(crawl_id, domain):
        print(f"❌ Failed to create crawl record, but continuing...")

    with open(output_file, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow([
            'url', 'status_code', 'title', 'meta_description', 'canonical',
            'schema_types', 'text_length', 'h1_count', 'h2_count', 'h3_count',
            'h4_count', 'h5_count', 'h6_count', 'internal_links', 'external_links',
            'nofollow_links', 'target_keyword'
        ])

        page_count = 0
        while to_visit:
            url = to_visit.pop(0)
            if url in visited: 
                print(f"⏭️  Skipping already visited: {url}")
                continue
            visited.add(url)
            page_count += 1

            # Check if crawl has been stopped by user
            crawl_status = check_crawl_status(crawl_id)
            if crawl_status == "failed":
                print(f"🛑 Crawl stopped by user. Stopping at page {page_count}")
                break

            print(f"\n🕷️  Crawling page {page_count}: {url}")
            print(f"📊 Queue: {len(to_visit)} pages remaining, {len(visited)} pages processed")

            try:
                res = requests.get(url, timeout=10, headers={
                    'User-Agent': 'Mozilla/5.0 (compatible; SEO-Spider/1.0)'
                })
                
                if res.status_code != 200:
                    print(f"⚠️  {url}: Status {res.status_code}")
                    continue

                print(f"✅ Successfully fetched: {url}")

                soup = BeautifulSoup(res.text, 'html.parser')
                
                # Extract full visible text
                full_text = soup.get_text(separator=' ', strip=True)
                text_length = len(full_text)
                print(f"📝 Text content: {text_length} characters")

                # Extract metadata
                title = soup.title.string if soup.title else ""
                meta_desc = ""
                canonical = ""
                
                meta_desc_tag = soup.find('meta', attrs={'name': 'description'})
                if meta_desc_tag:
                    meta_desc = meta_desc_tag.get('content', '')
                
                canonical_tag = soup.find('link', attrs={'rel': 'canonical'})
                if canonical_tag:
                    canonical = canonical_tag.get('href', '')

                # Extract schema types
                schema_types = extract_schema_types(soup)
                if schema_types:
                    print(f"🏷️  Schema types found: {', '.join(schema_types)}")
                
                # Count headings
                heading_counts = count_headings(soup)
                total_headings = sum(heading_counts.values())
                print(f"📋 Headings: {total_headings} total (H1: {heading_counts['h1_count']}, H2: {heading_counts['h2_count']}, etc.)")
                
                # Analyze links
                link_analysis = analyze_links(soup, url)
                print(f"🔗 Links: {link_analysis['internal_links']} internal, {link_analysis['external_links']} external, {link_analysis['nofollow_links']} nofollow")

                # Process links and track them in page_links table
                internal_links_found = process_links(soup, url, domain, crawl_id, visited, to_visit)

                # Extract image data
                images = extract_image_data(soup, url)
                print(f"🖼️  Images found: {len(images)} images")

                # Prepare data for CSV
                csv_row = [
                    url, res.status_code, title, meta_desc, canonical,
                    ','.join(schema_types), text_length,
                    heading_counts['h1_count'], heading_counts['h2_count'],
                    heading_counts['h3_count'], heading_counts['h4_count'],
                    heading_counts['h5_count'], heading_counts['h6_count'],
                    link_analysis['internal_links'], link_analysis['external_links'],
                    link_analysis['nofollow_links'], ''  # target_keyword placeholder
                ]
                
                writer.writerow(csv_row)

                # Insert into Supabase pages table if available
                if supabase:
                    supabase_data = {
                        "crawl_id": crawl_id,
                        "url": url,
                        "status_code": res.status_code,
                        "title": title,
                        "meta_description": meta_desc,
                        "canonical": canonical,
                        "schema_types": schema_types,
                        "text_length": text_length,
                        "full_text": full_text,
                        "h1_count": heading_counts['h1_count'],
                        "h2_count": heading_counts['h2_count'],
                        "h3_count": heading_counts['h3_count'],
                        "h4_count": heading_counts['h4_count'],
                        "h5_count": heading_counts['h5_count'],
                        "h6_count": heading_counts['h6_count'],
                        "internal_links": link_analysis['internal_links'],
                        "external_links": link_analysis['external_links'],
                        "nofollow_links": link_analysis['nofollow_links'],
                        "target_keyword": None
                    }

                    result = supabase.table("pages").insert(supabase_data).execute()
                    
                    if hasattr(result, 'error') and result.error:
                        print(f"❌ Supabase error for {url}: {result.error}")
                    else:
                        print(f"💾 Saved to database: {url}")
                        
                        # Get the page_id from the inserted record
                        if result.data and len(result.data) > 0:
                            page_id = result.data[0]['id']
                            print(f"📄 Got page_id: {page_id}")
                            
                            # Insert image data if any images were found
                            if images:
                                print(f"🖼️  Attempting to insert {len(images)} images for page {url}")
                                image_data = []
                                for img in images:
                                    image_data.append({
                                        "page_id": page_id,
                                        "crawl_id": crawl_id,
                                        "src": img['src'],
                                        "alt": img['alt'],
                                        "format": img['format']
                                    })
                                
                                # Batch insert images
                                image_result = supabase.table("page_images").insert(image_data).execute()
                                
                                if hasattr(image_result, 'error') and image_result.error:
                                    print(f"❌ Image insert error for {url}: {image_result.error}")
                                else:
                                    print(f"🖼️  Saved {len(images)} images to database for {url}")
                            else:
                                print(f"📄 No images found for {url}")
                        else:
                            print(f"⚠️  Could not get page_id for image insertion: {url}")
                            print(f"⚠️  Result data: {result.data}")
                else:
                    print(f"💾 Saved to CSV: {url}")

            except Exception as e:
                print(f"❌ {url}: {e}")

    print(f"\n🎉 Crawl completed!")
    print(f"📊 Summary:")
    print(f"   • Total pages processed: {len(visited)}")
    print(f"   • CSV file saved: {output_file}")
    if supabase:
        print(f"   • Database records created")
        # Update crawl status to finished
        try:
            supabase.table("crawls").update({ "status": "finished" }).eq("id", crawl_id).execute()
            print(f"   • Crawl status updated to 'finished'")
        except Exception as e:
            print(f"   • Could not update crawl status: {e}")
    print(f"   • Crawl ID: {crawl_id}")

if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("Usage: python3 crawler.py <domain> <output_file> <crawl_id>")
        sys.exit(1)
        
    domain = sys.argv[1]
    output_file = sys.argv[2]
    crawl_id = sys.argv[3]
    
    # Generate a proper UUID if crawl_id isn't already a valid UUID
    try:
        uuid.UUID(crawl_id)
    except ValueError:
        crawl_id = str(uuid.uuid4())
        print(f"🆔 Generated new UUID for crawl: {crawl_id}")
    
    crawl(domain, output_file, crawl_id)
