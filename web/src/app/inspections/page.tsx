'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Layout } from '../../components/Layout';
import { Inspection, ConditionGrade, InspectionStatus, CONDITION_GRADES } from '../../types';
import {
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  XMarkIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/v1';
const TOKEN_KEY = 'silvertown_access_token';

const statusStyles: Record<InspectionStatus, string> = {
  NOT_STARTED: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  COMPLETE: 'bg-blue-100 text-blue-700',
  SUBMITTED: 'bg-green-100 text-green-700',
};

const statusLabels: Record<InspectionStatus, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETE: 'Complete',
  SUBMITTED: 'Submitted',
};

const priorityLabels: Record<string, { label: string; color: string }> = {
  P1: { label: 'P1 - Critical', color: 'text-red-600' },
  P2: { label: 'P2 - High', color: 'text-orange-600' },
  P3: { label: 'P3 - Medium', color: 'text-amber-600' },
  P4: { label: 'P4 - Low', color: 'text-green-600' },
};

interface Engineer {
  id: string;
  displayName: string;
}

export default function InspectionsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [zones, setZones] = useState<string[]>([]);
  const [engineers, setEngineers] = useState<Engineer[]>([]);

  // Filter states - initialize from URL params
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [selectedZone, setSelectedZone] = useState<string>(searchParams.get('zone') || '');
  const [selectedStatus, setSelectedStatus] = useState<string>(searchParams.get('status') || '');
  const [selectedGrade, setSelectedGrade] = useState<string>(searchParams.get('grade') || '');
  const [selectedEngineer, setSelectedEngineer] = useState<string>(searchParams.get('engineerId') || '');
  const [selectedPriority, setSelectedPriority] = useState<string>(searchParams.get('priority') || '');
  const [followUpOnly, setFollowUpOnly] = useState<boolean>(searchParams.get('followUp') === 'true');
  const [dateFrom, setDateFrom] = useState<string>(searchParams.get('dateFrom') || '');
  const [dateTo, setDateTo] = useState<string>(searchParams.get('dateTo') || '');
  const [showFilters, setShowFilters] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalInspections, setTotalInspections] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const itemsPerPage = 15;
  const hasFetchedRef = useRef(false);

  // Check if any filters are active
  const hasActiveFilters = selectedZone || selectedStatus || selectedGrade ||
    selectedEngineer || selectedPriority || followUpOnly || dateFrom || dateTo;

  const handleRefresh = () => setRefreshTrigger(prev => prev + 1);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedZone('');
    setSelectedStatus('');
    setSelectedGrade('');
    setSelectedEngineer('');
    setSelectedPriority('');
    setFollowUpOnly(false);
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
    router.push('/inspections');
  };

  // Load token from localStorage
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

  // Fetch inspections
  useEffect(() => {
    if (!token) return;

    const fetchInspections = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.append('page', String(currentPage));
        params.append('limit', String(itemsPerPage));
        if (selectedZone) params.append('zone', selectedZone);
        if (selectedStatus) params.append('status', selectedStatus);
        if (selectedGrade) params.append('conditionGrade', selectedGrade);
        if (selectedEngineer) params.append('engineerId', selectedEngineer);
        if (selectedPriority) params.append('priority', selectedPriority);
        if (followUpOnly) params.append('followUpRequired', 'true');
        if (searchQuery) params.append('search', searchQuery);
        if (dateFrom) params.append('dateFrom', new Date(dateFrom).toISOString());
        if (dateTo) {
          // Set to end of day
          const endDate = new Date(dateTo);
          endDate.setHours(23, 59, 59, 999);
          params.append('dateTo', endDate.toISOString());
        }

        const response = await fetch(`${API_URL}/inspections?${params}`, {
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
        setInspections(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalInspections(data.pagination?.total || 0);
      } catch (err) {
        console.error('Failed to load inspections:', err);
        setError(err instanceof Error ? err.message : 'Failed to load inspections');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInspections();
    hasFetchedRef.current = true;
  }, [token, currentPage, selectedZone, selectedStatus, selectedGrade, selectedEngineer,
      selectedPriority, followUpOnly, searchQuery, dateFrom, dateTo, refreshTrigger]);

  // Fetch filter options
  useEffect(() => {
    if (!token) return;

    // Fetch zones
    fetch(`${API_URL}/assets/filters`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.zones) setZones(data.zones);
      })
      .catch(console.error);

    // Fetch engineers
    fetch(`${API_URL}/inspections/engineers`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setEngineers(data);
      })
      .catch(console.error);
  }, [token]);

  // Debounced search
  useEffect(() => {
    if (!hasFetchedRef.current) return;
    const timeout = setTimeout(() => setCurrentPage(1), 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedZone, selectedStatus, selectedGrade, selectedEngineer, selectedPriority, followUpOnly, dateFrom, dateTo]);

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
          <p className="text-sm text-gray-500">Please log in to view inspections.</p>
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
            <h1 className="text-lg font-semibold text-gray-900">Inspections</h1>
            <p className="text-xs text-gray-500">
              {isLoading ? 'Loading...' : `${totalInspections} inspections`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/inspections/new"
              className="flex items-center gap-1 px-3 py-1.5 bg-brand-primary text-white text-xs font-medium rounded hover:bg-brand-primary/90"
            >
              <PlusIcon className="w-3 h-3" />
              New Inspection
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
                {[selectedZone, selectedStatus, selectedGrade, selectedEngineer, selectedPriority, followUpOnly, dateFrom || dateTo].filter(Boolean).length}
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
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Zone */}
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Zone</label>
                <select
                  value={selectedZone}
                  onChange={(e) => setSelectedZone(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white"
                >
                  <option value="">All Zones</option>
                  {zones.map((zone) => (
                    <option key={zone} value={zone}>{zone}</option>
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
                  <option value="NOT_STARTED">Not Started</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETE">Complete</option>
                  <option value="SUBMITTED">Submitted</option>
                </select>
              </div>

              {/* Condition Grade */}
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Condition Grade</label>
                <select
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white"
                >
                  <option value="">All Grades</option>
                  {Object.entries(CONDITION_GRADES).map(([key, grade]) => (
                    <option key={key} value={key}>Grade {grade.value} - {grade.label}</option>
                  ))}
                </select>
              </div>

              {/* Inspector */}
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Inspector</label>
                <select
                  value={selectedEngineer}
                  onChange={(e) => setSelectedEngineer(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white"
                >
                  <option value="">All Inspectors</option>
                  {engineers.map((eng) => (
                    <option key={eng.id} value={eng.id}>{eng.displayName}</option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Priority</label>
                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white"
                >
                  <option value="">All Priorities</option>
                  {Object.entries(priorityLabels).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Date From */}
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Date From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Date To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white"
                />
              </div>

              {/* Follow Up */}
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={followUpOnly}
                    onChange={(e) => setFollowUpOnly(e.target.checked)}
                    className="w-4 h-4 text-brand-primary border-gray-300 rounded focus:ring-brand-primary"
                  />
                  <span className="text-xs text-gray-700">Follow-up Required</span>
                </label>
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
              <button onClick={handleRefresh} className="text-xs text-red-600 underline mt-1">
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
        {!isLoading && !error && inspections.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-600 mb-2">No inspections found</p>
            <p className="text-xs text-gray-400 mb-4">
              {hasActiveFilters || searchQuery
                ? 'Try adjusting your filters'
                : 'Create your first inspection to get started'}
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
                href="/inspections/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-primary text-white text-xs font-medium rounded hover:bg-brand-primary/90"
              >
                <PlusIcon className="w-4 h-4" />
                New Inspection
              </Link>
            )}
          </div>
        )}

        {/* Table */}
        {!isLoading && !error && inspections.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-gray-500 uppercase tracking-wide bg-gray-50">
                  <th className="text-left px-3 py-2 font-medium">Asset</th>
                  <th className="text-left px-3 py-2 font-medium">Type</th>
                  <th className="text-left px-3 py-2 font-medium">Zone</th>
                  <th className="text-left px-3 py-2 font-medium">Grade</th>
                  <th className="text-left px-3 py-2 font-medium">Priority</th>
                  <th className="text-left px-3 py-2 font-medium">Inspector</th>
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {inspections.map((inspection) => {
                  const priority = inspection.riskScore
                    ? inspection.riskScore >= 15 ? 'P1'
                      : inspection.riskScore >= 10 ? 'P2'
                      : inspection.riskScore >= 5 ? 'P3'
                      : 'P4'
                    : null;
                  return (
                    <tr key={inspection.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <Link
                          href={`/inspections/${inspection.id}`}
                          className="text-[11px] font-mono font-medium text-brand-primary hover:underline"
                        >
                          {inspection.asset?.assetId || '-'}
                        </Link>
                        {inspection.followUpRequired && (
                          <span className="ml-1 text-[8px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded">
                            Follow-up
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-gray-600">
                        {inspection.asset?.level3 || '-'}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-gray-600">
                        {inspection.asset?.zone || '-'}
                      </td>
                      <td className="px-3 py-2">
                        {inspection.conditionGrade ? (
                          <span
                            className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[9px] font-bold"
                            style={{
                              backgroundColor: CONDITION_GRADES[inspection.conditionGrade as ConditionGrade].color,
                            }}
                          >
                            {CONDITION_GRADES[inspection.conditionGrade as ConditionGrade].value}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {priority ? (
                          <span className={`text-[10px] font-medium ${priorityLabels[priority].color}`}>
                            {priority}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-gray-600">
                        {inspection.engineer?.displayName || '-'}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-gray-600">
                        {inspection.dateOfInspection
                          ? new Date(inspection.dateOfInspection).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                            })
                          : '-'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${statusStyles[inspection.status]}`}>
                          {statusLabels[inspection.status]}
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
                  {Math.min(currentPage * itemsPerPage, totalInspections)} of {totalInspections}
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
