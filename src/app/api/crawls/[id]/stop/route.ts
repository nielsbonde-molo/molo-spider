import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crawlId = params.id;
    
    // Create service role client for database operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log('🛑 Stopping crawl:', crawlId);

    const { error } = await supabase
      .from("crawls")
      .update({ 
        status: "failed",
        error_message: "Crawl stopped by user"
      })
      .eq("id", crawlId);

    if (error) {
      console.error('❌ Error stopping crawl:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('✅ Crawl stopped successfully:', crawlId);
    return NextResponse.json({ success: true });

    } catch (error: unknown) {
    console.error('❌ Stop crawl error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({
      error: errorMessage
    }, { status: 500 });
  }
} 