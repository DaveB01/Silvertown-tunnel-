'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Layout } from '../../components/Layout';
import { CONDITION_GRADES, ConditionGrade, Inspection } from '../../types';
import {
  CubeIcon,
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  FlagIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/v1';
const TOKEN_KEY = 'silvertown_access_token';

interface DashboardSummary {
  totalInspections: number;
  byStatus: Record<string, number>;
  byConditionGrade: Record<string, number>;
  byZone: Record<string, number>;
  followUpCount: number;
  byPriority: { P1: number; P2: number; P3: number; P4: number };
}

// Priority configuration
const PRIORITIES = {
  P1: { label: 'Priority 1', description: 'Critical (≥15)', color: 'bg-red-600', textColor: 'text-red-600', bgLight: 'bg-red-50' },
  P2: { label: 'Priority 2', description: 'High (10-14)', color: 'bg-orange-500', textColor: 'text-orange-600', bgLight: 'bg-orange-50' },
  P3: { label: 'Priority 3', description: 'Medium (5-9)', color: 'bg-amber-500', textColor: 'text-amber-600', bgLight: 'bg-amber-50' },
  P4: { label: 'Priority 4', description: 'Low (<5)', color: 'bg-green-500', textColor: 'text-green-600', bgLight: 'bg-green-50' },
};

export default function DashboardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [assetCount, setAssetCount] = useState(0);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentInspections, setRecentInspections] = useState<Inspection[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = () => setRefreshTrigger(prev => prev + 1);

  // Load token from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      setToken(storedToken);
    }
    setAuthLoading(false);
  }, []);

  // Fetch dashboard data
  useEffect(() => {
    if (!token) return;

    const fetchDashboardData = async () => {
      setIsLoading(true);
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      try {
        // Fetch all data in parallel
        const [assetsRes, summaryRes, inspectionsRes] = await Promise.all([
          fetch(`${API_URL}/assets?page=1&limit=1`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`${API_URL}/inspections/summary`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`${API_URL}/inspections?page=1&limit=5&sortBy=dateOfInspection&sortOrder=desc`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);

        setAssetCount(assetsRes?.pagination?.total || 0);

        if (summaryRes) {
          setSummary(summaryRes);
        } else {
          setSummary({
            totalInspections: 0,
            byStatus: { NOT_STARTED: 0, IN_PROGRESS: 0, COMPLETE: 0, SUBMITTED: 0 },
            byConditionGrade: { GRADE_1: 0, GRADE_2: 0, GRADE_3: 0, GRADE_4: 0, GRADE_5: 0 },
            byZone: {},
            followUpCount: 0,
            byPriority: { P1: 0, P2: 0, P3: 0, P4: 0 },
          });
        }

        setRecentInspections(inspectionsRes?.data || []);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [token, refreshTrigger]);

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
          <p className="text-sm text-gray-500">Please log in to view the dashboard.</p>
        </div>
      </Layout>
    );
  }

  const totalGraded = summary
    ? Object.values(summary.byConditionGrade).reduce((a, b) => a + b, 0)
    : 0;

  const attentionCount = summary
    ? (summary.byConditionGrade.GRADE_4 || 0) + (summary.byConditionGrade.GRADE_5 || 0)
    : 0;

  const totalPriority = summary
    ? summary.byPriority.P1 + summary.byPriority.P2 + summary.byPriority.P3 + summary.byPriority.P4
    : 0;

  return (
    <Layout>
      <div className="space-y-4">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
            <p className="text-xs text-gray-500">Overview of inspection status</p>
          </div>
          <button
            onClick={handleRefresh}
            className="p-1.5 text-gray-400 hover:text-gray-600"
            title="Refresh"
          >
            <ArrowPathIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <ArrowPathIcon className="w-6 h-6 text-brand-primary animate-spin" />
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-3">
              {/* Assets Card */}
              <Link href="/assets" className="bg-white rounded-lg border border-gray-200 p-3 hover:border-brand-primary hover:shadow-sm transition-all">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Assets</p>
                    <p className="text-xl font-semibold text-gray-900">{assetCount}</p>
                  </div>
                  <CubeIcon className="w-4 h-4 text-gray-400" />
                </div>
              </Link>

              {/* Inspections Card */}
              <Link href="/inspections" className="bg-white rounded-lg border border-gray-200 p-3 hover:border-brand-primary hover:shadow-sm transition-all">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Inspections</p>
                    <p className="text-xl font-semibold text-gray-900">{summary?.totalInspections || 0}</p>
                  </div>
                  <ClipboardDocumentListIcon className="w-4 h-4 text-gray-400" />
                </div>
              </Link>

              {/* Follow Up Card */}
              <Link href="/inspections?followUp=true" className="bg-white rounded-lg border border-gray-200 p-3 hover:border-brand-primary hover:shadow-sm transition-all">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Follow Up</p>
                    <p className={`text-xl font-semibold ${(summary?.followUpCount || 0) > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                      {summary?.followUpCount || 0}
                    </p>
                  </div>
                  <FlagIcon className="w-4 h-4 text-amber-400" />
                </div>
              </Link>

              {/* Attention Card */}
              <Link href="/assets?status=attention" className="bg-white rounded-lg border border-gray-200 p-3 hover:border-brand-primary hover:shadow-sm transition-all">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Attention</p>
                    <p className={`text-xl font-semibold ${attentionCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {attentionCount}
                    </p>
                  </div>
                  <ExclamationTriangleIcon className="w-4 h-4 text-red-400" />
                </div>
              </Link>
            </div>

            {/* Priority Section */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowTrendingUpIcon className="w-4 h-4 text-gray-400" />
                  <h2 className="text-xs font-medium text-gray-900">Priority Overview</h2>
                </div>
                <span className="text-[10px] text-gray-500">Based on risk score</span>
              </div>
              <div className="p-3">
                {totalPriority > 0 ? (
                  <div className="grid grid-cols-4 gap-3">
                    {(['P1', 'P2', 'P3', 'P4'] as const).map((priority) => {
                      const config = PRIORITIES[priority];
                      const count = summary?.byPriority[priority] || 0;
                      return (
                        <Link
                          key={priority}
                          href={`/inspections?priority=${priority}`}
                          className={`${config.bgLight} rounded-lg p-3 hover:shadow-sm transition-all border border-transparent hover:border-gray-200`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`w-2 h-2 rounded-full ${config.color}`} />
                            <span className="text-[10px] font-medium text-gray-700">{config.label}</span>
                          </div>
                          <p className={`text-2xl font-bold ${config.textColor}`}>{count}</p>
                          <p className="text-[9px] text-gray-500">{config.description}</p>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <CheckCircleIcon className="w-5 h-5 mx-auto text-green-400 mb-1" />
                    <p className="text-[10px] text-gray-500">No risk scores recorded yet</p>
                  </div>
                )}
              </div>
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-3 gap-3">
              {/* Condition Summary */}
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-3 py-2 border-b border-gray-100">
                  <h2 className="text-xs font-medium text-gray-900">Condition Summary</h2>
                </div>
                <div className="p-3">
                  {totalGraded > 0 ? (
                    <>
                      {/* Stacked bar */}
                      <div className="h-2 rounded-full overflow-hidden flex bg-gray-100 mb-3">
                        {(['GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5'] as ConditionGrade[]).map(
                          (grade) => {
                            const count = summary?.byConditionGrade[grade] || 0;
                            const percentage = (count / totalGraded) * 100;
                            const gradeInfo = CONDITION_GRADES[grade];
                            return (
                              <div
                                key={grade}
                                style={{ width: `${percentage}%`, backgroundColor: gradeInfo.color }}
                              />
                            );
                          }
                        )}
                      </div>
                      {/* Legend */}
                      <div className="space-y-1">
                        {(['GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5'] as ConditionGrade[]).map(
                          (grade) => {
                            const count = summary?.byConditionGrade[grade] || 0;
                            const percentage = totalGraded > 0 ? ((count / totalGraded) * 100).toFixed(0) : 0;
                            const gradeInfo = CONDITION_GRADES[grade];
                            return (
                              <div key={grade} className="flex items-center text-[10px]">
                                <span
                                  className="w-2 h-2 rounded-full mr-2"
                                  style={{ backgroundColor: gradeInfo.color }}
                                />
                                <span className="flex-1 text-gray-600">{gradeInfo.label}</span>
                                <span className="text-gray-400">{count} ({percentage}%)</span>
                              </div>
                            );
                          }
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-[10px] text-gray-400">No inspections yet</p>
                    </div>
                  )}
                </div>
              </div>

              {/* By Zone */}
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-3 py-2 border-b border-gray-100">
                  <h2 className="text-xs font-medium text-gray-900">By Zone</h2>
                </div>
                <div className="p-3 space-y-2">
                  {summary && Object.keys(summary.byZone).length > 0 ? (
                    Object.entries(summary.byZone).map(([zone, count]) => {
                      const percentage = summary.totalInspections > 0
                        ? (count / summary.totalInspections) * 100
                        : 0;
                      return (
                        <div key={zone}>
                          <div className="flex justify-between text-[10px] mb-0.5">
                            <span className="text-gray-700">{zone}</span>
                            <span className="text-gray-400">{count}</span>
                          </div>
                          <div className="h-1 bg-gray-100 rounded-full">
                            <div
                              className="h-1 bg-brand-primary rounded-full"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-[10px] text-gray-400">No inspections yet</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Requiring Attention */}
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-3 py-2 border-b border-gray-100 flex justify-between items-center">
                  <h2 className="text-xs font-medium text-gray-900">Requiring Attention</h2>
                  <Link href="/assets?status=attention" className="text-[10px] text-brand-primary hover:underline">
                    View all
                  </Link>
                </div>
                {attentionCount === 0 ? (
                  <div className="p-6 text-center">
                    <CheckCircleIcon className="w-5 h-5 mx-auto text-green-400 mb-1" />
                    <p className="text-[10px] text-gray-500">All clear</p>
                  </div>
                ) : (
                  <div className="p-3">
                    <p className="text-[10px] text-gray-600">
                      {attentionCount} inspections with Grade 4 or 5 ratings
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Inspections Table */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-3 py-2 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-xs font-medium text-gray-900">Recent Inspections</h2>
                <Link href="/inspections" className="text-[10px] text-brand-primary hover:underline">
                  View all
                </Link>
              </div>
              {recentInspections.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-3 py-2 font-medium">Asset</th>
                      <th className="text-left px-3 py-2 font-medium">Type</th>
                      <th className="text-left px-3 py-2 font-medium">Zone</th>
                      <th className="text-left px-3 py-2 font-medium">Grade</th>
                      <th className="text-left px-3 py-2 font-medium">Risk</th>
                      <th className="text-left px-3 py-2 font-medium">Date</th>
                      <th className="text-left px-3 py-2 font-medium">Inspector</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {recentInspections.map((inspection) => {
                      // Determine priority from risk score
                      const riskScore = inspection.riskScore;
                      let priorityBadge: React.ReactNode = null;
                      if (riskScore) {
                        const priority = riskScore >= 15 ? 'P1' : riskScore >= 10 ? 'P2' : riskScore >= 5 ? 'P3' : 'P4';
                        const config = PRIORITIES[priority];
                        priorityBadge = (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${config.bgLight} ${config.textColor}`}>
                            {priority}
                          </span>
                        );
                      }
                      return (
                        <tr key={inspection.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <Link
                              href={`/inspections/${inspection.id}`}
                              className="text-[11px] font-mono font-medium text-brand-primary hover:underline"
                            >
                              {inspection.asset?.assetId}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-[11px] text-gray-600">
                            {inspection.asset?.level3}
                          </td>
                          <td className="px-3 py-2 text-[11px] text-gray-600">{inspection.asset?.zone}</td>
                          <td className="px-3 py-2">
                            <span
                              className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[9px] font-bold"
                              style={{
                                backgroundColor:
                                  CONDITION_GRADES[inspection.conditionGrade as ConditionGrade].color,
                              }}
                            >
                              {CONDITION_GRADES[inspection.conditionGrade as ConditionGrade].value}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {priorityBadge || <span className="text-[10px] text-gray-400">-</span>}
                          </td>
                          <td className="px-3 py-2 text-[11px] text-gray-600">
                            {new Date(inspection.dateOfInspection).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </td>
                          <td className="px-3 py-2 text-[11px] text-gray-600">
                            {inspection.inspectorName || inspection.engineer?.displayName}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="p-6 text-center">
                  <ClipboardDocumentListIcon className="w-6 h-6 mx-auto text-gray-300 mb-2" />
                  <p className="text-xs text-gray-500">No inspections yet</p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Import assets and start inspecting
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
