import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { Layers, FileCode, Zap, Server } from 'lucide-react';

const StatCard = ({ icon: Icon, label, value, color }) => (
    <div className="card glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <div style={{
            padding: '1rem',
            borderRadius: '50%',
            backgroundColor: `rgba(${color}, 0.1)`,
            color: `rgb(${color})`
        }}>
            <Icon size={32} />
        </div>
        <div>
            <div className="label">{label}</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{value}</div>
        </div>
    </div>
);

export default function Dashboard() {
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/config')
            .then(res => res.json())
            .then(data => {
                setConfig(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    if (loading) return <Layout><div>Loading...</div></Layout>;
    if (!config) return <Layout><div>Error loading config</div></Layout>;

    return (
        <Layout>
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Dashboard</h1>
                <p style={{ color: 'var(--muted-foreground)' }}>Overview of your Solace Event Portal configuration</p>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '1.5rem',
                marginBottom: '3rem'
            }}>
                <StatCard
                    icon={Layers}
                    label="Application Domains"
                    value={config.applicationDomains?.length || 0}
                    color="59, 130, 246" // Blue
                />
                <StatCard
                    icon={FileCode}
                    label="Schemas"
                    value={config.schemas?.length || 0}
                    color="16, 185, 129" // Green
                />
                <StatCard
                    icon={Zap}
                    label="Events"
                    value={config.events?.length || 0}
                    color="245, 158, 11" // Amber
                />
                <StatCard
                    icon={Server}
                    label="Applications"
                    value={config.applications?.length || 0}
                    color="139, 92, 246" // Purple
                />
            </div>

            <div className="card glass-panel">
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Quick Actions</h2>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn btn-primary" onClick={() => window.location.href = '/designer'}>
                        Open Designer
                    </button>
                    <button className="btn btn-secondary" onClick={() => window.location.href = '/json'}>
                        Edit JSON
                    </button>
                </div>
            </div>
        </Layout>
    );
}
