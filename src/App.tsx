import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Video, 
  Mic, 
  Image as ImageIcon, 
  Youtube, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Play,
  Pause,
  Upload,
  Download,
  ArrowRight,
  ShoppingBag,
  FolderDown,
  Code
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { searchProduct, generateScript, generateAudio, generateVisual } from './services/gemini';
import { cn } from './lib/utils';

interface Script {
  hook: string;
  body: string;
  cta: string;
}

export default function App() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'search' | 'script' | 'preview' | 'upload'>('search');
  const [language, setLanguage] = useState<'English' | 'Hindi'>('English');
  const [productInfo, setProductInfo] = useState('');
  const [script, setScript] = useState<Script | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isYoutubeConnected, setIsYoutubeConnected] = useState(() => {
    try {
      return localStorage.getItem('isYoutubeConnected') === 'true';
    } catch {
      return false;
    }
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Persistence
  useEffect(() => {
    try {
      const savedState = localStorage.getItem('shorts_ai_state');
      if (savedState) {
        const state = JSON.parse(savedState);
        setQuery(state.query || '');
        setStep(state.step || 'search');
        setProductInfo(state.productInfo || '');
        setScript(state.script || null);
        // We don't restore audioUrl/imageUrl from localStorage as they are too large
      }
    } catch (e) {
      console.error("Failed to restore state:", e);
    }

    // Check for success flag in URL (fallback for non-popup flow)
    const params = new URLSearchParams(window.location.search);
    if (params.get('youtube_success') === 'true') {
      setIsYoutubeConnected(true);
      localStorage.setItem('isYoutubeConnected', 'true');
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    try {
      // Only persist small, non-circular data
      const state = { 
        query: String(query || ''), 
        step: String(step || 'search'), 
        productInfo: String(productInfo || ''), 
        script: script ? {
          hook: String(script.hook),
          body: String(script.body),
          cta: String(script.cta)
        } : null
      };
      localStorage.setItem('shorts_ai_state', JSON.stringify(state));
    } catch (e) {
      console.warn("Persistence failed:", e);
    }
  }, [query, step, productInfo, script]);

  useEffect(() => {
    localStorage.setItem('isYoutubeConnected', String(isYoutubeConnected));
  }, [isYoutubeConnected]);

  // Cleanup Object URLs
  useEffect(() => {
    return () => {
      if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
      if (imageUrl?.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
    };
  }, [audioUrl, imageUrl]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'YOUTUBE_AUTH_SUCCESS') {
        setIsYoutubeConnected(true);
        setStep('preview'); // Go back to preview if we were there
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const clearState = () => {
    localStorage.removeItem('shorts_ai_state');
    setQuery('');
    setStep('search');
    setProductInfo('');
    setScript(null);
    setAudioUrl(null);
    setImageUrl(null);
  };

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true);
    setError(null);
    try {
      const info = await searchProduct(query);
      if (!info) throw new Error("Could not find product information. Please try a different search term.");
      
      setProductInfo(info);
      const generatedScript = await generateScript(info, language);
      if (!generatedScript) throw new Error("Failed to generate script.");
      
      setScript(generatedScript);
      setStep('script');
    } catch (err: any) {
      console.error("Search error:", err);
      setError(err.message || "An unexpected error occurred during search. Please check your API key and connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAssets = async () => {
    if (!script) return;
    setLoading(true);
    try {
      const fullText = `${script.hook}. ${script.body}. ${script.cta}`;
      const [audio, image] = await Promise.all([
        generateAudio(fullText, language),
        generateVisual(query)
      ]);
      setAudioUrl(audio);
      setImageUrl(image);
      setStep('preview');
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const connectYoutube = async () => {
    try {
      const response = await fetch('/api/auth/youtube/url');
      const { url } = await response.json();
      window.open(url, 'youtube_auth', 'width=600,height=700');
    } catch (error) {
      console.error(error);
    }
  };

  const toggleAudio = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleDownload = () => {
    if (imageUrl) {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `shorts-visual-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    if (audioUrl) {
      const link = document.createElement('a');
      link.href = audioUrl;
      link.download = `shorts-audio-${Date.now()}.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleDownloadAll = async () => {
    const zip = new JSZip();
    
    if (imageUrl) {
      const imgData = await fetch(imageUrl).then(r => r.blob());
      zip.file("visual.png", imgData);
    }
    
    if (audioUrl) {
      const audioData = await fetch(audioUrl).then(r => r.blob());
      zip.file("audio.wav", audioData);
    }

    if (script) {
      const scriptText = `HOOK: ${script.hook}\n\nBODY: ${script.body}\n\nCTA: ${script.cta}`;
      zip.file("script.txt", scriptText);
    }

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `shorts-ai-bundle-${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadSource = () => {
    window.location.href = '/api/download-source';
  };

  const handleUpload = async () => {
    setUploading(true);
    // Simulate upload since we need a video file for real YouTube upload
    // In a production app, you would send the assets to a server to be merged into a video
    await new Promise(resolve => setTimeout(resolve, 2000));
    alert("Upload simulation successful! In a production environment, the image and audio would be merged into a .mp4 file and uploaded to your YouTube channel.");
    setUploading(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
              <Video className="w-5 h-5 text-black" />
            </div>
            <span className="font-bold text-xl tracking-tight">ShortsAI</span>
          </div>
          <div className="flex items-center gap-4">
            {isYoutubeConnected ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4" />
                YouTube Connected
              </div>
            ) : (
              <button 
                onClick={connectYoutube}
                className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-full text-sm font-bold hover:bg-zinc-200 transition-colors"
              >
                <Youtube className="w-4 h-4" />
                Connect YouTube
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {step === 'search' && (
            <motion.div 
              key="search"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8 text-center"
            >
              <div className="space-y-4">
                <h1 className="text-5xl md:text-6xl font-bold tracking-tighter bg-gradient-to-b from-white to-white/50 bg-clip-text text-transparent">
                  Turn Products into <br /> Viral Shorts
                </h1>
                <p className="text-zinc-400 text-lg max-w-xl mx-auto">
                  Enter an Amazon product name or URL, and we'll generate a complete YouTube Short with AI voiceover and visuals.
                </p>
              </div>

              <div className="flex flex-col items-center gap-6 max-w-2xl mx-auto">
                <div className="flex bg-zinc-900/80 p-1 rounded-xl border border-white/10">
                  <button 
                    onClick={() => setLanguage('English')}
                    className={cn(
                      "px-6 py-2 rounded-lg text-sm font-bold transition-all",
                      language === 'English' ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"
                    )}
                  >
                    English
                  </button>
                  <button 
                    onClick={() => setLanguage('Hindi')}
                    className={cn(
                      "px-6 py-2 rounded-lg text-sm font-bold transition-all",
                      language === 'Hindi' ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"
                    )}
                  >
                    Hindi
                  </button>
                </div>

                <div className="relative w-full">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                    <ShoppingBag className="w-5 h-5 text-zinc-500" />
                  </div>
                  <input 
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. Sony WH-1000XM5 Headphones"
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl py-5 pl-12 pr-32 text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <button 
                    onClick={handleSearch}
                    disabled={loading || !query}
                    className="absolute right-2 top-2 bottom-2 px-6 bg-emerald-500 text-black rounded-xl font-bold hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                    Generate
                  </button>
                </div>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="max-w-2xl mx-auto p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm"
                >
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p className="text-left">{error}</p>
                </motion.div>
              )}
            </motion.div>
          )}

          {step === 'script' && script && (
            <motion.div 
              key="script"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold">Review Script</h2>
                <button 
                  onClick={clearState}
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  Start Over
                </button>
              </div>

              <div className="grid gap-6">
                {[
                  { label: 'The Hook', content: script.hook, icon: <AlertCircle className="text-amber-400" /> },
                  { label: 'The Details', content: script.body, icon: <Mic className="text-blue-400" /> },
                  { label: 'Call to Action', content: script.cta, icon: <ArrowRight className="text-emerald-400" /> }
                ].map((item, i) => (
                  <div key={i} className="p-6 bg-zinc-900/50 border border-white/5 rounded-2xl space-y-2">
                    <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-zinc-500">
                      {item.icon}
                      {item.label}
                    </div>
                    <p className="text-xl text-zinc-200 leading-relaxed">{item.content}</p>
                  </div>
                ))}
              </div>

              <button 
                onClick={handleGenerateAssets}
                disabled={loading}
                className="w-full py-5 bg-emerald-500 text-black rounded-2xl font-bold text-xl hover:bg-emerald-400 transition-all flex items-center justify-center gap-3"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    Generating Voice & Visuals...
                  </>
                ) : (
                  <>
                    <Video className="w-6 h-6" />
                    Generate Video Assets
                  </>
                )}
              </button>
            </motion.div>
          )}

          {step === 'preview' && (
            <motion.div 
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="grid md:grid-cols-2 gap-12 items-start"
            >
              <div className="space-y-6">
                <div className="aspect-[9/16] bg-zinc-900 rounded-3xl overflow-hidden border border-white/10 relative group shadow-2xl shadow-emerald-500/10">
                  {imageUrl ? (
                    <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-12 h-12 text-zinc-800" />
                    </div>
                  )}
                  
                  <div className="absolute inset-0 bg-black/40 flex flex-col justify-end p-8 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-lg font-bold leading-tight line-clamp-3">
                      {script?.hook}
                    </p>
                  </div>

                  <button 
                    onClick={toggleAudio}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-emerald-500 text-black rounded-full flex items-center justify-center shadow-xl hover:scale-110 transition-transform"
                  >
                    {isPlaying ? <Pause className="w-10 h-10 fill-current" /> : <Play className="w-10 h-10 fill-current ml-2" />}
                  </button>
                </div>

                {audioUrl && (
                  <audio 
                    ref={audioRef} 
                    src={audioUrl} 
                    onEnded={() => setIsPlaying(false)}
                    onError={(e) => {
                      console.error("Audio playback error:", e);
                      setIsPlaying(false);
                    }}
                    className="hidden"
                  />
                )}
              </div>

              <div className="space-y-8">
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold">Ready to Publish</h2>
                  <p className="text-zinc-400">Your AI-generated product review is ready for YouTube Shorts.</p>
                </div>

                <div className="p-6 bg-zinc-900/50 border border-white/5 rounded-2xl space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div>
                      <p className="font-bold">AI Voiceover Generated</p>
                      <p className="text-sm text-zinc-500">High-quality "Puck" voice</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div>
                      <p className="font-bold">Cinematic Visuals Ready</p>
                      <p className="text-sm text-zinc-500">9:16 Vertical Aspect Ratio</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {!isYoutubeConnected ? (
                    <button 
                      onClick={connectYoutube}
                      className="w-full py-4 bg-white text-black rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-200 transition-all"
                    >
                      <Youtube className="w-5 h-5" />
                      Connect YouTube to Upload
                    </button>
                  ) : (
                    <button 
                      onClick={handleUpload}
                      disabled={uploading}
                      className="w-full py-4 bg-emerald-500 text-black rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-400 transition-all disabled:opacity-50"
                    >
                      {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                      {uploading ? 'Uploading...' : 'Upload to YouTube Shorts'}
                    </button>
                  )}
                  <button 
                    onClick={handleDownloadAll}
                    className="w-full py-4 bg-emerald-500/10 text-emerald-400 rounded-2xl font-bold border border-emerald-500/20 hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    <FolderDown className="w-5 h-5" />
                    Download All (ZIP)
                  </button>
                  <button 
                    onClick={handleDownload}
                    className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold border border-white/5 hover:bg-zinc-800 transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Download Assets
                  </button>
                  <button 
                    onClick={clearState}
                    className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold border border-white/5 hover:bg-zinc-800 transition-all"
                  >
                    Discard & Start New
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Background Decor */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
      </div>
    </div>
  );
}
