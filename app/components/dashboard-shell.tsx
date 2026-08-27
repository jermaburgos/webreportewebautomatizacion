"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { DashboardData, DashboardExecution, DashboardTest, SuiteSummary } from "@/app/lib/dashboard";
import type { WorkflowLaunchRow } from "@/app/lib/workflow-launches";
import {
  formatDurationHuman,
  formatExecutionTime,
  formatNumber,
  formatPercent,
  normalizeExecutionVerdict,
} from "@/app/lib/dashboard";

type SectionId = "overview" | "suites" | "cases" | "launch" | "history" | "executions" | "failures";
type SortDirection = "asc" | "desc";
type SortState<K extends string> = { key: K; direction: SortDirection };
type PageSize = 10 | 20 | 50 | 100;
type PaginationState = { page: number; pageSize: PageSize };
type LaunchRecord = {
  id: string;
  title: string;
  subtitle: string;
  runId: number | null;
  status: string;
  conclusion: string;
  updatedAt: string;
  url: string;
  artifactId: number | null;
  artifactName: string;
  artifactExpired: boolean;
};
type LaunchPanelState = {
  launching: boolean;
  success: string;
  error: string;
  runId: number | null;
  status: string;
  conclusion: string;
  url: string;
  updatedAt: string;
  artifactId: number | null;
  artifactName: string;
  artifactExpired: boolean;
  history: LaunchRecord[];
};

type CaseRow = {
  caseKey: string;
  testName: string;
  className: string;
  groupName: string;
  suiteName: string;
  executions: number;
  passed: number;
  failed: number;
  skipped: number;
  latestTimestamp: string;
  latestStatus: string;
  latestExecutionId: string;
  latestReportUrl: string | null;
};

type CaseExecutionRow = {
  execution: DashboardExecution | null;
  groupName: string;
  status: string;
  timestamp: string;
  duration: number;
  reportUrl: string | null;
  errorMessage: string;
  stacktrace: string;
};

type HistoryRow = {
  id: string;
  kind: "Execution" | "Case";
  title: string;
  subtitle: string;
  suiteName: string;
  status: string;
  timestamp: string;
  duration: number;
  details: string;
  reportUrl: string | null;
};

type ExecutionSortKey = "suite" | "browser" | "verdict" | "timestamp" | "duration" | "tests" | "approval";
type SuiteSortKey = "suite" | "executions" | "cases" | "averageDuration" | "latestTimestamp";
type CaseSortKey = "case" | "suite" | "executions" | "passed" | "failed" | "skipped" | "latestTimestamp";
type CaseExecutionSortKey = "timestamp" | "suite" | "group" | "browser" | "status" | "duration";
type HistorySortKey = "timestamp" | "title" | "suite" | "status" | "duration";
type NavSection = {
  id: SectionId;
  label: string;
  description: string;
};

type LaunchDispatchPayload = {
  message?: string;
  error?: string;
  run_id?: number | null;
  run_status?: string | null;
  run_conclusion?: string | null;
  run_url?: string | null;
  artifact_id?: number | null;
  artifact_name?: string | null;
  artifact_expired?: boolean | null;
} | null;

type LaunchStatusPayload = {
  status?: string;
  conclusion?: string | null;
  html_url?: string;
  updated_at?: string;
  artifact_id?: number | null;
  artifact_name?: string | null;
  artifact_expired?: boolean | null;
};

type LaunchDescriptor = {
  title: string;
  subtitle: string;
  idPrefix: "case" | "suite";
};

const NAV_SECTIONS: NavSection[] = [
  { id: "overview", label: "Resumen", description: "KPIs y la última ejecución." },
  { id: "suites", label: "Suites", description: "Agrupación de casos y métricas." },
  { id: "cases", label: "Casos", description: "Casos únicos y sus ejecuciones." },
  { id: "launch", label: "Lanzar", description: "Dispara pruebas unitarias o suites." },
  { id: "history", label: "Historial", description: "Búsqueda y seguimiento histórico." },
  { id: "executions", label: "Ejecuciones", description: "Listado general de corridas." },
  { id: "failures", label: "Fallos", description: "Errores recientes y sus detalles." },
];

function statusTone(status: string): string {
  if (status === "passed") return "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30";
  if (status === "failed") return "bg-rose-500/15 text-rose-300 ring-rose-400/30";
  if (status === "skipped") return "bg-amber-500/15 text-amber-300 ring-amber-400/30";
  return "bg-slate-500/15 text-slate-200 ring-slate-400/30";
}

function SectionButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex w-full flex-col items-start gap-0.5 rounded-full px-3 py-2 text-left text-xs font-medium transition sm:w-auto sm:px-4 sm:text-sm",
        active ? "bg-white text-slate-950 shadow-lg shadow-black/20" : "text-slate-300 hover:bg-white/8 hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

const PAGE_SIZE_OPTIONS: PageSize[] = [10, 20, 50, 100];

function paginateRows<T>(rows: T[], page: number, pageSize: PageSize) {
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = totalRows ? (currentPage - 1) * pageSize : 0;
  const endIndex = totalRows ? Math.min(startIndex + pageSize, totalRows) : 0;

  return {
    rows: rows.slice(startIndex, endIndex),
    totalRows,
    totalPages,
    currentPage,
    startIndex,
    endIndex,
  };
}

function PaginationControls({
  totalRows,
  page,
  totalPages,
  pageSize,
  alwaysShow = false,
  onPageChange,
  onPageSizeChange,
}: {
  totalRows: number;
  page: number;
  totalPages: number;
  pageSize: PageSize;
  alwaysShow?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSize) => void;
}) {
  if (!alwaysShow && totalRows <= pageSize) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-xs text-slate-400">
        Mostrando <span className="text-slate-100">{Math.min((page - 1) * pageSize + 1, totalRows)}</span>-
        <span className="text-slate-100">{Math.min(page * pageSize, totalRows)}</span> de{" "}
        <span className="text-slate-100">{formatNumber(totalRows)}</span>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-2">
          {PAGE_SIZE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onPageSizeChange(option)}
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                option === pageSize
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
              ].join(" ")}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="min-w-20 text-center text-xs text-slate-400">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}

function compareText(left: string, right: string, direction: SortDirection): number {
  const value = left.localeCompare(right, "es", { sensitivity: "base", numeric: true });
  return direction === "asc" ? value : -value;
}

function compareNumber(left: number, right: number, direction: SortDirection): number {
  const value = left - right;
  return direction === "asc" ? value : -value;
}

function compareDate(left: string, right: string, direction: SortDirection): number {
  const value = new Date(left || "").getTime() - new Date(right || "").getTime();
  return direction === "asc" ? value : -value;
}

function toggleSort<K extends string>(state: SortState<K>, nextKey: K): SortState<K> {
  if (state.key === nextKey) {
    return { key: nextKey, direction: state.direction === "asc" ? "desc" : "asc" };
  }

  return { key: nextKey, direction: "asc" };
}

function sortMarker(active: boolean, direction: SortDirection): string {
  if (!active) return "↕";
  return direction === "asc" ? "↑" : "↓";
}

function sortableHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex max-w-full min-w-0 items-center gap-2 text-left transition hover:text-white"
    >
      <span className="break-words whitespace-normal">{label}</span>
      <span className="text-[0.65rem] text-slate-400">{sortMarker(active, direction)}</span>
    </button>
  );
}

function previewHref(url: string | null | undefined): string {
  return url ? `/api/report/preview?url=${encodeURIComponent(url)}` : "";
}

function downloadHref(url: string | null | undefined): string {
  return url ? `/api/report/download?url=${encodeURIComponent(url)}` : "";
}

function githubArtifactDownloadHref(artifactId: number | null, artifactName: string | null): string {
  if (!artifactId) {
    return "";
  }

  const params = new URLSearchParams({ artifact_id: String(artifactId) });
  if (artifactName) {
    params.set("name", artifactName);
  }

  return `/api/github/artifact-download?${params.toString()}`;
}

function reportActionContent(label: string) {
  const isPreview = label === "Vista rapida";

  return (
    <>
      <span className="sm:hidden" aria-hidden="true">
        {isPreview ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        )}
      </span>
      <span className="hidden sm:inline">{label === "Vista rapida" ? "Vista rapida" : "Descarga"}</span>
    </>
  );
}

function reportButtonClassName(kind: "preview" | "download"): string {
  return [
    "inline-flex max-w-full items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium leading-tight transition",
    kind === "preview"
      ? "border border-cyan-400/30 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20"
      : "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10",
  ].join(" ");
}

function buildLaunchPanelState(mode: "case" | "suite", launches: WorkflowLaunchRow[]): LaunchPanelState {
  const rows = launches
    .filter((launch) => launch.mode === mode)
    .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());

  const history = rows.map((launch) => ({
    id: launch.id,
    title: launch.identifier,
    subtitle: launch.mode === "case" ? "Prueba unitaria" : "Suite / grupo",
    runId: launch.run_id,
    status: launch.status ?? "",
    conclusion: launch.conclusion ?? "",
    updatedAt: launch.updated_at ?? "",
    url: launch.run_url ?? "",
    artifactId: launch.artifact_id ?? null,
    artifactName: launch.artifact_name ?? "",
    artifactExpired: Boolean(launch.artifact_expired),
  }));

  const latest = history[0] ?? null;

  return {
    launching: false,
    success: "",
    error: "",
    runId: latest?.runId ?? null,
    status: latest?.status ?? "",
    conclusion: latest?.conclusion ?? "",
    url: latest?.url ?? "",
    updatedAt: latest?.updatedAt ?? "",
    artifactId: latest?.artifactId ?? null,
    artifactName: latest?.artifactName ?? "",
    artifactExpired: latest?.artifactExpired ?? false,
    history,
  };
}

function launchStatusLabel(status: string, conclusion: string): string {
  if (status === "queued") {
    return "En cola";
  }

  if (status === "in_progress") {
    return "En ejecución";
  }

  if (status === "completed") {
    if (conclusion === "success") {
      return "Completada";
    }

    return conclusion ? `Finalizada: ${conclusion}` : "Completada";
  }

  return status || "Sin lanzamiento";
}

function pushLaunchHistory(history: LaunchRecord[], next: LaunchRecord): LaunchRecord[] {
  const withoutCurrent = history.filter((row) => row.runId !== next.runId);
  return [next, ...withoutCurrent].slice(0, 8);
}

function resetLaunchPanelState(current: LaunchPanelState): LaunchPanelState {
  return {
    ...current,
    launching: true,
    error: "",
    success: "",
    runId: null,
    status: "",
    conclusion: "",
    url: "",
    updatedAt: "",
    artifactId: null,
    artifactName: "",
    artifactExpired: false,
  };
}

function buildLaunchHistoryRecord(
  descriptor: LaunchDescriptor,
  launch: {
    runId: number | null;
    status: string;
    conclusion: string;
    updatedAt: string;
    url: string;
    artifactId: number | null;
    artifactName: string;
    artifactExpired: boolean;
  },
): LaunchRecord {
  return {
    id: `${descriptor.idPrefix}-${launch.runId ?? "pending"}`,
    title: descriptor.title,
    subtitle: descriptor.subtitle,
    runId: launch.runId,
    status: launch.status,
    conclusion: launch.conclusion,
    updatedAt: launch.updatedAt,
    url: launch.url,
    artifactId: launch.artifactId,
    artifactName: launch.artifactName,
    artifactExpired: launch.artifactExpired,
  };
}

function applyLaunchStatusUpdate(
  current: LaunchPanelState,
  payload: LaunchStatusPayload,
  descriptor: LaunchDescriptor,
): LaunchPanelState {
  const next = {
    ...current,
    status: payload.status ?? "",
    conclusion: payload.conclusion ?? "",
    url: payload.html_url ?? "",
    updatedAt: payload.updated_at ?? "",
    artifactId: payload.artifact_id ?? null,
    artifactName: payload.artifact_name ?? "",
    artifactExpired: Boolean(payload.artifact_expired),
  };

  next.history = pushLaunchHistory(current.history, buildLaunchHistoryRecord(descriptor, next));
  return next;
}

function applyLaunchDispatchUpdate(
  current: LaunchPanelState,
  payload: Exclude<LaunchDispatchPayload, null>,
  descriptor: LaunchDescriptor,
): LaunchPanelState {
  const next = {
    ...current,
    launching: false,
    runId: payload.run_id ?? null,
    status: payload.run_status ?? "queued",
    conclusion: payload.run_conclusion ?? "",
    url: payload.run_url ?? "",
    updatedAt: "",
    artifactId: payload.artifact_id ?? null,
    artifactName: payload.artifact_name ?? "",
    artifactExpired: Boolean(payload.artifact_expired),
  };

  next.history = pushLaunchHistory(current.history, buildLaunchHistoryRecord(descriptor, next));
  return next;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function joinParts(parts: Array<string | null | undefined>, fallback: string): string {
  const text = parts.map((part) => normalizeText(part)).filter(Boolean).join(" • ");
  return text || fallback;
}

function buildCaseKey(test: DashboardTest): string {
  return [
    normalizeText(test.test_name) || "Sin caso",
    normalizeText(test.class_name),
  ]
    .map((part) => part.toLowerCase())
    .join("::");
}

function safeTime(value: string | null | undefined): number {
  const time = new Date(value || "").getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatDurationLabel(value: number): string {
  return formatDurationHuman(value);
}

function uniqueTestsByExecutionId(tests: DashboardTest[]): DashboardTest[] {
  const grouped = new Map<string, DashboardTest>();

  for (const test of tests) {
    const executionId = test.execution?.id ?? test.execution_id ?? `test-${test.id}`;
    const current = grouped.get(executionId);

    if (!current || safeTime(test.timestamp) > safeTime(current.timestamp)) {
      grouped.set(executionId, test);
    }
  }

  return [...grouped.values()].sort((left, right) => safeTime(right.timestamp) - safeTime(left.timestamp));
}

function buildCaseRows(data: DashboardData): CaseRow[] {
  const groups = new Map<string, DashboardTest[]>();

  for (const test of data.tests) {
    const key = buildCaseKey(test);
    const list = groups.get(key) ?? [];
    list.push(test);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .map(([caseKey, tests]) => {
      const executions = uniqueTestsByExecutionId(tests);
      const ordered = [...executions].sort((left, right) => safeTime(right.timestamp) - safeTime(left.timestamp));
      const latest = ordered[0] ?? tests[0];
      const latestExecution = latest?.execution ?? null;
      const latestReportUrl = latestExecution?.report_url ?? null;

      return {
        caseKey,
        testName: normalizeText(latest?.test_name) || "Sin caso",
        className: normalizeText(latest?.class_name),
        groupName: normalizeText(latest?.group_name),
        suiteName: normalizeText(latestExecution?.xml_test_name) || "Sin suite",
        executions: executions.length,
        passed: executions.filter((test) => test.statusLabel === "passed").length,
        failed: executions.filter((test) => test.statusLabel === "failed").length,
        skipped: executions.filter((test) => test.statusLabel === "skipped").length,
        latestTimestamp: latest?.timestamp || latestExecution?.timestamp || "",
        latestStatus: latest?.statusLabel || "unknown",
        latestExecutionId: latestExecution?.id ?? "",
        latestReportUrl,
      } satisfies CaseRow;
    })
    .sort((left, right) => safeTime(right.latestTimestamp) - safeTime(left.latestTimestamp));
}

function buildCaseExecutions(caseRows: DashboardData["tests"], caseKey: string): CaseExecutionRow[] {
  const grouped = new Map<string, DashboardTest>();

  for (const test of caseRows) {
    if (buildCaseKey(test) !== caseKey) {
      continue;
    }

    const executionId = test.execution?.id ?? test.execution_id ?? `test-${test.id}`;
    const current = grouped.get(executionId);
    if (!current || safeTime(test.timestamp) > safeTime(current.timestamp)) {
      grouped.set(executionId, test);
    }
  }

  return [...grouped.values()]
    .sort((left, right) => safeTime(right.timestamp) - safeTime(left.timestamp))
    .map((test) => ({
      execution: test.execution ?? null,
      groupName: normalizeText(test.group_name),
      status: test.statusLabel,
      timestamp: test.timestamp,
      duration: test.duration,
      reportUrl: test.execution?.report_url ?? null,
      errorMessage: normalizeText(test.error_message),
      stacktrace: normalizeText(test.stacktrace),
    }));
}

function buildHistoryRows(data: DashboardData): { executions: HistoryRow[]; cases: HistoryRow[] } {
  const executions = data.executions.map((execution) => ({
    id: `execution-${execution.id}`,
    kind: "Execution" as const,
    title: normalizeText(execution.xml_test_name) || "Sin suite",
    subtitle: joinParts([execution.browser, execution.headless === null ? null : execution.headless ? "headless" : "headed"], "Sin browser"),
    suiteName: normalizeText(execution.xml_test_name) || "Sin suite",
    status: normalizeExecutionVerdict(execution.verdict),
    timestamp: execution.timestamp,
    duration: execution.duration,
    details: `${formatNumber(execution.totalTests)} casos`,
    reportUrl: execution.report_url,
  }));

  const cases = data.tests.map((test) => ({
    id: `case-${test.id}`,
    kind: "Case" as const,
    title: normalizeText(test.test_name) || "Sin caso",
    subtitle: joinParts([test.class_name, test.group_name], "Sin clase o grupo"),
    suiteName: normalizeText(test.execution?.xml_test_name) || "Sin suite",
    status: test.statusLabel,
    timestamp: test.timestamp,
    duration: test.duration,
    details: joinParts([test.execution?.browser, test.error_message], "Sin detalles"),
    reportUrl: test.execution?.report_url ?? null,
  }));

  return { executions, cases };
}

function sortCaseRows(rows: CaseRow[], sortState: SortState<CaseSortKey>): CaseRow[] {
  const sorted = [...rows];

  sorted.sort((left, right) => {
    switch (sortState.key) {
      case "case":
        return compareText(left.testName, right.testName, sortState.direction);
      case "suite":
        return compareText(left.suiteName, right.suiteName, sortState.direction);
      case "executions":
        return compareNumber(left.executions, right.executions, sortState.direction);
      case "passed":
        return compareNumber(left.passed, right.passed, sortState.direction);
      case "failed":
        return compareNumber(left.failed, right.failed, sortState.direction);
      case "skipped":
        return compareNumber(left.skipped, right.skipped, sortState.direction);
      case "latestTimestamp":
        return compareDate(left.latestTimestamp, right.latestTimestamp, sortState.direction);
      default:
        return 0;
    }
  });

  return sorted;
}

function sortSuiteRows(rows: SuiteSummary[], sortState: SortState<SuiteSortKey>): SuiteSummary[] {
  const sorted = [...rows];

  sorted.sort((left, right) => {
    switch (sortState.key) {
      case "suite":
        return compareText(left.suiteName, right.suiteName, sortState.direction);
      case "executions":
        return compareNumber(left.executions, right.executions, sortState.direction);
      case "cases":
        return compareNumber(left.cases, right.cases, sortState.direction);
      case "averageDuration":
        return compareNumber(left.averageDuration, right.averageDuration, sortState.direction);
      case "latestTimestamp":
        return compareDate(left.latestTimestamp, right.latestTimestamp, sortState.direction);
      default:
        return 0;
    }
  });

  return sorted;
}

function sortExecutionRows(rows: DashboardExecution[], sortState: SortState<ExecutionSortKey>): DashboardExecution[] {
  const sorted = [...rows];

  sorted.sort((left, right) => {
    switch (sortState.key) {
      case "suite":
        return compareText(normalizeText(left.xml_test_name), normalizeText(right.xml_test_name), sortState.direction);
      case "browser":
        return compareText(normalizeText(left.browser), normalizeText(right.browser), sortState.direction);
      case "verdict":
        return compareText(normalizeExecutionVerdict(left.verdict), normalizeExecutionVerdict(right.verdict), sortState.direction);
      case "timestamp":
        return compareDate(left.timestamp, right.timestamp, sortState.direction);
      case "duration":
        return compareNumber(left.duration, right.duration, sortState.direction);
      case "tests":
        return compareNumber(left.totalTests, right.totalTests, sortState.direction);
      case "approval":
        return compareNumber(left.approval, right.approval, sortState.direction);
      default:
        return 0;
    }
  });

  return sorted;
}

function sortCaseExecutionRows(rows: CaseExecutionRow[], sortState: SortState<CaseExecutionSortKey>): CaseExecutionRow[] {
  const sorted = [...rows];

  sorted.sort((left, right) => {
    switch (sortState.key) {
      case "timestamp":
        return compareDate(left.timestamp, right.timestamp, sortState.direction);
      case "suite":
        return compareText(
          normalizeText(left.execution?.xml_test_name),
          normalizeText(right.execution?.xml_test_name),
          sortState.direction,
        );
      case "browser":
        return compareText(normalizeText(left.execution?.browser), normalizeText(right.execution?.browser), sortState.direction);
      case "group":
        return compareText(left.groupName, right.groupName, sortState.direction);
      case "status":
        return compareText(left.status, right.status, sortState.direction);
      case "duration":
        return compareNumber(left.duration, right.duration, sortState.direction);
      default:
        return 0;
    }
  });

  return sorted;
}

function sortHistoryRows(rows: HistoryRow[], sortState: SortState<HistorySortKey>): HistoryRow[] {
  const sorted = [...rows];

  sorted.sort((left, right) => {
    switch (sortState.key) {
      case "timestamp":
        return compareDate(left.timestamp, right.timestamp, sortState.direction);
      case "title":
        return compareText(left.title, right.title, sortState.direction);
      case "suite":
        return compareText(left.suiteName, right.suiteName, sortState.direction);
      case "status":
        return compareText(left.status, right.status, sortState.direction);
      case "duration":
        return compareNumber(left.duration, right.duration, sortState.direction);
      default:
        return 0;
    }
  });

  return sorted;
}

function renderStatusBadge(status: string) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] ring-1 ${statusTone(status)}`}>
      {status || "unknown"}
    </span>
  );
}

function LaunchHistoryTable({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: LaunchRecord[];
  emptyText: string;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{title}</p>
          <p className="mt-1 text-xs text-slate-500">{rows.length ? `${rows.length} ejecuciones recientes` : emptyText}</p>
        </div>
      </div>

      {rows.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[640px] w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="border-b border-white/10 px-3 py-3">Nombre</th>
                <th className="border-b border-white/10 px-3 py-3">Estado</th>
                <th className="border-b border-white/10 px-3 py-3">Actualizado</th>
                <th className="border-b border-white/10 px-3 py-3">Informe</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/5">
                  <td className="px-3 py-3 align-top text-white">
                    <p className="break-words font-medium">{row.title}</p>
                    <p className="mt-1 break-words text-xs text-slate-400">{row.subtitle}</p>
                  </td>
                  <td className="px-3 py-3 align-top">{renderStatusBadge(launchStatusLabel(row.status, row.conclusion))}</td>
                  <td className="px-3 py-3 align-top text-slate-300">{formatExecutionTime(row.updatedAt || null)}</td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex flex-wrap gap-2">
                      {row.artifactId && !row.artifactExpired ? (
                        <a
                          href={githubArtifactDownloadHref(row.artifactId, row.artifactName || "workflow-artifact")}
                          className={reportButtonClassName("download")}
                        >
                          {reportActionContent("Descarga")}
                        </a>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function filterHistory(rows: HistoryRow[], query: string): HistoryRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;

  return rows.filter((row) =>
    [
      row.title,
      row.subtitle,
      row.suiteName,
      row.status,
      row.details,
      row.timestamp,
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

export default function DashboardShell({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedSuiteName, setSelectedSuiteName] = useState<string>("");
  const [selectedCaseKey, setSelectedCaseKey] = useState<string>("");
  const [launchSelectedCaseKey, setLaunchSelectedCaseKey] = useState<string>("");
  const [launchSelectedSuiteName, setLaunchSelectedSuiteName] = useState<string>("");
  const [caseLaunch, setCaseLaunch] = useState<LaunchPanelState>(() => buildLaunchPanelState("case", data.workflowLaunches));
  const [suiteLaunch, setSuiteLaunch] = useState<LaunchPanelState>(() => buildLaunchPanelState("suite", data.workflowLaunches));
  const [suiteSort, setSuiteSort] = useState<SortState<SuiteSortKey>>({ key: "latestTimestamp", direction: "desc" });
  const [caseSort, setCaseSort] = useState<SortState<CaseSortKey>>({ key: "latestTimestamp", direction: "desc" });
  const [caseExecutionSort, setCaseExecutionSort] = useState<SortState<CaseExecutionSortKey>>({ key: "timestamp", direction: "desc" });
  const [executionSort, setExecutionSort] = useState<SortState<ExecutionSortKey>>({ key: "timestamp", direction: "desc" });
  const [historyExecutionSort, setHistoryExecutionSort] = useState<SortState<HistorySortKey>>({ key: "timestamp", direction: "desc" });
  const [historyCaseSort, setHistoryCaseSort] = useState<SortState<HistorySortKey>>({ key: "timestamp", direction: "desc" });
  const [suitePagination, setSuitePagination] = useState<PaginationState>({ page: 1, pageSize: 10 });
  const [casePagination, setCasePagination] = useState<PaginationState>({ page: 1, pageSize: 10 });
  const [launchPagination, setLaunchPagination] = useState<PaginationState>({ page: 1, pageSize: 10 });
  const [caseExecutionPagination, setCaseExecutionPagination] = useState<PaginationState>({ page: 1, pageSize: 10 });
  const [executionPagination, setExecutionPagination] = useState<PaginationState>({ page: 1, pageSize: 10 });
  const [failurePagination, setFailurePagination] = useState<PaginationState>({ page: 1, pageSize: 10 });
  const [historyExecutionPagination, setHistoryExecutionPagination] = useState<PaginationState>({ page: 1, pageSize: 10 });
  const [historyCasePagination, setHistoryCasePagination] = useState<PaginationState>({ page: 1, pageSize: 10 });
  const [historyExecutionQuery, setHistoryExecutionQuery] = useState("");
  const [historyCaseQuery, setHistoryCaseQuery] = useState("");

  const caseRows = useMemo(() => buildCaseRows(data), [data]);
  const suiteRows = useMemo(() => sortSuiteRows(data.suiteSummaries, suiteSort), [data.suiteSummaries, suiteSort]);
  const sortedCaseRows = useMemo(() => sortCaseRows(caseRows, caseSort), [caseRows, caseSort]);
  const executionRows = useMemo(() => sortExecutionRows(data.executions, executionSort), [data.executions, executionSort]);
  const failureExecutionRows = useMemo(() => {
    return data.tests
      .filter((test) => test.statusLabel !== "passed")
      .map((test) => test.execution)
      .filter((execution): execution is DashboardExecution => Boolean(execution))
      .sort((left, right) => safeTime(right.timestamp) - safeTime(left.timestamp));
  }, [data.tests]);

  const selectedCaseKeyEffective = selectedCaseKey && caseRows.some((row) => row.caseKey === selectedCaseKey) ? selectedCaseKey : caseRows[0]?.caseKey ?? "";
  const selectedCaseRow = caseRows.find((row) => row.caseKey === selectedCaseKeyEffective) ?? caseRows[0] ?? null;
  const selectedCaseExecutions = useMemo(() => sortCaseExecutionRows(buildCaseExecutions(data.tests, selectedCaseKeyEffective), caseExecutionSort), [caseExecutionSort, data.tests, selectedCaseKeyEffective]);
  const launchSelectedCaseKeyEffective =
    launchSelectedCaseKey && caseRows.some((row) => row.caseKey === launchSelectedCaseKey)
      ? launchSelectedCaseKey
      : caseRows[0]?.caseKey ?? "";
  const launchSelectedCaseRow = caseRows.find((row) => row.caseKey === launchSelectedCaseKeyEffective) ?? caseRows[0] ?? null;
  const launchSelectedSuiteNameEffective =
    launchSelectedSuiteName && suiteRows.some((row) => row.suiteName === launchSelectedSuiteName)
      ? launchSelectedSuiteName
      : suiteRows[0]?.suiteName ?? "";
  const launchSelectedSuiteRow = suiteRows.find((row) => row.suiteName === launchSelectedSuiteNameEffective) ?? suiteRows[0] ?? null;

  const historyRows = useMemo(() => buildHistoryRows(data), [data]);
  const filteredExecutionHistoryRows = useMemo(
    () => sortHistoryRows(filterHistory(historyRows.executions, historyExecutionQuery), historyExecutionSort),
    [historyExecutionQuery, historyExecutionSort, historyRows.executions],
  );
  const filteredCaseHistoryRows = useMemo(
    () => sortHistoryRows(filterHistory(historyRows.cases, historyCaseQuery), historyCaseSort),
    [historyCaseQuery, historyCaseSort, historyRows.cases],
  );
  const pagedSuiteRows = useMemo(
    () => paginateRows(suiteRows, suitePagination.page, suitePagination.pageSize),
    [suiteRows, suitePagination.page, suitePagination.pageSize],
  );
  const pagedCaseRows = useMemo(
    () => paginateRows(sortedCaseRows, casePagination.page, casePagination.pageSize),
    [sortedCaseRows, casePagination.page, casePagination.pageSize],
  );
  const pagedLaunchRows = useMemo(
    () => paginateRows(sortedCaseRows, launchPagination.page, launchPagination.pageSize),
    [sortedCaseRows, launchPagination.page, launchPagination.pageSize],
  );
  const pagedCaseExecutions = useMemo(
    () => paginateRows(selectedCaseExecutions, caseExecutionPagination.page, caseExecutionPagination.pageSize),
    [selectedCaseExecutions, caseExecutionPagination.page, caseExecutionPagination.pageSize],
  );
  const pagedExecutionRows = useMemo(
    () => paginateRows(executionRows, executionPagination.page, executionPagination.pageSize),
    [executionRows, executionPagination.page, executionPagination.pageSize],
  );
  const pagedFailureExecutionRows = useMemo(
    () => paginateRows(failureExecutionRows, failurePagination.page, failurePagination.pageSize),
    [failureExecutionRows, failurePagination.page, failurePagination.pageSize],
  );
  const pagedExecutionHistory = useMemo(
    () => paginateRows(filteredExecutionHistoryRows, historyExecutionPagination.page, historyExecutionPagination.pageSize),
    [filteredExecutionHistoryRows, historyExecutionPagination.page, historyExecutionPagination.pageSize],
  );
  const pagedCaseHistory = useMemo(
    () => paginateRows(filteredCaseHistoryRows, historyCasePagination.page, historyCasePagination.pageSize),
    [filteredCaseHistoryRows, historyCasePagination.page, historyCasePagination.pageSize],
  );

  useEffect(() => {
    if (!caseLaunch.runId || caseLaunch.status === "completed") {
      return undefined;
    }

    let cancelled = false;

    const pollRunStatus = async () => {
      try {
        const response = await fetch(`/api/github/run-status?run_id=${caseLaunch.runId}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as LaunchStatusPayload;

        if (cancelled) {
          return;
        }

        setCaseLaunch((current) =>
          applyLaunchStatusUpdate(
            current,
            payload,
            {
              idPrefix: "case",
              title: launchSelectedCaseRow?.testName ?? "Sin caso",
              subtitle: joinParts([launchSelectedCaseRow?.className, launchSelectedCaseRow?.groupName], "Sin clase o grupo"),
            },
          ),
        );

        if (payload.status === "completed") {
          setCaseLaunch((current) => ({
            ...current,
            launching: false,
            success:
              payload.conclusion === "success"
                ? "Workflow completado con éxito."
                : `Workflow finalizado con estado ${payload.conclusion ?? "unknown"}.`,
          }));
        }
      } catch {
        // Mantener el último estado conocido y reintentar en el siguiente ciclo.
      }
    };

    void pollRunStatus();
    const interval = window.setInterval(() => {
      void pollRunStatus();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [caseLaunch.runId, caseLaunch.status, launchSelectedCaseRow]);

  useEffect(() => {
    if (!suiteLaunch.runId || suiteLaunch.status === "completed") {
      return undefined;
    }

    let cancelled = false;

    const pollRunStatus = async () => {
      try {
        const response = await fetch(`/api/github/run-status?run_id=${suiteLaunch.runId}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as LaunchStatusPayload;

        if (cancelled) {
          return;
        }

        setSuiteLaunch((current) =>
          applyLaunchStatusUpdate(
            current,
            payload,
            {
              idPrefix: "suite",
              title: launchSelectedSuiteRow?.suiteName ?? "Sin suite",
              subtitle: `${formatNumber(launchSelectedSuiteRow?.executions ?? 0)} ejecuciones, ${formatNumber(launchSelectedSuiteRow?.cases ?? 0)} casos`,
            },
          ),
        );

        if (payload.status === "completed") {
          setSuiteLaunch((current) => ({
            ...current,
            launching: false,
            success:
              payload.conclusion === "success"
                ? "Workflow completado con éxito."
                : `Workflow finalizado con estado ${payload.conclusion ?? "unknown"}.`,
          }));
        }
      } catch {
        // Mantener el último estado conocido y reintentar en el siguiente ciclo.
      }
    };

    void pollRunStatus();
    const interval = window.setInterval(() => {
      void pollRunStatus();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [suiteLaunch.runId, suiteLaunch.status, launchSelectedSuiteRow]);

  function selectLaunchSuite(suiteName: string) {
    setLaunchSelectedSuiteName(suiteName);
  }

  async function launchSelectedCase() {
    const selectedTestName = launchSelectedCaseRow?.testName ?? "";

    if (!selectedTestName) {
      return;
    }

    setCaseLaunch((current) => resetLaunchPanelState(current));

    try {
      const response = await fetch("/api/github/dispatch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          mode: "case" as const,
          test_name: selectedTestName,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
        run_id?: number | null;
        run_status?: string | null;
        run_conclusion?: string | null;
        run_url?: string | null;
        artifact_id?: number | null;
        artifact_name?: string | null;
        artifact_expired?: boolean | null;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? payload?.message ?? "No se pudo lanzar la ejecución.");
      }

      if (payload?.run_id) {
        setCaseLaunch((current) =>
          applyLaunchDispatchUpdate(
            current,
            payload,
            {
              idPrefix: "case",
              title: selectedTestName,
              subtitle: joinParts([launchSelectedCaseRow?.className, launchSelectedCaseRow?.groupName], "Sin clase o grupo"),
            },
          ),
        );
      }

      setCaseLaunch((current) => ({
        ...current,
        success: payload?.message ?? `Ejecución lanzada para ${selectedTestName}.`,
      }));
    } catch (error) {
      setCaseLaunch((current) => ({
        ...current,
        launching: false,
        error: error instanceof Error ? error.message : "No se pudo lanzar la ejecución.",
      }));
    } finally {
      setCaseLaunch((current) => ({ ...current, launching: false }));
    }
  }

  async function launchSelectedSuite() {
    const selectedSuiteName = launchSelectedSuiteRow?.suiteName ?? "";

    if (!selectedSuiteName) {
      return;
    }

    setSuiteLaunch((current) => resetLaunchPanelState(current));

    try {
      const response = await fetch("/api/github/dispatch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          mode: "suite" as const,
          test_groups: selectedSuiteName,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
        run_id?: number | null;
        run_status?: string | null;
        run_conclusion?: string | null;
        run_url?: string | null;
        artifact_id?: number | null;
        artifact_name?: string | null;
        artifact_expired?: boolean | null;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? payload?.message ?? "No se pudo lanzar la ejecución.");
      }

      if (payload?.run_id) {
        setSuiteLaunch((current) =>
          applyLaunchDispatchUpdate(
            current,
            payload,
            {
              idPrefix: "suite",
              title: selectedSuiteName,
              subtitle: `${formatNumber(launchSelectedSuiteRow?.executions ?? 0)} ejecuciones, ${formatNumber(launchSelectedSuiteRow?.cases ?? 0)} casos`,
            },
          ),
        );
      }

      setSuiteLaunch((current) => ({
        ...current,
        success: payload?.message ?? `Ejecución por suite lanzada para ${selectedSuiteName}.`,
      }));
    } catch (error) {
      setSuiteLaunch((current) => ({
        ...current,
        launching: false,
        error: error instanceof Error ? error.message : "No se pudo lanzar la ejecución.",
      }));
    } finally {
      setSuiteLaunch((current) => ({ ...current, launching: false }));
    }
  }

  const activePreviewUrl = previewUrl ? previewHref(previewUrl) : "";
  const selectedSuiteNameEffective =
    selectedSuiteName && suiteRows.some((suite) => suite.suiteName === selectedSuiteName)
      ? selectedSuiteName
      : suiteRows[0]?.suiteName ?? "";
  const selectedSuite = suiteRows.find((suite) => suite.suiteName === selectedSuiteNameEffective) ?? suiteRows[0] ?? null;
  const suiteCaseList = useMemo(() => {
    if (!selectedSuite) return [];
    const names = selectedSuite.caseNames.length ? selectedSuite.caseNames : [];
    return names;
  }, [selectedSuite]);

  function handleSectionChange(section: SectionId) {
    setActiveSection(section);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_32%),linear-gradient(180deg,#020617_0%,#050816_45%,#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <header className="rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[0.65rem] uppercase tracking-[0.38em] text-cyan-300/80">Dashboard de pruebas</p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-4xl">Ejecuciones, suites y casos</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Revisa ejecuciones, casos únicos, historial y reportes HTML interactivos.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                {NAV_SECTIONS.map((section) => (
                  <SectionButton
                    key={section.id}
                    active={activeSection === section.id}
                    onClick={() => handleSectionChange(section.id)}
                  >
                    <span className="text-sm font-semibold leading-tight">{section.label}</span>
                  </SectionButton>
              ))}
            </div>
          </div>
        </header>

        {!data.configured ? (
          <section className="rounded-[1.5rem] border border-amber-400/20 bg-amber-500/10 p-4 text-amber-100 sm:p-6">
            <h2 className="text-lg font-semibold">Falta configurar Supabase</h2>
            <p className="mt-2 text-sm text-amber-50/80">Variables requeridas: {data.missingConfig.join(", ")}</p>
          </section>
        ) : null}

        {data.tableErrors.length ? (
          <section className="rounded-[1.5rem] border border-rose-400/20 bg-rose-500/10 p-4 text-rose-100 sm:p-6">
            <h2 className="text-lg font-semibold">Aviso de lectura</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-50/85">
              {data.tableErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1.35rem] border border-white/10 bg-white/5 p-4 sm:p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Ejecuciones</p>
            <p className="mt-3 text-3xl font-semibold text-white">{formatNumber(data.summary.executions)}</p>
            <p className="mt-2 text-sm text-slate-300">Ejecuciones registradas.</p>
          </div>
          <div className="rounded-[1.35rem] border border-white/10 bg-white/5 p-4 sm:p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Casos</p>
            <p className="mt-3 text-3xl font-semibold text-white">{formatNumber(data.summary.totalTests)}</p>
            <p className="mt-2 text-sm text-slate-300">Casos visibles.</p>
          </div>
          <div className="rounded-[1.35rem] border border-white/10 bg-white/5 p-4 sm:p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Aprobacion promedio</p>
            <p className="mt-3 text-3xl font-semibold text-white">{formatPercent(data.summary.averageApproval)}</p>
            <p className="mt-2 text-sm text-slate-300">Promedio de aprobación.</p>
          </div>
          <div className="rounded-[1.35rem] border border-white/10 bg-white/5 p-4 sm:p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Duración media</p>
            <p className="mt-3 text-3xl font-semibold text-white">{formatDurationLabel(data.summary.averageDuration)}</p>
            <p className="mt-2 text-sm text-slate-300">Tiempo medio por ejecución.</p>
          </div>
        </section>

        {(() => {
          const currentSection = NAV_SECTIONS.find((section) => section.id === activeSection);

          if (!currentSection) {
            return null;
          }

          return (
            <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/50 px-5 py-4 sm:px-6">
              <p className="text-xs uppercase tracking-[0.26em] text-cyan-300/80">{currentSection.label}</p>
              <p className="mt-2 text-sm text-slate-300">{currentSection.description}</p>
            </section>
          );
        })()}

        {activeSection === "overview" ? (
          <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
            <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">Última ejecución</h2>
                  <p className="mt-1 text-sm text-slate-400">Resumen ejecutivo con acceso al reporte.</p>
                </div>
                {data.latestExecution?.report_url ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewUrl(data.latestExecution?.report_url ?? null)}
                      className={reportButtonClassName("preview")}
                    >
                      {reportActionContent("Vista rapida")}
                    </button>
                    <a
                      href={downloadHref(data.latestExecution.report_url)}
                      className={reportButtonClassName("download")}
                    >
                      {reportActionContent("Descarga")}
                    </a>
                  </div>
                ) : null}
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Suite</p>
                  <p className="mt-1 text-sm font-medium text-white">{data.latestExecution?.xml_test_name ?? "Sin datos"}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Fecha</p>
                  <p className="mt-1 text-sm font-medium text-white">{formatExecutionTime(data.latestExecution?.timestamp ?? null)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Tests</p>
                  <p className="mt-1 text-sm font-medium text-white">{formatNumber(data.latestExecution?.totalTests ?? 0)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Veredicto</p>
                  <p className="mt-1 text-sm font-medium text-white">{data.latestExecution ? normalizeExecutionVerdict(data.latestExecution.verdict) : "Sin datos"}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-4 sm:p-6">
              <h2 className="text-xl font-semibold text-white">Top suites</h2>
              <div className="mt-4 space-y-3">
                {suiteRows.slice(0, 5).map((suite) => (
                  <div key={suite.suiteName} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{suite.suiteName}</p>
                        <p className="mt-1 text-sm text-slate-400">{formatNumber(suite.executions)} ejecuciones, {formatNumber(suite.cases)} casos</p>
                      </div>
                      <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">{formatDurationLabel(suite.averageDuration)} promedio</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {activeSection === "suites" ? (
          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
              <h2 className="text-xl font-semibold text-white">Suites</h2>
              <p className="mt-1 text-sm text-slate-400">Cada suite con sus casos y promedio.</p>
                </div>
              </div>

              <div className="mt-6 space-y-3 sm:hidden">
                {pagedSuiteRows.rows.map((suite) => (
                  <button
                    key={suite.suiteName}
                    type="button"
                    onClick={() => setSelectedSuiteName(suite.suiteName)}
                    className={[
                      "w-full rounded-2xl border p-4 text-left transition",
                      selectedSuiteNameEffective === suite.suiteName ? "border-cyan-400/40 bg-cyan-400/10" : "border-white/10 bg-white/5 hover:bg-white/8",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{suite.suiteName}</p>
                        <p className="mt-1 text-xs text-slate-400">{formatNumber(suite.executions)} ejecuciones</p>
                      </div>
                      <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-200">{formatNumber(suite.cases)} casos</span>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 text-xs text-slate-300 sm:grid-cols-2">
                      <div className="rounded-xl bg-slate-950/60 px-3 py-2">
                        <p className="text-slate-500">Promedio</p>
                        <p className="mt-1 break-words text-white">{formatDurationLabel(suite.averageDuration)}</p>
                      </div>
                      <div className="rounded-xl bg-slate-950/60 px-3 py-2">
                        <p className="text-slate-500">Última</p>
                        <p className="mt-1 break-words text-white">{formatExecutionTime(suite.latestTimestamp || null)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-6 hidden overflow-x-auto sm:block">
                <table className="min-w-[760px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Suite", active: suiteSort.key === "suite", direction: suiteSort.direction, onClick: () => setSuiteSort(toggleSort(suiteSort, "suite")) })}</th>
                      <th className="border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Ejecuciones", active: suiteSort.key === "executions", direction: suiteSort.direction, onClick: () => setSuiteSort(toggleSort(suiteSort, "executions")) })}</th>
                      <th className="hidden sm:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Casos", active: suiteSort.key === "cases", direction: suiteSort.direction, onClick: () => setSuiteSort(toggleSort(suiteSort, "cases")) })}</th>
                      <th className="hidden md:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Duracion promedio", active: suiteSort.key === "averageDuration", direction: suiteSort.direction, onClick: () => setSuiteSort(toggleSort(suiteSort, "averageDuration")) })}</th>
                      <th className="hidden md:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Última ejecución", active: suiteSort.key === "latestTimestamp", direction: suiteSort.direction, onClick: () => setSuiteSort(toggleSort(suiteSort, "latestTimestamp")) })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedSuiteRows.rows.map((suite) => (
                      <tr
                        key={suite.suiteName}
                        className={[
                          "cursor-pointer border-b border-white/5 transition hover:bg-white/5",
                          selectedSuiteNameEffective === suite.suiteName ? "bg-cyan-400/10" : "",
                        ].join(" ")}
                        onClick={() => setSelectedSuiteName(suite.suiteName)}
                      >
                        <td className="px-3 py-4 align-top break-words text-white">{suite.suiteName}</td>
                        <td className="px-3 py-4 align-top text-slate-300">{formatNumber(suite.executions)}</td>
                        <td className="hidden sm:table-cell px-3 py-4 align-top text-slate-300">{formatNumber(suite.cases)}</td>
                        <td className="hidden md:table-cell px-3 py-4 align-top text-slate-300">{formatDurationLabel(suite.averageDuration)}</td>
                        <td className="hidden md:table-cell px-3 py-4 align-top text-slate-300">{formatExecutionTime(suite.latestTimestamp || null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                totalRows={pagedSuiteRows.totalRows}
                page={pagedSuiteRows.currentPage}
                totalPages={pagedSuiteRows.totalPages}
                pageSize={suitePagination.pageSize}
                onPageChange={(page) => setSuitePagination((prev) => ({ ...prev, page }))}
                onPageSizeChange={(pageSize) => setSuitePagination({ page: 1, pageSize })}
              />
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-white">Casos relacionados</h3>
              <p className="mt-1 break-words text-sm text-slate-400">{selectedSuite ? selectedSuite.suiteName : "Selecciona una suite"}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                {suiteCaseList.length ? (
                  suiteCaseList.slice(0, 12).map((caseName) => (
                    <span key={caseName} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                      {caseName}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">Sin casos relacionados.</p>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {activeSection === "cases" ? (
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-4 sm:p-6">
              <h2 className="text-xl font-semibold text-white">Casos únicos</h2>
              <p className="mt-1 text-sm text-slate-400">Listado consolidado de casos.</p>

              <div className="mt-5 space-y-3 sm:hidden">
                {pagedCaseRows.rows.map((row) => (
                  <button
                    key={row.caseKey}
                    type="button"
                    onClick={() => setSelectedCaseKey(row.caseKey)}
                    className={[
                      "w-full rounded-2xl border p-4 text-left transition",
                      selectedCaseKeyEffective === row.caseKey ? "border-cyan-400/40 bg-cyan-400/10" : "border-white/10 bg-white/5 hover:bg-white/8",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-medium text-white">{row.testName}</p>
                        <p className="mt-1 break-words text-xs text-slate-400">{joinParts([row.className, row.groupName], "Sin clase o grupo")}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-200">{formatNumber(row.executions)} ejec.</span>
                        {launchSelectedCaseKeyEffective === row.caseKey ? (
                          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[0.7rem] uppercase tracking-[0.18em] text-cyan-100">
                            {launchStatusLabel(caseLaunch.status, caseLaunch.conclusion)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                      <div className="rounded-xl bg-slate-950/60 px-3 py-2 text-slate-300">
                        <p className="text-slate-500">OK</p>
                        <p className="mt-1 break-words text-white">{formatNumber(row.passed)}</p>
                      </div>
                      <div className="rounded-xl bg-slate-950/60 px-3 py-2 text-slate-300">
                        <p className="text-slate-500">Errores</p>
                        <p className="mt-1 break-words text-white">{formatNumber(row.failed)}</p>
                      </div>
                      <div className="rounded-xl bg-slate-950/60 px-3 py-2 text-slate-300">
                        <p className="text-slate-500">Saltos</p>
                        <p className="mt-1 break-words text-white">{formatNumber(row.skipped)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-5 hidden max-w-full overflow-x-auto sm:block">
                <table className="min-w-[760px] w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Caso", active: caseSort.key === "case", direction: caseSort.direction, onClick: () => setCaseSort(toggleSort(caseSort, "case")) })}</th>
                      <th className="border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Ejecuciones", active: caseSort.key === "executions", direction: caseSort.direction, onClick: () => setCaseSort(toggleSort(caseSort, "executions")) })}</th>
                      <th className="hidden sm:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "OK", active: caseSort.key === "passed", direction: caseSort.direction, onClick: () => setCaseSort(toggleSort(caseSort, "passed")) })}</th>
                      <th className="hidden md:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Fallos", active: caseSort.key === "failed", direction: caseSort.direction, onClick: () => setCaseSort(toggleSort(caseSort, "failed")) })}</th>
                      <th className="hidden lg:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Skip", active: caseSort.key === "skipped", direction: caseSort.direction, onClick: () => setCaseSort(toggleSort(caseSort, "skipped")) })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedCaseRows.rows.map((row) => (
                      <tr
                        key={row.caseKey}
                        className={[
                          "cursor-pointer border-b border-white/5 transition hover:bg-white/5",
                          selectedCaseKeyEffective === row.caseKey ? "bg-cyan-400/10" : "",
                        ].join(" ")}
                        onClick={() => setSelectedCaseKey(row.caseKey)}
                      >
                        <td className="px-3 py-4 align-top text-white">
                          <p className="break-words font-medium">{row.testName}</p>
                          <p className="mt-1 break-words text-xs text-slate-400">{joinParts([row.className, row.groupName], "Sin clase o grupo")}</p>
                        </td>
                        <td className="px-3 py-4 align-top text-slate-300">{formatNumber(row.executions)}</td>
                        <td className="hidden sm:table-cell px-3 py-4 align-top text-slate-300">{formatNumber(row.passed)}</td>
                        <td className="hidden md:table-cell px-3 py-4 align-top text-slate-300">{formatNumber(row.failed)}</td>
                        <td className="hidden lg:table-cell px-3 py-4 align-top text-slate-300">{formatNumber(row.skipped)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                totalRows={pagedCaseRows.totalRows}
                page={pagedCaseRows.currentPage}
                totalPages={pagedCaseRows.totalPages}
                pageSize={casePagination.pageSize}
                onPageChange={(page) => setCasePagination((prev) => ({ ...prev, page }))}
                onPageSizeChange={(pageSize) => setCasePagination({ page: 1, pageSize })}
              />
            </div>

            <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-4 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">Ejecuciones del caso</h3>
                  <p className="mt-1 text-sm text-slate-400">{selectedCaseRow ? selectedCaseRow.testName : "Selecciona un caso"}</p>
                </div>
              </div>

              <div className="mt-3 space-y-3 sm:hidden">
                {pagedCaseExecutions.rows.map((entry) => (
                  <div key={entry.execution?.id ?? `${entry.timestamp}-${entry.status}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{formatExecutionTime(entry.timestamp || null)}</p>
                        <p className="mt-1 text-xs text-slate-400">{normalizeText(entry.execution?.xml_test_name) || "Sin suite"} {entry.groupName ? `- ${entry.groupName}` : ""}</p>
                      </div>
                      {renderStatusBadge(entry.status)}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 text-xs text-slate-300 sm:grid-cols-2">
                      <div className="rounded-xl bg-slate-950/60 px-3 py-2">
                        <p className="text-slate-500">Navegador</p>
                        <p className="mt-1 text-white">{normalizeText(entry.execution?.browser) || "Sin browser"}</p>
                      </div>
                      <div className="rounded-xl bg-slate-950/60 px-3 py-2">
                        <p className="text-slate-500">Duración</p>
                        <p className="mt-1 text-white">{formatDurationLabel(entry.duration)}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      {entry.reportUrl ? (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => setPreviewUrl(entry.reportUrl)} className={reportButtonClassName("preview")}>
                            {reportActionContent("Vista rapida")}
                          </button>
                          <a href={downloadHref(entry.reportUrl)} className={reportButtonClassName("download")}>
                            {reportActionContent("Descarga")}
                          </a>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">Sin reporte</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 hidden max-w-full overflow-x-auto sm:block">
                <table className="min-w-[760px] w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Fecha", active: caseExecutionSort.key === "timestamp", direction: caseExecutionSort.direction, onClick: () => setCaseExecutionSort(toggleSort(caseExecutionSort, "timestamp")) })}</th>
                      <th className="hidden sm:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Suite", active: caseExecutionSort.key === "suite", direction: caseExecutionSort.direction, onClick: () => setCaseExecutionSort(toggleSort(caseExecutionSort, "suite")) })}</th>
                      <th className="hidden md:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Grupo", active: caseExecutionSort.key === "group", direction: caseExecutionSort.direction, onClick: () => setCaseExecutionSort(toggleSort(caseExecutionSort, "group")) })}</th>
                      <th className="hidden sm:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Browser", active: caseExecutionSort.key === "browser", direction: caseExecutionSort.direction, onClick: () => setCaseExecutionSort(toggleSort(caseExecutionSort, "browser")) })}</th>
                      <th className="border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Estado", active: caseExecutionSort.key === "status", direction: caseExecutionSort.direction, onClick: () => setCaseExecutionSort(toggleSort(caseExecutionSort, "status")) })}</th>
                      <th className="hidden lg:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Duracion", active: caseExecutionSort.key === "duration", direction: caseExecutionSort.direction, onClick: () => setCaseExecutionSort(toggleSort(caseExecutionSort, "duration")) })}</th>
                      <th className="border-b border-white/10 px-3 py-3">Reporte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedCaseExecutions.rows.map((entry) => (
                      <tr key={entry.execution?.id ?? `${entry.timestamp}-${entry.status}`} className="border-b border-white/5">
                        <td className="px-3 py-4 align-top text-slate-300">{formatExecutionTime(entry.timestamp || null)}</td>
                        <td className="hidden sm:table-cell px-3 py-4 align-top text-slate-300">{normalizeText(entry.execution?.xml_test_name) || "Sin suite"}</td>
                        <td className="hidden md:table-cell px-3 py-4 align-top text-slate-300">{entry.groupName || "Sin grupo"}</td>
                        <td className="hidden sm:table-cell px-3 py-4 align-top text-slate-300">{normalizeText(entry.execution?.browser) || "Sin browser"}</td>
                        <td className="px-3 py-4 align-top">{renderStatusBadge(entry.status)}</td>
                        <td className="hidden lg:table-cell px-3 py-4 align-top text-slate-300">{formatDurationLabel(entry.duration)}</td>
                        <td className="px-3 py-4 align-top">
                          {entry.reportUrl ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setPreviewUrl(entry.reportUrl)}
                                className={reportButtonClassName("preview")}
                              >
                                {reportActionContent("Vista rapida")}
                              </button>
                              <a href={downloadHref(entry.reportUrl)} className={reportButtonClassName("download")}>
                                {reportActionContent("Descarga")}
                              </a>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">Sin reporte</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                totalRows={pagedCaseExecutions.totalRows}
                page={pagedCaseExecutions.currentPage}
                totalPages={pagedCaseExecutions.totalPages}
                pageSize={caseExecutionPagination.pageSize}
                onPageChange={(page) => setCaseExecutionPagination((prev) => ({ ...prev, page }))}
                onPageSizeChange={(pageSize) => setCaseExecutionPagination({ page: 1, pageSize })}
              />
            </div>
          </section>
        ) : null}

        {activeSection === "launch" ? (
          <section className="grid gap-4 xl:grid-cols-2">
            <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">Prueba unitaria</h2>
                  <p className="mt-1 text-sm text-slate-400">Elige un caso único y envía `test_name` al workflow `run-single-test.yml`.</p>
                </div>
                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">Individual</span>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <div className="min-w-0">
                  <div className="space-y-3 sm:hidden">
                    {pagedLaunchRows.rows.map((row) => (
                      <button
                        key={row.caseKey}
                        type="button"
                        onClick={() => setLaunchSelectedCaseKey(row.caseKey)}
                        className={[
                          "w-full rounded-2xl border p-4 text-left transition",
                          launchSelectedCaseKeyEffective === row.caseKey ? "border-cyan-400/40 bg-cyan-400/10" : "border-white/10 bg-white/5 hover:bg-white/8",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-words font-medium text-white">{row.testName}</p>
                            <p className="mt-1 break-words text-xs text-slate-400">{joinParts([row.className, row.groupName], "Sin clase o grupo")}</p>
                          </div>
                          <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-200">{formatNumber(row.executions)} ejec.</span>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                          <div className="rounded-xl bg-slate-950/60 px-3 py-2 text-slate-300">
                            <p className="text-slate-500">Suite</p>
                            <p className="mt-1 break-words text-white">{row.suiteName}</p>
                          </div>
                          <div className="rounded-xl bg-slate-950/60 px-3 py-2 text-slate-300">
                            <p className="text-slate-500">Última ejecución</p>
                            <p className="mt-1 break-words text-white">{formatExecutionTime(row.latestTimestamp || null)}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="hidden max-w-full overflow-x-auto sm:block">
                    <table className="min-w-[760px] w-full border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr className="text-left text-slate-400">
                          <th className="border-b border-white/10 px-3 py-3">Caso</th>
                          <th className="border-b border-white/10 px-3 py-3">Ejecuciones</th>
                          <th className="hidden sm:table-cell border-b border-white/10 px-3 py-3">Suite</th>
                          <th className="hidden md:table-cell border-b border-white/10 px-3 py-3">Última ejecución</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedLaunchRows.rows.map((row) => (
                          <tr
                            key={row.caseKey}
                            className={[
                              "cursor-pointer border-b border-white/5 transition hover:bg-white/5",
                              launchSelectedCaseKeyEffective === row.caseKey ? "bg-cyan-400/10" : "",
                            ].join(" ")}
                            onClick={() => setLaunchSelectedCaseKey(row.caseKey)}
                          >
                            <td className="px-3 py-4 align-top break-words text-white">
                              <p className="break-words font-medium">{row.testName}</p>
                              <p className="mt-1 break-words text-xs text-slate-400">{joinParts([row.className, row.groupName], "Sin clase o grupo")}</p>
                            </td>
                            <td className="px-3 py-4 align-top text-slate-300">{formatNumber(row.executions)}</td>
                            <td className="hidden sm:table-cell px-3 py-4 align-top text-slate-300">{row.suiteName}</td>
                            <td className="hidden md:table-cell px-3 py-4 align-top text-slate-300">{formatExecutionTime(row.latestTimestamp || null)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <PaginationControls
                    totalRows={pagedLaunchRows.totalRows}
                    page={pagedLaunchRows.currentPage}
                    totalPages={pagedLaunchRows.totalPages}
                    pageSize={launchPagination.pageSize}
                    onPageChange={(page) => setLaunchPagination((prev) => ({ ...prev, page }))}
                    onPageSizeChange={(pageSize) => setLaunchPagination({ page: 1, pageSize })}
                  />
                </div>

                <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Acción</p>
                  <p className="mt-2 break-words text-sm font-medium text-white">{launchSelectedCaseRow?.testName ?? "Sin selección"}</p>
                  <p className="mt-1 break-words text-xs text-slate-400">{joinParts([launchSelectedCaseRow?.className, launchSelectedCaseRow?.groupName], "Sin clase o grupo")}</p>
                  <p className="mt-3 text-xs text-slate-500">Se enviará este `test_name` al backend y podrás seguir su estado en la tabla lateral.</p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Estado</p>
                      <p className="mt-2 break-words text-sm font-medium text-white">{launchStatusLabel(caseLaunch.status, caseLaunch.conclusion)}</p>
                      <p className="mt-1 text-xs text-slate-400">{caseLaunch.conclusion ? `Conclusión: ${caseLaunch.conclusion}` : "Esperando lanzamiento."}</p>
                    </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Actualizado</p>
                    <p className="mt-2 break-words text-sm font-medium text-white">{caseLaunch.updatedAt ? formatExecutionTime(caseLaunch.updatedAt) : "Sin datos"}</p>
                    {caseLaunch.artifactId && !caseLaunch.artifactExpired ? (
                      <a href={caseLaunch.url || githubArtifactDownloadHref(caseLaunch.artifactId, caseLaunch.artifactName || "workflow-artifact")} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-cyan-200 underline-offset-4 hover:underline">
                        Abrir informe
                      </a>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">El acceso al informe se habilita cuando el workflow genera un artifact.</p>
                    )}
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Informe</p>
                    {caseLaunch.artifactId && !caseLaunch.artifactExpired ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                          {caseLaunch.artifactName || "Artifact disponible"}
                        </span>
                        <a href={githubArtifactDownloadHref(caseLaunch.artifactId, caseLaunch.artifactName || "workflow-artifact")} className={reportButtonClassName("download")}>
                          {reportActionContent("Descarga")}
                        </a>
                      </div>
                    ) : caseLaunch.status === "completed" ? (
                      <p className="mt-2 break-words text-sm text-slate-300">El workflow terminó, pero no se generó informe descargable.</p>
                    ) : (
                      <p className="mt-2 break-words text-sm text-slate-300">El informe aparecerá aquí si el workflow lo genera.</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={launchSelectedCase}
                    disabled={caseLaunch.launching || !launchSelectedCaseRow}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {caseLaunch.launching ? "Lanzando..." : "Lanzar ejecución"}
                  </button>

                  {caseLaunch.success ? (
                    <p className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{caseLaunch.success}</p>
                  ) : null}

                  {caseLaunch.error ? (
                    <p className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{caseLaunch.error}</p>
                  ) : null}
                </div>
              </div>

              <LaunchHistoryTable title="Historial de lanzamientos unitarios" rows={caseLaunch.history} emptyText="No hay lanzamientos unitarios todavía." />
            </div>

            <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">Suite / grupo</h2>
                  <p className="mt-1 text-sm text-slate-400">Elige una suite para enviar `test_groups` al workflow `run-groups.yml`.</p>
                </div>
                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">Grupo</span>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <div className="min-w-0">
                  <div className="space-y-3 sm:hidden">
                    {pagedSuiteRows.rows.map((suite) => {
                      const selected = launchSelectedSuiteNameEffective === suite.suiteName;

                      return (
                        <button
                          key={suite.suiteName}
                          type="button"
                          onClick={() => selectLaunchSuite(suite.suiteName)}
                          className={[
                            "w-full rounded-2xl border p-4 text-left transition",
                            selected ? "border-cyan-400/40 bg-cyan-400/10" : "border-white/10 bg-white/5 hover:bg-white/8",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-words font-medium text-white">{suite.suiteName}</p>
                              <p className="mt-1 break-words text-xs text-slate-400">
                                {formatNumber(suite.executions)} ejecuciones · {formatNumber(suite.cases)} casos
                              </p>
                            </div>
                            <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-200">{selected ? "Seleccionada" : "Tocar para elegir"}</span>
                          </div>
                          <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                            <div className="rounded-xl bg-slate-950/60 px-3 py-2 text-slate-300">
                              <p className="text-slate-500">Promedio</p>
                              <p className="mt-1 break-words text-white">{formatDurationLabel(suite.averageDuration)}</p>
                            </div>
                            <div className="rounded-xl bg-slate-950/60 px-3 py-2 text-slate-300">
                              <p className="text-slate-500">Última ejecución</p>
                              <p className="mt-1 break-words text-white">{formatExecutionTime(suite.latestTimestamp || null)}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="hidden max-w-full overflow-x-auto sm:block">
                    <table className="min-w-[760px] w-full border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr className="text-left text-slate-400">
                          <th className="border-b border-white/10 px-3 py-3">Suite</th>
                          <th className="border-b border-white/10 px-3 py-3">Ejecuciones</th>
                          <th className="hidden sm:table-cell border-b border-white/10 px-3 py-3">Casos</th>
                          <th className="hidden md:table-cell border-b border-white/10 px-3 py-3">Duración promedio</th>
                          <th className="hidden md:table-cell border-b border-white/10 px-3 py-3">Última ejecución</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedSuiteRows.rows.map((suite) => {
                          const selected = launchSelectedSuiteNameEffective === suite.suiteName;

                          return (
                            <tr
                              key={suite.suiteName}
                              className={[
                                "cursor-pointer border-b border-white/5 transition hover:bg-white/5",
                                selected ? "bg-cyan-400/10" : "",
                              ].join(" ")}
                              onClick={() => selectLaunchSuite(suite.suiteName)}
                            >
                              <td className="px-3 py-4 align-top break-words text-white">
                                <p className="break-words font-medium">{suite.suiteName}</p>
                              </td>
                              <td className="px-3 py-4 align-top text-slate-300">{formatNumber(suite.executions)}</td>
                              <td className="hidden sm:table-cell px-3 py-4 align-top text-slate-300">{formatNumber(suite.cases)}</td>
                              <td className="hidden md:table-cell px-3 py-4 align-top text-slate-300">{formatDurationLabel(suite.averageDuration)}</td>
                              <td className="hidden md:table-cell px-3 py-4 align-top text-slate-300">{formatExecutionTime(suite.latestTimestamp || null)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <PaginationControls
                    totalRows={pagedSuiteRows.totalRows}
                    page={pagedSuiteRows.currentPage}
                    totalPages={pagedSuiteRows.totalPages}
                    pageSize={suitePagination.pageSize}
                    onPageChange={(page) => setSuitePagination((prev) => ({ ...prev, page }))}
                    onPageSizeChange={(pageSize) => setSuitePagination({ page: 1, pageSize })}
                  />
                </div>

                <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Acción</p>
                  <p className="mt-2 break-words text-sm font-medium text-white">{launchSelectedSuiteRow?.suiteName ?? "Sin selección"}</p>
                  <p className="mt-1 break-words text-xs text-slate-400">
                    {launchSelectedSuiteRow
                      ? `${formatNumber(launchSelectedSuiteRow.executions)} ejecuciones históricas, ${formatNumber(launchSelectedSuiteRow.cases)} casos`
                      : "Selecciona una suite para continuar"}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">Se enviará esta suite como `test_groups` y podrás revisar su estado en la tabla lateral.</p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Estado</p>
                      <p className="mt-2 break-words text-sm font-medium text-white">{launchStatusLabel(suiteLaunch.status, suiteLaunch.conclusion)}</p>
                      <p className="mt-1 text-xs text-slate-400">{suiteLaunch.conclusion ? `Conclusión: ${suiteLaunch.conclusion}` : "Esperando lanzamiento."}</p>
                    </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Actualizado</p>
                    <p className="mt-2 break-words text-sm font-medium text-white">{suiteLaunch.updatedAt ? formatExecutionTime(suiteLaunch.updatedAt) : "Sin datos"}</p>
                    {suiteLaunch.artifactId && !suiteLaunch.artifactExpired ? (
                      <a href={suiteLaunch.url || githubArtifactDownloadHref(suiteLaunch.artifactId, suiteLaunch.artifactName || "workflow-artifact")} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-cyan-200 underline-offset-4 hover:underline">
                        Abrir informe
                      </a>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">El acceso al informe se habilita cuando el workflow genera un artifact.</p>
                    )}
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Informe</p>
                    {suiteLaunch.artifactId && !suiteLaunch.artifactExpired ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                          {suiteLaunch.artifactName || "Artifact disponible"}
                        </span>
                        <a href={githubArtifactDownloadHref(suiteLaunch.artifactId, suiteLaunch.artifactName || "workflow-artifact")} className={reportButtonClassName("download")}>
                          {reportActionContent("Descarga")}
                        </a>
                      </div>
                    ) : suiteLaunch.status === "completed" ? (
                      <p className="mt-2 break-words text-sm text-slate-300">El workflow terminó, pero no se generó informe descargable.</p>
                    ) : (
                      <p className="mt-2 break-words text-sm text-slate-300">El informe aparecerá aquí si el workflow lo genera.</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={launchSelectedSuite}
                    disabled={suiteLaunch.launching || !launchSelectedSuiteRow}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {suiteLaunch.launching ? "Lanzando..." : "Lanzar suite"}
                  </button>

                  {suiteLaunch.success ? (
                    <p className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{suiteLaunch.success}</p>
                  ) : null}

                  {suiteLaunch.error ? (
                    <p className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{suiteLaunch.error}</p>
                  ) : null}
                </div>
              </div>

              <LaunchHistoryTable title="Historial de lanzamientos de suites" rows={suiteLaunch.history} emptyText="No hay lanzamientos de suite todavía." />
            </div>
          </section>
        ) : null}

        {activeSection === "history" ? (
          <section className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/55 p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
              <h2 className="text-xl font-semibold text-white">Historial de ejecuciones</h2>
              <p className="mt-1 text-sm text-slate-400">Búsqueda y paginación independientes.</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <input
                    value={historyExecutionQuery}
                    onChange={(event) => setHistoryExecutionQuery(event.target.value)}
                    placeholder="Buscar ejecución"
                    className="w-full min-w-0 rounded-full border border-white/10 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 sm:w-auto sm:min-w-56"
                  />
                </div>
              </div>

              <div className="mt-5 space-y-3 sm:hidden">
                {pagedExecutionHistory.rows.map((row) => (
                  <div key={row.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="break-words font-medium text-white">{row.title}</p>
                        <p className="mt-1 break-words text-xs text-slate-400">{row.subtitle}</p>
                      </div>
                      {renderStatusBadge(row.status)}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                      <div className="rounded-xl bg-slate-950/60 px-3 py-2">
                        <p className="text-slate-500">Suite</p>
                        <p className="mt-1 break-words text-white">{row.suiteName}</p>
                      </div>
                      <div className="rounded-xl bg-slate-950/60 px-3 py-2">
                        <p className="text-slate-500">Duración</p>
                        <p className="mt-1 break-words text-white">{formatDurationLabel(row.duration)}</p>
                      </div>
                      <div className="rounded-xl bg-slate-950/60 px-3 py-2 col-span-2">
                        <p className="text-slate-500">Fecha</p>
                        <p className="mt-1 break-words text-white">{formatExecutionTime(row.timestamp || null)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 hidden overflow-x-auto sm:block">
                <table className="min-w-[1080px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Título", active: historyExecutionSort.key === "title", direction: historyExecutionSort.direction, onClick: () => setHistoryExecutionSort(toggleSort(historyExecutionSort, "title")) })}</th>
                      <th className="hidden sm:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Suite", active: historyExecutionSort.key === "suite", direction: historyExecutionSort.direction, onClick: () => setHistoryExecutionSort(toggleSort(historyExecutionSort, "suite")) })}</th>
                      <th className="border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Estado", active: historyExecutionSort.key === "status", direction: historyExecutionSort.direction, onClick: () => setHistoryExecutionSort(toggleSort(historyExecutionSort, "status")) })}</th>
                      <th className="hidden md:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Duración", active: historyExecutionSort.key === "duration", direction: historyExecutionSort.direction, onClick: () => setHistoryExecutionSort(toggleSort(historyExecutionSort, "duration")) })}</th>
                      <th className="hidden sm:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Fecha", active: historyExecutionSort.key === "timestamp", direction: historyExecutionSort.direction, onClick: () => setHistoryExecutionSort(toggleSort(historyExecutionSort, "timestamp")) })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedExecutionHistory.rows.map((row) => (
                      <tr key={row.id} className="border-b border-white/5">
                        <td className="px-3 py-4 align-top text-white">
                          <p className="break-words font-medium">{row.title}</p>
                          <p className="mt-1 break-words text-xs text-slate-400">{row.subtitle}</p>
                        </td>
                        <td className="hidden sm:table-cell px-3 py-4 align-top break-words text-slate-300">{row.suiteName}</td>
                        <td className="px-3 py-4 align-top">{renderStatusBadge(row.status)}</td>
                        <td className="hidden md:table-cell px-3 py-4 align-top break-words text-slate-300">{formatDurationLabel(row.duration)}</td>
                        <td className="hidden sm:table-cell px-3 py-4 align-top break-words text-slate-300">{formatExecutionTime(row.timestamp || null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                totalRows={pagedExecutionHistory.totalRows}
                page={pagedExecutionHistory.currentPage}
                totalPages={pagedExecutionHistory.totalPages}
                pageSize={historyExecutionPagination.pageSize}
                alwaysShow
                onPageChange={(page) => setHistoryExecutionPagination((prev) => ({ ...prev, page }))}
                onPageSizeChange={(pageSize) => setHistoryExecutionPagination({ page: 1, pageSize })}
              />
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/55 p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Historial de casos</h2>
                  <p className="mt-1 text-sm text-slate-400">Búsqueda y paginación independientes.</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <input
                    value={historyCaseQuery}
                    onChange={(event) => setHistoryCaseQuery(event.target.value)}
                    placeholder="Buscar caso"
                    className="w-full min-w-0 rounded-full border border-white/10 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 sm:w-auto sm:min-w-56"
                  />
                </div>
              </div>

              <div className="mt-5 space-y-3 sm:hidden">
                {pagedCaseHistory.rows.map((row) => (
                  <div key={row.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{row.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{row.subtitle}</p>
                      </div>
                      {renderStatusBadge(row.status)}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                      <div className="rounded-xl bg-slate-950/60 px-3 py-2">
                        <p className="text-slate-500">Suite</p>
                        <p className="mt-1 text-white">{row.suiteName}</p>
                      </div>
                      <div className="rounded-xl bg-slate-950/60 px-3 py-2">
                        <p className="text-slate-500">Duración</p>
                        <p className="mt-1 text-white">{formatDurationLabel(row.duration)}</p>
                      </div>
                      <div className="rounded-xl bg-slate-950/60 px-3 py-2 col-span-2">
                        <p className="text-slate-500">Fecha</p>
                        <p className="mt-1 text-white">{formatExecutionTime(row.timestamp || null)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 hidden overflow-x-auto sm:block">
                <table className="min-w-[1080px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Caso", active: historyCaseSort.key === "title", direction: historyCaseSort.direction, onClick: () => setHistoryCaseSort(toggleSort(historyCaseSort, "title")) })}</th>
                      <th className="hidden sm:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Suite", active: historyCaseSort.key === "suite", direction: historyCaseSort.direction, onClick: () => setHistoryCaseSort(toggleSort(historyCaseSort, "suite")) })}</th>
                      <th className="border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Estado", active: historyCaseSort.key === "status", direction: historyCaseSort.direction, onClick: () => setHistoryCaseSort(toggleSort(historyCaseSort, "status")) })}</th>
                      <th className="hidden md:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Duración", active: historyCaseSort.key === "duration", direction: historyCaseSort.direction, onClick: () => setHistoryCaseSort(toggleSort(historyCaseSort, "duration")) })}</th>
                      <th className="hidden sm:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Fecha", active: historyCaseSort.key === "timestamp", direction: historyCaseSort.direction, onClick: () => setHistoryCaseSort(toggleSort(historyCaseSort, "timestamp")) })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedCaseHistory.rows.map((row) => (
                      <tr key={row.id} className="border-b border-white/5">
                        <td className="px-3 py-4 align-top text-white">
                          <p className="font-medium">{row.title}</p>
                          <p className="mt-1 text-xs text-slate-400">{row.subtitle}</p>
                        </td>
                        <td className="hidden sm:table-cell px-3 py-4 align-top text-slate-300">{row.suiteName}</td>
                        <td className="px-3 py-4 align-top">{renderStatusBadge(row.status)}</td>
                        <td className="hidden md:table-cell px-3 py-4 align-top text-slate-300">{formatDurationLabel(row.duration)}</td>
                        <td className="hidden sm:table-cell px-3 py-4 align-top text-slate-300">{formatExecutionTime(row.timestamp || null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                totalRows={pagedCaseHistory.totalRows}
                page={pagedCaseHistory.currentPage}
                totalPages={pagedCaseHistory.totalPages}
                pageSize={historyCasePagination.pageSize}
                alwaysShow
                onPageChange={(page) => setHistoryCasePagination((prev) => ({ ...prev, page }))}
                onPageSizeChange={(pageSize) => setHistoryCasePagination({ page: 1, pageSize })}
              />
            </div>
          </section>
        ) : null}

        {activeSection === "executions" ? (
          <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/55 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Ejecuciones</h2>
                <p className="mt-1 text-sm text-slate-400">Acceso directo a reportes HTML y descarga.</p>
              </div>
            </div>

            <div className="mt-6 space-y-3 sm:hidden">
              {pagedExecutionRows.rows.map((execution) => (
                <div key={execution.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="break-words font-medium text-white">{execution.xml_test_name ?? "Sin suite"}</p>
                        <p className="mt-1 break-words text-xs text-slate-400">{execution.browser ?? "Sin browser"}</p>
                    </div>
                    {renderStatusBadge(normalizeExecutionVerdict(execution.verdict))}
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-950/60 px-3 py-2">
                      <p className="text-slate-500">Tests</p>
                      <p className="mt-1 break-words text-white">{formatNumber(execution.totalTests)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-950/60 px-3 py-2">
                      <p className="text-slate-500">Aprobacion</p>
                      <p className="mt-1 break-words text-white">{formatPercent(execution.approval)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-950/60 px-3 py-2">
                      <p className="text-slate-500">Duracion</p>
                      <p className="mt-1 break-words text-white">{formatDurationLabel(execution.duration)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-950/60 px-3 py-2">
                      <p className="text-slate-500">Fecha</p>
                      <p className="mt-1 break-words text-white">{formatExecutionTime(execution.timestamp || null)}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    {execution.report_url ? (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setPreviewUrl(execution.report_url)} className={reportButtonClassName("preview")}>
                          {reportActionContent("Vista rapida")}
                        </button>
                        <a href={downloadHref(execution.report_url)} className={reportButtonClassName("download")}>
                          {reportActionContent("Descarga")}
                        </a>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">Sin reporte</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

              <div className="mt-6 hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-slate-400">
                    <th className="border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Suite", active: executionSort.key === "suite", direction: executionSort.direction, onClick: () => setExecutionSort(toggleSort(executionSort, "suite")) })}</th>
                    <th className="hidden sm:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Browser", active: executionSort.key === "browser", direction: executionSort.direction, onClick: () => setExecutionSort(toggleSort(executionSort, "browser")) })}</th>
                      <th className="border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Veredicto", active: executionSort.key === "verdict", direction: executionSort.direction, onClick: () => setExecutionSort(toggleSort(executionSort, "verdict")) })}</th>
                    <th className="hidden md:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Tests", active: executionSort.key === "tests", direction: executionSort.direction, onClick: () => setExecutionSort(toggleSort(executionSort, "tests")) })}</th>
                    <th className="hidden md:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Aprobación", active: executionSort.key === "approval", direction: executionSort.direction, onClick: () => setExecutionSort(toggleSort(executionSort, "approval")) })}</th>
                    <th className="hidden lg:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Duración", active: executionSort.key === "duration", direction: executionSort.direction, onClick: () => setExecutionSort(toggleSort(executionSort, "duration")) })}</th>
                    <th className="hidden sm:table-cell border-b border-white/10 px-3 py-3">{sortableHeader({ label: "Fecha", active: executionSort.key === "timestamp", direction: executionSort.direction, onClick: () => setExecutionSort(toggleSort(executionSort, "timestamp")) })}</th>
                    <th className="border-b border-white/10 px-3 py-3">Reporte</th>
                  </tr>
                </thead>
                <tbody>
                    {pagedExecutionRows.rows.map((execution) => (
                    <tr key={execution.id} className="border-b border-white/5">
                      <td className="px-3 py-4 align-top break-words text-white">{execution.xml_test_name ?? "Sin suite"}</td>
                      <td className="hidden sm:table-cell px-3 py-4 align-top break-words text-slate-300">{execution.browser ?? "Sin browser"}</td>
                      <td className="px-3 py-4 align-top">{renderStatusBadge(normalizeExecutionVerdict(execution.verdict))}</td>
                      <td className="hidden md:table-cell px-3 py-4 align-top break-words text-slate-300">{formatNumber(execution.totalTests)}</td>
                      <td className="hidden md:table-cell px-3 py-4 align-top break-words text-slate-300">{formatPercent(execution.approval)}</td>
                      <td className="hidden lg:table-cell px-3 py-4 align-top break-words text-slate-300">{formatDurationLabel(execution.duration)}</td>
                      <td className="hidden sm:table-cell px-3 py-4 align-top break-words text-slate-300">{formatExecutionTime(execution.timestamp || null)}</td>
                      <td className="px-3 py-4 align-top">
                        {execution.report_url ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setPreviewUrl(execution.report_url)}
                              className={reportButtonClassName("preview")}
                            >
                              {reportActionContent("Vista rapida")}
                            </button>
                            <a
                              href={downloadHref(execution.report_url)}
                              className={reportButtonClassName("download")}
                            >
                              {reportActionContent("Descarga")}
                            </a>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">Sin reporte</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
              <PaginationControls
                totalRows={pagedExecutionRows.totalRows}
                page={pagedExecutionRows.currentPage}
                totalPages={pagedExecutionRows.totalPages}
                pageSize={executionPagination.pageSize}
                onPageChange={(page) => setExecutionPagination((prev) => ({ ...prev, page }))}
                onPageSizeChange={(pageSize) => setExecutionPagination({ page: 1, pageSize })}
              />
            </section>
        ) : null}

        {activeSection === "failures" ? (
          <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/55 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Fallos recientes</h2>
                <p className="mt-1 text-sm text-slate-400">Casos con error y reporte asociado.</p>
              </div>
            </div>

            <div className="mt-6 space-y-3 sm:hidden">
              {pagedFailureExecutionRows.rows.map((execution) => (
                <div key={execution.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="break-words font-medium text-white">{execution.xml_test_name ?? "Sin suite"}</p>
                        <p className="mt-1 break-words text-xs text-slate-400">{execution.browser ?? "Sin browser"}</p>
                    </div>
                    {renderStatusBadge(normalizeExecutionVerdict(execution.verdict))}
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-950/60 px-3 py-2">
                      <p className="text-slate-500">Duracion</p>
                      <p className="mt-1 break-words text-white">{formatDurationLabel(execution.duration)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-950/60 px-3 py-2">
                      <p className="text-slate-500">Suite</p>
                      <p className="mt-1 text-white">{execution.xml_test_name ?? "Sin suite"}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    {execution.report_url ? (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setPreviewUrl(execution.report_url)} className={reportButtonClassName("preview")}>
                          {reportActionContent("Vista rapida")}
                        </button>
                        <a href={downloadHref(execution.report_url)} className={reportButtonClassName("download")}>
                          {reportActionContent("Descarga")}
                        </a>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">Sin reporte</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-slate-400">
                    <th className="border-b border-white/10 px-3 py-3">Caso</th>
                    <th className="hidden sm:table-cell border-b border-white/10 px-3 py-3">Browser</th>
                    <th className="border-b border-white/10 px-3 py-3">Estado</th>
                    <th className="hidden md:table-cell border-b border-white/10 px-3 py-3">Duracion</th>
                    <th className="border-b border-white/10 px-3 py-3">Reporte</th>
                  </tr>
                </thead>
                <tbody>
                    {pagedFailureExecutionRows.rows.map((execution) => (
                    <tr key={execution.id} className="border-b border-white/5">
                      <td className="px-3 py-4 align-top break-words text-white">{execution.xml_test_name ?? "Sin suite"}</td>
                      <td className="hidden sm:table-cell px-3 py-4 align-top break-words text-slate-300">{execution.browser ?? "Sin browser"}</td>
                      <td className="px-3 py-4 align-top">{renderStatusBadge(normalizeExecutionVerdict(execution.verdict))}</td>
                      <td className="hidden md:table-cell px-3 py-4 align-top break-words text-slate-300">{formatDurationLabel(execution.duration)}</td>
                      <td className="px-3 py-4 align-top">
                        {execution.report_url ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setPreviewUrl(execution.report_url)}
                              className={reportButtonClassName("preview")}
                            >
                              {reportActionContent("Vista rapida")}
                            </button>
                            <a
                              href={downloadHref(execution.report_url)}
                              className={reportButtonClassName("download")}
                            >
                              {reportActionContent("Descarga")}
                            </a>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">Sin reporte</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
              <PaginationControls
                totalRows={pagedFailureExecutionRows.totalRows}
                page={pagedFailureExecutionRows.currentPage}
                totalPages={pagedFailureExecutionRows.totalPages}
                pageSize={failurePagination.pageSize}
                onPageChange={(page) => setFailurePagination((prev) => ({ ...prev, page }))}
                onPageSizeChange={(pageSize) => setFailurePagination({ page: 1, pageSize })}
              />
            </section>
        ) : null}

        <footer className="mt-4 rounded-[1.5rem] border border-white/10 bg-slate-950/50 px-5 py-4 text-center text-xs text-slate-400 sm:px-6">
          <p className="break-words">
            Página de prueba creada con IA. Derechos reservados por Jeremy Burgos.
          </p>
        </footer>
      </div>

      {previewUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="flex h-[90vh] w-[95vw] max-w-[1500px] flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Vista rapida</p>
                <p className="mt-1 text-sm text-slate-200">{previewUrl}</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={downloadHref(previewUrl)}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10"
                >
                  Descargar
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewUrl(null)}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="relative flex-1 bg-slate-900">
              <iframe
                key={activePreviewUrl}
                src={activePreviewUrl}
                title="Vista rapida del reporte"
                className="h-full w-full bg-white"
                sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-downloads"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}


