'use client';

import { useState, useCallback } from 'react';
import { Layout } from '../../components/Layout';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../services/api';
import {
  ArrowUpTrayIcon,
  DocumentIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

type Step = 'upload' | 'mapping' | 'validate' | 'complete';

interface UploadResult {
  uploadId: string;
  filename: string;
  headers: string[];
  totalRows: number;
  preview: Record<string, string>[];
  suggestedMappings: Partial<ColumnMapping>;
}

interface ColumnMapping {
  // Required
  assetId: string;      // Unique Identifier
  level2: string;       // Level 2
  level3: string;       // Level 3 (Asset Type)
  zone: string;         // Zone

  // Optional
  level1?: string;      // Level 1
  assetCode?: string;   // Asset ID (short code)
  title?: string;       // Title
  description?: string; // Description
  region?: string;      // Region
  space?: string;       // Space
  facility?: string;    // Facility
  specification?: string; // Specification
  assetType?: string;   // Type
  system?: string;      // System
}

interface ValidationResult {
  valid: boolean;
  totalRows: number;
  validRows: number;
  duplicates: number;
  errors: Array<{ row: number; column: string; error: string }>;
  preview: Array<{
    row: number;
    data: { level2: string; level3: string; assetId: string; zone: string; description?: string };
    status: 'new' | 'duplicate' | 'error';
  }>;
}

interface ImportResult {
  batchId: string;
  success: number;
  skipped: number;
  errors: number;
  message: string;
}

export default function ImportPage() {
  const { token, isAuthenticated, isLoading: authLoading, refreshToken } = useAuth();
  const [step, setStep] = useState<Step>('upload');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Upload state
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  // Mapping state
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    assetId: '',
    level2: '',
    level3: '',
    zone: '',
    level1: '',
    assetCode: '',
    title: '',
    description: '',
    region: '',
    space: '',
    facility: '',
    specification: '',
    assetType: '',
    system: '',
  });
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // Validation state
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  // Import result state
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        await handleFileUpload(file);
      }
    },
    [token]
  );

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleFileUpload(file);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!token) {
      setError('You must be logged in to upload files');
      return;
    }

    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const hasValidExtension = validExtensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    );

    if (!validTypes.includes(file.type) && !hasValidExtension) {
      setError('Please upload an Excel (.xlsx, .xls) or CSV file');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Refresh token before upload to ensure it's valid
      const freshToken = await refreshToken();
      const uploadToken = freshToken || token;

      const result = await api.import.upload(file, uploadToken);
      setUploadResult(result);

      // Apply suggested mappings
      setColumnMapping({
        assetId: result.suggestedMappings.assetId || '',
        level1: result.suggestedMappings.level1 || '',
        level2: result.suggestedMappings.level2 || '',
        level3: result.suggestedMappings.level3 || '',
        assetCode: result.suggestedMappings.assetCode || '',
        title: result.suggestedMappings.title || '',
        zone: result.suggestedMappings.zone || '',
        region: result.suggestedMappings.region || '',
        space: result.suggestedMappings.space || '',
        description: result.suggestedMappings.description || '',
        facility: result.suggestedMappings.facility || '',
        specification: result.suggestedMappings.specification || '',
        assetType: result.suggestedMappings.assetType || '',
        system: result.suggestedMappings.system || '',
      });

      setStep('mapping');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!token || !uploadResult) return;

    // Check required mappings
    if (!columnMapping.assetId || !columnMapping.level2 || !columnMapping.level3 || !columnMapping.zone) {
      setError('Please map all required columns (Unique Identifier, Level 2, Level 3, Zone)');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Refresh token before validate
      const freshToken = await refreshToken();
      const validateToken = freshToken || token;

      const result = await api.import.validate(
        uploadResult.uploadId,
        columnMapping,
        skipDuplicates,
        validateToken
      );
      setValidationResult(result);
      setStep('validate');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!token || !uploadResult) return;

    setIsLoading(true);
    setError(null);

    try {
      // Refresh token before import
      const freshToken = await refreshToken();
      const importToken = freshToken || token;

      const result = await api.import.execute(
        uploadResult.uploadId,
        columnMapping,
        skipDuplicates,
        importToken
      );
      setImportResult(result);
      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setStep('upload');
    setUploadResult(null);
    setColumnMapping({
      assetId: '',
      level1: '',
      level2: '',
      level3: '',
      assetCode: '',
      title: '',
      zone: '',
      region: '',
      space: '',
      description: '',
      facility: '',
      specification: '',
      assetType: '',
      system: '',
    });
    setValidationResult(null);
    setImportResult(null);
    setError(null);
  };

  const renderStepIndicator = () => {
    const steps = [
      { key: 'upload', label: 'Upload' },
      { key: 'mapping', label: 'Map Columns' },
      { key: 'validate', label: 'Validate' },
      { key: 'complete', label: 'Complete' },
    ];

    const currentIndex = steps.findIndex((s) => s.key === step);

    return (
      <div className="flex items-center gap-2 mb-4">
        {steps.map((s, index) => (
          <div key={s.key} className="flex items-center">
            <div
              className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-medium ${
                index < currentIndex
                  ? 'bg-green-500 text-white'
                  : index === currentIndex
                  ? 'bg-brand-primary text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {index < currentIndex ? (
                <CheckCircleIcon className="w-4 h-4" />
              ) : (
                index + 1
              )}
            </div>
            <span
              className={`ml-1.5 text-[11px] ${
                index === currentIndex ? 'text-gray-900 font-medium' : 'text-gray-500'
              }`}
            >
              {s.label}
            </span>
            {index < steps.length - 1 && (
              <div className="w-8 h-px bg-gray-200 mx-2" />
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderUploadStep = () => (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? 'border-brand-primary bg-brand-primary/5'
            : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <ArrowUpTrayIcon className="w-10 h-10 mx-auto text-gray-400 mb-3" />
        <p className="text-sm text-gray-600 mb-1">
          Drag and drop your Excel or CSV file here
        </p>
        <p className="text-xs text-gray-400 mb-3">or</p>
        <label className="inline-flex items-center gap-2 px-4 py-2 bg-brand-primary text-white text-xs font-medium rounded cursor-pointer hover:bg-brand-primary/90">
          <DocumentIcon className="w-4 h-4" />
          Browse Files
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
        <p className="text-[10px] text-gray-400 mt-3">
          Supported formats: .xlsx, .xls, .csv
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <h4 className="text-xs font-medium text-blue-800 mb-1">Expected columns</h4>
        <p className="text-[11px] text-blue-700">
          Your file should contain columns for: <strong>Asset ID</strong>, <strong>Category</strong> (Level 2),{' '}
          <strong>Asset Type</strong> (Level 3), <strong>Zone</strong>, and optionally <strong>Description</strong>.
        </p>
      </div>
    </div>
  );

  const renderMappingStep = () => {
    if (!uploadResult) return null;

    const requiredFields = [
      { key: 'assetId', label: 'Unique Identifier', description: 'Unique ID for each asset (e.g., M120012S1CMC8428)' },
      { key: 'level2', label: 'Level 2', description: 'Sub-category (e.g., COMMS, Electrical)' },
      { key: 'level3', label: 'Level 3 (Asset Type)', description: 'Asset type (e.g., Cables, Distribution Board)' },
      { key: 'zone', label: 'Zone', description: 'Tunnel zone (e.g., Northbound, Southbound)' },
    ];

    const optionalFields = [
      { key: 'level1', label: 'Level 1', description: 'Top category (e.g., MEP)' },
      { key: 'assetCode', label: 'Asset ID (Code)', description: 'Short asset code (e.g., CMC)' },
      { key: 'title', label: 'Title', description: 'Full asset title/name' },
      { key: 'description', label: 'Description', description: 'Detailed asset description' },
      { key: 'region', label: 'Region', description: 'Geographic region (e.g., Tunnel, Portal)' },
      { key: 'space', label: 'Space', description: 'Specific space/location' },
      { key: 'facility', label: 'Facility', description: 'Facility name (e.g., Silvertown Tunnel)' },
      { key: 'specification', label: 'Specification', description: 'Document reference' },
      { key: 'assetType', label: 'Type', description: 'Type classification (e.g., Project Facilities)' },
      { key: 'system', label: 'System', description: 'System name' },
    ];

    return (
      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-3">
            <DocumentIcon className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-900">{uploadResult.filename}</span>
            <span className="text-[10px] text-gray-500">({uploadResult.totalRows} rows)</span>
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="text-[11px] font-medium text-gray-700 mb-2">Required Columns</h4>
              <div className="grid grid-cols-2 gap-2">
                {requiredFields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-[10px] text-gray-600 mb-0.5">
                      {field.label} <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={columnMapping[field.key as keyof ColumnMapping] || ''}
                      onChange={(e) =>
                        setColumnMapping({ ...columnMapping, [field.key]: e.target.value })
                      }
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    >
                      <option value="">Select column...</option>
                      {uploadResult.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                    <p className="text-[9px] text-gray-400 mt-0.5">{field.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-[11px] font-medium text-gray-700 mb-2">Optional Columns</h4>
              <div className="grid grid-cols-2 gap-2">
                {optionalFields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-[10px] text-gray-600 mb-0.5">{field.label}</label>
                    <select
                      value={columnMapping[field.key as keyof ColumnMapping] || ''}
                      onChange={(e) =>
                        setColumnMapping({ ...columnMapping, [field.key]: e.target.value })
                      }
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    >
                      <option value="">None</option>
                      {uploadResult.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                    <p className="text-[9px] text-gray-400 mt-0.5">{field.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="skipDuplicates"
            checked={skipDuplicates}
            onChange={(e) => setSkipDuplicates(e.target.checked)}
            className="w-3 h-3 rounded border-gray-300 text-brand-primary focus:ring-brand-primary"
          />
          <label htmlFor="skipDuplicates" className="text-xs text-gray-700">
            Skip duplicate Asset IDs (recommended)
          </label>
        </div>

        {uploadResult.preview.length > 0 && (
          <div>
            <h4 className="text-[11px] font-medium text-gray-700 mb-2">Data Preview (first 5 rows)</h4>
            <div className="overflow-x-auto border border-gray-200 rounded">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="bg-gray-50">
                    {uploadResult.headers.map((header) => (
                      <th key={header} className="px-2 py-1.5 text-left font-medium text-gray-600">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {uploadResult.preview.map((row, index) => (
                    <tr key={index}>
                      {uploadResult.headers.map((header) => (
                        <td key={header} className="px-2 py-1.5 text-gray-700">
                          {row[header] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-between">
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800"
          >
            Back
          </button>
          <button
            onClick={handleValidate}
            disabled={isLoading}
            className="px-4 py-1.5 bg-brand-primary text-white text-xs font-medium rounded hover:bg-brand-primary/90 disabled:opacity-50"
          >
            {isLoading ? 'Validating...' : 'Validate Data'}
          </button>
        </div>
      </div>
    );
  };

  const renderValidateStep = () => {
    if (!validationResult) return null;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
            <p className="text-lg font-semibold text-gray-900">{validationResult.totalRows}</p>
            <p className="text-[10px] text-gray-500">Total Rows</p>
          </div>
          <div className="bg-white border border-green-200 rounded-lg p-3 text-center">
            <p className="text-lg font-semibold text-green-600">{validationResult.validRows}</p>
            <p className="text-[10px] text-gray-500">Valid / New</p>
          </div>
          <div className="bg-white border border-yellow-200 rounded-lg p-3 text-center">
            <p className="text-lg font-semibold text-yellow-600">{validationResult.duplicates}</p>
            <p className="text-[10px] text-gray-500">Duplicates</p>
          </div>
          <div className="bg-white border border-red-200 rounded-lg p-3 text-center">
            <p className="text-lg font-semibold text-red-600">{validationResult.errors.length}</p>
            <p className="text-[10px] text-gray-500">Errors</p>
          </div>
        </div>

        {validationResult.errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <h4 className="text-xs font-medium text-red-800 mb-2 flex items-center gap-1">
              <XCircleIcon className="w-4 h-4" />
              Validation Errors
            </h4>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {validationResult.errors.slice(0, 20).map((err, index) => (
                <p key={index} className="text-[10px] text-red-700">
                  Row {err.row}: {err.column} - {err.error}
                </p>
              ))}
              {validationResult.errors.length > 20 && (
                <p className="text-[10px] text-red-600 font-medium">
                  ... and {validationResult.errors.length - 20} more errors
                </p>
              )}
            </div>
          </div>
        )}

        {validationResult.preview.length > 0 && (
          <div>
            <h4 className="text-[11px] font-medium text-gray-700 mb-2">Preview (first 10 rows)</h4>
            <div className="overflow-x-auto border border-gray-200 rounded">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-2 py-1.5 text-left font-medium text-gray-600">Row</th>
                    <th className="px-2 py-1.5 text-left font-medium text-gray-600">Status</th>
                    <th className="px-2 py-1.5 text-left font-medium text-gray-600">Asset ID</th>
                    <th className="px-2 py-1.5 text-left font-medium text-gray-600">Category</th>
                    <th className="px-2 py-1.5 text-left font-medium text-gray-600">Type</th>
                    <th className="px-2 py-1.5 text-left font-medium text-gray-600">Zone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {validationResult.preview.map((item) => (
                    <tr key={item.row}>
                      <td className="px-2 py-1.5 text-gray-500">{item.row}</td>
                      <td className="px-2 py-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${
                            item.status === 'new'
                              ? 'bg-green-100 text-green-700'
                              : item.status === 'duplicate'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {item.status === 'new' && <CheckCircleIcon className="w-3 h-3" />}
                          {item.status === 'duplicate' && <ExclamationCircleIcon className="w-3 h-3" />}
                          {item.status === 'error' && <XCircleIcon className="w-3 h-3" />}
                          {item.status}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 font-mono text-gray-700">{item.data.assetId}</td>
                      <td className="px-2 py-1.5 text-gray-700">{item.data.level2}</td>
                      <td className="px-2 py-1.5 text-gray-700">{item.data.level3}</td>
                      <td className="px-2 py-1.5 text-gray-700">{item.data.zone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-between">
          <button
            onClick={() => setStep('mapping')}
            className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800"
          >
            Back
          </button>
          <button
            onClick={handleImport}
            disabled={isLoading || validationResult.validRows === 0}
            className="px-4 py-1.5 bg-brand-primary text-white text-xs font-medium rounded hover:bg-brand-primary/90 disabled:opacity-50"
          >
            {isLoading ? 'Importing...' : `Import ${validationResult.validRows} Assets`}
          </button>
        </div>
      </div>
    );
  };

  const renderCompleteStep = () => {
    if (!importResult) return null;

    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <CheckCircleIcon className="w-12 h-12 mx-auto text-green-500 mb-3" />
          <h3 className="text-lg font-semibold text-green-800 mb-1">Import Complete</h3>
          <p className="text-sm text-green-700">{importResult.message}</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-green-200 rounded-lg p-3 text-center">
            <p className="text-xl font-semibold text-green-600">{importResult.success}</p>
            <p className="text-[10px] text-gray-500">Imported</p>
          </div>
          <div className="bg-white border border-yellow-200 rounded-lg p-3 text-center">
            <p className="text-xl font-semibold text-yellow-600">{importResult.skipped}</p>
            <p className="text-[10px] text-gray-500">Skipped</p>
          </div>
          <div className="bg-white border border-red-200 rounded-lg p-3 text-center">
            <p className="text-xl font-semibold text-red-600">{importResult.errors}</p>
            <p className="text-[10px] text-gray-500">Errors</p>
          </div>
        </div>

        <div className="flex justify-center gap-3">
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-primary text-white text-xs font-medium rounded hover:bg-brand-primary/90"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Import Another File
          </button>
          <a
            href="/assets"
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-xs font-medium rounded hover:bg-gray-50"
          >
            View Assets
          </a>
        </div>
      </div>
    );
  };

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
          <p className="text-sm text-gray-500">Please log in to import assets.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-gray-900">Import Assets</h1>
          <p className="text-xs text-gray-500">
            Upload an Excel or CSV file to import assets into the system
          </p>
        </div>

        {renderStepIndicator()}

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <XCircleIcon className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {isLoading && step === 'upload' && (
          <div className="flex items-center justify-center py-12">
            <ArrowPathIcon className="w-6 h-6 text-brand-primary animate-spin" />
            <span className="ml-2 text-sm text-gray-600">Uploading and parsing file...</span>
          </div>
        )}

        {step === 'upload' && !isLoading && renderUploadStep()}
        {step === 'mapping' && renderMappingStep()}
        {step === 'validate' && renderValidateStep()}
        {step === 'complete' && renderCompleteStep()}
      </div>
    </Layout>
  );
}
