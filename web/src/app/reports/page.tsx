'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Layout } from '../../components/Layout';
import { Inspection, CONDITION_GRADES, ConditionGrade } from '../../types';
import {
  ArrowPathIcon,
  DocumentArrowDownIcon,
  DocumentTextIcon,
  ChartBarIcon,
  TableCellsIcon,
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowDownTrayIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/v1';
const TOKEN_KEY = 'silvertown_access_token';

type ReportTab = 'overview' | 'inspections' | 'summary' | 'export';

const PRIORITY_CONFIG = {
  P1: { label: 'Critical', color: 'bg-red-500', textColor: 'text-red-600', min: 15, max: 25 },
  P2: { label: 'High', color: 'bg-orange-500', textColor: 'text-orange-600', min: 10, max: 14 },
  P3: { label: 'Medium', color: 'bg-amber-500', textColor: 'text-amber-600', min: 5, max: 9 },
  P4: { label: 'Low', color: 'bg-green-500', textColor: 'text-green-600', min: 0, max: 4 },
};

interface Summary {
  totalInspections: number;
  byStatus: Record<string, number>;
  byConditionGrade: Record<string, number>;
  byZone: Record<string, number>;
  followUpCount: number;
  byPriority: { P1: number; P2: number; P3: number; P4: number };
}

export default function ReportsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');

  // Overview data
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Inspections data
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [inspectionsLoading, setInspectionsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalInspections, setTotalInspections] = useState(0);
  const [inspectionFilter, setInspectionFilter] = useState({
    status: 'COMPLETE',
    zone: '',
    dateFrom: '',
    dateTo: '',
  });

  // Export state
  const [exporting, setExporting] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState<string | null>(null);

  const itemsPerPage = 15;

  // Load token
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      setToken(storedToken);
    }
    setAuthLoading(false);
  }, []);

  // Fetch summary data
  useEffect(() => {
    if (!token) return;

    const fetchSummary = async () => {
      setSummaryLoading(true);
      try {
        const response = await fetch(`${API_URL}/inspections/summary`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setSummary(data);
        }
      } catch (err) {
        console.error('Failed to load summary:', err);
      } finally {
        setSummaryLoading(false);
      }
    };

    fetchSummary();
  }, [token]);

  // Fetch inspections when on inspections tab
  useEffect(() => {
    if (!token || activeTab !== 'inspections') return;

    const fetchInspections = async () => {
      setInspectionsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.append('page', String(currentPage));
        params.append('limit', String(itemsPerPage));
        if (inspectionFilter.status) params.append('status', inspectionFilter.status);
        if (inspectionFilter.zone) params.append('zone', inspectionFilter.zone);
        if (inspectionFilter.dateFrom) {
          params.append('dateFrom', new Date(inspectionFilter.dateFrom).toISOString());
        }
        if (inspectionFilter.dateTo) {
          const endDate = new Date(inspectionFilter.dateTo);
          endDate.setHours(23, 59, 59, 999);
          params.append('dateTo', endDate.toISOString());
        }
        params.append('sortBy', 'dateOfInspection');
        params.append('sortOrder', 'desc');

        const response = await fetch(`${API_URL}/inspections?${params}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('Failed to load inspections');
        }

        const data = await response.json();
        setInspections(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalInspections(data.pagination?.total || 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load inspections');
      } finally {
        setInspectionsLoading(false);
      }
    };

    fetchInspections();
  }, [token, activeTab, currentPage, inspectionFilter]);

  const handleGenerateReport = async (inspectionId: string) => {
    if (!token) return;

    setGeneratingReport(inspectionId);
    try {
      const response = await fetch(`${API_URL}/reports/inspections/${inspectionId}/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate report');
      }

      alert('Report generated successfully!');
      // Refresh inspections
      setCurrentPage(1);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setGeneratingReport(null);
    }
  };

  const handleExport = async (type: 'inspections' | 'assets' | 'priority') => {
    if (!token) return;

    setExporting(type);
    try {
      let data: Record<string, unknown>[] = [];
      let filename = '';

      if (type === 'inspections') {
        // Fetch all inspections (no status filter for full export)
        const params = new URLSearchParams();
        params.append('limit', '1000');
        // Don't filter by status for full export - get all inspections

        const response = await fetch(`${API_URL}/inspections?${params}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const result = await response.json();
        data = (result.data || []).map((i: Inspection) => ({
          'Asset ID': i.asset?.assetId || '',
          'Asset Type': i.asset?.level3 || '',
          'Zone': i.asset?.zone || '',
          'Condition Grade': i.conditionGrade?.replace('GRADE_', '') || '',
          'Risk Score': i.riskScore || '',
          'Inspector': i.engineer?.displayName || '',
          'Date': i.dateOfInspection ? new Date(i.dateOfInspection).toLocaleDateString('en-GB') : '',
          'Status': i.status,
          'Follow-up Required': i.followUpRequired ? 'Yes' : 'No',
          'Comments': i.comments || '',
        }));
        filename = `inspections_${new Date().toISOString().split('T')[0]}.csv`;
      } else if (type === 'assets') {
        const response = await fetch(`${API_URL}/assets?limit=5000`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const result = await response.json();
        data = (result.data || []).map((a: Record<string, unknown>) => ({
          'Asset ID': a.assetId || '',
          'Asset Code': a.assetCode || '',
          'Type (Level 3)': a.level3 || '',
          'Category (Level 2)': a.level2 || '',
          'Zone': a.zone || '',
          'Region': a.region || '',
          'Last Inspection': a.lastInspectionDate ? new Date(a.lastInspectionDate as string).toLocaleDateString('en-GB') : 'Never',
          'Last Grade': a.lastConditionGrade ? (a.lastConditionGrade as string).replace('GRADE_', '') : '',
          'Last Risk Score': a.lastRiskScore || '',
          'Inspection Count': a.inspectionCount || 0,
          'Next Due': a.nextInspectionDue ? new Date(a.nextInspectionDue as string).toLocaleDateString('en-GB') : '',
        }));
        filename = `assets_${new Date().toISOString().split('T')[0]}.csv`;
      } else if (type === 'priority') {
        // Fetch high priority inspections (P1 and P2)
        const response = await fetch(`${API_URL}/inspections?limit=1000&priority=P1`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const p1Result = await response.json();

        const response2 = await fetch(`${API_URL}/inspections?limit=1000&priority=P2`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const p2Result = await response2.json();

        const allPriority = [...(p1Result.data || []), ...(p2Result.data || [])];
        data = allPriority.map((i: Inspection) => {
          const priority = i.riskScore && i.riskScore >= 15 ? 'P1' : 'P2';
          return {
            'Priority': priority,
            'Asset ID': i.asset?.assetId || '',
            'Asset Type': i.asset?.level3 || '',
            'Zone': i.asset?.zone || '',
            'Condition Grade': i.conditionGrade?.replace('GRADE_', '') || '',
            'Risk Score': i.riskScore || '',
            'Inspector': i.engineer?.displayName || '',
            'Date': i.dateOfInspection ? new Date(i.dateOfInspection).toLocaleDateString('en-GB') : '',
            'Recommended Action': i.recommendedAction || '',
            'Follow-up Required': i.followUpRequired ? 'Yes' : 'No',
          };
        });
        filename = `priority_report_${new Date().toISOString().split('T')[0]}.csv`;
      }

      // Convert to CSV
      if (data.length > 0) {
        const headers = Object.keys(data[0]);
        const csvContent = [
          headers.join(','),
          ...data.map(row => headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        // Download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
      } else {
        alert('No data to export');
      }
    } catch (err) {
      alert('Export failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setExporting(null);
    }
  };

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
          <p className="text-sm text-gray-500">Please log in to view reports.</p>
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
            <h1 className="text-lg font-semibold text-gray-900">Reports</h1>
            <p className="text-xs text-gray-500">Generate reports and export data</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          {[
            { id: 'overview', label: 'Overview', icon: ChartBarIcon },
            { id: 'inspections', label: 'Inspection Reports', icon: ClipboardDocumentListIcon },
            { id: 'summary', label: 'Summary Reports', icon: DocumentTextIcon },
            { id: 'export', label: 'Export Data', icon: TableCellsIcon },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ReportTab)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {summaryLoading ? (
              <div className="flex items-center justify-center py-12">
                <ArrowPathIcon className="w-6 h-6 text-brand-primary animate-spin" />
              </div>
            ) : summary ? (
              <>
                {/* Key Metrics */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total Inspections</p>
                    <p className="text-2xl font-bold text-gray-900">{summary.totalInspections}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Completed</p>
                    <p className="text-2xl font-bold text-green-600">{(summary.byStatus['COMPLETE'] || 0) + (summary.byStatus['SUBMITTED'] || 0)}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Follow-up Required</p>
                    <p className="text-2xl font-bold text-amber-600">{summary.followUpCount}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">High Priority (P1+P2)</p>
                    <p className="text-2xl font-bold text-red-600">{summary.byPriority.P1 + summary.byPriority.P2}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Priority Breakdown */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">Priority Distribution</h3>
                    <div className="space-y-2">
                      {Object.entries(PRIORITY_CONFIG).map(([key, config]) => {
                        const count = summary.byPriority[key as keyof typeof summary.byPriority] || 0;
                        const percentage = summary.totalInspections > 0 ? (count / summary.totalInspections) * 100 : 0;
                        return (
                          <div key={key} className="flex items-center gap-3">
                            <div className="w-12 text-xs font-medium">{key}</div>
                            <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${config.color} rounded-full`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <div className="w-16 text-xs text-right">
                              <span className={`font-medium ${config.textColor}`}>{count}</span>
                              <span className="text-gray-400 ml-1">({percentage.toFixed(0)}%)</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Condition Grade Breakdown */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">Condition Grade Distribution</h3>
                    <div className="space-y-2">
                      {Object.entries(CONDITION_GRADES).map(([key, grade]) => {
                        const count = summary.byConditionGrade[key] || 0;
                        const percentage = summary.totalInspections > 0 ? (count / summary.totalInspections) * 100 : 0;
                        return (
                          <div key={key} className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center" style={{ backgroundColor: grade.color }}>
                              {grade.value}
                            </div>
                            <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${percentage}%`, backgroundColor: grade.color }}
                              />
                            </div>
                            <div className="w-16 text-xs text-right">
                              <span className="font-medium">{count}</span>
                              <span className="text-gray-400 ml-1">({percentage.toFixed(0)}%)</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Zone Breakdown */}
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Inspections by Zone</h3>
                  <div className="grid grid-cols-4 gap-3">
                    {Object.entries(summary.byZone).map(([zone, count]) => (
                      <div key={zone} className="bg-gray-50 rounded p-3">
                        <p className="text-xs text-gray-500">{zone}</p>
                        <p className="text-lg font-bold text-gray-900">{count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <p className="text-sm text-gray-500">No data available</p>
              </div>
            )}
          </div>
        )}

        {/* Inspection Reports Tab */}
        {activeTab === 'inspections' && (
          <div className="space-y-3">
            {/* Filters */}
            <div className="flex gap-2 items-center bg-gray-50 p-2 rounded-lg">
              <FunnelIcon className="w-4 h-4 text-gray-400" />
              <select
                value={inspectionFilter.status}
                onChange={(e) => {
                  setInspectionFilter(f => ({ ...f, status: e.target.value }));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 text-xs border border-gray-200 rounded bg-white"
              >
                <option value="">All Statuses</option>
                <option value="COMPLETE">Complete</option>
                <option value="SUBMITTED">Submitted</option>
              </select>
              <input
                type="date"
                value={inspectionFilter.dateFrom}
                onChange={(e) => {
                  setInspectionFilter(f => ({ ...f, dateFrom: e.target.value }));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 text-xs border border-gray-200 rounded bg-white"
                placeholder="From"
              />
              <input
                type="date"
                value={inspectionFilter.dateTo}
                onChange={(e) => {
                  setInspectionFilter(f => ({ ...f, dateTo: e.target.value }));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 text-xs border border-gray-200 rounded bg-white"
                placeholder="To"
              />
              <div className="flex-1" />
              <span className="text-xs text-gray-500">{totalInspections} inspections</span>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <ExclamationTriangleIcon className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            {/* Loading */}
            {inspectionsLoading && (
              <div className="flex items-center justify-center py-12">
                <ArrowPathIcon className="w-6 h-6 text-brand-primary animate-spin" />
              </div>
            )}

            {/* Empty State */}
            {!inspectionsLoading && !error && inspections.length === 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <DocumentTextIcon className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                <p className="text-sm text-gray-600 mb-2">No inspections found</p>
                <p className="text-xs text-gray-400">Try adjusting your filters</p>
              </div>
            )}

            {/* Table */}
            {!inspectionsLoading && !error && inspections.length > 0 && (
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
                      <th className="text-right px-3 py-2 font-medium">Actions</th>
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
                                style={{ backgroundColor: CONDITION_GRADES[inspection.conditionGrade as ConditionGrade].color }}
                              >
                                {CONDITION_GRADES[inspection.conditionGrade as ConditionGrade].value}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-3 py-2">
                            {priority ? (
                              <span className={`text-[10px] font-medium ${PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG].textColor}`}>
                                {priority}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-3 py-2 text-[11px] text-gray-600">
                            {inspection.engineer?.displayName || '-'}
                          </td>
                          <td className="px-3 py-2 text-[11px] text-gray-600">
                            {inspection.dateOfInspection
                              ? new Date(inspection.dateOfInspection).toLocaleDateString('en-GB', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : '-'}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <Link
                                href={`/inspections/${inspection.id}`}
                                className="px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-100 rounded"
                              >
                                View
                              </Link>
                              {inspection.hasReport ? (
                                <button
                                  className="flex items-center gap-1 px-2 py-1 text-[10px] text-brand-primary hover:bg-brand-primary/10 rounded"
                                >
                                  <DocumentArrowDownIcon className="w-3 h-3" />
                                  PDF
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleGenerateReport(inspection.id)}
                                  disabled={generatingReport === inspection.id}
                                  className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50"
                                >
                                  {generatingReport === inspection.id ? (
                                    <ArrowPathIcon className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <DocumentTextIcon className="w-3 h-3" />
                                  )}
                                  Generate
                                </button>
                              )}
                            </div>
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
                        if (totalPages <= 5) page = i + 1;
                        else if (currentPage <= 3) page = i + 1;
                        else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
                        else page = currentPage - 2 + i;
                        return (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`w-5 h-5 text-[10px] rounded ${
                              currentPage === page ? 'bg-brand-primary text-white' : 'text-gray-600 hover:bg-gray-200'
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
        )}

        {/* Summary Reports Tab */}
        {activeTab === 'summary' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {/* Priority Report Card */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-red-50 rounded-lg">
                    <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-900">Priority Report</h3>
                    <p className="text-xs text-gray-500 mt-1">Assets requiring urgent attention (P1 & P2)</p>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-lg font-bold text-red-600">
                        {summary ? summary.byPriority.P1 + summary.byPriority.P2 : '-'}
                      </span>
                      <span className="text-xs text-gray-500">high priority items</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleExport('priority')}
                  disabled={exporting === 'priority'}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-50 text-red-700 text-xs font-medium rounded hover:bg-red-100 disabled:opacity-50"
                >
                  {exporting === 'priority' ? (
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowDownTrayIcon className="w-4 h-4" />
                  )}
                  Export Priority Report
                </button>
              </div>

              {/* Zone Summary Card */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <ChartBarIcon className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-900">Zone Summary</h3>
                    <p className="text-xs text-gray-500 mt-1">Inspection breakdown by zone</p>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-lg font-bold text-blue-600">
                        {summary ? Object.keys(summary.byZone).length : '-'}
                      </span>
                      <span className="text-xs text-gray-500">active zones</span>
                    </div>
                  </div>
                </div>
                <Link
                  href="/inspections"
                  className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 text-xs font-medium rounded hover:bg-blue-100"
                >
                  <TableCellsIcon className="w-4 h-4" />
                  View by Zone
                </Link>
              </div>

              {/* Follow-up Report Card */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <ClipboardDocumentListIcon className="w-6 h-6 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-900">Follow-up Report</h3>
                    <p className="text-xs text-gray-500 mt-1">Inspections requiring follow-up action</p>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-lg font-bold text-amber-600">
                        {summary ? summary.followUpCount : '-'}
                      </span>
                      <span className="text-xs text-gray-500">pending follow-ups</span>
                    </div>
                  </div>
                </div>
                <Link
                  href="/inspections?followUp=true"
                  className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 text-xs font-medium rounded hover:bg-amber-100"
                >
                  <TableCellsIcon className="w-4 h-4" />
                  View Follow-ups
                </Link>
              </div>
            </div>

            {/* Condition Summary */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-4">Condition Grade Summary</h3>
              <div className="grid grid-cols-5 gap-3">
                {Object.entries(CONDITION_GRADES).map(([key, grade]) => {
                  const count = summary?.byConditionGrade[key] || 0;
                  return (
                    <Link
                      key={key}
                      href={`/inspections?grade=${key}`}
                      className="p-4 rounded-lg text-center hover:shadow-md transition-shadow"
                      style={{ backgroundColor: `${grade.color}15` }}
                    >
                      <div
                        className="w-10 h-10 mx-auto rounded-full text-white text-lg font-bold flex items-center justify-center mb-2"
                        style={{ backgroundColor: grade.color }}
                      >
                        {grade.value}
                      </div>
                      <p className="text-2xl font-bold" style={{ color: grade.color }}>{count}</p>
                      <p className="text-[10px] text-gray-600 mt-1">{grade.label}</p>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Export Tab */}
        {activeTab === 'export' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-4">Export Data</h3>
              <div className="grid grid-cols-3 gap-4">
                {/* Export Inspections */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <ClipboardDocumentListIcon className="w-8 h-8 text-brand-primary" />
                    <div>
                      <h4 className="text-sm font-medium">Inspections</h4>
                      <p className="text-xs text-gray-500">Export all inspection data</p>
                    </div>
                  </div>
                  <ul className="text-xs text-gray-600 mb-4 space-y-1">
                    <li>• Asset details</li>
                    <li>• Condition grades & risk scores</li>
                    <li>• Inspector information</li>
                    <li>• Comments & recommendations</li>
                  </ul>
                  <button
                    onClick={() => handleExport('inspections')}
                    disabled={exporting === 'inspections'}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-brand-primary text-white text-xs font-medium rounded hover:bg-brand-primary/90 disabled:opacity-50"
                  >
                    {exporting === 'inspections' ? (
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    ) : (
                      <ArrowDownTrayIcon className="w-4 h-4" />
                    )}
                    Export to CSV
                  </button>
                </div>

                {/* Export Assets */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <TableCellsIcon className="w-8 h-8 text-brand-primary" />
                    <div>
                      <h4 className="text-sm font-medium">Assets</h4>
                      <p className="text-xs text-gray-500">Export asset register</p>
                    </div>
                  </div>
                  <ul className="text-xs text-gray-600 mb-4 space-y-1">
                    <li>• Asset IDs & codes</li>
                    <li>• Location & zone data</li>
                    <li>• Last inspection status</li>
                    <li>• Next inspection due</li>
                  </ul>
                  <button
                    onClick={() => handleExport('assets')}
                    disabled={exporting === 'assets'}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-brand-primary text-white text-xs font-medium rounded hover:bg-brand-primary/90 disabled:opacity-50"
                  >
                    {exporting === 'assets' ? (
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    ) : (
                      <ArrowDownTrayIcon className="w-4 h-4" />
                    )}
                    Export to CSV
                  </button>
                </div>

                {/* Export Priority */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <ExclamationTriangleIcon className="w-8 h-8 text-red-500" />
                    <div>
                      <h4 className="text-sm font-medium">Priority Report</h4>
                      <p className="text-xs text-gray-500">High priority items only</p>
                    </div>
                  </div>
                  <ul className="text-xs text-gray-600 mb-4 space-y-1">
                    <li>• P1 & P2 items only</li>
                    <li>• Risk scores & grades</li>
                    <li>• Recommended actions</li>
                    <li>• Follow-up status</li>
                  </ul>
                  <button
                    onClick={() => handleExport('priority')}
                    disabled={exporting === 'priority'}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    {exporting === 'priority' ? (
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    ) : (
                      <ArrowDownTrayIcon className="w-4 h-4" />
                    )}
                    Export to CSV
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-900 mb-1">Export Tips</h4>
              <ul className="text-xs text-blue-800 space-y-1">
                <li>• CSV files can be opened in Microsoft Excel, Google Sheets, or any spreadsheet application</li>
                <li>• Use the Inspection Reports tab filters to export a specific subset of data</li>
                <li>• For large datasets, exports may take a few moments to complete</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
