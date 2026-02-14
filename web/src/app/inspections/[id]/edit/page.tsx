'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Layout } from '../../../../components/Layout';
import { Inspection, User, CONDITION_GRADES, DEFECT_SEVERITY, ConditionGrade } from '../../../../types';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckIcon,
  XMarkIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/v1';
const TOKEN_KEY = 'silvertown_access_token';

export default function EditInspectionPage() {
  const params = useParams();
  const inspectionId = params.id as string;
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [token, setToken] = useState<string | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [engineers, setEngineers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [dateOfInspection, setDateOfInspection] = useState('');
  const [inspectorName, setInspectorName] = useState('');
  const [conditionGrade, setConditionGrade] = useState<ConditionGrade | ''>('');
  const [comments, setComments] = useState('');

  // Defect fields
  const [defectSeverity, setDefectSeverity] = useState<number | ''>('');
  const [defectDescription, setDefectDescription] = useState('');
  const [observedIssues, setObservedIssues] = useState('');
  const [recommendedAction, setRecommendedAction] = useState('');
  const [followUpRequired, setFollowUpRequired] = useState(false);

  // New photos
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [newPhotoPreviewUrls, setNewPhotoPreviewUrls] = useState<string[]>([]);

  const hasDefect = conditionGrade && conditionGrade !== 'GRADE_1';
  const riskScore = hasDefect && defectSeverity
    ? parseInt(conditionGrade.replace('GRADE_', '')) * (defectSeverity as number)
    : null;

  // Load token
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      setToken(storedToken);
    }
  }, []);

  // Load engineers
  useEffect(() => {
    if (!token) return;

    const fetchEngineers = async () => {
      try {
        const response = await fetch(`${API_URL}/users?limit=100&role=ENGINEER`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setEngineers(data.data || []);
        }
      } catch (err) {
        console.error('Failed to load engineers:', err);
      }
    };

    fetchEngineers();
  }, [token]);

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

        // Populate form fields
        if (data.dateOfInspection) {
          setDateOfInspection(new Date(data.dateOfInspection).toISOString().split('T')[0]);
        }
        if (data.conditionGrade) {
          setConditionGrade(data.conditionGrade);
        }
        if (data.comments) {
          setComments(data.comments);
        }
        if (data.inspectorName) {
          setInspectorName(data.inspectorName);
        }
        if (data.defectSeverity) {
          setDefectSeverity(data.defectSeverity);
        }
        if (data.defectDescription) {
          setDefectDescription(data.defectDescription);
        }
        if (data.observedIssues) {
          setObservedIssues(data.observedIssues);
        }
        if (data.recommendedAction) {
          setRecommendedAction(data.recommendedAction);
        }
        if (data.followUpRequired) {
          setFollowUpRequired(data.followUpRequired);
        }
      } catch (err) {
        console.error('Failed to load inspection:', err);
        setError(err instanceof Error ? err.message : 'Failed to load inspection');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInspection();
  }, [token, inspectionId]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setNewPhotos(prev => [...prev, ...files]);

    files.forEach(file => {
      const url = URL.createObjectURL(file);
      setNewPhotoPreviewUrls(prev => [...prev, url]);
    });
  };

  const handleRemoveNewPhoto = (index: number) => {
    URL.revokeObjectURL(newPhotoPreviewUrls[index]);
    setNewPhotos(prev => prev.filter((_, i) => i !== index));
    setNewPhotoPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token || !inspection || !conditionGrade) {
      setError('Please fill in all required fields');
      return;
    }

    if (hasDefect && !defectSeverity) {
      setError('Please select a defect severity');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/inspections/${inspection.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateOfInspection: new Date(dateOfInspection).toISOString(),
          conditionGrade,
          comments: comments || undefined,
          inspectorName: inspectorName || undefined,
          defectSeverity: hasDefect && defectSeverity ? defectSeverity : null,
          defectDescription: hasDefect ? defectDescription || null : null,
          observedIssues: hasDefect ? observedIssues || null : null,
          recommendedAction: hasDefect ? recommendedAction || null : null,
          followUpRequired: hasDefect ? followUpRequired : null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to update inspection');
      }

      // Upload new photos if any
      if (newPhotos.length > 0) {
        for (const photo of newPhotos) {
          const formData = new FormData();
          formData.append('file', photo);
          formData.append('type', 'PHOTO');

          await fetch(`${API_URL}/media/inspections/${inspection.id}/upload`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
            body: formData,
          });
        }
      }

      router.push(`/inspections/${inspection.id}`);
    } catch (err) {
      console.error('Failed to update inspection:', err);
      setError(err instanceof Error ? err.message : 'Failed to update inspection');
    } finally {
      setIsSubmitting(false);
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

  if (error && !inspection) {
    return (
      <Layout>
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <Link href="/inspections" className="text-xs text-brand-primary hover:underline">
            Back to inspections
          </Link>
        </div>
      </Layout>
    );
  }

  if (!inspection) return null;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Link href={`/inspections/${inspection.id}`} className="p-1 hover:bg-gray-100 rounded">
            <ArrowLeftIcon className="w-3 h-3 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Edit Inspection</h1>
            <p className="text-xs text-gray-500">{inspection.asset?.assetId}</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Asset Info (Read-only) */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-medium text-gray-900 mb-3">Asset</h2>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-mono font-medium text-gray-900">{inspection.asset?.assetId}</p>
              <p className="text-xs text-gray-600">{inspection.asset?.level3} · {inspection.asset?.zone}</p>
            </div>
          </div>

          {/* Inspector & Date */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-medium text-gray-900 mb-3">Inspector Details</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Inspector Name *</label>
                <input
                  type="text"
                  list="engineers-list"
                  value={inspectorName}
                  onChange={(e) => setInspectorName(e.target.value)}
                  placeholder="Select or type name..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  required
                />
                <datalist id="engineers-list">
                  {engineers.map((eng) => (
                    <option key={eng.id} value={eng.displayName} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Date of Inspection *</label>
                <input
                  type="date"
                  value={dateOfInspection}
                  onChange={(e) => setDateOfInspection(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  required
                />
              </div>
            </div>
          </div>

          {/* Condition Grade */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-medium text-gray-900 mb-3">Condition Assessment *</h2>

            <div className="grid grid-cols-5 gap-2">
              {Object.entries(CONDITION_GRADES).map(([key, grade]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setConditionGrade(key as ConditionGrade);
                    if (key === 'GRADE_1') {
                      setDefectSeverity('');
                      setDefectDescription('');
                      setObservedIssues('');
                      setRecommendedAction('');
                      setFollowUpRequired(false);
                    }
                  }}
                  className={`relative p-3 rounded-lg border-2 transition-all ${
                    conditionGrade === key
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {conditionGrade === key && (
                    <CheckIcon className="absolute top-1 right-1 w-3 h-3 text-gray-900" />
                  )}
                  <div
                    className="w-8 h-8 mx-auto rounded-full text-white text-sm font-bold flex items-center justify-center mb-1"
                    style={{ backgroundColor: grade.color }}
                  >
                    {grade.value}
                  </div>
                  <p className="text-[9px] text-center text-gray-600 leading-tight">{grade.label}</p>
                </button>
              ))}
            </div>
            {conditionGrade && (
              <p className="mt-2 text-xs text-gray-500">
                {CONDITION_GRADES[conditionGrade].description}
              </p>
            )}
          </div>

          {/* Defect Assessment */}
          {hasDefect && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="text-sm font-medium text-gray-900 mb-3">Defect Assessment</h2>

              <div className="mb-4">
                <label className="block text-xs text-gray-600 mb-2">Defect Severity *</label>
                <div className="grid grid-cols-5 gap-2">
                  {Object.entries(DEFECT_SEVERITY).map(([key, severity]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDefectSeverity(parseInt(key))}
                      className={`relative p-2 rounded-lg border-2 transition-all ${
                        defectSeverity === parseInt(key)
                          ? 'border-gray-900 bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {defectSeverity === parseInt(key) && (
                        <CheckIcon className="absolute top-1 right-1 w-3 h-3 text-gray-900" />
                      )}
                      <div
                        className="w-6 h-6 mx-auto rounded-full text-white text-xs font-bold flex items-center justify-center mb-1"
                        style={{ backgroundColor: severity.color }}
                      >
                        {severity.value}
                      </div>
                      <p className="text-[8px] text-center text-gray-600">{severity.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              {riskScore !== null && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">Calculated Risk Score</span>
                    <span className={`text-lg font-bold ${
                      riskScore >= 15 ? 'text-red-600' :
                      riskScore >= 9 ? 'text-orange-600' :
                      riskScore >= 4 ? 'text-amber-600' : 'text-green-600'
                    }`}>
                      {riskScore}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Condition Grade ({conditionGrade ? parseInt(conditionGrade.replace('GRADE_', '')) : 0}) × Defect Severity ({defectSeverity || 0})
                  </p>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-xs text-gray-600 mb-1">Defect Description</label>
                <textarea
                  value={defectDescription}
                  onChange={(e) => setDefectDescription(e.target.value)}
                  rows={3}
                  placeholder="Describe the defect..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary resize-none"
                />
              </div>

              <div className="mb-4">
                <label className="block text-xs text-gray-600 mb-1">Observed Issues</label>
                <textarea
                  value={observedIssues}
                  onChange={(e) => setObservedIssues(e.target.value)}
                  rows={3}
                  placeholder="List observed issues..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary resize-none"
                />
              </div>

              <div className="mb-4">
                <label className="block text-xs text-gray-600 mb-1">Recommended Action</label>
                <textarea
                  value={recommendedAction}
                  onChange={(e) => setRecommendedAction(e.target.value)}
                  rows={3}
                  placeholder="Recommended remediation actions..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary resize-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="followUpRequired"
                  checked={followUpRequired}
                  onChange={(e) => setFollowUpRequired(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-brand-primary focus:ring-brand-primary"
                />
                <label htmlFor="followUpRequired" className="text-xs text-gray-700">
                  Follow-up action required
                </label>
              </div>
            </div>
          )}

          {/* Comments */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-medium text-gray-900 mb-3">Additional Comments</h2>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
              placeholder="Any additional observations or notes..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary resize-none"
            />
          </div>

          {/* Existing Photos */}
          {inspection.media && inspection.media.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="text-sm font-medium text-gray-900 mb-3">Existing Photos</h2>
              <div className="grid grid-cols-4 gap-2">
                {inspection.media.map((m) => (
                  <div key={m.id} className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                    {m.signedThumbnailUrl ? (
                      <img src={m.signedThumbnailUrl} alt={m.caption || 'Photo'} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                        Photo
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add New Photos */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-medium text-gray-900 mb-3">Add Photos</h2>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePhotoSelect}
              accept="image/*"
              multiple
              className="hidden"
            />

            <div className="grid grid-cols-4 gap-2">
              {newPhotoPreviewUrls.map((url, index) => (
                <div key={index} className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
                  <img src={url} alt={`New Photo ${index + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveNewPhoto(index)}
                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                  >
                    <XMarkIcon className="w-3 h-3" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-gray-400 hover:bg-gray-50"
              >
                <PlusIcon className="w-6 h-6 text-gray-400 mb-1" />
                <span className="text-[10px] text-gray-500">Add Photo</span>
              </button>
            </div>

            {newPhotos.length > 0 && (
              <p className="text-[10px] text-gray-500 mt-2">{newPhotos.length} new photo(s) to add</p>
            )}
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3">
            <Link
              href={`/inspections/${inspection.id}`}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || !conditionGrade || !inspectorName || (hasDefect && !defectSeverity)}
              className="px-4 py-2 bg-brand-primary text-white text-sm font-medium rounded-lg hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
