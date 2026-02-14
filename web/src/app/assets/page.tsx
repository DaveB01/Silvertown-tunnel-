'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/v1';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Layout } from '../../components/Layout';
import { api } from '../../services/api';
import { Asset, ConditionGrade, CONDITION_GRADES } from '../../types';
import {
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  CheckCircleIcon,
  XMarkIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';

// Status filter options
type AssetStatusFilter = 'critical' | 'attention' | 'monitor' | 'due-soon' | 'good' | 'not-inspected';

const STATUS_OPTIONS: Record<AssetStatusFilter, { label: string; color: string }> = {
  'critical': { label: 'Critical', color: 'text-red-700' },
  'attention': { label: 'Attention', color: 'text-red-600' },
  'monitor': { label: 'Monitor', color: 'text-amber-600' },
  'due-soon': { label: 'Due Soon', color: 'text-amber-600' },
  'good': { label: 'Good', color: 'text-green-600' },
  'not-inspected': { label: 'Not Inspected', color: 'text-gray-500' },
};

// Helper to determine asset status based on condition and schedule
function getAssetStatus(
  conditionGrade?: ConditionGrade,
  nextDue?: string
): { label: string; color: string; icon: 'critical' | 'attention' | 'due-soon' | 'ok' | 'none' } {
  // Not inspected yet
  if (!conditionGrade || !nextDue) {
    return { label: 'Not Inspected', color: 'text-gray-400 bg-gray-50', icon: 'none' };
  }

  const dueDate = new Date(nextDue);
  const now = new Date();
  const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isOverdue = daysUntilDue < 0;
  const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 30;

  // Critical: GRADE_5 (severe) or GRADE_4 with follow-up needed
  if (conditionGrade === 'GRADE_5') {
    return { label: 'Critical', color: 'text-red-700 bg-red-100', icon: 'critical' };
  }

  // Attention: GRADE_4 (significant deterioration) or overdue
  if (conditionGrade === 'GRADE_4' || isOverdue) {
    return {
      label: isOverdue ? 'Overdue' : 'Attention',
      color: 'text-red-600 bg-red-50',
      icon: 'attention'
    };
  }

  // Warning: GRADE_3 (moderate deterioration)
  if (conditionGrade === 'GRADE_3') {
    return { label: 'Monitor', color: 'text-amber-600 bg-amber-50', icon: 'due-soon' };
  }

  // Due soon
  if (isDueSoon) {
    return { label: 'Due Soon', color: 'text-amber-600 bg-amber-50', icon: 'due-soon' };
  }

  // OK: GRADE_1 or GRADE_2 and not due soon
  return { label: 'Good', color: 'text-green-600 bg-green-50', icon: 'ok' };
}

const TOKEN_KEY = 'silvertown_access_token';

export default function AssetsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [filterOptions, setFilterOptions] = useState<{
    zones: string[];
    level2Values: string[];
    level3Values: string[];
    regions: string[];
  }>({ zones: [], level2Values: [], level3Values: [], regions: [] });

  // Filter states - initialize from URL params
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [selectedZone, setSelectedZone] = useState<string>(searchParams.get('zone') || '');
  const [selectedLevel2, setSelectedLevel2] = useState<string>(searchParams.get('level2') || '');
  const [selectedRegion, setSelectedRegion] = useState<string>(searchParams.get('region') || '');
  const [selectedStatus, setSelectedStatus] = useState<string>(searchParams.get('status') || '');
  const [showFilters, setShowFilters] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalAssets, setTotalAssets] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const itemsPerPage = 20;
  const hasFetchedRef = useRef(false);

  // Check if any filters are active
  const hasActiveFilters = selectedZone || selectedLevel2 || selectedRegion || selectedStatus;

  // Manual refresh function
  const handleRefresh = () => setRefreshTrigger(prev => prev + 1);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedZone('');
    setSelectedLevel2('');
    setSelectedRegion('');
    setSelectedStatus('');
    setCurrentPage(1);
    router.push('/assets');
  };

  // Load token from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      setToken(storedToken);
    }
    setAuthLoading(false);
  }, []);

  // Show filters panel if URL has filter params
  useEffect(() => {
    if (hasActiveFilters) {
      setShowFilters(true);
    }
  }, []);

  // Fetch assets when token is available or filters change
  useEffect(() => {
    if (!token) {
      return;
    }

    const fetchAssets = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Use direct fetch like the working test page
        const params = new URLSearchParams();
        params.append('page', String(currentPage));
        params.append('limit', String(itemsPerPage));
        if (selectedZone) params.append('zone', selectedZone);
        if (selectedLevel2) params.append('level2', selectedLevel2);
        if (selectedRegion) params.append('region', selectedRegion);
        if (selectedStatus) params.append('status', selectedStatus);
        if (searchQuery) params.append('search', searchQuery);

        const response = await fetch(`${API_URL}/assets?${params}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
        }

        const data = await response.json();
        setAssets(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalAssets(data.pagination?.total || 0);
      } catch (err) {
        console.error('Failed to load assets:', err);
        setError(err instanceof Error ? err.message : 'Failed to load assets');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAssets();
    hasFetchedRef.current = true;
  }, [token, currentPage, selectedZone, selectedLevel2, selectedRegion, selectedStatus, searchQuery, refreshTrigger]);

  // Fetch filter options once when token is available
  useEffect(() => {
    if (!token) {
      return;
    }

    const fetchFilterOptions = async () => {
      try {
        const options = await api.assets.filters(token);
        setFilterOptions(options);
      } catch (err) {
        console.error('Failed to load filter options:', err);
      }
    };

    fetchFilterOptions();
  }, [token]);

  // Debounced search - reset to page 1
  useEffect(() => {
    if (!hasFetchedRef.current) return;

    const timeout = setTimeout(() => {
      setCurrentPage(1);
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedZone, selectedLevel2, selectedRegion, selectedStatus]);

  const isAuthenticated = !!token;

  if (authLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <ArrowPathIcon className="w-6 h-6 text-brand-primary animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-gray-500">Please log in to view assets.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Assets</h1>
            <p className="text-xs text-gray-500">
              {isLoading ? 'Loading...' : `${totalAssets} assets`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/import"
              className="px-3 py-1.5 bg-brand-primary text-white text-xs font-medium rounded hover:bg-brand-primary/90"
            >
              Import Assets
            </Link>
            <button
              onClick={handleRefresh}
              className="p-1.5 text-gray-400 hover:text-gray-600"
              title="Refresh"
            >
              <ArrowPathIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search and Filter Toggle */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1 max-w-xs">
            <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1 px-2 py-1.5 text-xs border rounded ${
              hasActiveFilters
                ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <FunnelIcon className="w-3 h-3" />
            Filters
            {hasActiveFilters && (
              <span className="ml-1 px-1 py-0.5 bg-brand-primary text-white text-[9px] rounded-full">
                {[selectedZone, selectedLevel2, selectedRegion, selectedStatus].filter(Boolean).length}
              </span>
            )}
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700"
            >
              <XMarkIcon className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {/* Zone */}
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Zone</label>
                <select
                  value={selectedZone}
                  onChange={(e) => setSelectedZone(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white"
                >
                  <option value="">All Zones</option>
                  {filterOptions.zones.map((zone) => (
                    <option key={zone} value={zone}>{zone}</option>
                  ))}
                </select>
              </div>

              {/* Category (Level 2) */}
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Category</label>
                <select
                  value={selectedLevel2}
                  onChange={(e) => setSelectedLevel2(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white"
                >
                  <option value="">All Categories</option>
                  {filterOptions.level2Values.map((l2) => (
                    <option key={l2} value={l2}>{l2}</option>
                  ))}
                </select>
              </div>

              {/* Region */}
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Region</label>
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white"
                >
                  <option value="">All Regions</option>
                  {filterOptions.regions.map((region) => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Status</label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white"
                >
                  <option value="">All Statuses</option>
                  {Object.entries(STATUS_OPTIONS).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <ExclamationTriangleIcon className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-red-700">{error}</p>
              <button
                onClick={handleRefresh}
                className="text-xs text-red-600 underline mt-1"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <ArrowPathIcon className="w-6 h-6 text-brand-primary animate-spin" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && assets.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-600 mb-2">No assets found</p>
            <p className="text-xs text-gray-400 mb-4">
              {hasActiveFilters || searchQuery
                ? 'Try adjusting your filters'
                : 'Import assets to get started'}
            </p>
            {hasActiveFilters ? (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-xs font-medium rounded hover:bg-gray-50"
              >
                <XMarkIcon className="w-4 h-4" />
                Clear Filters
              </button>
            ) : (
              <Link
                href="/import"
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-primary text-white text-xs font-medium rounded hover:bg-brand-primary/90"
              >
                Import Assets
              </Link>
            )}
          </div>
        )}

        {/* Table */}
        {!isLoading && !error && assets.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-gray-500 uppercase tracking-wide bg-gray-50">
                  <th className="text-left px-3 py-2 font-medium">Asset ID</th>
                  <th className="text-left px-3 py-2 font-medium">Type</th>
                  <th className="text-left px-3 py-2 font-medium">Zone</th>
                  <th className="text-left px-3 py-2 font-medium">Last Inspected</th>
                  <th className="text-left px-3 py-2 font-medium">Grade</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assets.map((asset) => {
                  const status = getAssetStatus(asset.lastConditionGrade, asset.nextInspectionDue);
                  return (
                    <tr key={asset.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <Link
                          href={`/assets/${asset.id}`}
                          className="text-[11px] font-mono font-medium text-brand-primary hover:underline"
                        >
                          {asset.assetId}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <p className="text-[11px] text-gray-900">{asset.level3}</p>
                        <p className="text-[9px] text-gray-500">{asset.level2}</p>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-gray-600">{asset.zone}</td>
                      <td className="px-3 py-2 text-[11px] text-gray-600">
                        {asset.lastInspectionDate
                          ? new Date(asset.lastInspectionDate).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '-'}
                      </td>
                      <td className="px-3 py-2">
                        {asset.lastConditionGrade ? (
                          <span
                            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold"
                            style={{
                              backgroundColor:
                                CONDITION_GRADES[asset.lastConditionGrade as ConditionGrade].color,
                            }}
                          >
                            {CONDITION_GRADES[asset.lastConditionGrade as ConditionGrade].value}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${status.color}`}>
                          {(status.icon === 'critical' || status.icon === 'attention') && <ExclamationTriangleIcon className="w-3 h-3" />}
                          {status.icon === 'due-soon' && <ClockIcon className="w-3 h-3" />}
                          {status.icon === 'ok' && <CheckCircleIcon className="w-3 h-3" />}
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                <span className="text-[10px] text-gray-500">
                  {(currentPage - 1) * itemsPerPage + 1}-
                  {Math.min(currentPage * itemsPerPage, totalAssets)} of {totalAssets}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-30"
                  >
                    <ChevronLeftIcon className="w-3 h-3" />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 5) {
                      page = i + 1;
                    } else if (currentPage <= 3) {
                      page = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      page = totalPages - 4 + i;
                    } else {
                      page = currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-5 h-5 text-[10px] rounded ${
                          currentPage === page
                            ? 'bg-brand-primary text-white'
                            : 'text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-30"
                  >
                    <ChevronRightIcon className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
