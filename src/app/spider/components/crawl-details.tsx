'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import supabase from '@/lib/supabase';
import React from 'react';

interface Crawl {
  id: string;
  domain: string;
  created_at: string;
  user_id: string | null;
  status: 'pending' | 'running' | 'finished' | 'failed';
  error_message?: string;
}

interface Page {
  id: string;
  url: string;
  status_code: number;
  title: string;
  meta_description: string;
  text_length: number;
  h1_count: number;
  h2_count: number;
  h3_count: number;
  internal_links: number;
  external_links: number;
  nofollow_links: number;
  schema_types: string[];
  full_text?: string;
}

interface PageLink {
  id: string;
  from_url: string;
  to_url: string;
  link_count: number;
  is_nofollow: boolean;
}

interface PageImage {
  id: string;
  page_id: string;
  crawl_id: string;
  src: string;
  alt: string;
  format: string;
  has_alt: boolean;
  created_at: string;
}

interface LinkAnalysis {
  incomingLinks: PageLink[];
  outgoingLinks: PageLink[];
  internalLinks: PageLink[];
  externalLinks: PageLink[];
  nofollowLinks: PageLink[];
}

interface SEOAnalysis {
  seoScore: number;
  criticalIssues: string[];
  warnings: string[];
  recommendations: string[];
  pageIssues: { [key: string]: string[] };
}

interface CrawlDetailsProps {
  crawlId: string;
}

export default function CrawlDetails({ crawlId }: CrawlDetailsProps) {
  const [crawl, setCrawl] = useState<Crawl | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [links, setLinks] = useState<PageLink[]>([]);
  const [images, setImages] = useState<PageImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'pages' | 'links' | 'seo'>('overview');
  const [seoAnalysis, setSeoAnalysis] = useState<SEOAnalysis | null>(null);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [linkAnalysis, setLinkAnalysis] = useState<{ [key: string]: LinkAnalysis }>({});
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [pageFilter, setPageFilter] = useState<'all' | 'critical' | 'warning' | 'ok'>('all');
  const [linkDetailsModal, setLinkDetailsModal] = useState<{
    isOpen: boolean;
    pageUrl: string;
    linkType: 'internal' | 'external';
    links: PageLink[];
  } | null>(null);
  const [pageDetailsModal, setPageDetailsModal] = useState<{
    isOpen: boolean;
    page: Page;
    links: PageLink[];
  } | null>(null);

  useEffect(() => {
    fetchCrawlData();
  }, [crawlId]);

  const fetchCrawlData = async () => {
    try {
      setLoading(true);
      
      // Fetch crawl info
      const { data: crawlData, error: crawlError } = await supabase
        .from('crawls')
        .select('*')
        .eq('id', crawlId)
        .single();

      if (crawlError) {
        setError('Failed to load crawl data');
        return;
      }

      setCrawl(crawlData);

      // Fetch pages
      const { data: pagesData, error: pagesError } = await supabase
        .from('pages')
        .select('*')
        .eq('crawl_id', crawlId)
        .order('created_at', { ascending: false });

      if (pagesError) {
        console.error('Error fetching pages:', pagesError);
      } else {
        setPages(pagesData || []);
      }

      // Fetch links
      const { data: linksData, error: linksError } = await supabase
        .from('page_links')
        .select('*')
        .eq('crawl_id', crawlId)
        .order('created_at', { ascending: false });

      if (linksError) {
        console.error('Error fetching links:', linksError);
      } else {
        setLinks(linksData || []);
      }

      // Fetch images
      const { data: imagesData, error: imagesError } = await supabase
        .from('page_images')
        .select('*')
        .eq('crawl_id', crawlId)
        .order('created_at', { ascending: false });

      if (imagesError) {
        console.error('Error fetching images:', imagesError);
      } else {
        setImages(imagesData || []);
      }

    } catch (err) {
      setError('Failed to load crawl data');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (pages.length > 0) {
      const analysis = performSEOAnalysis(pages, links, images);
      setSeoAnalysis(analysis);
      
      // Pre-calculate link analysis for all pages
      const linkAnalysisData: { [key: string]: LinkAnalysis } = {};
      pages.forEach(page => {
        const pageLinks = analyzePageLinks(page.url, links);
        linkAnalysisData[page.url] = pageLinks;
      });
      setLinkAnalysis(linkAnalysisData);
    }
  }, [pages, links, images]);

  const analyzePageLinks = (pageUrl: string, allLinks: PageLink[]): LinkAnalysis => {
    const incomingLinks = allLinks.filter(link => link.to_url === pageUrl);
    const outgoingLinks = allLinks.filter(link => link.from_url === pageUrl);
    const internalLinks = outgoingLinks.filter(link => link.to_url.includes(new URL(crawl?.domain || '').hostname));
    const externalLinks = outgoingLinks.filter(link => !link.to_url.includes(new URL(crawl?.domain || '').hostname));
    const nofollowLinks = outgoingLinks.filter(link => link.is_nofollow);

    return {
      incomingLinks,
      outgoingLinks,
      internalLinks,
      externalLinks,
      nofollowLinks
    };
  };

  const performSEOAnalysis = (pages: Page[], links: PageLink[], images: PageImage[]): SEOAnalysis => {
    let seoScore = 100;
    const criticalIssues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    const pageIssues: { [key: string]: string[] } = {};

    if (pages.length === 0) {
      return {
        seoScore: 0,
        criticalIssues: ['No pages found in crawl'],
        warnings: [],
        recommendations: ['Run the crawl again to collect data'],
        pageIssues: {}
      };
    }

    // Calculate weighted penalties based on page count
    const totalPages = pages.length;
    const basePenalty = 100 / totalPages; // Distribute penalties across pages
    
    // Track total penalties for weighted calculation
    let totalPenalties = 0;
    let criticalPenalties = 0;
    let warningPenalties = 0;

    // Analyze each page
    pages.forEach(page => {
      const issues: string[] = [];
      const pageImages = images.filter(img => img.page_id === page.id);
      let pagePenalties = 0;
      
      // Check for missing title
      if (!page.title || page.title.trim() === '') {
        issues.push('Missing title tag');
        pagePenalties += 10;
        criticalPenalties += 10;
      } else if (page.title.length < 30) {
        issues.push('Title too short (should be 30-60 characters)');
        pagePenalties += 5;
        warningPenalties += 5;
      } else if (page.title.length > 60) {
        issues.push('Title too long (should be 30-60 characters)');
        pagePenalties += 3;
        warningPenalties += 3;
      }

      // Check for missing meta description
      if (!page.meta_description || page.meta_description.trim() === '') {
        issues.push('Missing meta description');
        pagePenalties += 8;
        criticalPenalties += 8;
      } else if (page.meta_description.length < 120) {
        issues.push('Meta description too short (should be 120-160 characters)');
        pagePenalties += 3;
        warningPenalties += 3;
      } else if (page.meta_description.length > 160) {
        issues.push('Meta description too long (should be 120-160 characters)');
        pagePenalties += 2;
        warningPenalties += 2;
      }

      // Check for missing H1
      if (page.h1_count === 0) {
        issues.push('Missing H1 heading');
        pagePenalties += 5;
        warningPenalties += 5;
      } else if (page.h1_count > 1) {
        issues.push('Multiple H1 headings found');
        pagePenalties += 3;
        warningPenalties += 3;
      }

      // Check for low content
      if (page.text_length < 300) {
        issues.push('Low content (less than 300 characters)');
        pagePenalties += 5;
        warningPenalties += 5;
      } else if (page.text_length < 1000) {
        issues.push('Content could be more comprehensive');
        pagePenalties += 2;
        warningPenalties += 2;
      }

      // Check for error status codes
      if (page.status_code >= 400) {
        issues.push(`Error status code: ${page.status_code}`);
        pagePenalties += 15;
        criticalPenalties += 15;
      }

      // Check for heading structure
      if (page.h1_count > 0 && page.h2_count === 0 && page.h3_count === 0) {
        issues.push('Poor heading hierarchy (H1 without H2/H3)');
        pagePenalties += 2;
        warningPenalties += 2;
      }

      // Check for internal linking
      if (page.internal_links === 0) {
        issues.push('No internal links');
        pagePenalties += 3;
        warningPenalties += 3;
      }

      // Check for images without alt text
      const imagesWithoutAlt = pageImages.filter(img => !img.has_alt);
      if (imagesWithoutAlt.length > 0) {
        issues.push(`${imagesWithoutAlt.length} image(s) missing alt text`);
        pagePenalties += 2;
        warningPenalties += 2;
      }

      totalPenalties += pagePenalties;

      if (issues.length > 0) {
        pageIssues[page.url] = issues;
        if (issues.some(i => i.includes('Error status code') || i.includes('Missing title tag') || i.includes('Missing meta description'))) {
          criticalIssues.push(`${page.url}: ${issues.filter(i => i.includes('Error status code') || i.includes('Missing title tag') || i.includes('Missing meta description')).join(', ')}`);
        } else {
          warnings.push(`${page.url}: ${issues.join(', ')}`);
        }
      }
    });

    // Calculate weighted score based on page count and issue distribution
    const averagePenaltyPerPage = totalPenalties / totalPages;
    const criticalIssueRate = criticalPenalties / totalPages;
    const warningRate = warningPenalties / totalPages;
    
    // Weight the score based on page count - more pages = less severe penalty per issue
    const pageWeight = Math.min(1, 10 / totalPages); // Cap at 10 pages for weighting
    const weightedPenalty = averagePenaltyPerPage * pageWeight;
    
    // Calculate final score
    seoScore = Math.max(0, 100 - weightedPenalty);
    
    // Overall recommendations
    if (pages.filter(p => p.h1_count === 0).length > 0) {
      recommendations.push('Add H1 headings to pages that are missing them');
    }
    if (pages.filter(p => !p.title || p.title.trim() === '').length > 0) {
      recommendations.push('Add title tags to all pages');
    }
    if (pages.filter(p => !p.meta_description || p.meta_description.trim() === '').length > 0) {
      recommendations.push('Add meta descriptions to all pages');
    }
    if (images.filter(img => !img.has_alt).length > 0) {
      recommendations.push('Add alt text to images for better accessibility and SEO');
    }
    if (images.length === 0) {
      recommendations.push('Consider adding relevant images to improve user engagement');
    }

    // Link analysis
    const internalLinks = links.filter(l => l.to_url.includes(new URL(crawl?.domain || '').hostname));
    const externalLinks = links.filter(l => !l.to_url.includes(new URL(crawl?.domain || '').hostname));
    const nofollowLinks = links.filter(l => l.is_nofollow);

    if (internalLinks.length < pages.length) {
      recommendations.push('Improve internal linking structure');
    }

    // Check for broken links (if we have status codes)
    const brokenLinks = links.filter(l => {
      // This would need to be enhanced with actual link checking
      return false; // Placeholder
    });

    if (brokenLinks.length > 0) {
      criticalIssues.push(`${brokenLinks.length} broken links detected`);
      seoScore = Math.max(0, seoScore - (10 * pageWeight));
    }

    // Check for duplicate content issues
    const titles = pages.map(p => p.title).filter(t => t);
    const uniqueTitles = new Set(titles);
    if (titles.length > uniqueTitles.size) {
      warnings.push('Duplicate titles detected');
      seoScore = Math.max(0, seoScore - (5 * pageWeight));
    }

    const metaDescriptions = pages.map(p => p.meta_description).filter(m => m);
    const uniqueMetaDescriptions = new Set(metaDescriptions);
    if (metaDescriptions.length > uniqueMetaDescriptions.size) {
      warnings.push('Duplicate meta descriptions detected');
      seoScore = Math.max(0, seoScore - (3 * pageWeight));
    }

    return {
      seoScore: Math.round(seoScore), // Round to whole number
      criticalIssues,
      warnings,
      recommendations,
      pageIssues
    };
  };

  const getSEOScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800';
    if (score >= 40) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const getStatusCodeBreakdown = (pages: Page[]) => {
    const breakdown: { [key: number]: number } = {};
    pages.forEach(page => {
      const status = page.status_code;
      breakdown[status] = (breakdown[status] || 0) + 1;
    });
    return breakdown;
  };

  const handleLinkDetailsClick = (pageUrl: string, linkType: 'internal' | 'external') => {
    const pageLinks = links.filter(link => link.from_url === pageUrl);
    const filteredLinks = linkType === 'internal' 
      ? pageLinks.filter(link => link.to_url.includes(new URL(crawl?.domain || '').hostname))
      : pageLinks.filter(link => !link.to_url.includes(new URL(crawl?.domain || '').hostname));
    
    setLinkDetailsModal({
      isOpen: true,
      pageUrl,
      linkType,
      links: filteredLinks
    });
  };

  const handlePageDetailsClick = (page: Page) => {
    const pageLinks = links.filter(link => link.from_url === page.url);
    setPageDetailsModal({
      isOpen: true,
      page,
      links: pageLinks
    });
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

  if (error || !crawl) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error || 'Crawl not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-black via-gray-900 to-gray-800 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-8">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Search Intelligence Analysis</h1>
              <p className="text-gray-300 text-lg">
                {crawl?.domain} • {crawl && formatDate(crawl.created_at)}
              </p>
            </div>
            <Link 
              href="/spider"
              className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg text-sm font-medium transition-all duration-200 hover:shadow-xl transform hover:-translate-y-0.5"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </div>

{/* SEO Health Banner */}
{seoAnalysis && (
  <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 text-white shadow-2xl">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        {/* Score Display */}
        <div className="flex items-center justify-center mb-8">
          <div className="relative">
            <div className="w-32 h-32 rounded-full bg-white bg-opacity-20 flex items-center justify-center backdrop-blur-sm">
              <div className="text-center">
                <div className="text-4xl font-bold text-white">{seoAnalysis.seoScore}</div>
                <div className="text-sm text-blue-100">/100</div>
              </div>
            </div>
            <div className="absolute inset-0 rounded-full border-4 border-white border-opacity-30"></div>
          </div>
          <div className="ml-8 text-left">
            <h2 className="text-3xl font-bold text-white mb-2">SEO Performance Score</h2>
            <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
              seoAnalysis.seoScore >= 80 ? 'bg-green-500 text-white' :
              seoAnalysis.seoScore >= 60 ? 'bg-yellow-500 text-white' :
              seoAnalysis.seoScore >= 40 ? 'bg-orange-500 text-white' : 'bg-red-500 text-white'
            }`}>
              {seoAnalysis.seoScore >= 80 ? 'Excellent' :
               seoAnalysis.seoScore >= 60 ? 'Good' :
               seoAnalysis.seoScore >= 40 ? 'Fair' : 'Poor'}
            </div>
            <p className="text-blue-100 mt-2">
              {seoAnalysis.seoScore >= 80 ? 'Excellent SEO performance' :
               seoAnalysis.seoScore >= 60 ? 'Good SEO with room for improvement' :
               seoAnalysis.seoScore >= 40 ? 'Fair SEO - needs attention' : 'Poor SEO - critical issues found'}
            </p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto">
          <div className="bg-white bg-opacity-10 rounded-lg p-4 backdrop-blur-sm">
            <div className="text-2xl font-bold text-white">{pages.length}</div>
            <div className="text-blue-100 text-sm">Pages Analyzed</div>
          </div>
          <div className="bg-white bg-opacity-10 rounded-lg p-4 backdrop-blur-sm">
            <div className="text-2xl font-bold text-white">{seoAnalysis.criticalIssues.length}</div>
            <div className="text-blue-100 text-sm">Critical Issues</div>
          </div>
          <div className="bg-white bg-opacity-10 rounded-lg p-4 backdrop-blur-sm">
            <div className="text-2xl font-bold text-white">{seoAnalysis.warnings.length}</div>
            <div className="text-blue-100 text-sm">Warnings</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="max-w-lg mx-auto mt-8">
          <div className="flex justify-between text-sm text-blue-100 mb-3">
            <span>0</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>
          <div className="w-full bg-white bg-opacity-20 rounded-full h-3 overflow-hidden backdrop-blur-sm">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${seoAnalysis.seoScore}%` }}
              transition={{ delay: 0.6, duration: 1.2 }}
              className={`h-3 rounded-full transition-all duration-300 ${
                seoAnalysis.seoScore >= 80 ? 'bg-green-400' :
                seoAnalysis.seoScore >= 60 ? 'bg-yellow-400' :
                seoAnalysis.seoScore >= 40 ? 'bg-orange-400' : 'bg-red-400'
              }`}
            />
          </div>
        </div>
      </motion.div>
    </div>
  </div>
)}



      {/* Quick Stats */}
      {seoAnalysis && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="bg-white shadow-lg"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200"
                onClick={() => setActiveTab('seo')}
              >
                <div className="text-center">
                  <div className="text-2xl mb-3 text-red-600">●</div>
                  <div className="text-3xl font-bold text-gray-900">{seoAnalysis.criticalIssues.length}</div>
                  <div className="text-sm font-medium text-gray-700">Critical Issues</div>
                  {seoAnalysis.criticalIssues.length > 0 && (
                    <div className="text-xs text-red-600 mt-2">Click to view details</div>
                  )}
                </div>
              </motion.div>
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200"
                onClick={() => setActiveTab('seo')}
              >
                <div className="text-center">
                  <div className="text-2xl mb-3 text-yellow-600">●</div>
                  <div className="text-3xl font-bold text-gray-900">{seoAnalysis.warnings.length}</div>
                  <div className="text-sm font-medium text-gray-700">Warnings</div>
                  {seoAnalysis.warnings.length > 0 && (
                    <div className="text-xs text-yellow-600 mt-2">Click to view details</div>
                  )}
                </div>
              </motion.div>
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-all duration-200"
              >
                <div className="text-center">
                  <div className="text-2xl mb-3 text-blue-600">●</div>
                  <div className="text-3xl font-bold text-gray-900">{Object.keys(seoAnalysis.pageIssues).length}</div>
                  <div className="text-sm font-medium text-gray-700">Pages with Issues</div>
                </div>
              </motion.div>
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-all duration-200"
              >
                <div className="text-center">
                  <div className="text-2xl mb-3 text-green-600">●</div>
                  <div className="text-3xl font-bold text-gray-900">{seoAnalysis.recommendations.length}</div>
                  <div className="text-sm font-medium text-gray-700">Recommendations</div>
                </div>
              </motion.div>
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200"
                onClick={() => setActiveTab('pages')}
              >
                <div className="text-center">
                  <div className="text-2xl mb-3 text-gray-600">●</div>
                  <div className="text-3xl font-bold text-gray-900">{images.length}</div>
                  <div className="text-sm font-medium text-gray-700">Total Images</div>
                  <div className="text-xs text-gray-500 mt-2">
                    {images.filter(img => img.has_alt).length} with alt text
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Navigation Tabs */}
      <div className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-8 px-4 font-semibold text-sm transition-all duration-300 rounded-t-lg ${
                activeTab === 'overview'
                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span className="flex items-center">
                📊 Overview
              </span>
            </button>
            <button
              onClick={() => setActiveTab('seo')}
              className={`py-8 px-4 font-semibold text-sm transition-all duration-300 rounded-t-lg ${
                activeTab === 'seo'
                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span className="flex items-center">
                🔍 SEO Analysis
                {seoAnalysis && (seoAnalysis.criticalIssues.length + seoAnalysis.warnings.length) > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500 text-white">
                    {seoAnalysis.criticalIssues.length + seoAnalysis.warnings.length}
                  </span>
                )}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('pages')}
              className={`py-8 px-4 font-semibold text-sm transition-all duration-300 rounded-t-lg ${
                activeTab === 'pages'
                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span className="flex items-center">
                📄 Pages
                {Object.keys(seoAnalysis?.pageIssues || {}).length > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500 text-white">
                    {Object.keys(seoAnalysis?.pageIssues || {}).length}
                  </span>
                )}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('links')}
              className={`py-8 px-4 font-semibold text-sm transition-all duration-300 rounded-t-lg ${
                activeTab === 'links'
                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span className="flex items-center">
                🔗 Links
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500 text-white">
                  {links.length}
                </span>
              </span>
            </button>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-8">
              {/* Main Statistics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 hover:shadow-md transition-all duration-200">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Pages Crawled</h3>
                  <p className="text-3xl font-bold text-gray-900">{pages.length}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 hover:shadow-md transition-all duration-200">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Total Links</h3>
                  <p className="text-3xl font-bold text-gray-900">{links.length}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 hover:shadow-md transition-all duration-200">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Internal Links</h3>
                  <p className="text-3xl font-bold text-gray-900">
                    {links.filter(l => l.to_url.includes(new URL(crawl?.domain || '').hostname)).length}
                  </p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 hover:shadow-md transition-all duration-200">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Total Images</h3>
                  <p className="text-3xl font-bold text-gray-900">{images.length}</p>
                </div>
              </div>

              {/* HTTP Status Codes */}
              <div className="bg-white rounded-lg shadow-sm p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold text-gray-900">HTTP Status Codes</h3>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                      {Object.keys(getStatusCodeBreakdown(pages)).length} different status codes
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  {Object.entries(getStatusCodeBreakdown(pages))
                    .sort(([a], [b]) => parseInt(a) - parseInt(b))
                    .map(([status, count]) => {
                      const statusCode = parseInt(status);
                      const getStatusColor = (code: number) => {
                        if (code >= 200 && code < 300) return 'bg-green-100 text-green-800';
                        if (code >= 300 && code < 400) return 'bg-blue-100 text-blue-800';
                        if (code >= 400 && code < 500) return 'bg-yellow-100 text-yellow-800';
                        if (code >= 500) return 'bg-red-100 text-red-800';
                        return 'bg-gray-100 text-gray-800';
                      };
                      const getStatusLabel = (code: number) => {
                        if (code === 200) return '200 OK';
                        if (code === 301) return '301 Moved';
                        if (code === 302) return '302 Found';
                        if (code === 404) return '404 Not Found';
                        if (code === 403) return '403 Forbidden';
                        if (code === 500) return '500 Server Error';
                        if (code === 503) return '503 Service Unavailable';
                        return `${code}`;
                      };
                      
                      return (
                        <div key={status} className="text-center group">
                          <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(statusCode)} group-hover:scale-105 transition-transform`}>
                            {getStatusLabel(statusCode)}
                          </div>
                          <div className="text-3xl font-bold text-gray-900 mt-2">{count}</div>
                          <div className="text-sm text-gray-500">pages</div>
                          {statusCode >= 400 && (
                            <div className="text-xs text-red-600 mt-2 font-medium">
                              ⚠️ Needs attention
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Page Issues Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 hover:shadow-md transition-all duration-200">
                  <h4 className="text-sm font-medium text-gray-500 mb-2">Pages with Issues</h4>
                  <p className="text-3xl font-bold text-red-600">{Object.keys(seoAnalysis?.pageIssues || {}).length}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 hover:shadow-md transition-all duration-200">
                  <h4 className="text-sm font-medium text-gray-500 mb-2">Pages without H1</h4>
                  <p className="text-3xl font-bold text-yellow-600">{pages.filter(p => p.h1_count === 0).length}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 hover:shadow-md transition-all duration-200">
                  <h4 className="text-sm font-medium text-gray-500 mb-2">Pages without Meta Description</h4>
                  <p className="text-3xl font-bold text-orange-600">{pages.filter(p => !p.meta_description || p.meta_description.trim() === '').length}</p>
                </div>
              </div>
            </div>

            {/* Quick Actions Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-sm p-8 sticky top-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-8">Quick Actions</h3>
                
                {/* Critical Issues - Fix These First */}
                {seoAnalysis && seoAnalysis.criticalIssues.length > 0 && (
                  <div className="mb-8">
                    <h4 className="text-sm font-semibold text-red-700 mb-4">
                      Critical Issues ({seoAnalysis.criticalIssues.length})
                    </h4>
                    <div className="space-y-3">
                      {seoAnalysis.criticalIssues.slice(0, 5).map((issue, index) => (
                        <div key={index} className="flex items-start">
                          <span className="text-red-500 mr-3 mt-0.5">•</span>
                          <span className="text-sm text-red-700">{issue.split(':')[0]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings - Recommended Next Steps */}
                {seoAnalysis && seoAnalysis.warnings.length > 0 && (
                  <div className="mb-8">
                    <h4 className="text-sm font-semibold text-yellow-700 mb-4">
                      Warnings ({seoAnalysis.warnings.length})
                    </h4>
                    <div className="space-y-3">
                      {seoAnalysis.warnings.slice(0, 5).map((warning, index) => (
                        <div key={index} className="flex items-start">
                          <span className="text-yellow-500 mr-3 mt-0.5">•</span>
                          <span className="text-sm text-yellow-700">{warning.split(':')[0]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommendations - General Improvements */}
                {seoAnalysis && seoAnalysis.recommendations.length > 0 && (
                  <div className="mb-8">
                    <h4 className="text-sm font-semibold text-green-700 mb-4">
                      Recommendations ({seoAnalysis.recommendations.length})
                    </h4>
                    <div className="space-y-3">
                      {seoAnalysis.recommendations.slice(0, 5).map((rec, index) => (
                        <div key={index} className="flex items-start">
                          <span className="text-green-500 mr-3 mt-0.5">•</span>
                          <span className="text-sm text-green-700">{rec}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Image Analysis */}
                {images.length > 0 && (
                  <div className="mb-8">
                    <h4 className="text-sm font-semibold text-gray-700 mb-4">
                      Image Analysis
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">Total Images</span>
                        <span className="text-sm font-medium text-gray-900">{images.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">With Alt Text</span>
                        <span className="text-sm font-medium text-green-600">{images.filter(img => img.has_alt).length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">Missing Alt Text</span>
                        <span className="text-sm font-medium text-red-600">{images.filter(img => !img.has_alt).length}</span>
                      </div>
                      
                      {/* File Type Breakdown */}
                      <div className="pt-2 border-t border-gray-200">
                        <div className="text-xs text-gray-500 mb-2">File Types:</div>
                        {(() => {
                          const fileTypes = images.reduce((acc, img) => {
                            const format = img.format?.toLowerCase() || 'unknown';
                            acc[format] = (acc[format] || 0) + 1;
                            return acc;
                          }, {} as Record<string, number>);
                          
                          return Object.entries(fileTypes)
                            .sort(([,a], [,b]) => b - a) // Sort by count descending
                            .map(([format, count]) => {
                              const percentage = ((count / images.length) * 100).toFixed(1);
                              return (
                                <div key={format} className="flex items-center justify-between">
                                  <span className="text-xs text-gray-600">.{format}</span>
                                  <span className="text-xs font-medium text-gray-700">{count} ({percentage}%)</span>
                                </div>
                              );
                            });
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'seo' && (
          <div className="space-y-6">
            {/* Critical Issues Section */}
            {seoAnalysis && seoAnalysis.criticalIssues.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="bg-white rounded-xl shadow-sm border border-red-200 p-6"
              >
                <div className="flex items-center mb-4">
                  <span className="text-2xl mr-3">🚨</span>
                  <h3 className="text-lg font-medium text-red-800">Critical Issues ({seoAnalysis.criticalIssues.length})</h3>
                </div>
                <div className="space-y-3">
                  {seoAnalysis.criticalIssues.map((issue, index) => (
                    <div key={index} className="flex items-start p-3 bg-red-50 rounded-lg border border-red-200">
                      <span className="text-red-500 mr-3 mt-0.5">🔴</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-red-800">{issue}</p>
                        <p className="text-xs text-red-600 mt-1">
                          {issue.includes('Error status code') ? 'Fix server issues immediately' :
                           issue.includes('Missing title tag') ? 'Add unique, descriptive titles' :
                           issue.includes('Missing meta description') ? 'Add compelling meta descriptions' :
                           'Address this issue to improve SEO score'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Warnings Section */}
            {seoAnalysis && seoAnalysis.warnings.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="bg-white rounded-xl shadow-sm border border-yellow-200 p-6"
              >
                <div className="flex items-center mb-4">
                  <span className="text-2xl mr-3">⚠️</span>
                  <h3 className="text-lg font-medium text-yellow-800">Warnings ({seoAnalysis.warnings.length})</h3>
                </div>
                <div className="space-y-3">
                  {seoAnalysis.warnings.map((warning, index) => (
                    <div key={index} className="flex items-start p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <span className="text-yellow-500 mr-3 mt-0.5">🟡</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-yellow-800">{warning}</p>
                        <p className="text-xs text-yellow-600 mt-1">
                          {warning.includes('Title too short') ? 'Aim for 30-60 characters' :
                           warning.includes('Title too long') ? 'Keep titles concise and compelling' :
                           warning.includes('Meta description') ? 'Write compelling descriptions (120-160 chars)' :
                           warning.includes('H1') ? 'Use one H1 per page for clear hierarchy' :
                           warning.includes('Content') ? 'Add more valuable content to engage users' :
                           'Consider improving this aspect for better SEO'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Recommendations Section */}
            {seoAnalysis && seoAnalysis.recommendations.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="bg-white rounded-xl shadow-sm border border-green-200 p-6"
              >
                <div className="flex items-center mb-4">
                  <span className="text-2xl mr-3">💡</span>
                  <h3 className="text-lg font-medium text-green-800">Recommendations ({seoAnalysis.recommendations.length})</h3>
                </div>
                <div className="space-y-3">
                  {seoAnalysis.recommendations.map((rec, index) => (
                    <div key={index} className="flex items-start p-3 bg-green-50 rounded-lg border border-green-200">
                      <span className="text-green-500 mr-3 mt-0.5">🟢</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-green-800">{rec}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        )}

        {activeTab === 'pages' && (
          <div className="space-y-4">
            {/* Page Details Modal */}
            <AnimatePresence>
              {pageDetailsModal && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
                  onClick={() => setPageDetailsModal(null)}
                >
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0, y: 50 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 50 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="relative top-10 mx-auto p-6 border w-11/12 md:w-4/5 lg:w-3/4 shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-between items-center mb-6">
                      <div>
                        <h3 className="text-xl font-medium text-gray-900">Page Analysis Report</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {pageDetailsModal.page.url}
                        </p>
                      </div>
                      <button
                        onClick={() => setPageDetailsModal(null)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <span className="text-2xl">×</span>
                      </button>
                    </div>

                    <div className="space-y-6">
                      {/* Page Overview */}
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6"
                      >
                        <h4 className="text-lg font-medium text-gray-900 mb-4">📄 Page Overview</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                          <div className="bg-white rounded-lg p-4 shadow-sm">
                            <div className="text-sm font-medium text-gray-500">Status Code</div>
                            <div className={`text-2xl font-bold ${
                              pageDetailsModal.page.status_code === 200 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {pageDetailsModal.page.status_code}
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-4 shadow-sm">
                            <div className="text-sm font-medium text-gray-500">Text Length</div>
                            <div className="text-2xl font-bold text-blue-600">
                              {pageDetailsModal.page.text_length.toLocaleString()}
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-4 shadow-sm">
                            <div className="text-sm font-medium text-gray-500">Total Links</div>
                            <div className="text-2xl font-bold text-purple-600">
                              {pageDetailsModal.page.internal_links + pageDetailsModal.page.external_links}
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-4 shadow-sm">
                            <div className="text-sm font-medium text-gray-500">Images</div>
                            <div className="text-2xl font-bold text-green-600">
                              {images.filter(img => img.page_id === pageDetailsModal.page.id).length}
                            </div>
                            <div className="text-xs text-gray-400">
                              {images.filter(img => img.page_id === pageDetailsModal.page.id && img.has_alt).length} with alt text
                            </div>
                          </div>
                        </div>

                        {/* Full Page Text */}
                        <div className="bg-white rounded-lg shadow-sm">
                          <div className="p-4 border-b border-gray-200">
                            <div className="flex items-center justify-between">
                              <h5 className="text-sm font-medium text-gray-700">Full Page Text</h5>
                              <span className="text-xs text-gray-500">
                                {pageDetailsModal.page.text_length.toLocaleString()} characters
                              </span>
                            </div>
                          </div>
                          <div className="p-4">
                            <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                              <pre className="text-sm text-gray-900 whitespace-pre-wrap font-sans">
                                {pageDetailsModal.page.full_text || 'No text content available'}
                              </pre>
                            </div>
                          </div>
                        </div>
                      </motion.div>

                      {/* SEO Elements */}
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-white rounded-lg shadow p-6"
                      >
                        <h4 className="text-lg font-medium text-gray-900 mb-4">🔍 SEO Elements</h4>
                        <div className="space-y-4">
                          {/* Title */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-sm font-medium text-gray-700">Page Title</label>
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                pageDetailsModal.page.title && pageDetailsModal.page.title.length >= 30 && pageDetailsModal.page.title.length <= 60
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {pageDetailsModal.page.title ? `${pageDetailsModal.page.title.length} chars` : 'Missing'}
                              </span>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-900">
                              {pageDetailsModal.page.title || 'No title found'}
                            </div>
                          </div>

                          {/* Meta Description */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-sm font-medium text-gray-700">Meta Description</label>
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                pageDetailsModal.page.meta_description && pageDetailsModal.page.meta_description.length >= 120 && pageDetailsModal.page.meta_description.length <= 160
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {pageDetailsModal.page.meta_description ? `${pageDetailsModal.page.meta_description.length} chars` : 'Missing'}
                              </span>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-900">
                              {pageDetailsModal.page.meta_description || 'No meta description found'}
                            </div>
                          </div>

                          {/* Headings */}
                          <div>
                            <label className="text-sm font-medium text-gray-700 mb-2 block">Heading Structure</label>
                            <div className="grid grid-cols-3 gap-4">
                              <div className="bg-gray-50 rounded-lg p-3 text-center">
                                <div className={`text-2xl font-bold ${
                                  pageDetailsModal.page.h1_count === 0 ? 'text-red-600' : 'text-green-600'
                                }`}>
                                  {pageDetailsModal.page.h1_count}
                                </div>
                                <div className="text-xs text-gray-600">H1</div>
                              </div>
                              <div className="bg-gray-50 rounded-lg p-3 text-center">
                                <div className="text-2xl font-bold text-blue-600">
                                  {pageDetailsModal.page.h2_count}
                                </div>
                                <div className="text-xs text-gray-600">H2</div>
                              </div>
                              <div className="bg-gray-50 rounded-lg p-3 text-center">
                                <div className="text-2xl font-bold text-blue-600">
                                  {pageDetailsModal.page.h3_count}
                                </div>
                                <div className="text-xs text-gray-600">H3</div>
                              </div>
                            </div>
                          </div>

                          {/* Schema Types */}
                          {pageDetailsModal.page.schema_types && pageDetailsModal.page.schema_types.length > 0 && (
                            <div>
                              <label className="text-sm font-medium text-gray-700 mb-2 block">Structured Data</label>
                              <div className="flex flex-wrap gap-2">
                                {pageDetailsModal.page.schema_types.map((schema, index) => (
                                  <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    {schema}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>

                      {/* Link Analysis */}
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="bg-white rounded-lg shadow p-6"
                      >
                        <h4 className="text-lg font-medium text-gray-900 mb-4">🔗 Link Analysis</h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                          <div className="bg-blue-50 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-blue-600">{pageDetailsModal.page.internal_links}</div>
                            <div className="text-sm text-blue-700">Internal Links</div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-gray-600">{pageDetailsModal.page.external_links}</div>
                            <div className="text-sm text-gray-700">External Links</div>
                          </div>
                          <div className="bg-yellow-50 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-yellow-600">{pageDetailsModal.page.nofollow_links}</div>
                            <div className="text-sm text-yellow-700">Nofollow Links</div>
                          </div>
                          <div className="bg-purple-50 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-purple-600">{pageDetailsModal.links.length}</div>
                            <div className="text-sm text-purple-700">Total Links</div>
                          </div>
                        </div>

                        {/* Quick Link Actions */}
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleLinkDetailsClick(pageDetailsModal.page.url, 'internal')}
                            className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors"
                          >
                            <span className="mr-1">📄</span>
                            View Internal Links ({pageDetailsModal.page.internal_links})
                          </button>
                          <button
                            onClick={() => handleLinkDetailsClick(pageDetailsModal.page.url, 'external')}
                            className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                          >
                            <span className="mr-1">🌐</span>
                            View External Links ({pageDetailsModal.page.external_links})
                          </button>
                        </div>
                      </motion.div>

                      {/* SEO Issues */}
                      {seoAnalysis?.pageIssues[pageDetailsModal.page.url] && (
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.4 }}
                          className="bg-white rounded-lg shadow p-6"
                        >
                          <h4 className="text-lg font-medium text-gray-900 mb-4">🚨 SEO Issues Found</h4>
                          <div className="space-y-2">
                            {seoAnalysis.pageIssues[pageDetailsModal.page.url].map((issue, index) => (
                              <div key={index} className="flex items-start">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mr-2 ${
                                  issue.includes('Error status code') || issue.includes('Missing title tag') || issue.includes('Missing meta description')
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {issue.includes('Error status code') || issue.includes('Missing title tag') || issue.includes('Missing meta description') ? 'Critical' : 'Warning'}
                                </span>
                                <span className="text-sm text-gray-700">{issue}</span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {/* Images Analysis */}
                      {images.filter(img => img.page_id === pageDetailsModal.page.id).length > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 }}
                          className="bg-white rounded-lg shadow p-6"
                        >
                          <h4 className="text-lg font-medium text-gray-900 mb-4">🖼️ Images Found ({images.filter(img => img.page_id === pageDetailsModal.page.id).length})</h4>
                          <div className="space-y-3">
                            {images
                              .filter(img => img.page_id === pageDetailsModal.page.id)
                              .map((image, index) => (
                                <div key={image.id} className="border border-gray-200 rounded-lg p-4">
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center space-x-2 mb-2">
                                        <span className="text-sm font-medium text-gray-900">Image {index + 1}</span>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                          image.has_alt ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                          {image.has_alt ? 'Has Alt Text' : 'Missing Alt Text'}
                                        </span>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                          {image.format.toUpperCase()}
                                        </span>
                                      </div>
                                      <div className="text-sm text-gray-600 mb-2">
                                        <strong>Source:</strong> {image.src}
                                      </div>
                                      {image.alt && (
                                        <div className="text-sm text-gray-600">
                                          <strong>Alt Text:</strong> "{image.alt}"
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pages Table */}
            <div className="space-y-4">
              {/* Filter Controls */}
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">Pages Analysis</h3>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-medium text-gray-700">Filter:</label>
                      <select
                        value={pageFilter}
                        onChange={(e) => setPageFilter(e.target.value as any)}
                        className="text-sm border border-gray-300 rounded-md px-3 py-1"
                      >
                        <option value="all">All Pages ({pages.length})</option>
                        <option value="critical">Critical Issues ({pages.filter(p => seoAnalysis?.pageIssues[p.url]?.some(i => i.includes('Error status code') || i.includes('Missing title tag') || i.includes('Missing meta description'))).length})</option>
                        <option value="warning">Warnings ({pages.filter(p => seoAnalysis?.pageIssues[p.url] && !seoAnalysis.pageIssues[p.url].some(i => i.includes('Error status code') || i.includes('Missing title tag') || i.includes('Missing meta description'))).length})</option>
                        <option value="ok">No Issues ({pages.filter(p => !seoAnalysis?.pageIssues[p.url]).length})</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        URL
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Title
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Links
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Headings
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Images
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Issues
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {pages
                      .filter(page => {
                        if (pageFilter === 'all') return true;
                        if (pageFilter === 'critical') {
                          return seoAnalysis?.pageIssues[page.url]?.some(i => 
                            i.includes('Error status code') || i.includes('Missing title tag') || i.includes('Missing meta description')
                          );
                        }
                        if (pageFilter === 'warning') {
                          return seoAnalysis?.pageIssues[page.url] && 
                            !seoAnalysis.pageIssues[page.url].some(i => 
                              i.includes('Error status code') || i.includes('Missing title tag') || i.includes('Missing meta description')
                            );
                        }
                        if (pageFilter === 'ok') {
                          return !seoAnalysis?.pageIssues[page.url];
                        }
                        return true;
                      })
                      .map((page) => (
                        <React.Fragment key={page.id}>
                          <tr className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                                <button
                                  onClick={() => handlePageDetailsClick(page)}
                                  className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer text-left"
                                >
                                  {page.url}
                                </button>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900 truncate max-w-xs">
                                {page.title || 'No title'}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                page.status_code === 200 
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {page.status_code}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                <div className="flex items-center space-x-2">
                                  <span className="text-blue-600">📄</span>
                                  <button
                                    onClick={() => handleLinkDetailsClick(page.url, 'internal')}
                                    className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                                  >
                                    {page.internal_links} internal
                                  </button>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <span className="text-gray-600">🌐</span>
                                  <button
                                    onClick={() => handleLinkDetailsClick(page.url, 'external')}
                                    className="text-gray-600 hover:text-gray-800 hover:underline cursor-pointer"
                                  >
                                    {page.external_links} external
                                  </button>
                                </div>
                                {page.nofollow_links > 0 && (
                                  <div className="flex items-center space-x-2">
                                    <span className="text-yellow-600">⚠️</span>
                                    <span>{page.nofollow_links} nofollow</span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <div className="space-y-1">
                                <div className="flex items-center">
                                  <span className="text-gray-600 mr-1">H1:</span>
                                  <span className={page.h1_count === 0 ? 'text-red-600 font-medium' : 'text-gray-900'}>{page.h1_count}</span>
                                </div>
                                <div className="flex items-center">
                                  <span className="text-gray-600 mr-1">H2:</span>
                                  <span className="text-gray-900">{page.h2_count}</span>
                                </div>
                                <div className="flex items-center">
                                  <span className="text-gray-600 mr-1">H3:</span>
                                  <span className="text-gray-900">{page.h3_count}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {images.filter(img => img.page_id === page.id).length}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {seoAnalysis?.pageIssues[page.url] ? (
                                <div className="flex items-center space-x-2">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                    seoAnalysis.pageIssues[page.url].some(i => i.includes('Error status code') || i.includes('Missing title tag') || i.includes('Missing meta description'))
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {seoAnalysis.pageIssues[page.url].length} issues
                                  </span>
                                  <button
                                    onClick={() => {
                                      const newExpanded = new Set(expandedPages);
                                      if (newExpanded.has(page.url)) {
                                        newExpanded.delete(page.url);
                                      } else {
                                        newExpanded.add(page.url);
                                      }
                                      setExpandedPages(newExpanded);
                                    }}
                                    className="text-blue-600 hover:text-blue-800 text-xs"
                                  >
                                    {expandedPages.has(page.url) ? 'Hide' : 'Show'} details
                                  </button>
                                </div>
                              ) : (
                                <span className="text-green-600 text-xs font-medium">✅ No issues</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => setSelectedPage(page.url)}
                                  className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors"
                                >
                                  <span className="mr-1">🔍</span>
                                  View Links
                                </button>
                              </div>
                            </td>
                          </tr>
                          
                          {/* Expanded Issues Row */}
                          {expandedPages.has(page.url) && seoAnalysis?.pageIssues[page.url] && (
                            <tr className="bg-gray-50">
                              <td colSpan={7} className="px-6 py-4">
                                <div className="space-y-2">
                                  <h4 className="text-sm font-medium text-gray-900">Issues Found:</h4>
                                  <div className="space-y-1">
                                    {seoAnalysis.pageIssues[page.url].map((issue, index) => (
                                      <div key={index} className="flex items-start">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mr-2 ${
                                          issue.includes('Error status code') || issue.includes('Missing title tag') || issue.includes('Missing meta description')
                                            ? 'bg-red-100 text-red-800'
                                            : 'bg-yellow-100 text-yellow-800'
                                        }`}>
                                          {issue.includes('Error status code') || issue.includes('Missing title tag') || issue.includes('Missing meta description') ? 'Critical' : 'Warning'}
                                        </span>
                                        <span className="text-sm text-gray-700">{issue}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'links' && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    From
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    To
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Count
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {links.map((link) => (
                  <tr key={link.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 truncate max-w-xs">
                        {link.from_url}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 truncate max-w-xs">
                        {link.to_url}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex space-x-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          link.to_url.includes(new URL(crawl.domain).hostname)
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {link.to_url.includes(new URL(crawl.domain).hostname) ? 'Internal' : 'External'}
                        </span>
                        {link.is_nofollow && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            Nofollow
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {link.link_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Link Details Modal */}
      <AnimatePresence>
        {linkDetailsModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
            onClick={() => setLinkDetailsModal(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 50 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative top-10 mx-auto p-6 border w-11/12 md:w-4/5 lg:w-3/4 shadow-lg rounded-md bg-white max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-medium text-gray-900">
                    {linkDetailsModal.linkType === 'internal' ? 'Internal' : 'External'} Links
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {linkDetailsModal.pageUrl}
                  </p>
                </div>
                <button
                  onClick={() => setLinkDetailsModal(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="text-2xl">×</span>
                </button>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    {linkDetailsModal.links.length} {linkDetailsModal.linkType} links found
                  </span>
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <span>Nofollow: {linkDetailsModal.links.filter(l => l.is_nofollow).length}</span>
                    <span>Dofollow: {linkDetailsModal.links.filter(l => !l.is_nofollow).length}</span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Link URL
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Properties
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {linkDetailsModal.links.map((link, index) => (
                      <motion.tr 
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="hover:bg-gray-50"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm text-gray-900 max-w-xs truncate">
                            <a 
                              href={link.to_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {link.to_url}
                            </a>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            link.is_nofollow 
                              ? 'bg-yellow-100 text-yellow-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {link.is_nofollow ? 'Nofollow' : 'Dofollow'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            <div className="flex items-center space-x-2">
                              {link.is_nofollow && (
                                <span className="text-yellow-600" title="Nofollow link">⚠️</span>
                              )}
                              {link.to_url.startsWith('mailto:') && (
                                <span className="text-blue-600" title="Email link">📧</span>
                              )}
                              {link.to_url.startsWith('tel:') && (
                                <span className="text-green-600" title="Phone link">📞</span>
                              )}
                              {link.to_url.includes('#') && (
                                <span className="text-purple-600" title="Anchor link">🔗</span>
                              )}
                            </div>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {linkDetailsModal.links.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">No {linkDetailsModal.linkType} links found for this page.</p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page Details Modal */}
      <AnimatePresence>
        {pageDetailsModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
            onClick={() => setPageDetailsModal(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 50 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative top-10 mx-auto p-6 border w-11/12 md:w-4/5 lg:w-3/4 shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-medium text-gray-900">Page Analysis Report</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {pageDetailsModal.page.url}
                  </p>
                </div>
                <button
                  onClick={() => setPageDetailsModal(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="text-2xl">×</span>
                </button>
              </div>

              <div className="space-y-6">
                {/* Page Overview */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6"
                >
                  <h4 className="text-lg font-medium text-gray-900 mb-4">📄 Page Overview</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white rounded-lg p-4 shadow-sm">
                      <div className="text-sm font-medium text-gray-500">Status Code</div>
                      <div className={`text-2xl font-bold ${
                        pageDetailsModal.page.status_code === 200 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {pageDetailsModal.page.status_code}
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm">
                      <div className="text-sm font-medium text-gray-500">Text Length</div>
                      <div className="text-2xl font-bold text-blue-600">
                        {pageDetailsModal.page.text_length.toLocaleString()}
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm">
                      <div className="text-sm font-medium text-gray-500">Total Links</div>
                      <div className="text-2xl font-bold text-purple-600">
                        {pageDetailsModal.page.internal_links + pageDetailsModal.page.external_links}
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm">
                      <div className="text-sm font-medium text-gray-500">Images</div>
                      <div className="text-2xl font-bold text-green-600">
                        {images.filter(img => img.page_id === pageDetailsModal.page.id).length}
                      </div>
                      <div className="text-xs text-gray-400">
                        {images.filter(img => img.page_id === pageDetailsModal.page.id && img.has_alt).length} with alt text
                      </div>
                    </div>
                  </div>

                  {/* Full Page Text */}
                  <div className="bg-white rounded-lg shadow-sm">
                    <div className="p-4 border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-medium text-gray-700">Full Page Text</h5>
                        <span className="text-xs text-gray-500">
                          {pageDetailsModal.page.text_length.toLocaleString()} characters
                        </span>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                        <pre className="text-sm text-gray-900 whitespace-pre-wrap font-sans">
                          {pageDetailsModal.page.full_text || 'No text content available'}
                        </pre>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* SEO Elements */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white rounded-lg shadow p-6"
                >
                  <h4 className="text-lg font-medium text-gray-900 mb-4">🔍 SEO Elements</h4>
                  <div className="space-y-4">
                    {/* Title */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700">Page Title</label>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          pageDetailsModal.page.title && pageDetailsModal.page.title.length >= 30 && pageDetailsModal.page.title.length <= 60
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {pageDetailsModal.page.title ? `${pageDetailsModal.page.title.length} chars` : 'Missing'}
                        </span>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-900">
                        {pageDetailsModal.page.title || 'No title found'}
                      </div>
                    </div>

                    {/* Meta Description */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700">Meta Description</label>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          pageDetailsModal.page.meta_description && pageDetailsModal.page.meta_description.length >= 120 && pageDetailsModal.page.meta_description.length <= 160
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {pageDetailsModal.page.meta_description ? `${pageDetailsModal.page.meta_description.length} chars` : 'Missing'}
                        </span>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-900">
                        {pageDetailsModal.page.meta_description || 'No meta description found'}
                      </div>
                    </div>

                    {/* Headings */}
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">Heading Structure</label>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <div className={`text-2xl font-bold ${
                            pageDetailsModal.page.h1_count === 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {pageDetailsModal.page.h1_count}
                          </div>
                          <div className="text-xs text-gray-600">H1</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-blue-600">
                            {pageDetailsModal.page.h2_count}
                          </div>
                          <div className="text-xs text-gray-600">H2</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-blue-600">
                            {pageDetailsModal.page.h3_count}
                          </div>
                          <div className="text-xs text-gray-600">H3</div>
                        </div>
                      </div>
                    </div>

                    {/* Schema Types */}
                    {pageDetailsModal.page.schema_types && pageDetailsModal.page.schema_types.length > 0 && (
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">Structured Data</label>
                        <div className="flex flex-wrap gap-2">
                          {pageDetailsModal.page.schema_types.map((schema, index) => (
                            <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              {schema}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Link Analysis */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-white rounded-lg shadow p-6"
                >
                  <h4 className="text-lg font-medium text-gray-900 mb-4">🔗 Link Analysis</h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-blue-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-blue-600">{pageDetailsModal.page.internal_links}</div>
                      <div className="text-sm text-blue-700">Internal Links</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-gray-600">{pageDetailsModal.page.external_links}</div>
                      <div className="text-sm text-gray-700">External Links</div>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-yellow-600">{pageDetailsModal.page.nofollow_links}</div>
                      <div className="text-sm text-yellow-700">Nofollow Links</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-purple-600">{pageDetailsModal.links.length}</div>
                      <div className="text-sm text-purple-700">Total Links</div>
                    </div>
                  </div>

                  {/* Quick Link Actions */}
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleLinkDetailsClick(pageDetailsModal.page.url, 'internal')}
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors"
                    >
                      <span className="mr-1">📄</span>
                      View Internal Links ({pageDetailsModal.page.internal_links})
                    </button>
                    <button
                      onClick={() => handleLinkDetailsClick(pageDetailsModal.page.url, 'external')}
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      <span className="mr-1">🌐</span>
                      View External Links ({pageDetailsModal.page.external_links})
                    </button>
                  </div>
                </motion.div>

                {/* SEO Issues */}
                {seoAnalysis?.pageIssues[pageDetailsModal.page.url] && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-white rounded-lg shadow p-6"
                  >
                    <h4 className="text-lg font-medium text-gray-900 mb-4">�� SEO Issues Found</h4>
                    <div className="space-y-2">
                      {seoAnalysis.pageIssues[pageDetailsModal.page.url].map((issue, index) => (
                        <div key={index} className="flex items-start">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mr-2 ${
                            issue.includes('Error status code') || issue.includes('Missing title tag') || issue.includes('Missing meta description')
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {issue.includes('Error status code') || issue.includes('Missing title tag') || issue.includes('Missing meta description') ? 'Critical' : 'Warning'}
                          </span>
                          <span className="text-sm text-gray-700">{issue}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Images Analysis */}
                {images.filter(img => img.page_id === pageDetailsModal.page.id).length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-white rounded-lg shadow p-6"
                  >
                    <h4 className="text-lg font-medium text-gray-900 mb-4">🖼️ Images Found ({images.filter(img => img.page_id === pageDetailsModal.page.id).length})</h4>
                    <div className="space-y-3">
                      {images
                        .filter(img => img.page_id === pageDetailsModal.page.id)
                        .map((image, index) => (
                          <div key={image.id} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-2">
                                  <span className="text-sm font-medium text-gray-900">Image {index + 1}</span>
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                    image.has_alt ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                  }`}>
                                    {image.has_alt ? 'Has Alt Text' : 'Missing Alt Text'}
                                  </span>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    {image.format.toUpperCase()}
                                  </span>
                                </div>
                                <div className="text-sm text-gray-600 mb-2">
                                  <strong>Source:</strong> {image.src}
                                </div>
                                {image.alt && (
                                  <div className="text-sm text-gray-600">
                                    <strong>Alt Text:</strong> "{image.alt}"
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
} 