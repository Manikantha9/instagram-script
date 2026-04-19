/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Instagram, 
  Send, 
  Download, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  FileSpreadsheet,
  PlusCircle,
  Trash2,
  ExternalLink,
  Info,
  Layers,
  Activity,
  ArrowRight
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

interface ReelItem {
  id: string;
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  transcript?: string;
  error?: string;
  thumbnail?: string;
}

export default function App() {
  const [linksText, setLinksText] = useState('');
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>(['[system] System ready. Waiting for input...']);

  const aiRef = useRef<GoogleGenAI | null>(null);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-8), msg]);
  };

  const parseLinks = () => {
    const lines = linksText.split('\n').map(line => line.trim());
    const urls = lines
      .filter(line => line.startsWith('http'))
      .map(url => ({
        id: Math.random().toString(36).substring(7),
        url,
        status: 'pending' as const
      }));
    
    if (urls.length > 0) {
      setReels(prev => [...prev, ...urls]);
      addLog(`[system] Added ${urls.length} URLs to queue.`);
      setLinksText('');
    }
  };

  const clearReels = () => {
    setReels([]);
    addLog('[system] Queue cleared.');
  };

  const processAll = async () => {
    if (reels.length === 0) return;
    setIsProcessing(true);
    setProgress(0);
    addLog('[system] Initializing Gemini Flash model...');

    if (!aiRef.current) {
      aiRef.current = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }

    const updatedReels = [...reels];
    const MAX_RETRIES = 1; // High-level retry attempt (1 extra try)
    
    for (let i = 0; i < updatedReels.length; i++) {
      if (updatedReels[i].status === 'completed') continue;

      let attempt = 0;
      let success = false;

      while (attempt <= MAX_RETRIES && !success) {
        if (attempt > 0) {
          addLog(`[retry] Attempting recovery for reel_${i+1}...`);
          // Small wait before retry
          await new Promise(r => setTimeout(r, 2000));
        }

        setReels(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'processing' } : r));
        addLog(`[processing] reel_${i+1}/${updatedReels.length}${attempt > 0 ? ` (Retry ${attempt})` : ''} downloading...`);

        try {
          const response = await fetch('/api/get-video-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: updatedReels[i].url })
          });

          if (!response.ok) throw new Error('Extraction failed');
          const { videoUrl, type } = await response.json();

          addLog(`[gemini] Analyzing media stream...`);
          const videoResponse = await fetch(videoUrl);
          const videoBlob = await videoResponse.blob();
          
          const base64Data = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(videoBlob);
          });

          const geminiResponse = await aiRef.current!.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType: type || "video/mp4",
                      data: base64Data
                    }
                  },
                  {
                    text: "You are a professional transcriber. Transcribe this Instagram Reel exactly. Output only text. No meta-talk."
                  }
                ]
              }
            ]
          });

          const transcript = geminiResponse.text || "No text detected.";
          addLog(`[done] Transcribed: "${transcript.substring(0, 40)}..."`);

          setReels(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'completed', transcript } : r));
          success = true;
        } catch (err: any) {
          attempt++;
          if (attempt > MAX_RETRIES) {
            addLog(`[skip] Permanently failed: ${updatedReels[i].url.substring(0, 30)}...`);
            setReels(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', error: err.message } : r));
          }
        }
      }

      setProgress(((i + 1) / updatedReels.length) * 100);
    }

    setIsProcessing(false);
    addLog('[system] Batch processing complete.');
  };

  const exportToExcel = async () => {
    const response = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: reels.map(r => ({ url: r.url, transcript: r.transcript || r.error || '' })) })
    });

    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'IG_Transcripts.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  const completedCount = reels.filter(r => r.status === 'completed').length;

  return (
    <div className="flex flex-col h-screen bg-bg text-text-main font-sans overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-border flex items-center px-6 justify-between shrink-0 bg-bg">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-accent rounded flex items-center justify-center text-bg">
            <Instagram size={14} />
          </div>
          <div className="text-lg font-bold tracking-tight">
            IG_TRANSCRIBER <span className="font-light opacity-50 ml-1">v2.1</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-accent/10 text-accent px-3 py-1 rounded-full text-[12px] font-semibold border border-accent/20 uppercase tracking-wide flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-accent animate-pulse' : 'bg-accent'}`} />
            {isProcessing ? 'Processing Active' : 'System Idle'}
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 overflow-hidden grid grid-cols-[280px_1fr]">
        {/* Sidebar */}
        <aside className="border-r border-border p-6 flex flex-col gap-8 bg-bg">
          <section>
            <h3 className="sidebar-title">Environment Specs</h3>
            <ul className="space-y-2">
              {[
                { name: 'Gemini 3 Flash', status: 'online' },
                { name: 'Instagram Scrapper', status: 'online' },
                { name: 'Excel Service', status: 'online' }
              ].map(dep => (
                <li key={dep.name} className="flex items-center justify-between py-2 text-[13px] border-b border-border/50">
                  <span className="text-text-main/80">{dep.name}</span>
                  <div className="w-2 h-2 rounded-full bg-accent" />
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="sidebar-title">Batch Analytics</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border p-4 rounded-lg">
                <div className="text-2xl font-bold flex items-end gap-1">
                  {completedCount}
                  <span className="text-xs text-text-dim font-normal pb-1">/{reels.length}</span>
                </div>
                <div className="text-[10px] uppercase font-bold text-text-dim mt-1">Processed</div>
              </div>
              <div className="bg-card border border-border p-4 rounded-lg">
                <div className="text-2xl font-bold">
                  {isProcessing ? '...' : '0s'}
                </div>
                <div className="text-[10px] uppercase font-bold text-text-dim mt-1">Av. Time</div>
              </div>
            </div>
          </section>

          <section className="mt-auto">
            <h3 className="sidebar-title">Controls</h3>
            <div className="flex flex-col gap-3">
              <button
                onClick={processAll}
                disabled={isProcessing || reels.length === 0}
                className="w-full bg-accent text-bg py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-20 disabled:grayscale transition-all active:scale-95"
              >
                {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Run Pipeline
              </button>
              <button
                onClick={exportToExcel}
                disabled={completedCount === 0}
                className="w-full bg-card border border-border text-text-main py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 hover:bg-border/50 transition-all disabled:opacity-20 active:scale-95"
              >
                <FileSpreadsheet size={16} />
                Export XLSX
              </button>
            </div>
          </section>
        </aside>

        {/* Main Content Area */}
        <main className="flex flex-col overflow-hidden p-6 gap-6 bg-bg/50">
          <div className="grid grid-cols-[1fr_320px] gap-6 flex-1 overflow-hidden">
            {/* Queue List */}
            <div className="flex flex-col gap-4 overflow-hidden">
              <div className="flex items-center justify-between">
                <h3 className="sidebar-title mb-0">Processing Queue</h3>
                <button 
                  onClick={clearReels}
                  className="text-text-dim hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                <AnimatePresence mode="popLayout">
                  {reels.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-text-dim/30 border border-dashed border-border rounded-xl">
                      <Layers size={48} strokeWidth={1} className="mb-4" />
                      <p className="text-sm">Pipeline empty.</p>
                      <p className="text-[10px] uppercase tracking-widest mt-1">Awaiting URL ingestion</p>
                    </div>
                  ) : (
                    reels.map((reel, idx) => (
                      <motion.div
                        key={reel.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={`bg-card border ${reel.status === 'processing' ? 'border-accent' : 'border-border'} rounded-lg p-5 group transition-all`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-8 h-8 rounded bg-bg border border-border flex items-center justify-center text-[10px] font-bold text-text-dim">
                            {String(idx + 1).padStart(2, '0')}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                  reel.status === 'completed' ? 'bg-accent/10 text-accent' : 
                                  reel.status === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-border/50 text-text-dim'
                                }`}>
                                  {reel.status}
                                </span>
                                <a 
                                  href={reel.url} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="text-[11px] font-mono text-text-dim hover:text-accent transition-colors truncate block max-w-[200px]"
                                >
                                  {reel.url}
                                </a>
                              </div>
                            </div>
                            
                            {reel.transcript && (
                              <div className="text-xs text-text-main/80 leading-relaxed font-sans bg-bg/50 p-3 rounded border border-border/50 italic">
                                "{reel.transcript}"
                              </div>
                            )}

                            {reel.status === 'processing' && (
                              <div className="flex items-center gap-2 text-xs text-accent py-2">
                                <Loader2 size={12} className="animate-spin" />
                                Analyzing audio track...
                              </div>
                            )}

                            {reel.error && (
                              <div className="text-[11px] text-red-400 mt-2 bg-red-500/5 p-2 rounded border border-red-500/10">
                                {reel.error}
                              </div>
                            )}
                          </div>
                          {reel.status === 'completed' && (
                            <CheckCircle2 size={18} className="text-accent" />
                          )}
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Sidebar Tools (Input & Terminal) */}
            <div className="flex flex-col gap-6 overflow-hidden">
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="sidebar-title flex items-center justify-between">
                  Link Ingestion
                  <Activity size={12} />
                </h3>
                <textarea
                  value={linksText}
                  onChange={(e) => setLinksText(e.target.value)}
                  placeholder="Paste Reel URLs..."
                  className="w-full h-32 bg-bg border border-border rounded-lg p-3 text-[12px] font-mono text-text-main focus:outline-none focus:border-accent transition-colors resize-none mb-3"
                />
                <button
                  onClick={parseLinks}
                  disabled={!linksText.trim()}
                  className="w-full bg-bg border border-border text-accent py-2 rounded-lg text-xs font-bold hover:bg-border/50 transition-all flex items-center justify-center gap-2"
                >
                  <PlusCircle size={14} />
                  Queue URLs
                </button>
              </div>

              {/* Terminal */}
              <div className="terminal-card flex-1 flex flex-col">
                <div className="absolute top-0 left-0 right-0 h-8 bg-border/20 flex items-center px-3 gap-1.5 border-b border-border">
                  <div className="w-2 h-2 rounded-full bg-text-dim/30" />
                  <div className="w-2 h-2 rounded-full bg-text-dim/30" />
                  <div className="w-2 h-2 rounded-full bg-text-dim/30" />
                  <span className="text-[10px] text-text-dim ml-2 opacity-50">run.py - bash</span>
                </div>
                <div className="mt-8 flex-1 overflow-y-auto text-text-dim custom-scrollbar text-[11px]">
                  {logs.map((log, i) => (
                    <div key={i} className="mb-1 leading-relaxed">
                      <span className="text-accent">{log.startsWith('[') ? '>' : ''}</span> {log}
                    </div>
                  ))}
                  {isProcessing && (
                    <div className="animate-pulse">
                      <span className="text-accent">{'>'}</span> processing...
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #262629;
          border-radius: 10px;
        }
      `}} />
    </div>
  );
}
