import { useState } from 'react';

interface NaturalLanguageInputProps {
  onGenerate: (prompt: string) => void;
  loading?: boolean;
}

export default function NaturalLanguageInput({ onGenerate, loading }: NaturalLanguageInputProps) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) onGenerate(prompt.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the data you want to see…"
        className="flex-1 rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
        aria-label="Natural language query"
        disabled={loading}
      />
      <button
        type="submit"
        disabled={!prompt.trim() || loading}
        className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-40"
      >
        {loading ? 'Generating…' : 'Generate DAX'}
      </button>
    </form>
  );
}
