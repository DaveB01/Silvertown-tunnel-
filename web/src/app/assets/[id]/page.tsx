'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { Layout } from '../../../components/Layout';
import { Asset, Inspection, CONDITION_GRADES, ConditionGrade, InspectionStatus } from '../../../types';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  PlusIcon,
  ClipboardDocumentListIcon,
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

export default function AssetDetailPage() {
  const params = useParams();
  const assetId = params.id as string;
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load token
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      setToken(storedToken);
    }
  }, []);

  // Fetch asset and inspections
  useEffect(() => {
    if (!token) return;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch asset details
        const assetResponse = await fetch(`${API_URL}/assets/${assetId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!assetResponse.ok) {
          if (assetResponse.status === 404) {
            throw new Error('Asset not found');
          }
          const errorData = await assetResponse.json().catch(() => ({}));
          throw new Error(errorData.message || errorData.error || `API error: ${assetResponse.status}`);
        }

        const assetData = await assetResponse.json();
        setAsset(assetData);

        // Fetch inspections for this asset
        const inspectionsResponse = await fetch(`${API_URL}/inspections?assetId=${assetId}&limit=100`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (inspectionsResponse.ok) {
          const inspectionsData = await inspectionsResponse.json();
          setInspections(inspectionsData.data || []);
        }
      } catch (err) {
        console.error('Failed to load asset:', err);
        setError(err instanceof Error ? err.message : 'Failed to load asset');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [token, assetId]);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <ArrowPathIcon className="w-6 h-6 text-brand-primary animate-spin" />
        </div>
      </Layout>
    );
  }

  if (error || !asset) {
    return (
      <Layout>
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-sm text-red-600 mb-4">{error || 'Asset not found'}</p>
          <Link href="/assets" className="text-xs text-brand-primary hover:underline">
            Back to assets
          </Link>
        </div>
      </Layout>
    );
  }

  const gradeInfo = asset.lastConditionGrade ? CONDITION_GRADES[asset.lastConditionGrade] : null;

  return (
    <Layout>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/assets" className="p-1 hover:bg-gray-100 rounded">
              <ArrowLeftIcon className="w-3 h-3 text-gray-500" />
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 font-mono">{asset.assetId}</h1>
              <p className="text-xs text-gray-500">{asset.level3} · {asset.zone}</p>
            </div>
          </div>
          <Link
            href={`/inspections/new?assetId=${asset.id}`}
            className="flex items-center gap-1 px-3 py-1.5 bg-brand-primary text-white text-xs font-medium rounded hover:bg-brand-primary/90"
          >
            <PlusIcon className="w-3 h-3" />
            New Inspection
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {/* Main Content */}
          <div className="col-span-2 space-y-3">
            {/* Asset Details */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <h2 className="text-xs font-medium text-gray-900 mb-2">Asset Information</h2>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[10px] text-gray-500">Asset ID</p>
                  <p className="font-mono">{asset.assetId}</p>
                </div>
                {asset.assetCode && (
                  <div>
                    <p className="text-[10px] text-gray-500">Asset Code</p>
                    <p className="font-mono">{asset.assetCode}</p>
                  </div>
                )}
                {asset.title && (
                  <div className="col-span-2">
                    <p className="text-[10px] text-gray-500">Title</p>
                    <p>{asset.title}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-gray-500">Level 1</p>
                  <p>{asset.level1}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">Level 2</p>
                  <p>{asset.level2}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">Level 3 (Type)</p>
                  <p>{asset.level3}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">Zone</p>
                  <p>{asset.zone}</p>
                </div>
                {asset.region && (
                  <div>
                    <p className="text-[10px] text-gray-500">Region</p>
                    <p>{asset.region}</p>
                  </div>
                )}
                {asset.space && (
                  <div>
                    <p className="text-[10px] text-gray-500">Space</p>
                    <p>{asset.space}</p>
                  </div>
                )}
                {asset.facility && (
                  <div className="col-span-2">
                    <p className="text-[10px] text-gray-500">Facility</p>
                    <p>{asset.facility}</p>
                  </div>
                )}
                {asset.description && (
                  <div className="col-span-2">
                    <p className="text-[10px] text-gray-500">Description</p>
                    <p className="text-gray-700">{asset.description}</p>
                  </div>
                )}
                {asset.specification && (
                  <div className="col-span-2">
                    <p className="text-[10px] text-gray-500">Specification</p>
                    <p className="text-gray-600">{asset.specification}</p>
                  </div>
                )}
                {asset.system && (
                  <div>
                    <p className="text-[10px] text-gray-500">System</p>
                    <p>{asset.system}</p>
                  </div>
                )}
                {asset.assetType && (
                  <div>
                    <p className="text-[10px] text-gray-500">Asset Type</p>
                    <p>{asset.assetType}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Inspection History */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-medium text-gray-900">Inspection History</h2>
                <span className="text-[10px] text-gray-500">{inspections.length} inspections</span>
              </div>

              {inspections.length > 0 ? (
                <div className="space-y-2">
                  {inspections.map((inspection) => {
                    const grade = inspection.conditionGrade ? CONDITION_GRADES[inspection.conditionGrade] : null;
                    return (
                      <Link
                        key={inspection.id}
                        href={`/inspections/${inspection.id}`}
                        className="block p-2 border border-gray-100 rounded hover:bg-gray-50"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {grade && (
                              <span
                                className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                                style={{ backgroundColor: grade.color }}
                              >
                                {grade.value}
                              </span>
                            )}
                            <div>
                              <p className="text-xs text-gray-900">
                                {inspection.dateOfInspection
                                  ? new Date(inspection.dateOfInspection).toLocaleDateString('en-GB', {
                                      day: 'numeric',
                                      month: 'long',
                                      year: 'numeric',
                                    })
                                  : 'No date'}
                              </p>
                              <p className="text-[10px] text-gray-500">
                                {inspection.engineer?.displayName || 'Unknown inspector'}
                              </p>
                            </div>
                          </div>
                          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${statusStyles[inspection.status]}`}>
                            {statusLabels[inspection.status]}
                          </span>
                        </div>
                        {inspection.comments && (
                          <p className="text-[10px] text-gray-600 mt-1 line-clamp-2">{inspection.comments}</p>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <ClipboardDocumentListIcon className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                  <p className="text-xs text-gray-500 mb-3">No inspections yet</p>
                  <Link
                    href={`/inspections/new?assetId=${asset.id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-primary text-white text-xs font-medium rounded hover:bg-brand-primary/90"
                  >
                    <PlusIcon className="w-3 h-3" />
                    Create First Inspection
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-3">
            {/* Current Status */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <h2 className="text-xs font-medium text-gray-900 mb-2">Current Status</h2>
              {gradeInfo ? (
                <div className="p-2 rounded" style={{ backgroundColor: `${gradeInfo.color}10` }}>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center"
                      style={{ backgroundColor: gradeInfo.color }}
                    >
                      {gradeInfo.value}
                    </span>
                    <div>
                      <p className="text-xs font-medium text-gray-900">{gradeInfo.label}</p>
                      <p className="text-[10px] text-gray-500">{gradeInfo.description}</p>
                    </div>
                  </div>
                  {asset.lastInspectionDate && (
                    <p className="text-[10px] text-gray-500 mt-2">
                      Last inspected: {new Date(asset.lastInspectionDate).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-500">No inspections recorded</p>
              )}
            </div>

            {/* Next Inspection */}
            {asset.nextInspectionDue && (
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <h2 className="text-xs font-medium text-gray-900 mb-2">Next Inspection Due</h2>
                {(() => {
                  const dueDate = new Date(asset.nextInspectionDue);
                  const now = new Date();
                  const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  const isOverdue = daysUntil < 0;
                  const isDueSoon = daysUntil >= 0 && daysUntil <= 30;

                  return (
                    <div className={`p-2 rounded ${isOverdue ? 'bg-red-50' : isDueSoon ? 'bg-amber-50' : 'bg-green-50'}`}>
                      <p className={`text-sm font-medium ${isOverdue ? 'text-red-700' : isDueSoon ? 'text-amber-700' : 'text-green-700'}`}>
                        {dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                      <p className={`text-[10px] ${isOverdue ? 'text-red-600' : isDueSoon ? 'text-amber-600' : 'text-green-600'}`}>
                        {isOverdue
                          ? `${Math.abs(daysUntil)} days overdue`
                          : daysUntil === 0
                            ? 'Due today'
                            : `${daysUntil} days remaining`}
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Stats */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <h2 className="text-xs font-medium text-gray-900 mb-2">Statistics</h2>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Total Inspections</span>
                  <span className="font-medium">{asset.inspectionCount || inspections.length}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Inspection Frequency</span>
                  <span className="font-medium">{asset.inspectionFrequencyMonths || 12} months</span>
                </div>
                {asset.lastRiskScore && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Last Risk Score</span>
                    <span className={`font-medium ${
                      asset.lastRiskScore >= 15 ? 'text-red-600' :
                      asset.lastRiskScore >= 9 ? 'text-orange-600' :
                      asset.lastRiskScore >= 4 ? 'text-amber-600' : 'text-green-600'
                    }`}>{asset.lastRiskScore}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Asset Created</span>
                  <span>{new Date(asset.createdAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}</span>
                </div>
              </div>
            </div>

            {/* Grade Scale Reference */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <h2 className="text-xs font-medium text-gray-900 mb-2">Grade Scale</h2>
              <div className="space-y-1">
                {Object.entries(CONDITION_GRADES).map(([key, grade]) => (
                  <div
                    key={key}
                    className={`flex items-center gap-2 p-1 rounded text-[10px] ${key === asset.lastConditionGrade ? 'bg-gray-100' : ''}`}
                  >
                    <span
                      className="w-4 h-4 rounded-full text-white text-[8px] font-bold flex items-center justify-center"
                      style={{ backgroundColor: grade.color }}
                    >
                      {grade.value}
                    </span>
                    <span className="text-gray-600">{grade.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
