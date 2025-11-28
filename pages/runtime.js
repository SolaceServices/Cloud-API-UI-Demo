import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { Server, Globe, Play, Terminal, AlertCircle, CheckCircle, XCircle, Settings } from 'lucide-react';

export default function Runtime() {
    const [environments, setEnvironments] = useState([]);
    const [meshes, setMeshes] = useState([]);
    const [config, setConfig] = useState({ applications: [] });
    const [selectedEnv, setSelectedEnv] = useState('');
    const [logs, setLogs] = useState([]);
    const [deploying, setDeploying] = useState(false);
    const [activeModal, setActiveModal] = useState(null);
    const [selectedApp, setSelectedApp] = useState(null);
    const [selectedVersionId, setSelectedVersionId] = useState('');
    const [selectedVersion, setSelectedVersion] = useState(null);
    const [formData, setFormData] = useState({});
    const [selectedMesh, setSelectedMesh] = useState('');
    const [debugData, setDebugData] = useState(null);

    useEffect(() => {
        fetchEnvironments();
        fetchMeshes();
        fetchConfig();
    }, []);

    const fetchEnvironments = async () => {
        const token = localStorage.getItem('solace_token');
        if (!token) return;
        try {
            const res = await fetch('/api/runtime/environments', { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) {
                console.error('Failed to fetch environments:', res.status);
                return;
            }
            const data = await res.json();
            setEnvironments(Array.isArray(data) ? data : []);

            // Try to restore selected env from localStorage
            const savedEnv = localStorage.getItem('solace_runtime_env');
            if (savedEnv && data.find(e => e.name === savedEnv)) {
                setSelectedEnv(savedEnv);
            } else if (data.length > 0) {
                setSelectedEnv(data[0].name);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const fetchMeshes = async () => {
        const token = localStorage.getItem('solace_token');
        if (!token) return;
        try {
            const res = await fetch('/api/runtime/meshes', { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) {
                console.error('Failed to fetch meshes:', res.status);
                return;
            }
            const data = await res.json();
            console.log('Meshes received:', data);
            setMeshes(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchConfig = async () => {
        const res = await fetch(`/api/config?t=${Date.now()}`);
        const data = await res.json();
        setConfig(data);
    };

    const handleDeploy = async () => {
        if (!selectedApp || !selectedVersionId || !selectedMesh) return;

        const token = localStorage.getItem('solace_token');
        setDeploying(true);
        setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: `Starting deployment of ${selectedApp.name} to ${selectedMesh}...` }]);
        setActiveModal(null);

        try {
            const res = await fetch('/api/runtime/deploy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    environment: selectedEnv,
                    eventMeshId: selectedMesh,
                    applicationVersionId: selectedVersionId
                })
            });

            const data = await res.json();
            if (data.logs) setLogs(prev => [...prev, ...data.logs]);

            if (res.ok && data.success) {
                setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: 'Deployment successful!' }]);
            } else {
                throw new Error(data.error || 'Deployment failed');
            }
        } catch (err) {
            setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: `ERROR: ${err.message}` }]);
        } finally {
            setDeploying(false);
        }
    };

    const openDeployModal = (app) => {
        setSelectedApp(app);
        // Default to latest version
        if (app.versions.length > 0) {
            setSelectedVersionId(app.versions[app.versions.length - 1].solaceId);
        }
        setActiveModal('deploy');
    };

    const openConfigModal = (app, version) => {
        setSelectedApp(app);
        setSelectedVersion(version);
        setFormData({
            clientUsername: version.messagingSettings?.clientUsername || '',
            clientProfileName: version.messagingSettings?.clientProfile?.name || '',
            guaranteedMessagingEnabled: !!version.messagingSettings?.guaranteedMessaging,
            accessType: version.messagingSettings?.guaranteedMessaging?.accessType || 'exclusive',
            queueName: version.messagingSettings?.guaranteedMessaging?.queueName || '',
            maxMsgSpoolUsage: version.messagingSettings?.guaranteedMessaging?.maxMsgSpoolUsage || 1500,
            maxTtl: version.messagingSettings?.guaranteedMessaging?.maxTtl || 0,
            respectTtl: version.messagingSettings?.guaranteedMessaging?.respectTtl !== false
        });
        setActiveModal('config');
    };

    const handlePushConfig = async () => {
        if (!selectedApp || !selectedVersion) return;

        const token = localStorage.getItem('solace_token');
        setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: `Pushing runtime configuration for ${selectedApp.name} v${selectedVersion.version}...` }]);
        setActiveModal(null);

        try {
            // Update local config
            const newConfig = { ...config };
            const appIndex = newConfig.applications.findIndex(a => a.id === selectedApp.id);
            const versionIndex = newConfig.applications[appIndex].versions.findIndex(v => v.id === selectedVersion.id);

            const messagingSettings = {
                clientUsername: formData.clientUsername,
                clientProfile: { name: formData.clientProfileName },
                guaranteedMessaging: formData.guaranteedMessagingEnabled ? {
                    accessType: formData.accessType,
                    queueName: formData.queueName,
                    maxMsgSpoolUsage: parseInt(formData.maxMsgSpoolUsage),
                    maxTtl: parseInt(formData.maxTtl),
                    respectTtl: formData.respectTtl
                } : null
            };

            newConfig.applications[appIndex].versions[versionIndex] = {
                ...selectedVersion,
                messagingSettings
            };

            // Save to local config
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newConfig)
            });

            // Push to Solace Cloud via design/push
            const res = await fetch('/api/design/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });

            const data = await res.json();
            if (data.logs) setLogs(prev => [...prev, ...data.logs]);

            if (res.ok && data.success) {
                setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: 'Runtime configuration pushed successfully!' }]);
                fetchConfig();
            } else {
                throw new Error(data.error || 'Push failed');
            }
        } catch (err) {
            setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: `ERROR: ${err.message}` }]);
        }
    };

    const currentEnvId = environments.find(e => e.name === selectedEnv)?.id;
    const availableMeshes = meshes.filter(m => m.environmentId === currentEnvId);
    const currentMesh = availableMeshes.find(m => m.id === selectedMesh);

    // Auto-select mesh when environment changes, respecting localStorage
    useEffect(() => {
        if (availableMeshes.length > 0) {
            const savedMesh = localStorage.getItem('solace_runtime_mesh');
            // Only use saved mesh if it belongs to the current environment
            if (savedMesh && availableMeshes.find(m => m.id === savedMesh)) {
                if (selectedMesh !== savedMesh) setSelectedMesh(savedMesh);
            } else if (!selectedMesh || !availableMeshes.find(m => m.id === selectedMesh)) {
                setSelectedMesh(availableMeshes[0].id);
            }
        }
    }, [currentEnvId, availableMeshes.length, availableMeshes]); // Added availableMeshes to dependency

    return (
        <Layout>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Runtime Manager</h1>
                    <p style={{ color: 'var(--muted-foreground)' }}>Manage deployments to Event Brokers</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Globe size={20} />
                    <select
                        className="input"
                        style={{ width: '200px' }}
                        value={selectedEnv}
                        onChange={e => {
                            setSelectedEnv(e.target.value);
                            localStorage.setItem('solace_runtime_env', e.target.value);
                            // Clear mesh selection when env changes to force re-evaluation
                            setSelectedMesh('');
                            localStorage.removeItem('solace_runtime_mesh');
                        }}
                    >
                        {environments.map(env => <option key={env.id} value={env.name}>{env.name}</option>)}
                    </select>
                    {availableMeshes.length > 1 && (
                        <>
                            <Server size={20} />
                            <select
                                className="input"
                                style={{ width: '200px' }}
                                value={selectedMesh}
                                onChange={e => {
                                    setSelectedMesh(e.target.value);
                                    localStorage.setItem('solace_runtime_mesh', e.target.value);
                                }}
                            >
                                {availableMeshes.map(mesh => <option key={mesh.id} value={mesh.id}>{mesh.name}</option>)}
                            </select>
                        </>
                    )}
                </div>
            </div>

            {/* Mesh Info */}
            <div className="card glass-panel" style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                    <Server size={24} style={{ color: 'var(--primary)' }} />
                    <div>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{currentMesh ? currentMesh.name : 'No Mesh Found'}</h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                            {currentMesh?.brokers?.length || 0} Connected Brokers
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }} onClick={fetchMeshes}>Refresh Meshes</button>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }} onClick={async () => {
                                const token = localStorage.getItem('solace_token');
                                const res = await fetch('/api/debug_app', { headers: { Authorization: `Bearer ${token}` } });
                                const data = await res.json();
                                setDebugData(JSON.stringify(data, null, 2));
                            }}>Debug App</button>
                        </div>
                        {debugData && (
                            <div style={{ marginTop: '1rem', background: '#1e1e1e', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.5rem', borderBottom: '1px solid #333' }}>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                        onClick={() => navigator.clipboard.writeText(debugData)}
                                    >
                                        Copy
                                    </button>
                                </div>
                                <pre style={{ padding: '1rem', margin: 0, overflow: 'auto', maxHeight: '400px', fontSize: '0.75rem' }}>
                                    {debugData}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>
                {currentMesh?.brokers?.map(broker => (
                    <div key={broker.id} style={{ padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius)', fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{broker.name}</span>
                        <span style={{ color: '#10b981' }}>Connected</span>
                    </div>
                ))}
            </div>

            {/* Deployment Console */}
            {logs.length > 0 && (
                <div className="card glass-panel" style={{ marginBottom: '2rem', backgroundColor: '#000', fontFamily: 'monospace' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
                        <Terminal size={16} />
                        <span style={{ fontSize: '0.875rem', fontWeight: 'bold' }}>Runtime Console</span>
                    </div>
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

            {/* Applications Table */}
            <div className="card glass-panel">
                <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Applications</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                            <th style={{ padding: '1rem' }}>Name</th>
                            <th style={{ padding: '1rem' }}>Domain</th>
                            <th style={{ padding: '1rem' }}>Latest Version</th>
                            <th style={{ padding: '1rem' }}>Runtime Config</th>
                            <th style={{ padding: '1rem' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {config.applications.map(app => (
                            <tr key={app.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '1rem', fontWeight: '500' }}>{app.name}</td>
                                <td style={{ padding: '1rem', color: 'var(--muted-foreground)' }}>
                                    {config.applicationDomains.find(d => d.id === app.domainId)?.name}
                                </td>
                                <td style={{ padding: '1rem' }}>
                                    {app.versions.length > 0 ? `v${app.versions[app.versions.length - 1].version}` : '-'}
                                </td>
                                <td style={{ padding: '1rem' }}>
                                    {app.versions.length > 0 ? (
                                        <button
                                            className="btn btn-secondary"
                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                                            onClick={() => openConfigModal(app, app.versions[app.versions.length - 1])}
                                        >
                                            <Settings size={14} />
                                        </button>
                                    ) : '-'}
                                </td>
                                <td style={{ padding: '1rem', display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        className="btn btn-primary"
                                        style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}
                                        onClick={() => openDeployModal(app)}
                                        disabled={app.versions.length === 0}
                                    >
                                        <Play size={14} style={{ marginRight: '0.25rem' }} />
                                        Deploy
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Deploy Modal */}
            <Modal
                isOpen={activeModal === 'deploy'}
                onClose={() => setActiveModal(null)}
                title={`Deploy ${selectedApp?.name}`}
                footer={<button className="btn btn-primary" onClick={handleDeploy} disabled={deploying || !selectedVersionId || !selectedMesh}>{deploying ? 'Deploying...' : 'Confirm Deployment'}</button>}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Target Environment</label>
                        <input type="text" className="input" value={selectedEnv} disabled />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Target Mesh</label>
                        <select
                            className="input"
                            value={selectedMesh}
                            onChange={e => setSelectedMesh(e.target.value)}
                        >
                            <option value="">Select Mesh</option>
                            {availableMeshes.map(mesh => <option key={mesh.id} value={mesh.id}>{mesh.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Version to Deploy</label>
                        <select
                            className="input"
                            value={selectedVersionId}
                            onChange={e => setSelectedVersionId(e.target.value)}
                        >
                            <option value="">Select Version</option>
                            {selectedApp?.versions.map(v => (
                                <option key={v.id} value={v.solaceId} disabled={!v.solaceId}>
                                    v{v.version} {v.solaceId ? '' : '(Not Pushed)'}
                                </option>
                            ))}
                        </select>
                        {!selectedVersionId && <small style={{ color: 'red' }}>Please select a version (must be pushed to portal first)</small>}
                    </div>
                </div>
            </Modal>

            {/* Runtime Config Modal */}
            <Modal
                isOpen={activeModal === 'config'}
                onClose={() => setActiveModal(null)}
                title={`Runtime Configuration - ${selectedApp?.name} v${selectedVersion?.version}`}
                footer={<button className="btn btn-primary" onClick={handlePushConfig}>Push Configuration</button>}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Client Settings */}
                    <div>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>Client Settings</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Client Username</label>
                                <input type="text" className="input" value={formData.clientUsername || ''} onChange={e => setFormData({ ...formData, clientUsername: e.target.value })} placeholder="e.g., my-app-user" />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Client Profile</label>
                                <input type="text" className="input" value={formData.clientProfileName || ''} onChange={e => setFormData({ ...formData, clientProfileName: e.target.value })} placeholder="e.g., default" />
                            </div>
                        </div>
                    </div>

                    {/* Guaranteed Messaging */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                            <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Guaranteed Messaging</h4>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                                <input type="checkbox" checked={formData.guaranteedMessagingEnabled || false} onChange={e => setFormData({ ...formData, guaranteedMessagingEnabled: e.target.checked })} />
                                <span>Enable</span>
                            </label>
                        </div>

                        {formData.guaranteedMessagingEnabled && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem' }}>Queue Name (Optional)</label>
                                    <input type="text" className="input" value={formData.queueName || ''} onChange={e => setFormData({ ...formData, queueName: e.target.value })} placeholder="Leave empty for auto-generated" />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Access Type</label>
                                        <select className="input" value={formData.accessType || 'exclusive'} onChange={e => setFormData({ ...formData, accessType: e.target.value })}>
                                            <option value="exclusive">Exclusive</option>
                                            <option value="non-exclusive">Non-Exclusive</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Max Spool Usage (MB)</label>
                                        <input type="number" className="input" value={formData.maxMsgSpoolUsage || 1500} onChange={e => setFormData({ ...formData, maxMsgSpoolUsage: e.target.value })} />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Max TTL (seconds)</label>
                                        <input type="number" className="input" value={formData.maxTtl || 0} onChange={e => setFormData({ ...formData, maxTtl: e.target.value })} placeholder="0 for infinite" />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', marginTop: '1.75rem' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={formData.respectTtl !== false} onChange={e => setFormData({ ...formData, respectTtl: e.target.checked })} />
                                            <span>Respect TTL</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Modal>
        </Layout>
    );
}
