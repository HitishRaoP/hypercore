"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { BeforeMount, OnChange } from "@monaco-editor/react";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[320px] items-center justify-center rounded-xl bg-[var(--ds-gray-100)]">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
      </div>
    ),
  },
);

const LIGHT_THEME = "hypercore-light";

const handleBeforeMount: BeforeMount = (monaco) => {
  monaco.editor.defineTheme(LIGHT_THEME, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "8f8f8f", fontStyle: "italic" },
      { token: "keyword", foreground: "0062d1" },
      { token: "string", foreground: "398e4a" },
      { token: "number", foreground: "a35200" },
      { token: "type", foreground: "0068d6" },
      { token: "identifier", foreground: "171717" },
    ],
    colors: {
      "editor.background": "#fafafa",
      "editor.foreground": "#171717",
      "editor.lineHighlightBackground": "#f2f2f2",
      "editorLineNumber.foreground": "#a8a8a8",
      "editorLineNumber.activeForeground": "#666666",
      "editorCursor.foreground": "#171717",
      "editor.selectionBackground": "#cce6ff",
      "editor.inactiveSelectionBackground": "#e0f0ff",
      "editorIndentGuide.background1": "#ebebeb",
      "editorIndentGuide.activeBackground1": "#c9c9c9",
      "editorWidget.background": "#ffffff",
      "editorWidget.border": "#ebebeb",
    },
  });

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true,
  });

  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
};

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  path?: string;
  height?: string;
  readOnly?: boolean;
}

export function CodeEditor({
  value,
  onChange,
  language = "typescript",
  path = "index.ts",
  height = "320px",
  readOnly = false,
}: CodeEditorProps) {
  const handleChange: OnChange = (next) => {
    onChange(next ?? "");
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--ds-gray-400)] bg-[#fafafa]">
      <MonacoEditor
        height={height}
        language={language}
        path={path}
        theme={LIGHT_THEME}
        value={value}
        onChange={handleChange}
        beforeMount={handleBeforeMount}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineHeight: 20,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 12, bottom: 12 },
          tabSize: 2,
          renderLineHighlight: "all",
          smoothScrolling: true,
          cursorSmoothCaretAnimation: "on",
          readOnly,
          domReadOnly: readOnly,
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, indentation: true },
          stickyScroll: { enabled: false },
        }}
        loading={
          <div className="flex h-[320px] items-center justify-center bg-[#fafafa]">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
          </div>
        }
      />
    </div>
  );
}
