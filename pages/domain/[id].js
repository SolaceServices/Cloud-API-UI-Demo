import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import { Plus, Trash2, Play, Terminal, RefreshCw, AlertCircle, CheckCircle, XCircle, ChevronRight, ChevronDown, Edit, ArrowLeft, Globe, Activity, Download, Layers } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const STATES = {
    "1": { label: "Draft", color: "#64748b" },
    "2": { label: "Released", color: "#10b981" },
    "3": { label: "Deprecated", color: "#f59e0b" },
    "4": { label: "Retired", color: "#ef4444" }
};

export default function Designer() {
    const router = useRouter();
    const { id: domainId } = router.query;
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('apps');
    const [deploying, setDeploying] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [logs, setLogs] = useState([]);
    const [activeModal, setActiveModal] = useState(null); // 'domain', 'schema', 'event', 'app', 'sync', 'version', 'detailedSyncReport'
    const [formData, setFormData] = useState({});
    const [editingVersionIndex, setEditingVersionIndex] = useState(null); // Track if we are editing a version
    const [syncReport, setSyncReport] = useState(null);
    const [pendingDeletions, setPendingDeletions] = useState([]);
    const [pulling, setPulling] = useState(false);

    // const [showSyncModal, setShowSyncModal] = useState(false); // Removed
    const [checkingSync, setCheckingSync] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null); // For Master-Detail view
    const [statusMap, setStatusMap] = useState({}); // Map of ID -> Status
    const [brokers, setBrokers] = useState([]);
    const [activeView, setActiveView] = useState('design'); // 'design' or 'configurations'
    const [activeBrokerConfig, setActiveBrokerConfig] = useState(0); // Index of selected broker config
    const [activeConfigTab, setActiveConfigTab] = useState('eventHandling'); // 'eventHandling' or 'accessControl'

    useEffect(() => {
        if (domainId) fetchConfig();
    }, [domainId]);

    const fetchConfig = () => {
        fetch('/api/config')
            .then(res => res.json())
            .then(data => {
                const safeData = {
                    applicationDomains: data.applicationDomains || [],
                    schemas: (data.schemas || []).filter(s => s.domainId === domainId),
                    events: (data.events || []).filter(e => e.domainId === domainId),
                    applications: (data.applications || []).filter(a => a.domainId === domainId).map(app => {
                        // Migration: If brokerConfigs is missing but brokerName exists, create it
                        if (!app.brokerConfigs && app.brokerName) {
                            app.brokerConfigs = [{
                                brokerName: app.brokerName,
                                clientUsername: app.clientUsername,
                                clientPassword: app.clientPassword,
                                accessType: app.accessType || 'reference'
                            }];
                        }
                        // Migration: Consumers queueConfig -> queueConfigs
                        if (app.versions) {
                            app.versions.forEach(v => {
                                if (v.consumers) {
                                    v.consumers.forEach(c => {
                                        if (!c.queueConfigs && c.queueConfig && app.brokerName) {
                                            c.queueConfigs = {
                                                [app.brokerName]: c.queueConfig
                                            };
                                        }
                                    });
                                }
                            });
                        }
                        return app;
                    })
                };
                setConfig(safeData);
                setLoading(false);
                // Refresh selected item if it exists
                if (selectedItem) {
                    const list = safeData[activeTab === 'apps' ? 'applications' : activeTab] || [];
                    const updated = list.find(i => i.id === selectedItem.id);
                    if (updated) setSelectedItem(updated);
                }
                fetchStatus();
                fetchBrokers();
            });
    };

    const fetchBrokers = async () => {
        const token = localStorage.getItem('solace_token');
        if (!token) return;
        try {
            const res = await fetch('/api/brokers', { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                setBrokers(data);
            }
        } catch (err) {
            console.error('Failed to fetch brokers:', err);
        }
    };

    const fetchStatus = async () => {
        const token = localStorage.getItem('solace_token');
        if (!token) return;
        try {
            const res = await fetch('/api/status', { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) {
                console.error('Status API error:', res.status);
                return;
            }
            const data = await res.json();
            const newMap = {};
            Object.values(data).flat().forEach(item => {
                newMap[item.id] = item.status;
            });
            setStatusMap(newMap);
        } catch (err) {
            console.error('Failed to fetch status:', err);
        }
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
            setActiveModal('detailedSyncReport');
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
            fetchStatus();
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
            fetchStatus();
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

    const openModal = (type, data = {}) => {
        setFormData({ version: '1.0.0', stateId: "1", content: "", ...data });
        setEditingVersionIndex(null);
        setActiveModal(type);
    };

    const editVersion = (version, index) => {
        setFormData({
            ...version,
            content: version.content ? JSON.stringify(version.content, null, 2) : ""
        });
        setEditingVersionIndex(index);
        setActiveModal('version');
    };

    const manageConsumers = (version, index) => {
        setFormData({
            ...version,
            consumers: version.consumers || []
        });
        setEditingVersionIndex(index);
        setActiveModal('consumer');
    };



    const handleFormSubmit = () => {
        const newConfig = { ...config };
        const id = uuidv4();
        const versionId = uuidv4();

        // Helper to validate JSON
        const parseContent = (content) => {
            try {
                return JSON.parse(content);
            } catch (e) {
                return null;
            }
        };

        if (activeModal === 'domain') {
            if (!formData.name) return alert('Name is required');
            newConfig.applicationDomains.push({ id, name: formData.name, description: formData.description || '' });
        }
        else if (activeModal === 'schema') {
            if (!formData.name || !formData.domainId) return alert('Name and Domain are required');
            const contentObj = parseContent(formData.content || '{}');
            if (!contentObj) return alert('Invalid JSON Content');

            newConfig.schemas.push({
                id,
                name: formData.name,
                domainId: formData.domainId,
                versions: [{ id: versionId, version: formData.version, stateId: formData.stateId, content: contentObj }]
            });
        }
        else if (activeModal === 'event') {
            if (!formData.name || !formData.domainId || !formData.topic) return alert('Name, Domain and Topic are required');
            newConfig.events.push({
                id,
                name: formData.name,
                domainId: formData.domainId,
                versions: [{
                    id: versionId,
                    version: formData.version,
                    stateId: formData.stateId,
                    topic: formData.topic,
                    schemaVersionId: formData.schemaVersionId || null
                }]
            });
        }
        else if (activeModal === 'app') {
            if (!formData.name || !formData.domainId) return alert('Name and Domain are required');
            newConfig.applications.push({
                id,
                name: formData.name,
                domainId: formData.domainId,
                versions: [{
                    id: versionId,
                    version: formData.version,
                    stateId: formData.stateId,
                    consumedEventVersionIds: formData.consumedEventVersionIds || []
                }]
            });
        }
        else if (activeModal === 'version') {
            if (!formData.version) return alert('Version is required');
            const listType = activeTab === 'apps' ? 'applications' : activeTab;
            const itemIndex = newConfig[listType].findIndex(i => i.id === selectedItem.id);
            if (itemIndex === -1) return;

            let contentObj = {};
            if (activeTab === 'schemas') {
                contentObj = parseContent(formData.content || '{}');
                if (!contentObj) return alert('Invalid JSON Content');
            }

            const versionData = {
                version: formData.version,
                stateId: formData.stateId,
                // Copy relevant fields based on type
                ...(activeTab === 'events' ? { topic: formData.topic, schemaVersionId: formData.schemaVersionId } : {}),
                ...(activeTab === 'apps' ? {
                    consumedEventVersionIds: formData.consumedEventVersionIds,
                    producedEventVersionIds: formData.producedEventVersionIds
                } : {}),
                ...(activeTab === 'schemas' ? { content: contentObj } : {})
            };

            if (editingVersionIndex !== null) {
                // Update existing version
                const existingId = newConfig[listType][itemIndex].versions[editingVersionIndex].id;
                const existingSolaceId = newConfig[listType][itemIndex].versions[editingVersionIndex].solaceId;
                const existingMessagingSettings = newConfig[listType][itemIndex].versions[editingVersionIndex].messagingSettings; // Preserve settings

                newConfig[listType][itemIndex].versions[editingVersionIndex] = {
                    ...versionData,
                    id: existingId,
                    solaceId: existingSolaceId,
                    messagingSettings: existingMessagingSettings
                };
            } else {
                // Add new version
                newConfig[listType][itemIndex].versions.push({
                    ...versionData,
                    id: versionId
                });
            }

            setSelectedItem(newConfig[listType][itemIndex]);
        }
        else if (activeModal === 'consumer') {
            const listType = 'applications';
            const itemIndex = newConfig[listType].findIndex(i => i.id === selectedItem.id);

            // Update consumers for the specific version
            newConfig[listType][itemIndex].versions[editingVersionIndex].consumers = formData.consumers;
            setSelectedItem(newConfig[listType][itemIndex]);
        }


        saveConfig(newConfig);
        setActiveModal(null);
    };

    const deleteItem = (type, index, e) => {
        e.stopPropagation();
        if (!confirm('Are you sure? This will delete the object and all its versions.\n\n(Note: This will only delete the resources locally)')) return;
        const newConfig = { ...config };
        newConfig[type].splice(index, 1);
        saveConfig(newConfig);
        if (selectedItem) setSelectedItem(null);
    };

    const deleteVersion = (versionIndex) => {
        if (!confirm('Are you sure you want to delete this version?\n\n(Note: This will only delete the resources locally)')) return;
        const newConfig = { ...config };
        const listType = activeTab === 'apps' ? 'applications' : activeTab;
        const itemIndex = newConfig[listType].findIndex(i => i.id === selectedItem.id);
        newConfig[listType][itemIndex].versions.splice(versionIndex, 1);
        saveConfig(newConfig);
        setSelectedItem(newConfig[listType][itemIndex]);
    };

    const updateVersionState = (versionIndex, newStateId) => {
        const newConfig = { ...config };
        const listType = activeTab === 'apps' ? 'applications' : activeTab;
        const itemIndex = newConfig[listType].findIndex(i => i.id === selectedItem.id);
        newConfig[listType][itemIndex].versions[versionIndex].stateId = newStateId;
        saveConfig(newConfig);
        setSelectedItem(newConfig[listType][itemIndex]);
    };

    const addBrokerConfig = () => {
        const newConfig = { ...config };
        const itemIndex = newConfig.applications.findIndex(i => i.id === selectedItem.id);
        const app = newConfig.applications[itemIndex];

        if (!app.brokerConfigs) app.brokerConfigs = [];
        app.brokerConfigs.push({
            brokerName: '',
            clientUsername: '',
            clientPassword: '',
            accessType: 'reference'
        });

        saveConfig(newConfig);
        setSelectedItem(app);
        setActiveBrokerConfig(app.brokerConfigs.length - 1);
    };

    const removeBrokerConfig = (index, e) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to remove this broker configuration?')) return;

        const newConfig = { ...config };
        const itemIndex = newConfig.applications.findIndex(i => i.id === selectedItem.id);
        const app = newConfig.applications[itemIndex];

        app.brokerConfigs.splice(index, 1);

        saveConfig(newConfig);
        setSelectedItem(app);
        setActiveBrokerConfig(Math.max(0, index - 1));
    };

    const updateBrokerConfig = (field, value) => {
        const newConfig = { ...config };
        const itemIndex = newConfig.applications.findIndex(i => i.id === selectedItem.id);
        const app = newConfig.applications[itemIndex];

        // Ensure array exists
        if (!app.brokerConfigs) app.brokerConfigs = [];
        if (!app.brokerConfigs[activeBrokerConfig]) return;

        app.brokerConfigs[activeBrokerConfig][field] = value;
        saveConfig(newConfig);
        setSelectedItem(app);
    };

    const updateQueueConfig = (versionIndex, consumerIndex, field, value) => {
        const newConfig = { ...config };
        const itemIndex = newConfig.applications.findIndex(i => i.id === selectedItem.id);
        const app = newConfig.applications[itemIndex];
        const version = app.versions[versionIndex];
        const consumer = version.consumers[consumerIndex];
        const brokerName = app.brokerConfigs[activeBrokerConfig]?.brokerName;

        if (!brokerName) return alert('Please select a broker first');

        if (!consumer.queueConfigs) consumer.queueConfigs = {};
        if (!consumer.queueConfigs[brokerName]) {
            // Initialize with defaults or existing legacy config
            consumer.queueConfigs[brokerName] = {
                ...(consumer.queueConfig || {
                    accessType: "exclusive",
                    maxMsgSpoolUsage: 1500,
                    permission: "consume",
                    respectTtlEnabled: true
                })
            };
        }

        consumer.queueConfigs[brokerName][field] = value;
        saveConfig(newConfig);
        setSelectedItem(app);
    };

    if (loading) return <Layout><div>Loading...</div></Layout>;

    const tabs = [
        { id: 'apps', label: 'Applications' },
        { id: 'events', label: 'Events' },
        { id: 'schemas', label: 'Schemas' },
    ];

    const renderSyncStatus = (status) => {
        if (status === 'synced') return <span title="Synced with Solace Cloud" style={{ color: '#10b981', display: 'flex', alignItems: 'center' }}><CheckCircle size={14} /></span>;
        if (status === 'missing_cloud') return <span title="Missing in Solace Cloud" style={{ color: '#f59e0b', display: 'flex', alignItems: 'center' }}><AlertCircle size={14} /></span>;
        if (status === 'not_pushed') return <span title="Not Pushed" style={{ color: '#ef4444', display: 'flex', alignItems: 'center' }}><XCircle size={14} /></span>;
        return null;
    };

    const getDomainName = (id) => config.applicationDomains.find(d => d.id === id)?.name || 'Unknown';
    const currentDomainName = getDomainName(domainId);

    const getEventDetails = (evId) => {
        for (const evt of config.events) {
            const ver = evt.versions.find(v => v.id === evId);
            if (ver) return { name: evt.name, version: ver.version };
        }
        return { name: 'Unknown Event', version: '?' };
    };

    return (
        <Layout>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={() => router.push('/designer')}
                        className="btn btn-secondary"
                        style={{ padding: '0.5rem' }}
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{currentDomainName}</h1>
                        <p style={{ color: 'var(--muted-foreground)' }}>Manage Applications, Events, and Schemas</p>
                    </div>
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

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id); setSelectedItem(null); setActiveView('design'); }}
                        style={{
                            padding: '0.75rem 1rem',
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                            color: activeTab === tab.id ? 'var(--primary)' : 'var(--muted-foreground)',
                            fontWeight: 500,
                            cursor: 'pointer'
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: selectedItem ? '1fr 1fr' : '1fr', gap: '2rem', transition: 'all 0.3s ease' }}>

                {/* LEFT PANE: List */}
                <div className="card glass-panel">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', textTransform: 'capitalize' }}>{activeTab}</h3>
                        <button
                            className="btn btn-secondary"
                            style={{ padding: '0.5rem' }}
                            onClick={() => openModal(activeTab === 'applicationDomains' ? 'domain' : activeTab === 'schemas' ? 'schema' : activeTab === 'events' ? 'event' : 'app')}
                        >
                            <Plus size={20} />
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {config[activeTab === 'apps' ? 'applications' : activeTab].map((item, i) => (
                            <div
                                key={item.id}
                                onClick={() => activeTab !== 'applicationDomains' && setSelectedItem(item)}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '1rem',
                                    backgroundColor: selectedItem?.id === item.id ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.2)',
                                    borderRadius: 'var(--radius)',
                                    cursor: activeTab !== 'applicationDomains' ? 'pointer' : 'default',
                                    border: selectedItem?.id === item.id ? '1px solid var(--primary)' : '1px solid transparent'
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                                    {item.description && <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>{item.description}</div>}
                                    {item.domainId && <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Domain: {getDomainName(item.domainId)}</div>}
                                    {item.versions && (
                                        <div style={{ fontSize: '0.875rem', color: 'var(--primary)', marginTop: '0.25rem' }}>
                                            Latest: v{item.versions[item.versions.length - 1]?.version || 'N/A'}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <button onClick={(e) => deleteItem(activeTab === 'apps' ? 'applications' : activeTab, i, e)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={18} /></button>
                                    {renderSyncStatus(statusMap[item.id])}
                                    {activeTab !== 'applicationDomains' && <ChevronRight size={18} color="var(--muted-foreground)" />}
                                </div>
                            </div>
                        ))}
                        {config[activeTab === 'apps' ? 'applications' : activeTab].length === 0 && (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted-foreground)' }}>
                                No items found. Click + to add one.
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT PANE: Details */}
                {selectedItem && (
                    <div className="card glass-panel">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #333', paddingBottom: '1rem' }}>
                            <div>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{selectedItem.name}</h2>
                                <p style={{ color: 'var(--muted-foreground)' }}>ID: {selectedItem.solaceId || 'Not Deployed'}</p>
                            </div>
                            <button className="btn btn-secondary" onClick={() => setSelectedItem(null)}><XCircle size={20} /></button>
                        </div>

                        {activeTab === 'apps' && (
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid #333' }}>
                                <button
                                    onClick={() => setActiveView('design')}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: 'none',
                                        border: 'none',
                                        borderBottom: activeView === 'design' ? '2px solid var(--primary)' : '2px solid transparent',
                                        color: activeView === 'design' ? 'var(--primary)' : 'var(--muted-foreground)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Design Details
                                </button>
                                <button
                                    onClick={() => setActiveView('configurations')}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: 'none',
                                        border: 'none',
                                        borderBottom: activeView === 'configurations' ? '2px solid var(--primary)' : '2px solid transparent',
                                        color: activeView === 'configurations' ? 'var(--primary)' : 'var(--muted-foreground)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Configurations
                                </button>
                            </div>
                        )}

                        {activeView === 'configurations' && activeTab === 'apps' ? (
                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem' }}>Configure for Event Brokers</h3>

                                {/* Broker Cards List */}
                                <div style={{ marginBottom: '2rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <label style={{ display: 'block' }}>Event brokers with configurations created</label>
                                        <button className="btn btn-sm btn-secondary" onClick={addBrokerConfig}><Plus size={14} style={{ marginRight: '0.25rem' }} /> Add Configuration</button>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                                        {(selectedItem.brokerConfigs || []).map((bc, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => setActiveBrokerConfig(idx)}
                                                style={{
                                                    padding: '1rem',
                                                    border: activeBrokerConfig === idx ? '2px solid var(--primary)' : '1px solid #333',
                                                    borderRadius: 'var(--radius)',
                                                    backgroundColor: activeBrokerConfig === idx ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0,0,0,0.2)',
                                                    cursor: 'pointer',
                                                    position: 'relative'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                    <Layers size={16} />
                                                    <span style={{ fontWeight: 'bold' }}>{bc.brokerName || 'Select Broker'}</span>
                                                </div>
                                                <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                                                    {bc.accessType === 'basic' ? 'Basic Auth' : 'Reference'}
                                                </div>
                                                <button
                                                    onClick={(e) => removeBrokerConfig(idx, e)}
                                                    style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                                >
                                                    <XCircle size={16} />
                                                </button>
                                            </div>
                                        ))}
                                        {(!selectedItem.brokerConfigs || selectedItem.brokerConfigs.length === 0) && (
                                            <div style={{ padding: '1rem', border: '1px dashed #333', borderRadius: 'var(--radius)', color: 'var(--muted-foreground)', textAlign: 'center' }}>
                                                No configurations yet.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {selectedItem.brokerConfigs && selectedItem.brokerConfigs[activeBrokerConfig] && (
                                    <>
                                        <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #333', display: 'flex', gap: '1rem' }}>
                                            <button
                                                onClick={() => setActiveConfigTab('eventHandling')}
                                                style={{
                                                    padding: '0.5rem 0',
                                                    background: 'none',
                                                    border: 'none',
                                                    borderBottom: activeConfigTab === 'eventHandling' ? '2px solid var(--primary)' : '2px solid transparent',
                                                    color: activeConfigTab === 'eventHandling' ? 'var(--primary)' : 'var(--muted-foreground)',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Define Event Handling
                                            </button>
                                            <button
                                                onClick={() => setActiveConfigTab('accessControl')}
                                                style={{
                                                    padding: '0.5rem 0',
                                                    background: 'none',
                                                    border: 'none',
                                                    borderBottom: activeConfigTab === 'accessControl' ? '2px solid var(--primary)' : '2px solid transparent',
                                                    color: activeConfigTab === 'accessControl' ? 'var(--primary)' : 'var(--muted-foreground)',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Define Access Control
                                            </button>
                                        </div>

                                        {activeConfigTab === 'accessControl' && (
                                            <div style={{ marginBottom: '2rem' }}>
                                                <div style={{ marginBottom: '1rem' }}>
                                                    <label style={{ display: 'block', marginBottom: '0.5rem' }}>Target Broker</label>
                                                    <select
                                                        className="input"
                                                        value={selectedItem.brokerConfigs[activeBrokerConfig].brokerName || ''}
                                                        onChange={(e) => updateBrokerConfig('brokerName', e.target.value)}
                                                    >
                                                        <option value="">Select a Broker...</option>
                                                        {brokers.map(b => (
                                                            <option key={b.id} value={b.name}>{b.name} ({b.serviceId || b.id})</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div style={{ marginBottom: '1rem' }}>
                                                    <label style={{ display: 'block', marginBottom: '0.5rem' }}>Access Type <span style={{ color: 'red' }}>*</span></label>
                                                    <select
                                                        className="input"
                                                        value={selectedItem.brokerConfigs[activeBrokerConfig].accessType || 'reference'}
                                                        onChange={(e) => updateBrokerConfig('accessType', e.target.value)}
                                                    >
                                                        <option value="reference">Reference Existing Client Username</option>
                                                        <option value="basic">Basic (Create/Update Client Username & Password)</option>
                                                    </select>
                                                </div>

                                                <div style={{ marginBottom: '1rem' }}>
                                                    <label style={{ display: 'block', marginBottom: '0.5rem' }}>Client Username <span style={{ color: 'red' }}>*</span></label>
                                                    <input
                                                        type="text"
                                                        className="input"
                                                        value={selectedItem.brokerConfigs[activeBrokerConfig].clientUsername || ''}
                                                        onChange={(e) => updateBrokerConfig('clientUsername', e.target.value)}
                                                        placeholder="e.g., my-client-username"
                                                    />
                                                </div>

                                                {selectedItem.brokerConfigs[activeBrokerConfig].accessType === 'basic' && (
                                                    <div>
                                                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Password <span style={{ color: 'red' }}>*</span></label>
                                                        <input
                                                            type="password"
                                                            className="input"
                                                            value={selectedItem.brokerConfigs[activeBrokerConfig].clientPassword || ''}
                                                            onChange={(e) => updateBrokerConfig('clientPassword', e.target.value)}
                                                            placeholder="Enter password"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {activeConfigTab === 'eventHandling' && (
                                            <div>
                                                {selectedItem.versions.map((v, vIdx) => (
                                                    <div key={v.id} style={{ marginBottom: '2rem' }}>
                                                        <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Version {v.version}</h4>
                                                        {v.consumers && v.consumers.length > 0 ? v.consumers.map((c, cIdx) => {
                                                            const brokerName = selectedItem.brokerConfigs[activeBrokerConfig].brokerName;
                                                            // Resolve queue config: specific -> legacy -> default
                                                            const qConfig = (c.queueConfigs && c.queueConfigs[brokerName]) || c.queueConfig || {
                                                                accessType: "exclusive",
                                                                maxMsgSpoolUsage: 1500,
                                                                permission: "consume",
                                                                respectTtlEnabled: true
                                                            };

                                                            return (
                                                                <div key={cIdx} style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius)' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                                                        <Layers size={16} />
                                                                        <span style={{ fontWeight: 'bold' }}>{c.name}</span>
                                                                        <span style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>({c.type})</span>
                                                                    </div>

                                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                                        <div>
                                                                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Access Type</label>
                                                                            <select
                                                                                className="input"
                                                                                style={{ fontSize: '0.875rem', padding: '0.4rem' }}
                                                                                value={qConfig.accessType}
                                                                                onChange={(e) => updateQueueConfig(vIdx, cIdx, 'accessType', e.target.value)}
                                                                            >
                                                                                <option value="exclusive">Exclusive</option>
                                                                                <option value="non-exclusive">Non-Exclusive</option>
                                                                            </select>
                                                                        </div>
                                                                        <div>
                                                                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Max Spool (MB)</label>
                                                                            <input
                                                                                type="number"
                                                                                className="input"
                                                                                style={{ fontSize: '0.875rem', padding: '0.4rem' }}
                                                                                value={qConfig.maxMsgSpoolUsage}
                                                                                onChange={(e) => updateQueueConfig(vIdx, cIdx, 'maxMsgSpoolUsage', parseInt(e.target.value))}
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Permission</label>
                                                                            <select
                                                                                className="input"
                                                                                style={{ fontSize: '0.875rem', padding: '0.4rem' }}
                                                                                value={qConfig.permission}
                                                                                onChange={(e) => updateQueueConfig(vIdx, cIdx, 'permission', e.target.value)}
                                                                            >
                                                                                <option value="consume">Consume</option>
                                                                                <option value="read-only">Read Only</option>
                                                                                <option value="no-access">No Access</option>
                                                                            </select>
                                                                        </div>
                                                                        <div>
                                                                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Max TTL (sec)</label>
                                                                            <input
                                                                                type="number"
                                                                                className="input"
                                                                                style={{ fontSize: '0.875rem', padding: '0.4rem' }}
                                                                                value={qConfig.maxTtl || 0}
                                                                                onChange={(e) => updateQueueConfig(vIdx, cIdx, 'maxTtl', parseInt(e.target.value))}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }) : (
                                                            <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>No consumers defined for this version.</div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        ) : (
                            // Design View (Existing Logic)
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Versions</h3>
                                    <button className="btn btn-sm btn-primary" onClick={() => openModal('version', {
                                        topic: selectedItem.versions[selectedItem.versions.length - 1]?.topic,
                                        schemaVersionId: selectedItem.versions[selectedItem.versions.length - 1]?.schemaVersionId,
                                        consumedEventVersionIds: selectedItem.versions[selectedItem.versions.length - 1]?.consumedEventVersionIds
                                    })}>
                                        <Plus size={16} style={{ marginRight: '0.25rem' }} /> Add Version
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {selectedItem.versions.map((v, idx) => (
                                        <div key={v.id} style={{ padding: '1rem', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>v{v.version}</span>
                                                    <span style={{
                                                        fontSize: '0.75rem',
                                                        padding: '0.1rem 0.5rem',
                                                        borderRadius: '1rem',
                                                        backgroundColor: STATES[v.stateId || "1"].color,
                                                        color: '#fff'
                                                    }}>
                                                        {STATES[v.stateId || "1"].label}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button className="btn btn-sm btn-secondary" onClick={() => editVersion(v, idx)}>
                                                        <Edit size={14} style={{ marginRight: '0.5rem' }} />
                                                        Edit Version
                                                    </button>
                                                    <button className="btn btn-sm btn-secondary" onClick={() => manageConsumers(v, idx)}>
                                                        <Layers size={14} style={{ marginRight: '0.5rem' }} />
                                                        Manage Consumers
                                                    </button>
                                                    <button className="btn btn-sm btn-secondary" onClick={() => deleteVersion(idx)} style={{ color: '#ef4444' }}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Published Events */}
                                            {v.producedEventVersionIds && v.producedEventVersionIds.length > 0 && (
                                                <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: 'rgba(16, 185, 129, 0.05)', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                                                    <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#10b981', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Published Events</div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                        {v.producedEventVersionIds.map(evId => {
                                                            const evt = getEventDetails(evId);
                                                            return (
                                                                <span key={evId} style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                                    <span style={{ fontWeight: '500' }}>{evt.name}</span>
                                                                    <span style={{ fontSize: '0.7rem', opacity: 0.7, backgroundColor: 'rgba(255,255,255,0.1)', padding: '0 0.2rem', borderRadius: '2px' }}>v{evt.version}</span>
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Subscribed Events */}
                                            {v.consumedEventVersionIds && v.consumedEventVersionIds.length > 0 && (
                                                <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: 'rgba(59, 130, 246, 0.05)', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
                                                    <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#60a5fa', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subscribed Events</div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                        {v.consumedEventVersionIds.map(evId => {
                                                            const evt = getEventDetails(evId);
                                                            return (
                                                                <span key={evId} style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                                    <span style={{ fontWeight: '500' }}>{evt.name}</span>
                                                                    <span style={{ fontSize: '0.7rem', opacity: 0.7, backgroundColor: 'rgba(255,255,255,0.1)', padding: '0 0.2rem', borderRadius: '2px' }}>v{evt.version}</span>
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Consumers Summary */}
                                            <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--muted-foreground)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>CONSUMERS</div>
                                            {v.consumers && v.consumers.length > 0 ? (
                                                <div style={{ display: 'grid', gap: '0.5rem' }}>
                                                    {v.consumers.map((c, cIdx) => (
                                                        <div key={cIdx} style={{ fontSize: '0.875rem', padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                                                            <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <Layers size={14} /> {c.name}
                                                            </div>
                                                            <div style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem', marginLeft: '1.4rem' }}>
                                                                Type: {c.type}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>No consumers defined.</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div >
                )}
            </div >

            {/* --- MODALS --- */}

            {/* Domain Modal */}
            <Modal isOpen={activeModal === 'domain'} onClose={() => setActiveModal(null)} title="Create Application Domain" footer={<button className="btn btn-primary" onClick={handleFormSubmit}>Create</button>}>
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

            {/* Schema Modal */}
            <Modal isOpen={activeModal === 'schema'} onClose={() => setActiveModal(null)} title="Create Schema" footer={<button className="btn btn-primary" onClick={handleFormSubmit}>Create</button>}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Name <span style={{ color: 'red' }}>*</span></label>
                        <input type="text" className="input" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., OrderSchema" />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Application Domain <span style={{ color: 'red' }}>*</span></label>
                        <select className="input" value={formData.domainId || ''} onChange={e => setFormData({ ...formData, domainId: e.target.value })}>
                            <option value="">Select Application Domain</option>
                            {config.applicationDomains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Version <span style={{ color: 'red' }}>*</span></label>
                            <input type="text" className="input" value={formData.version || '1.0.0'} onChange={e => setFormData({ ...formData, version: e.target.value })} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>State</label>
                            <select className="input" value={formData.stateId || "1"} onChange={e => setFormData({ ...formData, stateId: e.target.value })}>
                                {Object.entries(STATES).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Content (JSON) <span style={{ color: 'red' }}>*</span></label>
                        <textarea
                            className="input"
                            style={{ height: '150px', fontFamily: 'monospace' }}
                            value={formData.content || ''}
                            onChange={e => setFormData({ ...formData, content: e.target.value })}
                            placeholder={`{
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "date": { "type": "string", "format": "date-time" }
  }
}`}
                        />
                        <small style={{ color: 'var(--muted-foreground)' }}>Format: JSON Schema (Draft 7)</small>
                    </div>
                </div>
            </Modal>

            {/* Event Modal */}
            <Modal isOpen={activeModal === 'event'} onClose={() => setActiveModal(null)} title="Create Event" footer={<button className="btn btn-primary" onClick={handleFormSubmit}>Create</button>}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Name <span style={{ color: 'red' }}>*</span></label>
                        <input type="text" className="input" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., OrderCreated" />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Application Domain <span style={{ color: 'red' }}>*</span></label>
                        <select className="input" value={formData.domainId || ''} onChange={e => setFormData({ ...formData, domainId: e.target.value })}>
                            <option value="">Select Application Domain</option>
                            {config.applicationDomains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Topic <span style={{ color: 'red' }}>*</span></label>
                        <input type="text" className="input" value={formData.topic || ''} onChange={e => setFormData({ ...formData, topic: e.target.value })} placeholder="e.g., retail/orders/created" />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Schema (Optional)</label>
                        <select className="input" value={formData.schemaVersionId || ''} onChange={e => setFormData({ ...formData, schemaVersionId: e.target.value })}>
                            <option value="">Select Schema Version</option>
                            {config.schemas.map(s =>
                                s.versions.map(v => (
                                    <option key={v.id} value={v.id}>{s.name} v{v.version}</option>
                                ))
                            )}
                        </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Version <span style={{ color: 'red' }}>*</span></label>
                            <input type="text" className="input" value={formData.version || '1.0.0'} onChange={e => setFormData({ ...formData, version: e.target.value })} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>State</label>
                            <select className="input" value={formData.stateId || "1"} onChange={e => setFormData({ ...formData, stateId: e.target.value })}>
                                {Object.entries(STATES).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* App Modal */}
            <Modal isOpen={activeModal === 'app'} onClose={() => setActiveModal(null)} title="Create Application" footer={<button className="btn btn-primary" onClick={handleFormSubmit}>Create</button>}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Name <span style={{ color: 'red' }}>*</span></label>
                        <input type="text" className="input" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., OrderService" />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Application Domain <span style={{ color: 'red' }}>*</span></label>
                        <select className="input" value={formData.domainId || ''} onChange={e => setFormData({ ...formData, domainId: e.target.value })}>
                            <option value="">Select Application Domain</option>
                            {config.applicationDomains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Subscribed Events (Optional)</label>
                        <select
                            className="input"
                            multiple
                            style={{ height: '100px' }}
                            value={formData.consumedEventVersionIds || []}
                            onChange={e => {
                                const selected = Array.from(e.target.selectedOptions, option => option.value);
                                setFormData({ ...formData, consumedEventVersionIds: selected });
                            }}
                        >
                            {config.events.map(event =>
                                event.versions.map(v => (
                                    <option key={v.id} value={v.id}>{event.name} v{v.version}</option>
                                ))
                            )}
                        </select>
                        <small style={{ color: 'var(--muted-foreground)' }}>Hold Ctrl/Cmd to select multiple</small>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Version <span style={{ color: 'red' }}>*</span></label>
                            <input type="text" className="input" value={formData.version || '1.0.0'} onChange={e => setFormData({ ...formData, version: e.target.value })} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>State</label>
                            <select className="input" value={formData.stateId || "1"} onChange={e => setFormData({ ...formData, stateId: e.target.value })}>
                                {Object.entries(STATES).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Version Modal */}
            <Modal isOpen={activeModal === 'version'} onClose={() => setActiveModal(null)} title={`${editingVersionIndex !== null ? 'Edit' : 'Add'} Version to ${selectedItem?.name}`} footer={<button className="btn btn-primary" onClick={handleFormSubmit}>{editingVersionIndex !== null ? 'Save Changes' : 'Add Version'}</button>}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {formData.stateId !== "1" && (
                        <div style={{ padding: '0.75rem', backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', borderRadius: 'var(--radius)', color: '#f59e0b', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <AlertCircle size={16} />
                            <span>Only <strong>Draft</strong> versions can be edited. Change state to Draft to modify details.</span>
                        </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Version <span style={{ color: 'red' }}>*</span></label>
                            <input type="text" className="input" value={formData.version || ''} onChange={e => setFormData({ ...formData, version: e.target.value })} placeholder="e.g., 1.1.0" disabled={formData.stateId !== "1"} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>State</label>
                            <select className="input" value={formData.stateId || "1"} onChange={e => setFormData({ ...formData, stateId: e.target.value })}>
                                {Object.entries(STATES).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Conditional Fields based on Type */}
                    {activeTab === 'schemas' && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Content (JSON) <span style={{ color: 'red' }}>*</span></label>
                            <textarea
                                className="input"
                                style={{ height: '150px', fontFamily: 'monospace' }}
                                value={formData.content || ''}
                                onChange={e => setFormData({ ...formData, content: e.target.value })}
                                placeholder={`{
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "date": { "type": "string", "format": "date-time" }
  }
}`}
                                disabled={formData.stateId !== "1"}
                            />
                            <small style={{ color: 'var(--muted-foreground)' }}>Format: JSON Schema (Draft 7)</small>
                        </div>
                    )}

                    {activeTab === 'events' && (
                        <>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Topic <span style={{ color: 'red' }}>*</span></label>
                                <input type="text" className="input" value={formData.topic || ''} onChange={e => setFormData({ ...formData, topic: e.target.value })} disabled={formData.stateId !== "1"} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Schema (Optional)</label>
                                <select className="input" value={formData.schemaVersionId || ''} onChange={e => setFormData({ ...formData, schemaVersionId: e.target.value })} disabled={formData.stateId !== "1"}>
                                    <option value="">Select Schema Version</option>
                                    {config.schemas.map(s =>
                                        s.versions.map(v => (
                                            <option key={v.id} value={v.id}>{s.name} v{v.version}</option>
                                        ))
                                    )}
                                </select>
                            </div>
                        </>
                    )}

                    {activeTab === 'apps' && (
                        <>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Published Events (Optional)</label>
                                <select
                                    className="input"
                                    multiple
                                    style={{ height: '100px' }}
                                    value={formData.producedEventVersionIds || []}
                                    onChange={e => {
                                        const selected = Array.from(e.target.selectedOptions, option => option.value);
                                        setFormData({ ...formData, producedEventVersionIds: selected });
                                    }}
                                >
                                    {config.events.map(event =>
                                        event.versions.map(v => (
                                            <option key={v.id} value={v.id}>{event.name} v{v.version}</option>
                                        ))
                                    )}
                                </select>
                                <small style={{ color: 'var(--muted-foreground)' }}>Hold Ctrl/Cmd to select multiple</small>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Subscribed Events (Optional)</label>
                                <select
                                    className="input"
                                    multiple
                                    style={{ height: '100px' }}
                                    value={formData.consumedEventVersionIds || []}
                                    onChange={e => {
                                        const selected = Array.from(e.target.selectedOptions, option => option.value);
                                        setFormData({ ...formData, consumedEventVersionIds: selected });
                                    }}
                                    disabled={formData.stateId !== "1"}
                                >
                                    {config.events.map(event =>
                                        event.versions.map(v => (
                                            <option key={v.id} value={v.id}>{event.name} v{v.version}</option>
                                        ))
                                    )}
                                </select>
                                <small style={{ color: 'var(--muted-foreground)' }}>Hold Ctrl/Cmd to select multiple</small>
                            </div>
                        </>
                    )}
                </div>
            </Modal>



            {/* Consumer Modal */}
            <Modal isOpen={activeModal === 'consumer'} onClose={() => setActiveModal(null)} title={`Manage Consumers - ${selectedItem?.name} v${formData.version}`} footer={<button className="btn btn-primary" onClick={handleFormSubmit}>Save Consumers</button>}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ fontWeight: 'bold' }}>Consumers</h4>
                        <button className="btn btn-sm btn-secondary" onClick={() => {
                            const newConsumer = {
                                name: `${selectedItem.name.toLowerCase().replace(/\s+/g, '-')}-${formData.consumers?.length || 0}.queue`,
                                type: 'eventQueue',
                                queueConfig: {
                                    accessType: 'exclusive',
                                    maxMsgSpoolUsage: 1500,
                                    permission: 'consume'
                                },
                                subscriptions: []
                            };
                            setFormData({
                                ...formData,
                                consumers: [...(formData.consumers || []), newConsumer]
                            });
                        }}>
                            <Plus size={14} style={{ marginRight: '0.25rem' }} /> Add Queue
                        </button>
                    </div>

                    {(!formData.consumers || formData.consumers.length === 0) && (
                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted-foreground)', border: '1px dashed var(--border)', borderRadius: 'var(--radius)' }}>
                            No consumers defined.
                        </div>
                    )}

                    {formData.consumers?.map((consumer, cIdx) => (
                        <div key={cIdx} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <div style={{ fontWeight: 'bold' }}>Consumer #{cIdx + 1}</div>
                                <button onClick={() => {
                                    const newConsumers = [...formData.consumers];
                                    newConsumers.splice(cIdx, 1);
                                    setFormData({ ...formData, consumers: newConsumers });
                                }} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                                    <Trash2 size={16} />
                                </button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Name</label>
                                    <input type="text" className="input" value={consumer.name} onChange={e => {
                                        const newConsumers = [...formData.consumers];
                                        newConsumers[cIdx].name = e.target.value;
                                        setFormData({ ...formData, consumers: newConsumers });
                                    }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Access Type</label>
                                    <select className="input" value={consumer.queueConfig?.accessType || 'exclusive'} onChange={e => {
                                        const newConsumers = [...formData.consumers];
                                        newConsumers[cIdx].queueConfig.accessType = e.target.value;
                                        setFormData({ ...formData, consumers: newConsumers });
                                    }}>
                                        <option value="exclusive">Exclusive</option>
                                        <option value="non-exclusive">Non-Exclusive</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Max Spool Usage (MB)</label>
                                    <input type="number" className="input" value={consumer.queueConfig?.maxMsgSpoolUsage || 1500} onChange={e => {
                                        const newConsumers = [...formData.consumers];
                                        newConsumers[cIdx].queueConfig.maxMsgSpoolUsage = parseInt(e.target.value);
                                        setFormData({ ...formData, consumers: newConsumers });
                                    }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Permission</label>
                                    <select className="input" value={consumer.queueConfig?.permission || 'consume'} onChange={e => {
                                        const newConsumers = [...formData.consumers];
                                        newConsumers[cIdx].queueConfig.permission = e.target.value;
                                        setFormData({ ...formData, consumers: newConsumers });
                                    }}>
                                        <option value="consume">Consume</option>
                                        <option value="read-only">Read Only</option>
                                    </select>
                                </div>
                            </div>

                            {/* Subscriptions */}
                            <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <label style={{ fontSize: '0.875rem', fontWeight: 'bold' }}>Subscriptions</label>
                                    <button className="btn btn-sm btn-secondary" style={{ padding: '0.1rem 0.5rem', fontSize: '0.75rem' }} onClick={() => {
                                        const newConsumers = [...formData.consumers];
                                        newConsumers[cIdx].subscriptions.push({ subscriptionType: 'topic', value: '' });
                                        setFormData({ ...formData, consumers: newConsumers });
                                    }}>
                                        <Plus size={12} /> Add
                                    </button>
                                </div>

                                {consumer.subscriptions?.map((sub, sIdx) => (
                                    <div key={sIdx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        <select className="input" style={{ width: '150px' }} value={sub.attractedEventVersionId || ''} onChange={e => {
                                            const newConsumers = [...formData.consumers];
                                            const eventId = e.target.value;
                                            newConsumers[cIdx].subscriptions[sIdx].attractedEventVersionId = eventId;

                                            // Auto-fill topic if event selected
                                            if (eventId) {
                                                const event = config.events.find(ev => ev.versions.some(v => v.id === eventId));
                                                const version = event?.versions.find(v => v.id === eventId);
                                                if (version?.topic) {
                                                    newConsumers[cIdx].subscriptions[sIdx].value = version.topic.replace(/\{[^}]+\}/g, '*');
                                                }
                                            }
                                            setFormData({ ...formData, consumers: newConsumers });
                                        }}>
                                            <option value="">Custom Topic</option>
                                            {config.events.map(event =>
                                                event.versions.map(v => (
                                                    <option key={v.id} value={v.id}>{event.name} v{v.version}</option>
                                                ))
                                            )}
                                        </select>
                                        <input type="text" className="input" value={sub.value} onChange={e => {
                                            const newConsumers = [...formData.consumers];
                                            newConsumers[cIdx].subscriptions[sIdx].value = e.target.value;
                                            setFormData({ ...formData, consumers: newConsumers });
                                        }} placeholder="Topic Subscription" />
                                        <button onClick={() => {
                                            const newConsumers = [...formData.consumers];
                                            newConsumers[cIdx].subscriptions.splice(sIdx, 1);
                                            setFormData({ ...formData, consumers: newConsumers });
                                        }} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </Modal>

            {/* Sync Report Modal (Shared for Sync and Check Sync) */}
            <Modal isOpen={activeModal === 'sync' || activeModal === 'syncReport'} onClose={() => setActiveModal(null)} title="Sync Report">
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

            {/* Detailed Sync Report Modal (from Check Sync) */}
            <Modal isOpen={activeModal === 'detailedSyncReport'} onClose={() => setActiveModal(null)} title="Synchronization Report" maxWidth="800px">
                <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                    {syncReport?.applications?.map((app, idx) => (
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
                            {(app.issues || []).length > 0 && (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {app.issues.map((issue, i) => (
                                        <li key={i} style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--muted-foreground)', fontSize: '0.9rem', display: 'flex', alignItems: 'start', gap: '0.5rem' }}>
                                            <AlertCircle size={16} style={{ marginTop: '3px', color: '#ef4444' }} />
                                            {issue}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {(app.issues || []).length === 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', fontSize: '0.9rem' }}>
                                    <CheckCircle size={16} />
                                    Configuration matches Solace Cloud
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </Modal>
        </Layout >
    );
}
