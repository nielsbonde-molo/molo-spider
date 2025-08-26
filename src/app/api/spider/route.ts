import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// Create service role client for database operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { domain } = await req.json();
    const crawlId = uuidv4();

    console.log('🔍 Starting crawl for domain:', domain);
    console.log('🔍 Using Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log('🔍 Service role key exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Insert crawl record with 'pending' status
                    const { error: crawlError } = await supabaseAdmin
                  .from('crawls')
                  .insert({
                    id: crawlId,
                    domain: domain,
                    user_id: null,
                    status: 'pending'
                  })
                  .select()
                  .single();

    if (crawlError) {
      console.error('❌ Error inserting crawl record:', crawlError);
      console.error('❌ Error details:', JSON.stringify(crawlError, null, 2));
      return NextResponse.json({
        success: false,
        error: `Failed to create crawl record: ${crawlError.message}`
      }, { status: 500 });
    }

    console.log('✅ Crawl record created successfully:', crawlId);

    // Update status to 'running'
    await supabaseAdmin
      .from('crawls')
      .update({ status: 'running' })
      .eq('id', crawlId);

    const script = path.resolve('src/scripts/crawler.py');
    const output = path.resolve(`src/app/data/results/crawl_${crawlId}.csv`);

    // Start the Python crawler process
    const python = spawn('python3', [script, domain, output, crawlId]);

    let stderr = '';

    python.stdout.on('data', (data) => {
      const output = data.toString();
      // Log to console for debugging
      console.log('[PYTHON OUT]', output.trim());
    });

    python.stderr.on('data', (data) => {
      const error = data.toString();
      stderr += error;
      console.error('[PYTHON ERR]', error.trim());
    });

    // Set up event handlers for the Python process
    python.on('close', async (code) => {
      if (code === 0) {
        // Update status to 'finished'
        await supabaseAdmin
          .from('crawls')
          .update({ status: 'finished' })
          .eq('id', crawlId);
        console.log('✅ Crawl completed successfully:', crawlId);
      } else {
        // Update status to 'failed'
        await supabaseAdmin
          .from('crawls')
          .update({ 
            status: 'failed',
            error_message: `Crawler exited with code ${code}. Stderr: ${stderr}`
          })
          .eq('id', crawlId);
        console.error('❌ Crawler execution failed with code:', code);
      }
    });

    python.on('error', async (error) => {
      // Update status to 'failed'
      await supabaseAdmin
        .from('crawls')
        .update({ 
          status: 'failed',
          error_message: `Failed to start crawler: ${error.message}`
        })
        .eq('id', crawlId);
      console.error('❌ Failed to start crawler:', error);
    });

    // Return immediately with success, the crawler will run in background
    return NextResponse.json({
      success: true,
      crawlId,
      message: 'Crawl started successfully. Check dashboard for progress.',
    });

                } catch (error: unknown) {
                console.error('❌ Crawler error:', error);
                const errorMessage = error instanceof Error ? error.message : 'Internal server error';

                return NextResponse.json({
                  success: false,
                  error: errorMessage,
                }, { status: 500 });
              }
} 