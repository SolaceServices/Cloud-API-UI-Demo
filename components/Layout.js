import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { LayoutDashboard, Box, FileJson, Settings, Activity, Server, Download } from 'lucide-react';
import styles from './Layout.module.css';

const NavItem = ({ href, icon: Icon, label }) => {
    const router = useRouter();
    const isActive = router.pathname === href;

    return (
        <Link href={href} className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}>
            <Icon size={20} />
            <span className="font-medium">{label}</span>
        </Link>
    );
};

export default function Layout({ children }) {
    return (
        <div className={styles.container}>
            {/* Sidebar */}
            <aside className={`${styles.sidebar} glass-panel`}>
                <div className={styles.header}>
                    <div className={styles.brand}>
                        <Activity size={28} />
                        <h1 className={styles.title}>
                            SolCD
                        </h1>
                    </div>
                </div>

                <nav className={styles.nav}>
                    <NavItem href="/" icon={LayoutDashboard} label="Dashboard" />
                    <NavItem href="/designer" icon={Box} label="Designer" />
                    <NavItem href="/import" icon={Download} label="Import" />
                    <NavItem href="/runtime" icon={Server} label="Runtime" />
                    <NavItem href="/json" icon={FileJson} label="JSON Editor" />
                    <NavItem href="/settings" icon={Settings} label="Settings" />
                </nav>

                <div className={styles.footer}>
                    v1.0.0 • Local Mode
                </div>
            </aside>

            {/* Main Content */}
            <main className={styles.main}>
                <div className={styles.background} />
                <div className={styles.content}>
                    {children}
                </div>
            </main>
        </div>
    );
}
