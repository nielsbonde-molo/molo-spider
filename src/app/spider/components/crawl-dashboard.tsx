'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import supabase from '@/lib/supabase';

interface Crawl {
  id: string;
  domain: string;
  created_at: string;
  user_id: string | null;
  status: 'pending' | 'running' | 'finished' | 'failed';
  error_message?: string;
}

interface CrawlWithMetrics extends Crawl {
  pageCount: number;
  seoScore: number;
  issues: string[];
  warnings: string[];
}

export default function CrawlDashboard() {
  const [crawls, setCrawls] = useState<CrawlWithMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCrawlsWithMetrics(true); // Initial load with loading state
    
    // Auto-refresh every 5 seconds to check for status updates
    const interval = setInterval(() => {
      fetchCrawlsWithMetrics(false); // Auto-refresh without loading state
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleStopCrawl = async (crawlId: string) => {
    try {
      const res = await fetch(`/api/crawls/${crawlId}/stop`, { 
        method: "POST" 
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to stop crawl");
      }
      
      // Refresh the data immediately without loading state
      fetchCrawlsWithMetrics(false);
      
    } catch (err: any) {
      console.error('❌ Error stopping crawl:', err);
      alert(`Could not stop crawl: ${err.message}`);
    }
  };

  const fetchCrawlsWithMetrics = async (showLoading: boolean = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const { data, error } = await supabase
        .from('crawls')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        setError('Failed to load crawls');
        console.error('Error fetching crawls:', error);
        return;
      }

      // Fetch metrics for each crawl
      const crawlsWithMetrics = await Promise.all(
        (data || []).map(async (crawl) => {
          const metrics = await getCrawlMetrics(crawl.id);
          return {
            ...crawl,
            ...metrics
          };
        })
      );

      setCrawls(crawlsWithMetrics);
    } catch (err) {
      setError('Failed to load crawls');
      console.error('Error:', err);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const getCrawlMetrics = async (crawlId: string) => {
    try {
      // Get page count
      const { count: pageCount } = await supabase
        .from('pages')
        .select('*', { count: 'exact', head: true })
        .eq('crawl_id', crawlId);

      // Get pages for analysis
      const { data: pages } = await supabase
        .from('pages')
        .select('*')
        .eq('crawl_id', crawlId);

      // Calculate SEO score and issues
      const { seoScore, issues, warnings } = calculateSEOMetrics(pages || []);

      return {
        pageCount: pageCount || 0,
        seoScore,
        issues,
        warnings
      };
    } catch (err) {
      console.error('Error getting metrics:', err);
      return {
        pageCount: 0,
        seoScore: 0,
        issues: [],
        warnings: []
      };
    }
  };

  const calculateSEOMetrics = (pages: any[]) => {
    let seoScore = 100;
    const issues: string[] = [];
    const warnings: string[] = [];

    if (pages.length === 0) {
      return { seoScore: 0, issues: ['No pages found'], warnings: [] };
    }

    // Check for missing titles
    const pagesWithoutTitle = pages.filter(p => !p.title || p.title.trim() === '');
    if (pagesWithoutTitle.length > 0) {
      seoScore -= 10;
      issues.push(`${pagesWithoutTitle.length} pages missing titles`);
    }

    // Check for missing meta descriptions
    const pagesWithoutMetaDesc = pages.filter(p => !p.meta_description || p.meta_description.trim() === '');
    if (pagesWithoutMetaDesc.length > 0) {
      seoScore -= 8;
      issues.push(`${pagesWithoutMetaDesc.length} pages missing meta descriptions`);
    }

    // Check for pages without H1
    const pagesWithoutH1 = pages.filter(p => p.h1_count === 0);
    if (pagesWithoutH1.length > 0) {
      seoScore -= 5;
      warnings.push(`${pagesWithoutH1.length} pages without H1 headings`);
    }

    // Check for pages with multiple H1s
    const pagesWithMultipleH1 = pages.filter(p => p.h1_count > 1);
    if (pagesWithMultipleH1.length > 0) {
      seoScore -= 3;
      warnings.push(`${pagesWithMultipleH1.length} pages with multiple H1 headings`);
    }

    // Check for pages with low text content
    const pagesWithLowContent = pages.filter(p => p.text_length < 300);
    if (pagesWithLowContent.length > 0) {
      seoScore -= 5;
      warnings.push(`${pagesWithLowContent.length} pages with low text content (<300 chars)`);
    }

    // Check for 4xx/5xx status codes
    const errorPages = pages.filter(p => p.status_code >= 400);
    if (errorPages.length > 0) {
      seoScore -= 15;
      issues.push(`${errorPages.length} pages with error status codes`);
    }

    return { seoScore: Math.max(0, seoScore), issues, warnings };
  };

  const getSEOScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-100 text-gray-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'finished':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string, error_message?: string) => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'running':
        return 'Running';
      case 'finished':
        return 'Finished';
      case 'failed':
        return error_message === 'Crawl stopped by user' ? 'Stopped' : 'Failed';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Search Intelligence Dashboard</h1>
              <p className="text-gray-600 mt-2">Analyze website structure and SEO performance</p>
            </div>
            <Link
              href="/spider/new"
              className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              + New Crawl
            </Link>
          </div>
        </div>

        {/* Quick Stats Banner */}
        {crawls.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8"
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <motion.div 
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1 }}
                className="text-center p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200"
              >
                <div className="text-3xl mb-3">📊</div>
                <div className="text-3xl font-bold text-blue-600">{crawls.length}</div>
                <div className="text-sm text-blue-700 font-medium">Total Crawls</div>
              </motion.div>
              <motion.div 
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2 }}
                className="text-center p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-xl border border-green-200"
              >
                <div className="text-3xl mb-3">📄</div>
                <div className="text-3xl font-bold text-green-600">
                  {crawls.reduce((sum, crawl) => sum + crawl.pageCount, 0)}
                </div>
                <div className="text-sm text-green-700 font-medium">Pages Analyzed</div>
              </motion.div>
              <motion.div 
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3 }}
                className="text-center p-6 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl border border-emerald-200"
              >
                <div className="text-3xl mb-3">✅</div>
                <div className="text-3xl font-bold text-emerald-600">
                  {crawls.filter(c => c.seoScore >= 80).length}
                </div>
                <div className="text-sm text-emerald-700 font-medium">Good SEO Scores</div>
              </motion.div>
              <motion.div 
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.4 }}
                className="text-center p-6 bg-gradient-to-br from-red-50 to-red-100 rounded-xl border border-red-200"
              >
                <div className="text-3xl mb-3">🚨</div>
                <div className="text-3xl font-bold text-red-600">
                  {crawls.reduce((sum, crawl) => sum + crawl.issues.length, 0)}
                </div>
                <div className="text-sm text-red-700 font-medium">Critical Issues</div>
              </motion.div>
            </div>
          </motion.div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {crawls.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">No crawls yet</h3>
            <p className="text-gray-600 mb-6">Start your first crawl to analyze a website's SEO structure.</p>
            <Link
              href="/spider/new"
              className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              Create Your First Crawl
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-lg font-semibold text-gray-900">Recent Crawls</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Domain
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Pages
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      SEO Score
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Issues
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {crawls.map((crawl) => (
                    <motion.tr 
                      key={crawl.id} 
                      className="hover:bg-gray-50 transition-colors"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + (crawls.indexOf(crawl) * 0.05) }}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mr-4">
                            <span className="text-white text-sm font-bold">
                              {crawl.domain.split('//')[1]?.split('.')[0]?.charAt(0).toUpperCase() || 'W'}
                            </span>
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              {crawl.domain}
                            </div>
                            <div className="text-xs text-gray-500">
                              ID: {crawl.id.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(crawl.status)}`}>
                            {crawl.status === 'running' && <span className="mr-1">🔄</span>}
                            {crawl.status === 'finished' && <span className="mr-1">✅</span>}
                            {crawl.status === 'failed' && <span className="mr-1">❌</span>}
                            {crawl.status === 'pending' && <span className="mr-1">⏳</span>}
                            {getStatusText(crawl.status, crawl.error_message)}
                          </span>
                          {crawl.status === 'running' && (
                            <div className="ml-3 flex items-center space-x-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                              <button
                                onClick={() => handleStopCrawl(crawl.id)}
                                className="text-red-500 hover:text-red-700 hover:underline text-xs font-medium"
                              >
                                Stop
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {crawl.status === 'finished' ? (
                          <div className="flex items-center">
                            <span className="text-green-600 mr-2">📄</span>
                            {crawl.pageCount} pages
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {crawl.status === 'finished' ? (
                          <div className="flex items-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSEOScoreColor(crawl.seoScore)}`}>
                              {crawl.seoScore}/100
                            </span>
                            <span className="ml-2 text-xs text-gray-500">
                              {crawl.seoScore >= 80 ? 'Excellent' : crawl.seoScore >= 60 ? 'Good' : crawl.seoScore >= 40 ? 'Needs Work' : 'Poor'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {crawl.status === 'finished' ? (
                          <div className="space-y-1">
                            {crawl.issues.length > 0 && (
                              <div className="flex items-center">
                                <span className="text-red-500 mr-1">🚨</span>
                                <span className="text-xs text-red-600 font-medium">
                                  {crawl.issues.length} critical
                                </span>
                              </div>
                            )}
                            {crawl.warnings.length > 0 && (
                              <div className="flex items-center">
                                <span className="text-yellow-500 mr-1">⚠️</span>
                                <span className="text-xs text-yellow-600 font-medium">
                                  {crawl.warnings.length} warnings
                                </span>
                              </div>
                            )}
                            {crawl.issues.length === 0 && crawl.warnings.length === 0 && (
                              <div className="flex items-center">
                                <span className="text-green-500 mr-1">✅</span>
                                <span className="text-xs text-green-600 font-medium">
                                  No issues found
                                </span>
                              </div>
                            )}
                          </div>
                        ) : crawl.status === 'failed' ? (
                          <div className="flex items-center">
                            <span className="text-red-500 mr-1">❌</span>
                            <span className="text-xs text-red-600 font-medium">Failed</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(crawl.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          <Link
                            href={`/spider/${crawl.id}`}
                            className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors"
                          >
                            <span className="mr-1">👁️</span>
                            View Details
                          </Link>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 