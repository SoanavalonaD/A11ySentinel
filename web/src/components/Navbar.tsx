import React from 'react';
import { ShieldCheck, Cpu, ExternalLink, Sparkles, CheckCircle2, FileText } from 'lucide-react';

interface NavbarProps {
  onLoadFixture: (fixtureName: 'sample' | 'demo') => void;
  activeFixture: string;
  onOpenReport: () => void;
  isReportMode: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ onLoadFixture, activeFixture, onOpenReport, isReportMode }) => {
  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Logo and Brand */}
        <div className="flex items-center space-x-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-emerald-500 p-0.5 shadow-lg shadow-indigo-500/20">
            <div className="w-full h-full bg-[#0a0d14] rounded-[10px] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                A11ySentinel
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                ADK Agent Pipeline
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Source-Level WCAG 2.1 AA / RGAA 4 Audit & Remediation
            </p>
          </div>
        </div>

        {/* Quick Demo Presets & Report Button */}
        <div className="flex items-center space-x-3">
          
          {/* Preset dataset buttons */}
          <div className="hidden lg:flex items-center p-1 bg-slate-900/90 rounded-lg border border-slate-800 text-xs">
            <span className="px-2 text-slate-500 font-medium text-[11px]">Fixtures:</span>
            <button
              onClick={() => onLoadFixture('sample')}
              className={`px-2.5 py-1 rounded-md transition-all font-medium flex items-center space-x-1.5 ${
                activeFixture === 'sample' 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Fixture Contract (aud_7f3c91)</span>
            </button>
            <button
              onClick={() => onLoadFixture('demo')}
              className={`px-2.5 py-1 rounded-md transition-all font-medium flex items-center space-x-1.5 ${
                activeFixture === 'demo' 
                  ? 'bg-emerald-600 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Marché Antsahabe (21→4)</span>
            </button>
          </div>

          {/* Report Document CTA Button */}
          <button
            onClick={onOpenReport}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
              isReportMode 
                ? 'bg-indigo-600 text-white border-indigo-500' 
                : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/20'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Remediation Report</span>
          </button>

          {/* Cloud Run Service Badge */}
          <a
            href="https://a11ysentinel-pipeline-708226575684.us-central1.run.app/health"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs hover:bg-emerald-500/20 transition"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span className="font-medium hidden sm:inline">Cloud Run Active</span>
            <Cpu className="w-3.5 h-3.5" />
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>

        </div>

      </div>
    </header>
  );
};
