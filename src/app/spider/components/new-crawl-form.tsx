'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function NewCrawlForm() {
  const [domain, setDomain] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<string[]>([]);
  const [currentUrl, setCurrentUrl] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const router = useRouter();

  // Update current URL whenever progress changes
  useEffect(() => {
    const currentUrlFromProgress = parseCurrentUrl(progress);
    if (currentUrlFromProgress && currentUrlFromProgress !== currentUrl) {
      setCurrentUrl(currentUrlFromProgress);
    }
  }, [progress, currentUrl]);

  const handleStartCrawling = async () => {
    if (!domain) {
      setMessage('Please select a domain');
      return;
    }

    setIsLoading(true);
    setMessage('Starting crawl...');
    setProgress([]);
    setCurrentUrl('');
    
    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/spider', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ domain: domain }),
        signal: abortControllerRef.current.signal,
      });

      let result;

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server returned non-JSON: ${text.slice(0, 100)}...`);
      }

      try {
        result = await response.json();
      } catch {
        throw new Error("❌ Server did not return valid JSON.");
      }

      if (result.success) {
        setMessage(`✅ Crawl started successfully! Crawl ID: ${result.crawlId}`);
        
        // Show progress if available
        if (result.output) {
          const lines = result.output.split('\n').filter((line: string) => line.trim());
          setProgress(lines.slice(-15)); // Show last 15 lines
        }
        
        // Redirect to dashboard after successful crawl start
        setTimeout(() => {
          router.push('/spider');
        }, 2000);
      }
      
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        setMessage('❌ Crawl cancelled by user');
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setMessage(`❌ Error: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
      setCurrentUrl('');
      abortControllerRef.current = null;
    }
  };

  const handleCancelCrawl = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setMessage('❌ Crawl cancelled by user');
      setCurrentUrl('');
    }
  };

  // Parse progress to extract current URL
  const parseCurrentUrl = (lines: string[]) => {
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      
      // Look for various patterns that indicate current URL
      const patterns = [
        /🕷️\s+Crawling page \d+:\s+(https?:\/\/[^\s]+)/,
        /✅ Successfully fetched:\s+(https?:\/\/[^\s]+)/,
        /🔍 Analyzing links on:\s+(https?:\/\/[^\s]+)/,
        /💾 Saved to database:\s+(https?:\/\/[^\s]+)/,
        /💾 Saved to CSV:\s+(https?:\/\/[^\s]+)/
      ];
      
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          return match[1];
        }
      }
    }
    return '';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">New Crawl</h1>
              <p className="text-gray-600 mt-2">Start analyzing a website&apos;s SEO structure</p>
            </div>
            <Link
              href="/spider"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
        
        {/* Main Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="space-y-6">
            <div>
              <label htmlFor="domain" className="block text-sm font-semibold text-gray-700 mb-3">
                Select Domain to Crawl
              </label>
              <select
                id="domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                disabled={isLoading}
              >
                <option value="">Select a domain...</option>
                <option value="https://molo.com">https://molo.com</option>
                <option value="https://molo.de">https://molo.de</option>
                <option value="https://molo-kids.nl">https://molo-kids.nl</option>
                <option value="https://molo.dk">https://molo.dk</option>
                <option value="https://molo.us">https://molo.us</option>
                <option value="https://molo.se">https://molo.se</option>
              </select>
            </div>

            <div className="flex space-x-4">
              <button
                onClick={handleStartCrawling}
                disabled={isLoading || !domain}
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                {isLoading ? 'Crawling in Progress...' : 'Start Crawling'}
              </button>
              
              {isLoading && (
                <button
                  onClick={handleCancelCrawl}
                  className="bg-gradient-to-r from-red-600 to-red-700 text-white py-3 px-6 rounded-lg hover:from-red-700 hover:to-red-800 transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  Cancel
                </button>
              )}
            </div>

            {message && (
              <div className={`p-4 rounded-lg border ${
                message.startsWith('✅') 
                  ? 'bg-green-50 text-green-800 border-green-200' 
                  : message.startsWith('❌') 
                    ? 'bg-red-50 text-red-800 border-red-200'
                    : 'bg-blue-50 text-blue-800 border-blue-200'
              }`}>
                {message}
              </div>
            )}

            {isLoading && (
              <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                  <span className="text-sm font-semibold text-gray-700">Crawling in progress...</span>
                </div>
                {currentUrl && (
                  <div className="text-sm text-blue-600 mb-3">
                    <strong>Currently scanning:</strong> {currentUrl}
                  </div>
                )}
                <div className="text-sm text-gray-600">
                  The crawler is discovering and analyzing pages. This may take a few minutes.
                </div>
              </div>
            )}

            {progress.length > 0 && (
              <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Crawler Progress:</h3>
                <div className="text-xs font-mono text-gray-600 space-y-1 max-h-60 overflow-y-auto bg-white p-3 rounded border">
                  {progress.map((line, index) => (
                    <div key={index} className="whitespace-pre-wrap">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 