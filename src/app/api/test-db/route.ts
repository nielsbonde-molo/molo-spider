import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create service role client for database operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    console.log('🔍 Testing Supabase connection...');
    console.log('🔍 URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log('🔍 Service key exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Test basic connection
    const { data, error } = await supabaseAdmin
      .from('crawls')
      .select('count')
      .limit(1);

    if (error) {
      console.error('❌ Database connection failed:', error);
      return NextResponse.json({
        success: false,
        error: error.message,
        details: error
      }, { status: 500 });
    }

    console.log('✅ Database connection successful');
    
    return NextResponse.json({
      success: true,
      message: 'Database connection working',
      data: data
    });

  } catch (error: unknown) {
    console.error('❌ Test failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
} 