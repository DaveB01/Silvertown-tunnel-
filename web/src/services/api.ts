const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/v1';

interface RequestOptions extends RequestInit {
  token?: string;
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { token, ...fetchOptions } = options;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'An error occurred' }));
    throw new ApiError(response.status, error.message || error.error, error);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  // Auth
  auth: {
    login: (email: string, password: string) =>
      request<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: { id: string; email: string; displayName: string; role: string };
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),

    refresh: (refreshToken: string) =>
      request<{ accessToken: string; refreshToken: string; expiresIn: number }>(
        '/auth/refresh',
        {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        }
      ),

    logout: (refreshToken: string, token: string) =>
      request<void>('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
        token,
      }),

    me: (token: string) =>
      request<{ id: string; email: string; displayName: string; role: string }>(
        '/auth/me',
        { token }
      ),
  },

  // Assets
  assets: {
    list: (params: Record<string, string | number | boolean | undefined>, token: string) => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) searchParams.append(key, String(value));
      });
      return request<import('../types').PaginatedResponse<import('../types').Asset>>(
        `/assets?${searchParams}`,
        { token }
      );
    },

    get: (id: string, token: string) =>
      request<import('../types').Asset>(`/assets/${id}`, { token }),

    create: (data: Record<string, unknown>, token: string) =>
      request<import('../types').Asset>('/assets', {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),

    update: (id: string, data: Record<string, unknown>, token: string) =>
      request<import('../types').Asset>(`/assets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),

    delete: (id: string, token: string) =>
      request<void>(`/assets/${id}`, { method: 'DELETE', token }),

    filters: (token: string) =>
      request<{
        zones: string[];
        level1Values: string[];
        level2Values: string[];
        level3Values: string[];
        regions: string[];
        facilities: string[];
      }>('/assets/filters', { token }),
  },

  // Inspections
  inspections: {
    list: (params: Record<string, string | number | boolean | undefined>, token: string) => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) searchParams.append(key, String(value));
      });
      return request<import('../types').PaginatedResponse<import('../types').Inspection>>(
        `/inspections?${searchParams}`,
        { token }
      );
    },

    get: (id: string, token: string) =>
      request<import('../types').Inspection>(`/inspections/${id}`, { token }),

    create: (data: Record<string, unknown>, token: string) =>
      request<import('../types').Inspection>('/inspections', {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),

    update: (id: string, data: Record<string, unknown>, token: string) =>
      request<import('../types').Inspection>(`/inspections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),

    submit: (id: string, token: string) =>
      request<import('../types').Inspection>(`/inspections/${id}/submit`, {
        method: 'POST',
        token,
      }),

    delete: (id: string, token: string) =>
      request<void>(`/inspections/${id}`, { method: 'DELETE', token }),

    summary: (params: Record<string, string | undefined>, token: string) => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) searchParams.append(key, value);
      });
      return request<{
        totalInspections: number;
        byStatus: Record<string, number>;
        byConditionGrade: Record<string, number>;
        byZone: Record<string, number>;
      }>(`/inspections/summary?${searchParams}`, { token });
    },
  },

  // Reports
  reports: {
    generate: (inspectionId: string, token: string) =>
      request<{ reportId: string; status: string; pdfUrl: string }>(
        `/reports/inspections/${inspectionId}/generate`,
        { method: 'POST', token }
      ),

    email: (
      inspectionId: string,
      recipients: string[],
      message: string | undefined,
      token: string
    ) =>
      request<{ message: string }>(`/reports/inspections/${inspectionId}/email`, {
        method: 'POST',
        body: JSON.stringify({ recipients, message, includeMedia: false }),
        token,
      }),

    download: (reportId: string, token: string) =>
      request<{ url: string; expiresAt: string }>(`/reports/${reportId}/download`, {
        token,
      }),
  },

  // Users
  users: {
    list: (params: Record<string, string | number | boolean | undefined>, token: string) => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) searchParams.append(key, String(value));
      });
      return request<import('../types').PaginatedResponse<import('../types').User>>(
        `/users?${searchParams}`,
        { token }
      );
    },

    get: (id: string, token: string) =>
      request<import('../types').User>(`/users/${id}`, { token }),

    create: (data: Record<string, unknown>, token: string) =>
      request<import('../types').User>('/users', {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),

    update: (id: string, data: Record<string, unknown>, token: string) =>
      request<import('../types').User>(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),

    delete: (id: string, token: string) =>
      request<void>(`/users/${id}`, { method: 'DELETE', token }),
  },

  // Import
  import: {
    upload: async (file: File, token: string) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/import/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Upload failed' }));
        throw new ApiError(response.status, error.message || error.error, error);
      }

      return response.json() as Promise<{
        uploadId: string;
        filename: string;
        headers: string[];
        totalRows: number;
        preview: Record<string, string>[];
        suggestedMappings: Partial<{
          assetId: string;
          level1: string;
          level2: string;
          level3: string;
          assetCode: string;
          title: string;
          zone: string;
          region: string;
          space: string;
          description: string;
          facility: string;
          specification: string;
          assetType: string;
          system: string;
        }>;
      }>;
    },

    validate: (
      uploadId: string,
      columnMapping: {
        assetId: string;
        level2: string;
        level3: string;
        zone: string;
        level1?: string;
        assetCode?: string;
        title?: string;
        description?: string;
        region?: string;
        space?: string;
        facility?: string;
        specification?: string;
        assetType?: string;
        system?: string;
      },
      skipDuplicates: boolean,
      token: string
    ) =>
      request<{
        valid: boolean;
        totalRows: number;
        validRows: number;
        duplicates: number;
        errors: Array<{ row: number; column: string; error: string }>;
        preview: Array<{
          row: number;
          data: {
            assetId: string;
            level2: string;
            level3: string;
            zone: string;
            level1?: string;
            assetCode?: string;
            title?: string;
            description?: string;
            region?: string;
          };
          status: 'new' | 'duplicate' | 'error';
        }>;
      }>('/import/validate', {
        method: 'POST',
        body: JSON.stringify({ uploadId, columnMapping, skipDuplicates }),
        token,
      }),

    execute: (
      uploadId: string,
      columnMapping: {
        assetId: string;
        level2: string;
        level3: string;
        zone: string;
        level1?: string;
        assetCode?: string;
        title?: string;
        description?: string;
        region?: string;
        space?: string;
        facility?: string;
        specification?: string;
        assetType?: string;
        system?: string;
      },
      skipDuplicates: boolean,
      token: string
    ) =>
      request<{
        batchId: string;
        success: number;
        skipped: number;
        errors: number;
        message: string;
      }>('/import/execute', {
        method: 'POST',
        body: JSON.stringify({ uploadId, columnMapping, skipDuplicates }),
        token,
      }),

    status: (batchId: string, token: string) =>
      request<{
        id: string;
        filename: string;
        rowCount: number;
        successCount: number;
        errorCount: number;
        skipCount: number;
        status: string;
        startedAt: string;
        completedAt: string | null;
      }>(`/import/status/${batchId}`, { token }),

    history: (token: string) =>
      request<
        Array<{
          id: string;
          filename: string;
          rowCount: number;
          successCount: number;
          errorCount: number;
          skipCount: number;
          status: string;
          startedAt: string;
          completedAt: string | null;
        }>
      >('/import/history', { token }),
  },

  // Settings
  settings: {
    get: (token: string) =>
      request<Record<string, unknown>>('/settings', { token }),

    getKey: (key: string, token: string) =>
      request<{ key: string; value: unknown }>(`/settings/${key}`, { token }),

    update: (key: string, value: unknown, token: string) =>
      request<{ key: string; value: unknown }>(`/settings/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
        token,
      }),

    getBranding: () =>
      request<{
        companyName: string;
        primaryColor: string;
        secondaryColor: string;
        logoUrl: string;
      }>('/settings/branding/public'),
  },
};

export { ApiError };
