'use client';

import { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { User, Role } from '../../types';
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  UserCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/v1';
const TOKEN_KEY = 'silvertown_access_token';

const roleStyles: Record<Role, string> = {
  ADMIN: 'bg-purple-100 text-purple-700',
  MANAGER: 'bg-blue-100 text-blue-700',
  ENGINEER: 'bg-gray-100 text-gray-700',
};

const roleLabels: Record<Role, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  ENGINEER: 'Engineer',
};

interface UserWithCount extends User {
  _count?: { inspections: number };
}

export default function UsersPage() {
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [users, setUsers] = useState<UserWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedUser, setSelectedUser] = useState<UserWithCount | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    password: '',
    role: 'ENGINEER' as Role,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const itemsPerPage = 15;

  const handleRefresh = () => setRefreshTrigger((prev) => prev + 1);

  // Load token
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      setToken(storedToken);
    }
    setAuthLoading(false);
  }, []);

  // Fetch users
  useEffect(() => {
    if (!token) return;

    const fetchUsers = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.append('page', String(currentPage));
        params.append('limit', String(itemsPerPage));
        if (selectedRole) params.append('role', selectedRole);
        if (searchQuery) params.append('search', searchQuery);

        const response = await fetch(`${API_URL}/users?${params}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          if (response.status === 403) {
            throw new Error('Admin access required');
          }
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
        }

        const data = await response.json();
        setUsers(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalUsers(data.pagination?.total || 0);
      } catch (err) {
        console.error('Failed to load users:', err);
        setError(err instanceof Error ? err.message : 'Failed to load users');
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, [token, currentPage, selectedRole, searchQuery, refreshTrigger]);

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => setCurrentPage(1), 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const openCreateModal = () => {
    setModalMode('create');
    setSelectedUser(null);
    setFormData({
      email: '',
      firstName: '',
      lastName: '',
      password: '',
      role: 'ENGINEER',
    });
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (user: UserWithCount) => {
    setModalMode('edit');
    setSelectedUser(user);
    setFormData({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      password: '',
      role: user.role,
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      if (modalMode === 'create') {
        const response = await fetch(`${API_URL}/users`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || errorData.error || 'Failed to create user');
        }
      } else {
        const response = await fetch(`${API_URL}/users/${selectedUser?.id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            firstName: formData.firstName,
            lastName: formData.lastName,
            role: formData.role,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || errorData.error || 'Failed to update user');
        }
      }

      setShowModal(false);
      handleRefresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (user: UserWithCount) => {
    if (!token) return;
    if (!confirm(`Are you sure you want to deactivate ${user.displayName}?`)) return;

    try {
      const response = await fetch(`${API_URL}/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to deactivate user');
      }

      handleRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to deactivate user');
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
          <p className="text-sm text-gray-500">Please log in to view users.</p>
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
            <h1 className="text-lg font-semibold text-gray-900">Users</h1>
            <p className="text-xs text-gray-500">
              {isLoading ? 'Loading...' : `${totalUsers} users`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openCreateModal}
              className="flex items-center gap-1 px-3 py-1.5 bg-brand-primary text-white text-xs font-medium rounded hover:bg-brand-primary/90"
            >
              <PlusIcon className="w-3 h-3" />
              New User
            </button>
            <button
              onClick={handleRefresh}
              className="p-1.5 text-gray-400 hover:text-gray-600"
              title="Refresh"
            >
              <ArrowPathIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filters */}
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
          <select
            value={selectedRole}
            onChange={(e) => {
              setSelectedRole(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary"
          >
            <option value="">All Roles</option>
            <option value="ADMIN">Admin</option>
            <option value="MANAGER">Manager</option>
            <option value="ENGINEER">Engineer</option>
          </select>
        </div>

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
        {!isLoading && !error && users.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <UserCircleIcon className="w-10 h-10 mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-600 mb-2">No users found</p>
            <p className="text-xs text-gray-400 mb-4">
              {searchQuery || selectedRole
                ? 'Try adjusting your filters'
                : 'Create your first user to get started'}
            </p>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-primary text-white text-xs font-medium rounded hover:bg-brand-primary/90"
            >
              <PlusIcon className="w-4 h-4" />
              New User
            </button>
          </div>
        )}

        {/* Table */}
        {!isLoading && !error && users.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-gray-500 uppercase tracking-wide bg-gray-50">
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Email</th>
                  <th className="text-left px-3 py-2 font-medium">Role</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Last Login</th>
                  <th className="text-right px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-[11px] text-gray-900 font-medium">
                      {user.displayName}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-gray-600">
                      {user.email}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${roleStyles[user.role]}`}>
                        {roleLabels[user.role]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                          user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-gray-600">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'Never'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditModal(user)}
                          className="px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-100 rounded"
                        >
                          Edit
                        </button>
                        {user.isActive && (
                          <button
                            onClick={() => handleDeactivate(user)}
                            className="px-2 py-1 text-[10px] text-red-600 hover:bg-red-50 rounded"
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                <span className="text-[10px] text-gray-500">
                  {(currentPage - 1) * itemsPerPage + 1}-
                  {Math.min(currentPage * itemsPerPage, totalUsers)} of {totalUsers}
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="text-sm font-medium text-gray-900">
                {modalMode === 'create' ? 'Create User' : 'Edit User'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <XMarkIcon className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 rounded p-2">
                  <p className="text-xs text-red-700">{formError}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">First Name *</label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    required
                  />
                </div>
              </div>

              {modalMode === 'create' && (
                <>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Email *</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Password *</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary"
                      required
                      minLength={8}
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Minimum 8 characters</p>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs text-gray-600 mb-1">Role *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-primary"
                >
                  <option value="ENGINEER">Engineer</option>
                  <option value="MANAGER">Manager</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-3 py-1.5 bg-brand-primary text-white text-sm font-medium rounded hover:bg-brand-primary/90 disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : modalMode === 'create' ? 'Create User' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
