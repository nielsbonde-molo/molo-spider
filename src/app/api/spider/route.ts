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
    const { data: crawlData, error: crawlError } = await supabaseAdmin
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

    return new Promise((resolve) => {
      const python = spawn('python3', [script, domain, output, crawlId]);

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        // Log to console for debugging
        console.log('[PYTHON OUT]', output.trim());
      });

      python.stderr.on('data', (data) => {
        const error = data.toString();
        stderr += error;
        console.error('[PYTHON ERR]', error.trim());
      });

      python.on('close', async (code) => {
        if (code === 0) {
          // Update status to 'finished'
          await supabaseAdmin
            .from('crawls')
            .update({ status: 'finished' })
            .eq('id', crawlId);

          resolve(NextResponse.json({
            success: true,
            crawlId,
            output: stdout,
          }));
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
          
          resolve(NextResponse.json({
            success: false,
            error: 'Crawler execution failed',
            crawlId: crawlId
          }, { status: 500 }));
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
        
        resolve(NextResponse.json({
          success: false,
          error: `Failed to start crawler: ${error.message}`,
          crawlId: crawlId
        }, { status: 500 }));
      });
    });

  } catch (error: any) {
    console.error('❌ Crawler error:', error);

    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error',
    }, { status: 500 });
  }
} 