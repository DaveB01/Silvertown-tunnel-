'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { Layout } from '../../../components/Layout';
import { Inspection, CONDITION_GRADES, DEFECT_SEVERITY, ConditionGrade } from '../../../types';
import {
  ArrowLeftIcon,
  PhotoIcon,
  ArrowPathIcon,
  DocumentArrowDownIcon,
  PencilIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/v1';
const TOKEN_KEY = 'silvertown_access_token';

const statusStyles: Record<string, string> = {
  NOT_STARTED: 'bg-gray-50 text-gray-700',
  IN_PROGRESS: 'bg-amber-50 text-amber-700',
  COMPLETE: 'bg-blue-50 text-blue-700',
  SUBMITTED: 'bg-green-50 text-green-700',
};

const statusLabels: Record<string, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETE: 'Complete',
  SUBMITTED: 'Submitted',
};

export default function InspectionDetailPage() {
  const params = useParams();
  const inspectionId = params.id as string;
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Load token
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      setToken(storedToken);
    }
  }, []);

  // Fetch inspection
  useEffect(() => {
    if (!token) return;

    const fetchInspection = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_URL}/inspections/${inspectionId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Inspection not found');
          }
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
        }

        const data = await response.json();
        setInspection(data);
      } catch (err) {
        console.error('Failed to load inspection:', err);
        setError(err instanceof Error ? err.message : 'Failed to load inspection');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInspection();
  }, [token, inspectionId]);

  const handleDelete = async () => {
    if (!token || !inspection) return;
    if (!confirm('Are you sure you want to delete this inspection?')) return;

    try {
      const response = await fetch(`${API_URL}/inspections/${inspection.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to delete');
      }

      router.push('/inspections');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete inspection');
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <ArrowPathIcon className="w-6 h-6 text-brand-primary animate-spin" />
        </div>
      </Layout>
    );
  }

  if (error || !inspection) {
    return (
      <Layout>
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-sm text-red-600 mb-4">{error || 'Inspection not found'}</p>
          <Link href="/inspections" className="text-xs text-brand-primary hover:underline">
            Back to inspections
          </Link>
        </div>
      </Layout>
    );
  }

  const gradeInfo = CONDITION_GRADES[inspection.conditionGrade as ConditionGrade];
  const severityInfo = inspection.defectSeverity ? DEFECT_SEVERITY[inspection.defectSeverity] : null;
  const hasDefect = inspection.conditionGrade !== 'GRADE_1';

  return (
    <Layout>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/inspections" className="p-1 hover:bg-gray-100 rounded">
              <ArrowLeftIcon className="w-3 h-3 text-gray-500" />
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{inspection.asset?.assetId}</h1>
              <p className="text-xs text-gray-500">{inspection.asset?.level3} · {inspection.asset?.zone}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {inspection.status !== 'SUBMITTED' && (
              <>
                <Link
                  href={`/inspections/${inspection.id}/edit`}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
                >
                  <PencilIcon className="w-3 h-3" />
                  Edit
                </Link>
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                >
                  <TrashIcon className="w-3 h-3" />
                  Delete
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {/* Main */}
          <div className="col-span-2 space-y-3">
            {/* Condition */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <h2 className="text-xs font-medium text-gray-900 mb-2">Condition Assessment</h2>
              {gradeInfo ? (
                <>
                  <div className="flex items-center gap-3 p-2 rounded" style={{ backgroundColor: `${gradeInfo.color}10` }}>
                    <span
                      className="w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center"
                      style={{ backgroundColor: gradeInfo.color }}
                    >
                      {gradeInfo.value}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{gradeInfo.label}</p>
                      <p className="text-[10px] text-gray-500">{gradeInfo.description}</p>
                    </div>
                  </div>
                  {inspection.comments && (
                    <div className="mt-3 p-2 bg-gray-50 rounded border-l-2" style={{ borderColor: gradeInfo.color }}>
                      <p className="text-[10px] text-gray-500 mb-1">Comments</p>
                      <p className="text-xs text-gray-700">{inspection.comments}</p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-gray-500">No condition grade assigned</p>
              )}
            </div>

            {/* Defect Assessment (if applicable) */}
            {hasDefect && (
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <h2 className="text-xs font-medium text-gray-900 mb-2 flex items-center gap-1">
                  <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
                  Defect Assessment
                </h2>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  {/* Defect Severity */}
                  <div>
                    <p className="text-[10px] text-gray-500 mb-1">Defect Severity</p>
                    {severityInfo ? (
                      <div className="flex items-center gap-2">
                        <span
                          className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center"
                          style={{ backgroundColor: severityInfo.color }}
                        >
                          {severityInfo.value}
                        </span>
                        <span className="text-xs text-gray-700">{severityInfo.label}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Not set</span>
                    )}
                  </div>

                  {/* Risk Score */}
                  <div>
                    <p className="text-[10px] text-gray-500 mb-1">Risk Score</p>
                    {inspection.riskScore ? (
                      <span className={`text-lg font-bold ${
                        inspection.riskScore >= 15 ? 'text-red-600' :
                        inspection.riskScore >= 9 ? 'text-orange-600' :
                        inspection.riskScore >= 4 ? 'text-amber-600' : 'text-green-600'
                      }`}>
                        {inspection.riskScore}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </div>
                </div>

                {/* Defect Description */}
                {inspection.defectDescription && (
                  <div className="mb-3">
                    <p className="text-[10px] text-gray-500 mb-1">Defect Description</p>
                    <p className="text-xs text-gray-700 bg-gray-50 p-2 rounded">{inspection.defectDescription}</p>
                  </div>
                )}

                {/* Observed Issues */}
                {inspection.observedIssues && (
                  <div className="mb-3">
                    <p className="text-[10px] text-gray-500 mb-1">Observed Issues</p>
                    <p className="text-xs text-gray-700 bg-gray-50 p-2 rounded">{inspection.observedIssues}</p>
                  </div>
                )}

                {/* Recommended Action */}
                {inspection.recommendedAction && (
                  <div className="mb-3">
                    <p className="text-[10px] text-gray-500 mb-1">Recommended Action</p>
                    <p className="text-xs text-gray-700 bg-gray-50 p-2 rounded">{inspection.recommendedAction}</p>
                  </div>
                )}

                {/* Follow Up Required */}
                <div className="flex items-center gap-2">
                  {inspection.followUpRequired ? (
                    <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
                      <ExclamationTriangleIcon className="w-3 h-3" />
                      Follow-up action required
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
                      <CheckCircleIcon className="w-3 h-3" />
                      No follow-up required
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Asset Info */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <h2 className="text-xs font-medium text-gray-900 mb-2">Asset Information</h2>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-[10px] text-gray-500">Asset ID</p>
                  <p className="font-mono">{inspection.asset?.assetId}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">Zone</p>
                  <p>{inspection.asset?.zone}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">Level 1</p>
                  <p>{inspection.asset?.level1}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">Level 2</p>
                  <p>{inspection.asset?.level2}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">Type (Level 3)</p>
                  <p>{inspection.asset?.level3}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">Region</p>
                  <p>{inspection.asset?.region || '-'}</p>
                </div>
                {inspection.asset?.description && (
                  <div className="col-span-2">
                    <p className="text-[10px] text-gray-500">Description</p>
                    <p className="text-gray-700">{inspection.asset.description}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Media */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <h2 className="text-xs font-medium text-gray-900 mb-2">
                Media ({inspection.mediaCount || 0})
              </h2>
              {(inspection.mediaCount || 0) > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {inspection.media?.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedImage(m.signedUrl || m.signedThumbnailUrl || null)}
                      className="aspect-square bg-gray-100 rounded overflow-hidden hover:ring-2 hover:ring-brand-primary cursor-pointer"
                    >
                      {m.signedThumbnailUrl ? (
                        <img src={m.signedThumbnailUrl} alt={m.caption || 'Photo'} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <PhotoIcon className="w-5 h-5 text-gray-300" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center">
                  <PhotoIcon className="w-6 h-6 mx-auto text-gray-300 mb-1" />
                  <p className="text-[10px] text-gray-400">No photos attached</p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-3">
            {/* Status */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <div className={`p-2 rounded text-center ${statusStyles[inspection.status] || 'bg-gray-50'}`}>
                <p className="text-xs font-medium">
                  {statusLabels[inspection.status] || inspection.status}
                </p>
              </div>
            </div>

            {/* Details */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <h2 className="text-xs font-medium text-gray-900 mb-2">Details</h2>
              <div className="space-y-2 text-xs">
                <div>
                  <p className="text-[10px] text-gray-500">Inspector</p>
                  <p>{inspection.inspectorName || inspection.engineer?.displayName || '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">Inspection Date</p>
                  <p>{inspection.dateOfInspection
                    ? new Date(inspection.dateOfInspection).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">Created</p>
                  <p>{new Date(inspection.createdAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}</p>
                </div>
                {inspection.submittedAt && (
                  <div>
                    <p className="text-[10px] text-gray-500">Submitted</p>
                    <p>{new Date(inspection.submittedAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Reports */}
            {inspection.hasReport && (
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <h2 className="text-xs font-medium text-gray-900 mb-2">Reports</h2>
                <button className="flex items-center gap-2 text-xs text-brand-primary hover:underline">
                  <DocumentArrowDownIcon className="w-4 h-4" />
                  Download PDF
                </button>
              </div>
            )}

            {/* Grade Scale */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <h2 className="text-xs font-medium text-gray-900 mb-2">Grade Scale</h2>
              <div className="space-y-1">
                {Object.entries(CONDITION_GRADES).map(([key, grade]) => (
                  <div
                    key={key}
                    className={`flex items-center gap-2 p-1 rounded text-[10px] ${key === inspection.conditionGrade ? 'bg-gray-100' : ''}`}
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

            {/* Severity Scale (if has defect) */}
            {hasDefect && (
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <h2 className="text-xs font-medium text-gray-900 mb-2">Severity Scale</h2>
                <div className="space-y-1">
                  {Object.entries(DEFECT_SEVERITY).map(([key, severity]) => (
                    <div
                      key={key}
                      className={`flex items-center gap-2 p-1 rounded text-[10px] ${parseInt(key) === inspection.defectSeverity ? 'bg-gray-100' : ''}`}
                    >
                      <span
                        className="w-4 h-4 rounded-full text-white text-[8px] font-bold flex items-center justify-center"
                        style={{ backgroundColor: severity.color }}
                      >
                        {severity.value}
                      </span>
                      <span className="text-gray-600">{severity.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Image Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={selectedImage}
            alt="Full size"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </Layout>
  );
}
