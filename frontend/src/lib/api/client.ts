// ============================================
// API Client - Axios Configuration
// ============================================

import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import type { ApiResponse, ErrorResponse } from '@/types';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds
});

// Request interceptor - Add auth token
apiClient.interceptors.request.use(
  (config) => {
    // Don't overwrite if Authorization header is already set (check both ways for axios compatibility)
    const existingAuth = config.headers.get ? config.headers.get('Authorization') : config.headers.Authorization;
    if (existingAuth) {
      return config;
    }

    // Get token from localStorage or session
    if (typeof window !== 'undefined') {
      // Check for platform admin token first (for /platform/* and /admin/* routes)
      const platformToken = localStorage.getItem('platform_token');
      const regularToken = localStorage.getItem('token');

      // Use platform token for platform routes, otherwise use regular token
      const url = config.url || '';
      if ((url.startsWith('/platform') || url.startsWith('/admin')) && platformToken) {
        config.headers.set('Authorization', `Bearer ${platformToken}`);
      } else if (regularToken) {
        config.headers.set('Authorization', `Bearer ${regularToken}`);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors globally
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError<ErrorResponse>) => {
    // Handle specific error codes
    if (error.response) {
      const { status, data } = error.response;

      switch (status) {
        case 401:
          // Unauthorized - redirect to appropriate login
          if (typeof window !== 'undefined') {
            const basePath = '/lucent';
            const pathParts = window.location.pathname.split('/');

            // Check if this is a platform admin route
            const isPlatformRoute = pathParts.includes('admin') ||
              error.config?.url?.startsWith('/platform') ||
              error.config?.url?.startsWith('/admin');

            if (isPlatformRoute) {
              // Platform admin - clear platform tokens and redirect to platform login
              localStorage.removeItem('platform_token');
              localStorage.removeItem('platform_admin');
              window.location.href = `${basePath}/login`;
              break;
            }

            // Tenant user - get tenant from stored user or URL
            const storedUser = localStorage.getItem('user');
            let tenantSlug = null;

            if (storedUser) {
              try {
                const user = JSON.parse(storedUser);
                tenantSlug = user.tenant_slug;
              } catch (e) {
                // Ignore parse errors
              }
            }

            // Fallback: try to get tenant from current URL
            if (!tenantSlug) {
              // URL structure: /lucent/{tenant}/... or /{tenant}/...
              if (pathParts[1] === 'lucent' && pathParts[2] && pathParts[2] !== 'login' && pathParts[2] !== 'admin') {
                tenantSlug = pathParts[2];
              } else if (pathParts[1] && pathParts[1] !== 'lucent' && pathParts[1] !== 'login' && pathParts[1] !== 'admin') {
                tenantSlug = pathParts[1];
              }
            }

            localStorage.removeItem('token');
            localStorage.removeItem('user');

            // Redirect to tenant login
            if (tenantSlug) {
              window.location.href = `${basePath}/${tenantSlug}/login`;
            } else {
              window.location.href = `${basePath}/login`;
            }
          }
          break;
        case 403:
          // Forbidden - no permission
          console.error('Permission denied:', data.message);
          break;
        case 429:
          // Rate limit exceeded
          console.error('Rate limit exceeded:', data.message);
          break;
        case 500:
          // Server error
          console.error('Server error:', data.message);
          break;
        default:
          console.error('API error:', data.message);
      }
    } else if (error.request) {
      // Request made but no response
      console.error('Network error: No response from server');
    } else {
      // Error setting up request
      console.error('Request error:', error.message);
    }

    return Promise.reject(error);
  }
);

// ============================================
// API Helper Functions
// ============================================

export const api = {
  // Generic GET request
  get: async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await apiClient.get<T>(url, config);
    return response.data;
  },

  // Generic POST request
  post: async <T, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig
  ): Promise<T> => {
    const response = await apiClient.post<T>(url, data, config);
    return response.data;
  },

  // Generic PUT request
  put: async <T, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig
  ): Promise<T> => {
    const response = await apiClient.put<T>(url, data, config);
    return response.data;
  },

  // Generic DELETE request
  delete: async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await apiClient.delete<T>(url, config);
    return response.data;
  },

  // File upload
  upload: async <T>(
    url: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<T> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<T>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentCompleted);
        }
      },
    });

    return response.data;
  },

  // Download file
  download: async (url: string, filename: string): Promise<void> => {
    const response = await apiClient.get(url, {
      responseType: 'blob',
    });

    // Create download link
    const blob = new Blob([response.data]);
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  },
};

export default apiClient;
