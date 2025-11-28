import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { Plus, Trash2, Play, Terminal, RefreshCw, AlertCircle, CheckCircle, XCircle, Globe, Activity, Layers, ArrowRight } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function Designer() {
    const router = useRouter();
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [deploying, setDeploying] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [logs, setLogs] = useState([]);
    const [activeModal, setActiveModal] = useState(null); // 'domain', 'sync', 'confirmDeletions'
    const [formData, setFormData] = useState({});
    const [syncReport, setSyncReport] = useState(null);
    const [pendingDeletions, setPendingDeletions] = useState([]);

    const [showSyncModal, setShowSyncModal] = useState(false);
    const [checkingSync, setCheckingSync] = useState(false);

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = () => {
        fetch('/api/config')
            .then(res => res.json())
            .then(data => {
                setConfig(data);
                setLoading(false);
            });
    };

    const saveConfig = async (newConfig) => {
        setConfig(newConfig);
        await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newConfig)
        });
    };

    const handleCheckSync = async () => {
        setCheckingSync(true);
        try {
            const token = localStorage.getItem('solace_token');
            const res = await fetch('/api/design/sync_check', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setSyncReport(data);
            setShowSyncModal(true);
        } catch (err) {
            console.error(err);
            alert('Failed to check sync status');
        } finally {
            setCheckingSync(false);
        }
    };

    const handlePush = async () => {
        const token = localStorage.getItem('solace_token');
        const orgId = localStorage.getItem('solace_org_id');

        if (!token) return alert('Please configure your API Token in Settings first');

        setDeploying(true);
        setLogs([{ timestamp: new Date().toISOString(), message: 'Starting Push to Portal (Design Phase)...' }]);

        try {
            const res = await fetch('/api/design/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, orgId, confirmDeletions: false })
            });

            const data = await res.json();
            if (data.logs) setLogs(prev => [...prev, ...data.logs]);
            if (!res.ok) throw new Error(data.error || 'Push failed');

            if (data.success) {
                if (data.confirmationRequired) {
                    setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: 'Confirmation Required: Pending Deletions found.' }]);
                    setPendingDeletions(data.pendingDeletions);
                    setActiveModal('confirmDeletions');
                } else {
                    setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: 'Push completed successfully!' }]);
                }
            } else {
                setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: `Push finished with ${data.errorCount} errors. Check logs above.` }]);
            }
            fetchConfig();
        } catch (err) {
            setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: `ERROR: ${err.message}` }]);
        } finally {
            setDeploying(false);
        }
    };

    const confirmPush = async () => {
        const token = localStorage.getItem('solace_token');
        const orgId = localStorage.getItem('solace_org_id');
        setActiveModal(null);
        setDeploying(true);
        setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: 'Confirming deletions and proceeding with Push...' }]);

        try {
            const res = await fetch('/api/design/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, orgId, confirmDeletions: true })
            });

            const data = await res.json();
            if (data.logs) setLogs(prev => [...prev, ...data.logs]);
            if (!res.ok) throw new Error(data.error || 'Push failed');

            if (data.success) {
                if (data.confirmationRequired) {
                    setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: 'Confirmation Required: Pending Deletions found.' }]);
                    setPendingDeletions(data.pendingDeletions);
                    setActiveModal('confirmDeletions');
                } else {
                    setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: 'Push completed successfully!' }]);
                }
            } else {
                setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: `Push finished with ${data.errorCount} errors. Check logs above.` }]);
            }
            fetchConfig();
        } catch (err) {
            setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: `ERROR: ${err.message}` }]);
        } finally {
            setDeploying(false);
            setPendingDeletions([]);
        }
    };

    const handleSync = async () => {
        const token = localStorage.getItem('solace_token');
        const orgId = localStorage.getItem('solace_org_id');

        if (!token) return alert('Please configure your API Token in Settings first');

        setSyncing(true);
        setSyncReport(null);
        setActiveModal('sync');
        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, orgId })
            });
            const data = await res.json();
            setSyncReport(data);
        } catch (err) {
            alert('Sync failed: ' + err.message);
            setActiveModal(null);
        } finally {
            setSyncing(false);
        }
    };

    const handleCreateDomain = () => {
        if (!formData.name) return alert('Name is required');
        const newConfig = { ...config };
        const id = uuidv4();
        newConfig.applicationDomains.push({ id, name: formData.name, description: formData.description || '' });
        saveConfig(newConfig);
        setActiveModal(null);
    };

    const deleteDomain = (index, e) => {
        e.stopPropagation();
        if (!confirm('Are you sure? This will delete the domain and ALL its resources (Applications, Events, Schemas).')) return;

        const newConfig = { ...config };
        const domainId = newConfig.applicationDomains[index].id;

        // Remove domain
        newConfig.applicationDomains.splice(index, 1);

        // Remove related resources
        newConfig.applications = newConfig.applications.filter(a => a.domainId !== domainId);
        newConfig.events = newConfig.events.filter(e => e.domainId !== domainId);
        newConfig.schemas = newConfig.schemas.filter(s => s.domainId !== domainId);

        saveConfig(newConfig);
    };

    const renderSyncStatus = (status) => {
        if (status === 'synced') return <span title="Synced with Solace Cloud" style={{ color: '#10b981', display: 'flex', alignItems: 'center' }}><CheckCircle size={14} /></span>;
        if (status === 'missing_cloud') return <span title="Missing in Solace Cloud" style={{ color: '#f59e0b', display: 'flex', alignItems: 'center' }}><AlertCircle size={14} /></span>;
        if (status === 'not_pushed') return <span title="Not Pushed" style={{ color: '#ef4444', display: 'flex', alignItems: 'center' }}><XCircle size={14} /></span>;
        return null;
    };

    if (loading) return <Layout><div>Loading...</div></Layout>;

    return (
        <Layout>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Application Domains</h1>
                    <p style={{ color: 'var(--muted-foreground)' }}>Select a domain to manage its Applications, Events, and Schemas.</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn btn-secondary" onClick={handleSync} disabled={syncing}>
                        <RefreshCw size={20} style={{ marginRight: '0.5rem', animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
                        Sync
                    </button>
                    <button className="btn btn-secondary" onClick={handleCheckSync} disabled={checkingSync} title="Check for discrepancies between local design and Solace Cloud.">
                        <Activity size={20} style={{ marginRight: '0.5rem', animation: checkingSync ? 'pulse 1s infinite' : 'none' }} />
                        {checkingSync ? 'Checking...' : 'Check Sync'}
                    </button>
                    <button className="btn btn-primary" onClick={handlePush} disabled={deploying} title="Step 1: Push design to Solace Cloud. Step 2: Deploy to broker in Runtime Manager.">
                        <Play size={20} style={{ marginRight: '0.5rem' }} />
                        {deploying ? 'Pushing...' : 'Push to Portal'}
                    </button>
                </div>
            </div>

            {/* Deployment Console */}
            {logs.length > 0 && (
                <div className="card glass-panel" style={{ marginBottom: '2rem', backgroundColor: '#000', fontFamily: 'monospace' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
                        <Terminal size={16} />
                        <span style={{ fontSize: '0.875rem', fontWeight: 'bold' }}>Push Console</span>
                    </div>
                    {logs.some(l => l.message.includes('Success') || l.message.includes('Deployment successful')) && (
                        <div style={{ padding: '0 1rem 1rem 1rem' }}>
                            <button className="btn btn-sm btn-secondary" onClick={() => router.push('/runtime')} style={{ width: '100%', justifyContent: 'center' }}>
                                <Globe size={16} style={{ marginRight: '0.5rem' }} />
                                Go to Runtime Manager to Deploy
                            </button>
                        </div>
                    )}
                    <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.875rem' }}>
                        {logs.map((log, i) => (
                            <div key={i} style={{ marginBottom: '0.25rem' }}>
                                <span style={{ color: '#666', marginRight: '0.5rem' }}>[{log.timestamp.split('T')[1].split('.')[0]}]</span>
                                <span style={{ color: log.message.includes('ERROR') ? '#ef4444' : '#10b981' }}>{log.message}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Domain Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                {/* Create New Domain Card */}
                <div
                    onClick={() => { setFormData({}); setActiveModal('domain'); }}
                    style={{
                        border: '2px dashed var(--border)',
                        borderRadius: 'var(--radius)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2rem',
                        cursor: 'pointer',
                        color: 'var(--muted-foreground)',
                        transition: 'all 0.2s ease'
                    }}
                    className="hover:bg-slate-800/50 hover:border-blue-500/50 hover:text-blue-400"
                >
                    <Plus size={48} style={{ marginBottom: '1rem' }} />
                    <span style={{ fontWeight: 'bold' }}>Create New Domain</span>
                </div>

                {/* Domain Cards */}
                {config.applicationDomains.map((domain, index) => (
                    <div
                        key={domain.id}
                        className="card glass-panel"
                        style={{
                            cursor: 'pointer',
                            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                        onClick={() => router.push(`/domain/${domain.id}`)}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 10px 30px -10px rgba(0,0,0,0.5)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '4px', background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }}></div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                            <div style={{ padding: '0.75rem', borderRadius: '50%', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                                <Layers size={24} />
                            </div>
                            <button
                                onClick={(e) => deleteDomain(index, e)}
                                style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem' }}
                                title="Delete Domain"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>

                        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{domain.name}</h3>
                        <p style={{ color: 'var(--muted-foreground)', fontSize: '0.9rem', marginBottom: '1.5rem', minHeight: '3rem' }}>
                            {domain.description || 'No description provided.'}
                        </p>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                            <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                                {config.applications.filter(a => a.domainId === domain.id).length} Apps
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', fontSize: '0.875rem', fontWeight: 'bold' }}>
                                Open <ArrowRight size={16} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* --- MODALS --- */}

            {/* Domain Modal */}
            <Modal isOpen={activeModal === 'domain'} onClose={() => setActiveModal(null)} title="Create Application Domain" footer={<button className="btn btn-primary" onClick={handleCreateDomain}>Create</button>}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Name <span style={{ color: 'red' }}>*</span></label>
                        <input type="text" className="input" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Retail" />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Description</label>
                        <textarea className="input" value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Optional description" />
                    </div>
                </div>
            </Modal>

            {/* Sync Modal */}
            <Modal isOpen={activeModal === 'sync'} onClose={() => setActiveModal(null)} title="Sync Report">
                {syncing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem 1rem' }}>
                        <RefreshCw size={48} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)', marginBottom: '1.5rem' }} />
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Syncing with Solace Cloud...</h3>
                        <p style={{ color: 'var(--muted-foreground)', textAlign: 'center' }}>Fetching all resources...</p>
                    </div>
                ) : (
                    syncReport && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {Object.entries(syncReport).map(([type, items]) => (
                                <div key={type}>
                                    <h4 style={{ textTransform: 'capitalize', marginBottom: '0.5rem', borderBottom: '1px solid #333' }}>{type}</h4>
                                    {items.length === 0 ? <p style={{ color: '#666' }}>No items</p> : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {items.map(item => (
                                                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                                                    <span>{item.name}</span>
                                                    {renderSyncStatus(item.status)}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )
                )}
            </Modal>

            {/* Deletion Confirmation Modal */}
            <Modal isOpen={activeModal === 'confirmDeletions'} onClose={() => setActiveModal(null)} title="Confirm Deletions" footer={
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                    <button className="btn btn-primary" style={{ backgroundColor: '#ef4444' }} onClick={confirmPush}>Confirm & Delete</button>
                </div>
            }>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: 'var(--radius)', color: '#ef4444' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                            <AlertCircle size={20} />
                            Warning: Destructive Actions Required
                        </div>
                        <p style={{ fontSize: '0.9rem' }}>
                            The following existing configurations must be deleted before the new design can be applied.
                            This is necessary to avoid duplicate configuration errors.
                        </p>
                    </div>

                    <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #333', borderRadius: 'var(--radius)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead style={{ backgroundColor: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                                <tr>
                                    <th style={{ padding: '0.75rem' }}>Type</th>
                                    <th style={{ padding: '0.75rem' }}>Name</th>
                                    <th style={{ padding: '0.75rem' }}>Broker</th>
                                    <th style={{ padding: '0.75rem' }}>Count</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingDeletions.map((item, i) => (
                                    <React.Fragment key={i}>
                                        <tr style={{ borderTop: '1px solid #333', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                                            <td style={{ padding: '0.75rem' }}>{item.type}</td>
                                            <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{item.name}</td>
                                            <td style={{ padding: '0.75rem', color: 'var(--muted-foreground)' }}>{item.broker}</td>
                                            <td style={{ padding: '0.75rem' }}>{item.count}</td>
                                        </tr>
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>

            {/* Sync Report Modal */}
            {showSyncModal && syncReport && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '800px', width: '90%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Synchronization Report</h2>
                            <button className="btn btn-secondary" onClick={() => setShowSyncModal(false)}><XCircle size={24} /></button>
                        </div>

                        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                            {syncReport.applications.map((app, idx) => (
                                <div key={idx} style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius)', borderLeft: `4px solid ${app.status === 'synced' ? '#10b981' : '#ef4444'}` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <h3 style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{app.name}</h3>
                                        <span style={{
                                            padding: '0.25rem 0.75rem',
                                            borderRadius: '1rem',
                                            fontSize: '0.75rem',
                                            backgroundColor: app.status === 'synced' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                            color: app.status === 'synced' ? '#10b981' : '#ef4444'
                                        }}>
                                            {app.status === 'synced' ? 'Synced' : 'Discrepancies Found'}
                                        </span>
                                    </div>
                                    {app.issues.length > 0 && (
                                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                            {app.issues.map((issue, i) => (
                                                <li key={i} style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--muted-foreground)', fontSize: '0.9rem', display: 'flex', alignItems: 'start', gap: '0.5rem' }}>
                                                    <AlertCircle size={16} style={{ marginTop: '3px', color: '#ef4444' }} />
                                                    {issue}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {app.issues.length === 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', fontSize: '0.9rem' }}>
                                            <CheckCircle size={16} />
                                            Configuration matches Solace Cloud
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary" onClick={() => setShowSyncModal(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
