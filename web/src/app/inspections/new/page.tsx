'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Layout } from '../../../components/Layout';
import { Asset, User, CONDITION_GRADES, DEFECT_SEVERITY, ConditionGrade } from '../../../types';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  CheckIcon,
  PhotoIcon,
  XMarkIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/v1';
const TOKEN_KEY = 'silvertown_access_token';

export default function NewInspectionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedAssetId = searchParams.get('assetId');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Asset selection
  const [assetSearchQuery, setAssetSearchQuery] = useState('');
  const [assetSearchResults, setAssetSearchResults] = useState<Asset[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  // Asset filters
  const [assetZoneFilter, setAssetZoneFilter] = useState('');
  const [assetTypeFilter, setAssetTypeFilter] = useState('');
  const [filteredAssets, setFilteredAssets] = useState<Asset[]>([]);
  const [filterOptions, setFilterOptions] = useState<{ zones: string[]; level2: string[] }>({ zones: [], level2: [] });
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);

  // Engineers list for dropdown
  const [engineers, setEngineers] = useState<User[]>([]);

  // Form fields
  const [dateOfInspection, setDateOfInspection] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [inspectorName, setInspectorName] = useState('');
  const [conditionGrade, setConditionGrade] = useState<ConditionGrade | ''>('');
  const [comments, setComments] = useState('');

  // Defect fields (shown when grade > 1)
  const [defectSeverity, setDefectSeverity] = useState<number | ''>('');
  const [defectDescription, setDefectDescription] = useState('');
  const [observedIssues, setObservedIssues] = useState('');
  const [recommendedAction, setRecommendedAction] = useState('');
  const [followUpRequired, setFollowUpRequired] = useState(false);

  // Photos
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);

  const hasDefect = conditionGrade && conditionGrade !== 'GRADE_1';
  const riskScore = hasDefect && defectSeverity
    ? parseInt(conditionGrade.replace('GRADE_', '')) * defectSeverity
    : null;

  // Load token
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      setToken(storedToken);
    }
  }, []);

  // Load preselected asset
  useEffect(() => {
    if (!token || !preselectedAssetId) return;

    const fetchAsset = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_URL}/assets/${preselectedAssetId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const asset = await response.json();
          setSelectedAsset(asset);
        }
      } catch (err) {
        console.error('Failed to load asset:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAsset();
  }, [token, preselectedAssetId]);

  // Load engineers for dropdown
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

  // Load filter options (zones and asset types)
  useEffect(() => {
    if (!token) return;

    const fetchFilterOptions = async () => {
      try {
        const response = await fetch(`${API_URL}/assets/filters`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setFilterOptions({
            zones: data.zones || [],
            level2: data.level2Values || [],
          });
        }
      } catch (err) {
        console.error('Failed to load filter options:', err);
      }
    };

    fetchFilterOptions();
  }, [token]);

  // Load assets when zone or type filter changes
  useEffect(() => {
    if (!token || (!assetZoneFilter && !assetTypeFilter)) {
      setFilteredAssets([]);
      return;
    }

    const fetchFilteredAssets = async () => {
      setIsLoadingAssets(true);
      try {
        const params = new URLSearchParams();
        if (assetZoneFilter) params.append('zone', assetZoneFilter);
        if (assetTypeFilter) params.append('level2', assetTypeFilter);
        params.append('limit', '100');
        params.append('sortBy', 'assetId');
        params.append('sortOrder', 'asc');

        const response = await fetch(`${API_URL}/assets?${params}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setFilteredAssets(data.data || []);
        }
      } catch (err) {
        console.error('Failed to load assets:', err);
      } finally {
        setIsLoadingAssets(false);
      }
    };

    fetchFilteredAssets();
  }, [token, assetZoneFilter, assetTypeFilter]);

  // Search assets
  useEffect(() => {
    if (!token || !assetSearchQuery || assetSearchQuery.length < 2) {
      setAssetSearchResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`${API_URL}/assets?search=${encodeURIComponent(assetSearchQuery)}&limit=10`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setAssetSearchResults(data.data || []);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [token, assetSearchQuery]);

  const handleSelectAsset = (asset: Asset) => {
    setSelectedAsset(asset);
    setAssetSearchQuery('');
    setAssetSearchResults([]);
    setAssetZoneFilter('');
    setAssetTypeFilter('');
    setFilteredAssets([]);
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setPhotos(prev => [...prev, ...files]);

    // Create preview URLs
    files.forEach(file => {
      const url = URL.createObjectURL(file);
      setPhotoPreviewUrls(prev => [...prev, url]);
    });
  };

  const handleRemovePhoto = (index: number) => {
    URL.revokeObjectURL(photoPreviewUrls[index]);
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token || !selectedAsset || !conditionGrade) {
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
      // Create inspection
      const response = await fetch(`${API_URL}/inspections`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assetId: selectedAsset.id,
          dateOfInspection: new Date(dateOfInspection).toISOString(),
          conditionGrade,
          comments: comments || undefined,
          status: 'COMPLETE',
          inspectorName: inspectorName || undefined,
          defectSeverity: hasDefect && defectSeverity ? defectSeverity : undefined,
          defectDescription: hasDefect ? defectDescription || undefined : undefined,
          observedIssues: hasDefect ? observedIssues || undefined : undefined,
          recommendedAction: hasDefect ? recommendedAction || undefined : undefined,
          followUpRequired: hasDefect ? followUpRequired : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to create inspection');
      }

      const inspection = await response.json();

      // Upload photos if any
      if (photos.length > 0) {
        for (const photo of photos) {
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
      console.error('Failed to create inspection:', err);
      setError(err instanceof Error ? err.message : 'Failed to create inspection');
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

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Link href="/inspections" className="p-1 hover:bg-gray-100 rounded">
            <ArrowLeftIcon className="w-3 h-3 text-gray-500" />
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">New Inspection</h1>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Asset Selection */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-medium text-gray-900 mb-3">Select Asset *</h2>

            {selectedAsset ? (
              <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                <div>
                  <p className="text-sm font-mono font-medium text-gray-900">{selectedAsset.assetId}</p>
                  <p className="text-xs text-gray-600">{selectedAsset.level3} · {selectedAsset.zone}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAsset(null)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Filter dropdowns */}
                <div className="flex gap-2">
                  <select
                    value={assetZoneFilter}
                    onChange={(e) => setAssetZoneFilter(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white"
                  >
                    <option value="">All Zones</option>
                    {filterOptions.zones.map((zone) => (
                      <option key={zone} value={zone}>{zone}</option>
                    ))}
                  </select>
                  <select
                    value={assetTypeFilter}
                    onChange={(e) => setAssetTypeFilter(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white"
                  >
                    <option value="">All Asset Types</option>
                    {filterOptions.level2.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                {/* Search box */}
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Or search by asset ID..."
                    value={assetSearchQuery}
                    onChange={(e) => setAssetSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  />
                  {isSearching && (
                    <ArrowPathIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                  )}
                </div>

                {/* Search results (takes priority over filtered list) */}
                {assetSearchResults.length > 0 && (
                  <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                    {assetSearchResults.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => handleSelectAsset(asset)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                      >
                        <p className="text-xs font-mono font-medium text-gray-900">{asset.assetId}</p>
                        <p className="text-[10px] text-gray-500">{asset.level3} · {asset.zone}</p>
                      </button>
                    ))}
                  </div>
                )}

                {/* Filtered asset list (shown when filters active and no search) */}
                {assetSearchResults.length === 0 && (assetZoneFilter || assetTypeFilter) && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500">
                        {isLoadingAssets ? 'Loading...' : `${filteredAssets.length} assets found`}
                      </span>
                      {(assetZoneFilter || assetTypeFilter) && (
                        <button
                          type="button"
                          onClick={() => {
                            setAssetZoneFilter('');
                            setAssetTypeFilter('');
                          }}
                          className="text-xs text-brand-primary hover:underline"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                    {isLoadingAssets ? (
                      <div className="flex items-center justify-center py-8">
                        <ArrowPathIcon className="w-5 h-5 text-gray-400 animate-spin" />
                      </div>
                    ) : filteredAssets.length > 0 ? (
                      <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                        {filteredAssets.map((asset) => (
                          <button
                            key={asset.id}
                            type="button"
                            onClick={() => handleSelectAsset(asset)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs font-mono font-medium text-gray-900">{asset.assetId}</p>
                                <p className="text-[10px] text-gray-500">{asset.level3}</p>
                              </div>
                              <span className="text-[10px] text-gray-400">{asset.zone}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-xs text-gray-500">
                        No assets found with selected filters
                      </div>
                    )}
                  </div>
                )}

                {/* Helper text when no filters active */}
                {assetSearchResults.length === 0 && !assetZoneFilter && !assetTypeFilter && !assetSearchQuery && (
                  <p className="text-xs text-gray-500 text-center py-4">
                    Select a zone or asset type to browse assets, or search by ID above
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Inspector & Date */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-medium text-gray-900 mb-3">Inspector Details</h2>

            <div className="grid grid-cols-2 gap-4">
              {/* Inspector Name */}
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

              {/* Date */}
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
                    // Reset defect fields when switching to Grade 1
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

          {/* Defect Assessment (shown when grade > 1) */}
          {hasDefect && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="text-sm font-medium text-gray-900 mb-3">Defect Assessment</h2>

              {/* Defect Severity */}
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

              {/* Risk Score Display */}
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

              {/* Defect Description */}
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

              {/* Observed Issues */}
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

              {/* Recommended Action */}
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

              {/* Follow Up Required */}
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

          {/* General Comments */}
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

          {/* Photos */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-medium text-gray-900 mb-3">Photos</h2>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePhotoSelect}
              accept="image/*"
              multiple
              className="hidden"
            />

            <div className="grid grid-cols-4 gap-2">
              {photoPreviewUrls.map((url, index) => (
                <div key={index} className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
                  <img src={url} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(index)}
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

            {photos.length > 0 && (
              <p className="text-[10px] text-gray-500 mt-2">{photos.length} photo(s) selected</p>
            )}
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3">
            <Link
              href="/inspections"
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || !selectedAsset || !conditionGrade || !inspectorName || Boolean(hasDefect && !defectSeverity)}
              className="px-4 py-2 bg-brand-primary text-white text-sm font-medium rounded-lg hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Creating...' : 'Create Inspection'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
