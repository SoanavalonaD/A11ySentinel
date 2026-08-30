import React, { useEffect, useState } from 'react';
import { Sun, Moon, FileText, Cpu, ExternalLink, Globe } from 'lucide-react';
import logoImg from '../assets/logo.png';

interface NavbarProps {
  onLoadFixture: (fixtureName: 'sample' | 'demo') => void;
  activeFixture: string;
  onOpenReport: () => void;
  isReportMode: boolean;
  targetUrl?: string;
}

type Theme = 'light' | 'dark';

const THEME_KEY = 'a11ysentinel-theme';

/**
 * Resolve the theme the same way the pre-paint script in index.html does:
 * an explicit stored choice wins, otherwise follow the OS preference.
 */
function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Private mode, blocked storage — fall through to the OS preference.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const Navbar: React.FC<NavbarProps> = ({
  onLoadFixture,
  activeFixture,
  onOpenReport,
  isReportMode,
  targetUrl,
}) => {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Persisting is a convenience; the theme still applies for this session.
    }
  }, [theme]);

  // `onOpenReport` toggles, so only fire it when the target view differs.
  const goTo = (view: 'dashboard' | 'report') => {
    if ((view === 'report') !== isReportMode) onOpenReport();
  };

  return (
    <header className="sticky top-0 z-50 bg-panel border-b border-line2">
      <div className="max-w-[1280px] mx-auto px-6">
        {/* Row 1 — brand and actions. Wraps as whole items rather than overflowing. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 min-h-[66px] py-2">
          <div className="flex items-center gap-3 flex-[1_1_300px] min-w-0">
            <span className="w-[36px] h-[36px] shrink-0 grid place-items-center bg-sunk rounded overflow-hidden">
              <img src={logoImg} alt="A11ySentinel Logo" className="w-full h-full object-contain" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display font-bold text-[19px] tracking-[0.2px] text-head leading-none">
                  A11ySentinel
                </span>
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.5px] text-cblue border border-line2 px-1.5 py-0.5 whitespace-nowrap">
                  ADK Agent Pipeline
                </span>
              </div>
              <p className="text-[11px] text-bodyp mt-0.5 truncate">
                Source-Level WCAG 2.1 AA 
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Dynamic Active Audit Site Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-sunk border border-line2 text-[11px] whitespace-nowrap">
              <Globe className="w-3.5 h-3.5 text-cblue shrink-0" strokeWidth={1.5} />
              <span className="text-bodyp font-medium">Audit target:</span>
              <span className="font-mono font-semibold text-head truncate max-w-[200px]" title={targetUrl}>
                {targetUrl || 'https://example.com'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => goTo('report')}
              className="px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap border border-line2 text-bodyp hover:text-head transition-colors"
            >
              <FileText className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" strokeWidth={1.5} />
              Remediation Report
            </button>

            <span className="flex items-center gap-2 px-3 py-1.5 border border-line2 text-[11px] font-semibold text-cgreen whitespace-nowrap">
              <span className="relative grid place-items-center w-[7px] h-[7px]">
                <span className="absolute inset-0 rounded-full bg-green" />
                <span className="absolute inset-0 rounded-full bg-green a11-pulse" />
              </span>
              Cloud Run Active
              <Cpu className="w-3.5 h-3.5" strokeWidth={1.5} />
              <ExternalLink className="w-3 h-3 opacity-70" strokeWidth={1.5} />
            </span>

            {/* Theme switcher — always word-labelled, never icon-only. */}
            <div
              role="group"
              aria-label="Colour theme"
              className="flex items-center border border-line2"
            >
              <button
                type="button"
                onClick={() => setTheme('light')}
                aria-pressed={theme === 'light'}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                  theme === 'light'
                    ? 'bg-fill-blue text-on-fill'
                    : 'bg-transparent text-bodyp hover:text-head'
                }`}
              >
                <Sun className="w-3.5 h-3.5" strokeWidth={1.5} />
                Light
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                aria-pressed={theme === 'dark'}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                  theme === 'dark'
                    ? 'bg-fill-blue text-on-fill'
                    : 'bg-transparent text-bodyp hover:text-head'
                }`}
              >
                <Moon className="w-3.5 h-3.5" strokeWidth={1.5} />
                Dark
              </button>
            </div>
          </div>
        </div>

        {/* Row 2 — view tabs. */}
        <nav className="flex items-center gap-6 border-t border-line" aria-label="View">
          {(
            [
              ['dashboard', 'Dashboard'],
              ['report', 'Remediation Report'],
            ] as const
          ).map(([view, label]) => {
            const active = (view === 'report') === isReportMode;
            return (
              <button
                key={view}
                type="button"
                onClick={() => goTo(view)}
                aria-current={active ? 'page' : undefined}
                className={`py-2.5 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors ${
                  active
                    ? 'border-blue text-head'
                    : 'border-transparent text-bodyp hover:text-head'
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
