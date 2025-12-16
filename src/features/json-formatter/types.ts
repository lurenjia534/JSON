import type { JsonGraph } from "@/components/json/lib/jsonGraph";

export type IndentOption = "2" | "4" | "tab";
export type OutputKind =
  | "formatted"
  | "minified"
  | "escaped"
  | "unescaped"
  | null;
export type RightPane = "canvas" | "output";
export type GraphPreset = "default" | "more" | "all";
export type CanvasMode = "flow" | "native";
export type MobilePane = "input" | RightPane;

export type GraphOptions = {
  maxDepth: number;
  maxNodes: number;
  maxChildrenPerNode: number;
};

export type FormatterStats = {
  inputBytes: number;
  outputBytes: number;
};

export type FormatterState = {
  input: string;
  output: string;
  outputKind: OutputKind;
  rightPane: RightPane;
  mobilePane: MobilePane;
  parsedValue: unknown | undefined;
  indent: IndentOption;
  sortKeys: boolean;
  graphPreset: GraphPreset;
  canvasMode: CanvasMode;
  error: string | null;
  message: string | null;
  timingMs: number | null;
  inputFileName: string | null;
  inputFileBytes: number | null;
  stats: FormatterStats;
  graph: JsonGraph | null;
  tabSize: number;
  insertSpaces: boolean;
};

export type FormatterActions = {
  updateInput(next: string): void;
  setIndent(next: IndentOption): void;
  setSortKeys(next: boolean): void;
  setGraphPreset(next: GraphPreset): void;
  setCanvasMode(next: CanvasMode): void;
  setRightPane(next: RightPane): void;
  setMobilePane(next: MobilePane): void;
  format(): void;
  minify(): void;
  escapeText(): void;
  unescapeText(): void;
  validate(): void;
  clear(): void;
  copyInput(): Promise<void>;
  copyOutput(): Promise<void>;
  pasteFromClipboard(): Promise<void>;
  handleFileLoaded(file: File): Promise<void>;
  downloadOutput(): void;
};

export type UseJsonFormatterOptions = {
  onFocusInput?: () => void;
  onRevealInputPosition?: (position: { line: number; column: number }) => void;
};
