import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { Save } from 'lucide-react';

export default function JsonEditor() {
    const [jsonContent, setJsonContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    useEffect(() => {
        fetch('/api/config')
            .then(res => res.json())
            .then(data => {
                setJsonContent(JSON.stringify(data, null, 2));
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            // Validate JSON
            const parsed = JSON.parse(jsonContent);

            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(parsed)
            });

            if (!res.ok) throw new Error('Failed to save');

            setMessage({ type: 'success', text: 'Configuration saved successfully!' });
        } catch (err) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <Layout><div>Loading...</div></Layout>;

    return (
        <Layout>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>JSON Editor</h1>
                    <p style={{ color: 'var(--muted-foreground)' }}>Directly edit the solace-config.json file</p>
                </div>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    <Save size={20} style={{ marginRight: '0.5rem' }} />
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>

            {message && (
                <div style={{
                    padding: '1rem',
                    borderRadius: 'var(--radius)',
                    marginBottom: '1rem',
                    backgroundColor: message.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: message.type === 'success' ? '#10b981' : '#ef4444',
                    border: `1px solid ${message.type === 'success' ? '#10b981' : '#ef4444'}`
                }}>
                    {message.text}
                </div>
            )}

            <div className="card glass-panel" style={{ height: 'calc(100vh - 250px)', padding: 0, overflow: 'hidden' }}>
                <textarea
                    value={jsonContent}
                    onChange={(e) => setJsonContent(e.target.value)}
                    style={{
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'transparent',
                        color: '#f8fafc',
                        fontFamily: 'monospace',
                        fontSize: '0.9rem',
                        padding: '1.5rem',
                        border: 'none',
                        outline: 'none',
                        resize: 'none'
                    }}
                    spellCheck="false"
                />
            </div>
        </Layout>
    );
}
