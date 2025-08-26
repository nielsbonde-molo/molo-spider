'use client';

import { useState, useRef, useEffect } from 'react';

export default function SpiderUI() {
  const [domain, setDomain] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<string[]>([]);
  const [currentUrl, setCurrentUrl] = useState('');
  const [crawlId, setCrawlId] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

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
      } catch (err) {
        throw new Error("❌ Server did not return valid JSON.");
      }

      if (!result.success) {
        throw new Error(result.error || 'Unknown failure');
      }

      setMessage(`✅ Crawl completed successfully! Crawl ID: ${result.crawlId}`);
      
      // Show progress if available
      if (result.output) {
        const lines = result.output.split('\n').filter((line: string) => line.trim());
        setProgress(lines.slice(-15)); // Show last 15 lines
      }
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setMessage('❌ Crawl cancelled by user');
      } else {
        setMessage(`❌ Error: ${error.message || 'Unknown error'}`);
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
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">SEO Spider Tool</h1>
      
      <div className="space-y-4">
        <div>
          <label htmlFor="domain" className="block text-sm font-medium text-gray-700 mb-2">
            Select Domain to Crawl
          </label>
          <select
            id="domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={isLoading}
          >
            <option value="">Select a domain...</option>
            <option value="https://molo.com">https://molo.com</option>
            <option value="https://molo.de">https://molo.de</option>
            <option value="https://molo-kids.nl">https://molo-kids.nl</option>
            <option value="https://molo.us">https://molo.us</option>
            <option value="https://molo.se">https://molo.se</option>
          </select>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={handleStartCrawling}
            disabled={isLoading || !domain}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Crawling in Progress...' : 'Start Crawling'}
          </button>
          
          {isLoading && (
            <button
              onClick={handleCancelCrawl}
              className="bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

        {message && (
          <div className={`p-3 rounded-md ${
            message.startsWith('✅') 
              ? 'bg-green-100 text-green-800 border border-green-200' 
              : message.startsWith('❌') 
                ? 'bg-red-100 text-red-800 border border-red-200'
                : 'bg-blue-100 text-blue-800 border border-blue-200'
          }`}>
            {message}
          </div>
        )}

        {isLoading && (
          <div className="bg-gray-50 p-4 rounded-md">
            <div className="flex items-center space-x-2 mb-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-sm font-medium text-gray-700">Crawling in progress...</span>
            </div>
            {currentUrl && (
              <div className="text-sm text-blue-600 mb-2">
                <strong>Currently scanning:</strong> {currentUrl}
              </div>
            )}
            <div className="text-xs text-gray-600">
              The crawler is discovering and analyzing pages. This may take a few minutes.
            </div>
          </div>
        )}

        {progress.length > 0 && (
          <div className="bg-gray-50 p-4 rounded-md">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Crawler Progress:</h3>
            <div className="text-xs font-mono text-gray-600 space-y-1 max-h-60 overflow-y-auto">
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
  );
}