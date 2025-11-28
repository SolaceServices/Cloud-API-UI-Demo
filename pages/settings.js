import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { Save, Shield } from 'lucide-react';

export default function Settings() {
    const [token, setToken] = useState('');
    const [orgId, setOrgId] = useState('');
    const [environment, setEnvironment] = useState('Development');
    const [message, setMessage] = useState(null);

    useEffect(() => {
        // Load from localStorage
        const savedToken = localStorage.getItem('solace_token');
        const savedOrgId = localStorage.getItem('solace_org_id');
        const savedEnv = localStorage.getItem('solace_env');

        if (savedToken) setToken(savedToken);
        if (savedOrgId) setOrgId(savedOrgId);
        if (savedEnv) setEnvironment(savedEnv);
    }, []);

    const handleSave = () => {
        localStorage.setItem('solace_token', token);
        localStorage.setItem('solace_org_id', orgId);
        localStorage.setItem('solace_env', environment);

        setMessage({ type: 'success', text: 'Settings saved to browser storage' });
        setTimeout(() => setMessage(null), 3000);
    };

    return (
        <Layout>
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Settings</h1>
                <p style={{ color: 'var(--muted-foreground)' }}>Configure your Solace Cloud credentials</p>
            </div>

            <div className="card glass-panel" style={{ maxWidth: '600px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                    <Shield size={24} className="text-blue-500" />
                    <div>
                        <h3 style={{ fontWeight: 'bold' }}>Credentials</h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                            These are stored locally in your browser and sent with deployment requests.
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div>
                        <label className="label">Solace Cloud API Token</label>
                        <input
                            type="password"
                            className="input"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            placeholder="Bearer token..."
                        />
                    </div>

                    <div>
                        <label className="label">Organization ID</label>
                        <input
                            type="text"
                            className="input"
                            value={orgId}
                            onChange={(e) => setOrgId(e.target.value)}
                            placeholder="org-..."
                        />
                    </div>

                    <div>
                        <label className="label">Target Environment</label>
                        <input
                            type="text"
                            className="input"
                            value={environment}
                            onChange={(e) => setEnvironment(e.target.value)}
                            placeholder="Development"
                        />
                    </div>

                    {message && (
                        <div style={{
                            padding: '0.75rem',
                            borderRadius: 'var(--radius)',
                            backgroundColor: 'rgba(16, 185, 129, 0.2)',
                            color: '#10b981',
                            fontSize: '0.875rem'
                        }}>
                            {message.text}
                        </div>
                    )}

                    <button className="btn btn-primary" onClick={handleSave} style={{ alignSelf: 'flex-start' }}>
                        <Save size={18} style={{ marginRight: '0.5rem' }} />
                        Save Settings
                    </button>
                </div>
            </div>
        </Layout>
    );
}
