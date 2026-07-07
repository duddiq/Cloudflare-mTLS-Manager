/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent } from 'react';
import { ShieldCheck, Plus, Search, Trash2, Key, RefreshCcw, Users, User, Menu, X, UserCheck, Globe, Moon, Sun } from 'lucide-react';
import { CreateCertificateModal } from './components/CreateCertificateModal';
import { CertificateDetailsModal } from './components/CertificateDetailsModal';
import type { Certificate } from './types';
import { format } from 'date-fns';

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
    }
    return 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const [certs, setCerts] = useState<Certificate[]>([]);
  const [currentUser, setCurrentUser] = useState<{ email: string; role: string } | null>(null);
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  // Navigation, Sidebar & Filtering States
  const [activeTab, setActiveTab] = useState<'my-certs' | 'all-certs' | 'users' | 'hostnames'>('my-certs');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'revoked'>('all');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Users management states
  const [usersList, setUsersList] = useState<{ email: string; role: string; createdAt: string }[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);

  // Hostname associations states
  const [associations, setAssociations] = useState<{ hostname: string; mtls_certificate_id?: string | null; createdAt: string }[]>([]);
  const [isAssocsLoading, setIsAssocsLoading] = useState(false);
  const [newHostname, setNewHostname] = useState('');
  const [isAddingAssoc, setIsAddingAssoc] = useState(false);
  const [assocError, setAssocError] = useState('');
  const [assocToDelete, setAssocToDelete] = useState<string | null>(null);

  const fetchCerts = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/certs');
      const data = await res.json() as { certs: Certificate[] };
      if (res.ok) {
        setCerts(data.certs);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/me');
      const data = await res.json() as { user: { email: string; role: string } };
      if (res.ok) {
        setCurrentUser(data.user);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    try {
      setIsUsersLoading(true);
      const res = await fetch('/api/users');
      const data = await res.json() as { users: any[] };
      if (res.ok) {
        setUsersList(data.users);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUsersLoading(false);
    }
  };

  const fetchAssociations = async () => {
    try {
      setIsAssocsLoading(true);
      const res = await fetch('/api/hostname-associations');
      const data = await res.json() as { associations: any[] };
      if (res.ok) {
        setAssociations(data.associations);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAssocsLoading(false);
    }
  };

  useEffect(() => {
    fetchCerts();
    fetchUser();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'hostnames') {
      fetchAssociations();
    }
  }, [activeTab]);

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this certificate? This will prevent the device from accessing the network.')) return;
    try {
      const res = await fetch(`/api/certs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchCerts();
      } else {
        alert('Failed to revoke certificate.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRestore = async (id: string) => {
    if (!confirm('Are you sure you want to restore this certificate? This will allow the device to connect to the network again.')) return;
    try {
      const res = await fetch(`/api/certs/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        fetchCerts();
      } else {
        alert('Failed to restore certificate.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRoleChange = async (email: string, newRole: 'admin' | 'user') => {
    if (email === currentUser?.email) {
      alert('You cannot change your own role.');
      return;
    }
    if (!confirm(`Are you sure you want to change the role of ${email} to ${newRole}?`)) {
      fetchUsers();
      return;
    }
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(email)}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        fetchUsers();
        fetchCerts();
      } else {
        const errData = await res.json() as { error?: string };
        alert(errData.error || 'Failed to update user role.');
        fetchUsers();
      }
    } catch (err) {
      console.error(err);
      alert('Failed to update user role due to network error.');
      fetchUsers();
    }
  };

  const handleAddAssociation = async (e: FormEvent) => {
    e.preventDefault();
    if (!newHostname.trim()) return;
    setIsAddingAssoc(true);
    setAssocError('');
    try {
      const res = await fetch('/api/hostname-associations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ hostname: newHostname.trim() })
      });
      if (res.ok) {
        setNewHostname('');
        fetchAssociations();
      } else {
        const errData = await res.json() as { error?: string };
        setAssocError(errData.error || 'Failed to add hostname association.');
      }
    } catch (err) {
      console.error(err);
      setAssocError('Failed to add hostname association due to a network error.');
    } finally {
      setIsAddingAssoc(false);
    }
  };

  const handleDeleteAssociation = (hostname: string) => {
    setAssocToDelete(hostname);
  };

  const confirmDeleteAssociation = async () => {
    if (!assocToDelete) return;
    try {
      const res = await fetch(`/api/hostname-associations/${encodeURIComponent(assocToDelete)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchAssociations();
      } else {
        const errData = await res.json() as { error?: string };
        alert(errData.error || 'Failed to remove hostname association.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to remove hostname association due to a network error.');
    } finally {
      setAssocToDelete(null);
    }
  };

  // Filter logic: tab + status + search query
  const filteredCerts = certs.filter(c => {
    // 1. Filter by active tab (owner restriction)
    if (activeTab === 'my-certs' && currentUser) {
      if (c.issuedTo !== currentUser.email) return false;
    }
    
    // 2. Filter by active/revoked status
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;

    // 3. Filter by search query
    return (
      c.commonName.toLowerCase().includes(search.toLowerCase()) ||
      c.issuedTo.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-150 font-sans selection:bg-indigo-100 dark:selection:bg-indigo-900 selection:text-indigo-900 flex overflow-x-hidden">
      {/* Mobile Sidebar Backdrop Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 md:hidden animate-in fade-in duration-200" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Menu */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col h-screen transition-transform duration-300 ease-in-out shrink-0 md:static md:translate-x-0 md:h-screen md:sticky md:top-0 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        {/* Sidebar Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-md font-bold tracking-tight text-gray-900 dark:text-gray-100">mTLS Manager</h1>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold tracking-wider uppercase">Zero Trust</p>
            </div>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)} 
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-505 dark:hover:text-gray-300 dark:hover:bg-gray-800 rounded-lg md:hidden transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 p-4 space-y-6 overflow-y-auto">
          {/* User Section */}
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-2 mb-2">User Space</p>
            <button
              onClick={() => {
                setActiveTab('my-certs');
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'my-certs' 
                  ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 shadow-sm shadow-indigo-100/50 dark:shadow-none' 
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              <Key className="w-4 h-4 shrink-0" />
              My Certificates
            </button>
          </div>

          {/* Admin Section */}
          {currentUser?.role === 'admin' && (
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-gray-400 dark:text-gray-505 uppercase tracking-wider px-2 mb-2">Admin Space</p>
              <button
                onClick={() => {
                  setActiveTab('all-certs');
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === 'all-certs' 
                    ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 shadow-sm shadow-indigo-100/50 dark:shadow-none' 
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                All Certificates
              </button>

              <button
                onClick={() => {
                  setActiveTab('users');
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === 'users' 
                    ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 shadow-sm shadow-indigo-100/50 dark:shadow-none' 
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <UserCheck className="w-4 h-4 shrink-0" />
                Manage Users
              </button>

              <button
                onClick={() => {
                  setActiveTab('hostnames');
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === 'hostnames' 
                    ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 shadow-sm shadow-indigo-100/50 dark:shadow-none' 
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <Globe className="w-4 h-4 shrink-0" />
                mTLS Hostnames
              </button>
            </div>
          )}
        </div>

        {/* Bottom Profile Section */}
        {currentUser && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex items-center gap-3">
            <div className="w-9 h-9 bg-gray-200 dark:bg-gray-800 rounded-full flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate" title={currentUser.email}>
                {currentUser.email}
              </p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                currentUser.role === 'admin' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-450' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-455'
              }`}>
                {currentUser.role}
              </span>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Top Header */}
        <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 h-16 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-xl md:hidden shrink-0 transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 leading-snug">
                {activeTab === 'my-certs' && 'My Certificates'}
                {activeTab === 'all-certs' && 'All Certificates'}
                {activeTab === 'users' && 'Manage Users'}
                {activeTab === 'hostnames' && 'mTLS Hostnames'}
              </h2>
              <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                {activeTab === 'users' && 'Administer access control lists and user roles'}
                {activeTab === 'hostnames' && 'Configure which domains require mTLS client certificate verification'}
                {activeTab !== 'users' && activeTab !== 'hostnames' && 'Manage device authentication credentials'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors border border-transparent dark:border-transparent"
              title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            >
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
            {activeTab !== 'users' && activeTab !== 'hostnames' && (
              <button 
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Certificate</span>
                <span className="sm:hidden">New</span>
              </button>
            )}
          </div>
        </header>

        {/* Body Content */}
        <main className="flex-1 p-4 sm:p-8 overflow-y-auto">
          {activeTab === 'users' ? (
            <div className="space-y-6">
              {/* Toolbar */}
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-gray-400 dark:text-gray-505 uppercase tracking-wider">Registered Accounts</h3>
                <button 
                  onClick={fetchUsers}
                  className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-sm font-medium"
                >
                  <RefreshCcw className="w-4 h-4" />
                  Refresh
                </button>
              </div>

              {/* Users Table */}
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 font-medium">
                      <tr>
                        <th className="px-6 py-4">User Email</th>
                        <th className="px-6 py-4">Role</th>
                        <th className="px-6 py-4">Registered On</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {isUsersLoading ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                            Loading users...
                          </td>
                        </tr>
                      ) : usersList.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                            No users found.
                          </td>
                        </tr>
                      ) : (
                        usersList.map(user => (
                          <tr key={user.email} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                            <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                              {user.email}
                              {user.email === currentUser?.email && (
                                <span className="ml-2 text-[10px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                  You
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                user.role === 'admin' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                              }`}>
                                {user.role === 'admin' ? 'Administrator' : 'User'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                              {user.createdAt ? format(new Date(user.createdAt), 'MMM d, yyyy HH:mm') : 'N/A'}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <select
                                value={user.role}
                                disabled={user.email === currentUser?.email}
                                onChange={(e) => handleRoleChange(user.email, e.target.value as 'admin' | 'user')}
                                className="bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-800 dark:text-gray-250 focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                              >
                                <option value="user">Change to User</option>
                                <option value="admin">Change to Admin</option>
                              </select>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : activeTab === 'hostnames' ? (
            <div className="space-y-6">
              {/* Toolbar & Add Association Form */}
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Associate Domain with mTLS</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Specify hostnames/subdomains for which Cloudflare should enforce mTLS client certificate verification.</p>
                </div>
                <form onSubmit={handleAddAssociation} className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Globe className="w-4 h-4 text-gray-400 dark:text-gray-505 absolute left-3 top-3" />
                    <input 
                      type="text" 
                      placeholder="e.g. api.yourdomain.com"
                      value={newHostname}
                      onChange={e => setNewHostname(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all outline-none text-sm"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isAddingAssoc}
                    className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm disabled:opacity-50"
                  >
                    {isAddingAssoc ? 'Associating...' : 'Associate Domain'}
                  </button>
                </form>
                {assocError && (
                  <p className="text-xs text-red-600 font-semibold">{assocError}</p>
                )}
              </div>

              {/* Associations List Table */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-gray-400 dark:text-gray-505 uppercase tracking-wider">Associated Hostnames</h3>
                  <button 
                    onClick={fetchAssociations}
                    className="flex items-center gap-2 text-gray-600 dark:text-gray-450 hover:text-gray-900 dark:hover:text-gray-205 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-sm font-medium"
                  >
                    <RefreshCcw className="w-4 h-4" />
                    Refresh
                  </button>
                </div>

                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 font-medium">
                        <tr>
                          <th className="px-6 py-4">Domain (Hostname)</th>
                          <th className="px-6 py-4">Certificate Authority ID</th>
                          <th className="px-6 py-4">Associated On</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {isAssocsLoading ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                              Loading associations...
                            </td>
                          </tr>
                        ) : associations.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                              No domain associations found.
                            </td>
                          </tr>
                        ) : (
                          associations.map(assoc => (
                            <tr key={assoc.hostname} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                              <td className="px-6 py-4 font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                                {assoc.hostname}
                              </td>
                              <td className="px-6 py-4">
                                <span className="font-mono text-xs text-gray-500 dark:text-gray-450 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                  {assoc.mtls_certificate_id || 'Cloudflare Managed CA'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                                {assoc.createdAt ? format(new Date(assoc.createdAt), 'MMM d, yyyy HH:mm') : 'N/A'}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <button 
                                  onClick={() => handleDeleteAssociation(assoc.hostname)}
                                  className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 hover:bg-red-50 dark:hover:bg-red-950/30 p-2 rounded-lg transition-colors"
                                  title="Remove Domain Association"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Actions Bar */}
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
                <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto flex-1">
                  {/* Search */}
                  <div className="relative w-full sm:w-80">
                    <Search className="w-4 h-4 text-gray-400 dark:text-gray-505 absolute left-3 top-3" />
                    <input 
                      type="text" 
                      placeholder="Search certificates..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all outline-none text-sm"
                    />
                  </div>

                  {/* Status Filter */}
                  <div className="flex items-center bg-gray-100 dark:bg-gray-900 p-1 rounded-xl shrink-0 border border-gray-200 dark:border-gray-800 w-fit">
                    <button
                      onClick={() => setStatusFilter('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        statusFilter === 'all' 
                          ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' 
                          : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-350'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setStatusFilter('active')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        statusFilter === 'active' 
                          ? 'bg-white dark:bg-gray-800 text-green-700 dark:text-green-400 shadow-sm' 
                          : 'text-gray-500 hover:text-green-700 dark:hover:text-green-400'
                      }`}
                    >
                      Active
                    </button>
                    <button
                      onClick={() => setStatusFilter('revoked')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        statusFilter === 'revoked' 
                          ? 'bg-white dark:bg-gray-800 text-red-700 dark:text-red-450 shadow-sm' 
                          : 'text-gray-500 hover:text-red-700 dark:hover:text-red-400'
                      }`}
                    >
                      Revoked
                    </button>
                  </div>
                </div>

                <button 
                  onClick={fetchCerts}
                  className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-sm font-medium"
                >
                  <RefreshCcw className="w-4 h-4" />
                  Refresh
                </button>
              </div>

              {/* Certificate List Table */}
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 font-medium">
                      <tr>
                        <th className="px-6 py-4">Common Name</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Issued To</th>
                        <th className="px-6 py-4">Expires On</th>
                        <th className="px-6 py-4">Serial Number</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {isLoading ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                            Loading certificates...
                          </td>
                        </tr>
                      ) : filteredCerts.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                            <Key className="w-12 h-12 text-gray-305 dark:text-gray-600 mx-auto mb-3" />
                            <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">No certificates found</p>
                            <p className="text-sm">Create a new certificate to restrict access to your applications.</p>
                          </td>
                        </tr>
                      ) : (
                        filteredCerts.map(cert => (
                          <tr 
                            key={cert.id} 
                            onClick={() => setSelectedCert(cert)}
                            className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 cursor-pointer select-none transition-colors"
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${cert.status === 'active' ? 'bg-green-100 dark:bg-green-950/40' : 'bg-red-100 dark:bg-red-950/40'}`}>
                                  <Key className={`w-4 h-4 ${cert.status === 'active' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} />
                                </div>
                                <span className="font-medium text-gray-900 dark:text-gray-100">{cert.commonName}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                cert.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400'
                              }`}>
                                {cert.status.charAt(0).toUpperCase() + cert.status.slice(1)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                              {cert.issuedTo}
                            </td>
                            <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                              {format(new Date(cert.expiresOn), 'MMM d, yyyy')}
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-mono text-xs text-gray-500 dark:text-gray-455 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                {cert.serialNumber || 'N/A'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              {cert.status === 'active' ? (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRevoke(cert.id);
                                  }}
                                  className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 hover:bg-red-50 dark:hover:bg-red-950/40 p-2 rounded-lg transition-colors"
                                  title="Revoke Certificate"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              ) : (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRestore(cert.id);
                                  }}
                                  className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 hover:bg-green-50 dark:hover:bg-green-950/40 p-2 rounded-lg transition-colors"
                                  title="Restore Certificate"
                                >
                                  <RefreshCcw className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <CreateCertificateModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={fetchCerts} 
        userRole={currentUser?.role || 'user'}
      />
      <CertificateDetailsModal
        isOpen={!!selectedCert}
        onClose={() => setSelectedCert(null)}
        certificate={selectedCert}
        onRevoke={handleRevoke}
        onRestore={handleRestore}
        onUpdate={fetchCerts}
        isAdmin={currentUser?.role === 'admin'}
      />

      {assocToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-sm transition-all duration-300">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-100 dark:border-gray-800 transform transition-all duration-300 scale-100 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="space-y-2 flex-1">
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Remove Domain Association</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  Are you sure you want to remove the hostname association for <span className="font-semibold text-gray-900 dark:text-gray-100">{assocToDelete}</span>? 
                  Cloudflare will stop validating client certificates for requests to this domain.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setAssocToDelete(null)}
                className="px-4 py-2 border border-gray-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteAssociation}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm shadow-red-100"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
