"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

import { JsonCanvas } from "./JsonCanvas";
import { buildJsonGraph } from "./lib/jsonGraph";
import {
  extractJsonErrorPosition,
  formatBytes,
  indexToLineColumn,
  normalizeJsonText,
  sortKeysDeep,
} from "./lib/jsonUtils";

type IndentOption = "2" | "4" | "tab";
type OutputKind = "formatted" | "minified" | null;
type RightPane = "canvas" | "output";

export function JsonFormatter() {
  const [input, setInput] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [outputKind, setOutputKind] = useState<OutputKind>(null);
  const [rightPane, setRightPane] = useState<RightPane>("canvas");
  const [parsedValue, setParsedValue] = useState<unknown | undefined>(
    undefined,
  );
  const [indent, setIndent] = useState<IndentOption>("2");
  const [sortKeys, setSortKeys] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [timingMs, setTimingMs] = useState<number | null>(null);
  const [inputFileName, setInputFileName] = useState<string | null>(null);
  const [inputFileBytes, setInputFileBytes] = useState<number | null>(null);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (messageTimerRef.current != null) {
        window.clearTimeout(messageTimerRef.current);
      }
    };
  }, []);

  const indentValue = useMemo(() => {
    if (indent === "tab") return "\t";
    return Number(indent);
  }, [indent]);

  const stats = useMemo(() => {
    const inputBytes = new Blob([input]).size;
    const outputBytes = new Blob([output]).size;
    return { inputBytes, outputBytes };
  }, [input, output]);

  const graph = useMemo(() => {
    if (parsedValue === undefined) return null;
    return buildJsonGraph(parsedValue, {
      maxDepth: 6,
      maxNodes: 240,
      maxChildrenPerNode: 30,
    });
  }, [parsedValue]);

  function parseOrThrow() {
    const normalized = normalizeJsonText(input);
    if (!normalized) {
      throw new Error("输入为空：请粘贴或上传 JSON。");
    }
    return { normalized, value: JSON.parse(normalized) as unknown };
  }

  function flash(nextMessage: string) {
    setMessage(nextMessage);
    if (messageTimerRef.current != null) {
      window.clearTimeout(messageTimerRef.current);
    }
    messageTimerRef.current = window.setTimeout(() => {
      setMessage(null);
      messageTimerRef.current = null;
    }, 2200);
  }

  function setErrorFromUnknown(
    unknownError: unknown,
    normalizedForPosition?: string,
  ) {
    if (unknownError instanceof Error) {
      const position = extractJsonErrorPosition(unknownError.message);
      if (position != null && normalizedForPosition) {
        const { line, column } = indexToLineColumn(
          normalizedForPosition,
          position,
        );
        setError(`${unknownError.message}（第 ${line} 行，第 ${column} 列）`);
        return;
      }
      setError(unknownError.message);
      return;
    }

    setError("解析失败：未知错误。");
  }

  function handleFormat() {
    setError(null);
    setMessage(null);
    setTimingMs(null);
    setOutputKind(null);

    const start = performance.now();
    try {
      const { value } = parseOrThrow();
      const valueForOutput = sortKeys ? sortKeysDeep(value) : value;
      const formatted = JSON.stringify(valueForOutput, null, indentValue);
      setOutput(`${formatted}\n`);
      setOutputKind("formatted");
      setParsedValue(valueForOutput);
      setTimingMs(performance.now() - start);
      inputRef.current?.focus();
    } catch (unknownError) {
      const normalized = normalizeJsonText(input);
      setOutput("");
      setOutputKind(null);
      setParsedValue(undefined);
      setTimingMs(performance.now() - start);
      setErrorFromUnknown(unknownError, normalized);
    }
  }

  function handleMinify() {
    setError(null);
    setMessage(null);
    setTimingMs(null);
    setOutputKind(null);

    const start = performance.now();
    try {
      const { value } = parseOrThrow();
      const valueForOutput = sortKeys ? sortKeysDeep(value) : value;
      const minified = JSON.stringify(valueForOutput);
      setOutput(`${minified}\n`);
      setOutputKind("minified");
      setParsedValue(valueForOutput);
      setTimingMs(performance.now() - start);
      inputRef.current?.focus();
    } catch (unknownError) {
      const normalized = normalizeJsonText(input);
      setOutput("");
      setOutputKind(null);
      setParsedValue(undefined);
      setTimingMs(performance.now() - start);
      setErrorFromUnknown(unknownError, normalized);
    }
  }

  function handleValidate() {
    setError(null);
    setMessage(null);
    setTimingMs(null);

    const start = performance.now();
    try {
      const { value } = parseOrThrow();
      setParsedValue(sortKeys ? sortKeysDeep(value) : value);
      setTimingMs(performance.now() - start);
      setError(null);
      flash("JSON 校验通过。");
    } catch (unknownError) {
      const normalized = normalizeJsonText(input);
      setParsedValue(undefined);
      setTimingMs(performance.now() - start);
      setErrorFromUnknown(unknownError, normalized);
    }
  }

  function handleClear() {
    setInput("");
    setOutput("");
    setOutputKind(null);
    setError(null);
    setMessage(null);
    setTimingMs(null);
    setParsedValue(undefined);
    setInputFileName(null);
    setInputFileBytes(null);
    inputRef.current?.focus();
  }

  async function writeToClipboard(text: string) {
    if (!text) return;

    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  async function handleCopyInput() {
    setError(null);
    try {
      await writeToClipboard(input);
      flash("已复制输入到剪贴板。");
    } catch {
      setError("复制失败：浏览器未授予剪贴板权限。");
    }
  }

  async function handleCopyOutput() {
    setError(null);
    try {
      await writeToClipboard(output);
      flash("已复制输出到剪贴板。");
    } catch {
      setError("复制失败：浏览器未授予剪贴板权限。");
    }
  }

  async function handlePasteFromClipboard() {
    setError(null);
    setMessage(null);

    if (!navigator.clipboard?.readText || !window.isSecureContext) {
      setError("无法读取剪贴板：需要 HTTPS 或 localhost 环境。");
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      setInput(text);
      setOutput("");
      setOutputKind(null);
      setTimingMs(null);
      setParsedValue(undefined);
      setInputFileName(null);
      setInputFileBytes(null);
      flash("已从剪贴板粘贴到输入。");
      inputRef.current?.focus();
    } catch {
      setError("粘贴失败：浏览器未授予剪贴板权限。");
    }
  }

  function handlePickFile() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    setMessage(null);

    try {
      const text = await file.text();
      setInput(text);
      setOutput("");
      setOutputKind(null);
      setTimingMs(null);
      setParsedValue(undefined);
      setInputFileName(file.name);
      setInputFileBytes(file.size);
      flash(`已加载：${file.name}（${formatBytes(file.size)}）`);
      inputRef.current?.focus();
    } catch {
      setError("读取文件失败：请确认文件可访问且为文本 JSON。");
    }
  }

  function buildDownloadName(): string {
    const base = inputFileName
      ? inputFileName.replace(/\\.json$/i, "")
      : outputKind === "minified"
        ? "minified"
        : "formatted";

    if (outputKind === "minified") return `${base}.min.json`;
    if (outputKind === "formatted") return `${base}.formatted.json`;
    return `${base}.json`;
  }

  function handleDownloadOutput() {
    if (!output) return;

    const blob = new Blob([output], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = buildDownloadName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flash("已开始下载输出文件。");
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200/70 bg-white/80 px-3 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/70">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-zinc-900 px-2 py-0.5 font-mono text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-950">
            {"{}"}
          </span>
          <span className="text-sm font-semibold tracking-tight">JSON Web</span>
        </div>
        <div className="ml-auto flex min-w-0 max-w-[70vw] items-center gap-2 overflow-x-auto">
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            onClick={handlePasteFromClipboard}
          >
            粘贴
          </button>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            onClick={handlePickFile}
          >
            上传
          </button>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
            onClick={handleFormat}
            disabled={!input.trim()}
          >
            格式化
          </button>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            onClick={handleMinify}
            disabled={!input.trim()}
          >
            压缩
          </button>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            onClick={handleValidate}
            disabled={!input.trim()}
          >
            校验
          </button>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            onClick={handleClear}
            disabled={!input && !output}
          >
            清空
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleFileChange}
        />
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <section className="flex min-h-0 flex-col lg:border-r lg:border-zinc-200/70 lg:dark:border-zinc-800/70">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200/70 bg-white/60 p-2 dark:border-zinc-800/70 dark:bg-zinc-950/40">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                输入
              </span>
              {inputFileName ? (
                <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {inputFileName}
                  {inputFileBytes != null
                    ? `（${formatBytes(inputFileBytes)}）`
                    : ""}
                </span>
              ) : (
                <span className="truncate text-xs text-zinc-400 dark:text-zinc-500">
                  粘贴或上传 JSON
                </span>
              )}
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
              <span>缩进</span>
              <select
                className="h-8 rounded-full border border-zinc-200 bg-white px-3 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                value={indent}
                onChange={(e) => setIndent(e.target.value as IndentOption)}
              >
                <option value="2">2</option>
                <option value="4">4</option>
                <option value="tab">Tab</option>
              </select>
            </label>

            <label className="inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                className="h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
                checked={sortKeys}
                onChange={(e) => setSortKeys(e.target.checked)}
              />
              <span>排序 key</span>
            </label>

            <button
              type="button"
              className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              onClick={handleCopyInput}
              disabled={!input}
            >
              复制
            </button>
          </div>

          <textarea
            ref={inputRef}
            className="min-h-0 flex-1 resize-none bg-white p-3 font-mono text-sm leading-6 text-zinc-900 outline-none placeholder:text-zinc-400 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setParsedValue(undefined);
              setError(null);
              setMessage(null);
              setOutputKind(null);
            }}
            placeholder="在这里粘贴 JSON（支持很大的 JSON），或用“上传”导入文件。"
            spellCheck={false}
            wrap="off"
          />
        </section>

        <section className="flex min-h-0 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200/70 bg-white/60 p-2 dark:border-zinc-800/70 dark:bg-zinc-950/40">
            <div className="inline-flex items-center rounded-full border border-zinc-200 bg-white p-0.5 text-xs dark:border-zinc-800 dark:bg-zinc-950">
              <button
                type="button"
                className={`inline-flex h-8 items-center justify-center rounded-full px-3 font-medium ${
                  rightPane === "canvas"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                    : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
                }`}
                onClick={() => setRightPane("canvas")}
              >
                画布
              </button>
              <button
                type="button"
                className={`inline-flex h-8 items-center justify-center rounded-full px-3 font-medium ${
                  rightPane === "output"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                    : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
                }`}
                onClick={() => setRightPane("output")}
              >
                输出
              </button>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                onClick={handleCopyOutput}
                disabled={!output}
              >
                复制
              </button>
              <button
                type="button"
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                onClick={handleDownloadOutput}
                disabled={!output}
              >
                下载
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            {rightPane === "output" ? (
              <textarea
                className="h-full w-full resize-none bg-zinc-50 p-3 font-mono text-sm leading-6 text-zinc-900 outline-none placeholder:text-zinc-400 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-600"
                value={output}
                readOnly
                placeholder="格式化/压缩结果会显示在这里。"
                spellCheck={false}
                wrap="off"
              />
            ) : (
              <JsonCanvas graph={graph} />
            )}
          </div>
        </section>
      </main>

      <footer className="flex shrink-0 items-center gap-3 border-t border-zinc-200/70 bg-white/80 px-3 py-2 text-xs text-zinc-500 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/70 dark:text-zinc-400">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
          <span>输入 {formatBytes(stats.inputBytes)}</span>
          <span>输出 {formatBytes(stats.outputBytes)}</span>
          {timingMs != null ? <span>耗时 {timingMs.toFixed(1)} ms</span> : null}
          {outputKind ? (
            <span>{outputKind === "formatted" ? "已格式化" : "已压缩"}</span>
          ) : null}
          {graph ? (
            <span>
              画布 {graph.nodes.length.toLocaleString()} 节点
              {graph.truncated ? "（截断）" : ""}
            </span>
          ) : null}
        </div>
        {error ? (
          <div className="min-w-0 max-w-[60vw] truncate text-red-700 dark:text-red-300">
            {error}
          </div>
        ) : message ? (
          <div className="min-w-0 max-w-[60vw] truncate">{message}</div>
        ) : (
          <div className="min-w-0 max-w-[60vw] truncate">
            1MB+ JSON 建议用按钮触发解析
          </div>
        )}
      </footer>
    </div>
  );
}
