import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { Globe, RefreshCw, AlertCircle, CheckCircle, Download, Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';

export default function ImportPage() {
    const [remoteDomains, setRemoteDomains] = useState([]);
    const [loadingRemoteDomains, setLoadingRemoteDomains] = useState(false);
    const [pullSearchTerm, setPullSearchTerm] = useState('');
    const [selectedPullDomains, setSelectedPullDomains] = useState([]);
    const [pullProgress, setPullProgress] = useState(null);
    const [pulling, setPulling] = useState(false);

    useEffect(() => {
        fetchRemoteDomains();
    }, []);

    const fetchRemoteDomains = async () => {
        setLoadingRemoteDomains(true);
        const token = localStorage.getItem('solace_token');
        if (!token) {
            setLoadingRemoteDomains(false);
            return;
        }
        try {
            const res = await fetch('/api/design/remote-domains', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setRemoteDomains(data.sort((a, b) => a.name.localeCompare(b.name)));
            }
        } catch (err) {
            console.error('Failed to fetch remote domains:', err);
        } finally {
            setLoadingRemoteDomains(false);
        }
    };

    const handleBulkPull = async () => {
        if (selectedPullDomains.length === 0) return;
        setPulling(true);
        setPullProgress(`Starting pull for ${selectedPullDomains.length} domains...`);

        for (let i = 0; i < selectedPullDomains.length; i++) {
            const domainId = selectedPullDomains[i];
            const domainName = remoteDomains.find(d => d.id === domainId)?.name || domainId;
            setPullProgress(`Pulling ${domainName} (${i + 1}/${selectedPullDomains.length})...`);
            await handlePull(domainId);
        }

        setPulling(false);
        setPullProgress(null);
        setSelectedPullDomains([]);
        setPullSearchTerm('');
    };

    const handlePull = async (domainId) => {
        const token = localStorage.getItem('solace_token');
        if (!token) return;

        try {
            const res = await fetch('/api/design/pull', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ domainId })
            });

            if (!res.ok) {
                const err = await res.json();
                console.error('Pull failed:', err);
            }
        } catch (err) {
            console.error('Pull error:', err);
        }
    };

    const togglePullDomainSelection = (id) => {
        if (selectedPullDomains.includes(id)) {
            setSelectedPullDomains(selectedPullDomains.filter(d => d !== id));
        } else {
            setSelectedPullDomains([...selectedPullDomains, id]);
        }
    };

    const filteredRemoteDomains = remoteDomains.filter(d => {
        if (!pullSearchTerm) return true;
        try {
            const regex = new RegExp(pullSearchTerm, 'i');
            return regex.test(d.name);
        } catch (e) {
            return d.name.toLowerCase().includes(pullSearchTerm.toLowerCase());
        }
    });

    return (
        <Layout>
            <div className="min-h-screen bg-slate-950 text-white pb-32">
                {/* Hero Section */}
                <div className="relative pt-16 pb-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center">
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
                            Import Domains
                        </h1>
                        <p className="max-w-2xl mx-auto text-lg text-slate-400">
                            Select application domains from Solace Cloud to synchronize with your local workspace.
                        </p>
                    </motion.div>

                    {/* Search Bar */}
                    <motion.div
                        className="mt-8 w-full max-w-2xl relative group"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                    >
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-11 pr-4 py-4 bg-slate-900/50 border border-slate-800 rounded-2xl leading-5 placeholder-slate-500 focus:outline-none focus:bg-slate-900 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all duration-200 shadow-xl backdrop-blur-sm text-lg"
                            placeholder="Search domains..."
                            value={pullSearchTerm}
                            onChange={(e) => setPullSearchTerm(e.target.value)}
                        />
                    </motion.div>
                </div>

                {/* Main Content */}
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="bg-slate-900/30 border border-slate-800/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-2xl">
                        {/* Table Header */}
                        <div className="grid grid-cols-[80px_1fr_120px] border-b border-slate-800/50 bg-slate-900/50 p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            <div className="text-center">Select</div>
                            <div>Domain Name</div>
                            <div className="text-right pr-4">Status</div>
                        </div>

                        {/* Table Body */}
                        <div className="divide-y divide-slate-800/50">
                            {loadingRemoteDomains ? (
                                <div className="p-20 flex flex-col items-center justify-center text-slate-500 gap-4">
                                    <RefreshCw className="animate-spin text-blue-500" size={32} />
                                    <span className="text-lg font-medium">Loading domains...</span>
                                </div>
                            ) : filteredRemoteDomains.length === 0 ? (
                                <div className="p-20 flex flex-col items-center justify-center text-slate-500 gap-4">
                                    <AlertCircle size={32} />
                                    <span className="text-lg font-medium">No domains found</span>
                                </div>
                            ) : (
                                <AnimatePresence>
                                    {filteredRemoteDomains.map((d, index) => {
                                        const isSelected = selectedPullDomains.includes(d.id);
                                        return (
                                            <motion.div
                                                key={d.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: index * 0.03, duration: 0.2 }}
                                                onClick={() => togglePullDomainSelection(d.id)}
                                                className={`
                                                    grid grid-cols-[80px_1fr_120px] items-center p-4 cursor-pointer transition-all duration-200 group
                                                    ${isSelected ? 'bg-blue-500/10' : 'hover:bg-slate-800/50'}
                                                `}
                                            >
                                                <div className="flex justify-center">
                                                    <div className={`
                                                        h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all duration-200
                                                        ${isSelected
                                                            ? 'bg-blue-500 border-blue-500 shadow-lg shadow-blue-500/30 scale-110'
                                                            : 'border-slate-600 group-hover:border-slate-500 bg-transparent'
                                                        }
                                                    `}>
                                                        {isSelected && <CheckCircle size={12} className="text-white" strokeWidth={4} />}
                                                    </div>
                                                </div>
                                                <div className={`font-medium text-lg transition-colors ${isSelected ? 'text-blue-400' : 'text-slate-300 group-hover:text-white'}`}>
                                                    {d.name}
                                                </div>
                                                <div className="text-right pr-4">
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
                                                        Remote
                                                    </span>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 text-center text-sm text-slate-500">
                        Showing {filteredRemoteDomains.length} domains
                    </div>
                </div>

                {/* Floating Action Bar */}
                <AnimatePresence>
                    {selectedPullDomains.length > 0 && (
                        <motion.div
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 100, opacity: 0 }}
                            className="fixed bottom-8 left-0 right-0 flex justify-center z-50 px-4"
                        >
                            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/50 p-2 pl-6 flex items-center gap-6 backdrop-blur-md">
                                <div className="flex items-center gap-2 text-slate-300">
                                    <span className="text-white font-bold text-lg">{selectedPullDomains.length}</span>
                                    <span className="text-sm font-medium">selected</span>
                                </div>

                                <div className="h-8 w-px bg-slate-700"></div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setSelectedPullDomains([])}
                                        className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"
                                        title="Clear selection"
                                    >
                                        <X size={20} />
                                    </button>
                                    <button
                                        onClick={handleBulkPull}
                                        disabled={pulling}
                                        className={`
                                            flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white shadow-lg transition-all
                                            ${pulling
                                                ? 'bg-slate-700 cursor-not-allowed'
                                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 hover:shadow-blue-500/25 hover:-translate-y-0.5 active:translate-y-0'
                                            }
                                        `}
                                    >
                                        {pulling ? (
                                            <>
                                                <RefreshCw className="animate-spin" size={20} />
                                                Pulling...
                                            </>
                                        ) : (
                                            <>
                                                <Download size={20} />
                                                Pull Domains
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </Layout>
    );
}
