import Editor from '@monaco-editor/react';

interface DaxEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export default function DaxEditor({ value, onChange, readOnly }: DaxEditorProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-700/50">
      <textarea
        className="sr-only"
        aria-label="DAX query content"
        value={value}
        readOnly
        tabIndex={-1}
      />
      <Editor
        height="200px"
        defaultLanguage="plaintext"
        theme="vs-dark"
        value={value}
        onChange={(v) => onChange(v || '')}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          readOnly,
          automaticLayout: true,
          padding: { top: 8 },
        }}
      />
    </div>
  );
}
