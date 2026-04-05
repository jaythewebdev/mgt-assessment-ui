import { useEffect, useMemo, useState } from "react";

const LOCAL_BASE_URL = "http://127.0.0.1:8011/api/v1/lead-followup";
const ENV_BASE_URL = import.meta.env.VITE_LEAD_FOLLOWUP_BASE_URL || "";

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

const DEFAULT_BASE_URL = normalizeBaseUrl(ENV_BASE_URL) || LOCAL_BASE_URL;
const STAGE_ORDER = ["ingest", "duplicate_lookup", "validate", "enrich", "llm_decision", "confidence_routing", "persist"];

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function statusTone(status) {
  if (status === "success") return "ok";
  if (status === "failed") return "bad";
  if (status === "skipped") return "skip";
  if (status === "running") return "run";
  if (status === "idle") return "idle";
  return "wait";
}

function traceTone(status) {
  if (status === "success") return "ok";
  if (status === "duplicate_reused") return "reuse";
  if (status === "skipped") return "skip";
  if (status === "blocked") return "block";
  if (status === "failed" || status === "failed_but_continued") return "bad";
  return "wait";
}

function createInitialStageState() {
  return STAGE_ORDER.map((name) => ({
    name,
    status: "idle",
    started_at: "-",
    ended_at: "-",
    output_summary: "Waiting for run",
    errors: []
  }));
}

function mapResultToStageBoard(stages) {
  const base = createInitialStageState();
  if (!Array.isArray(stages) || stages.length === 0) {
    return base;
  }

  return base.map((stage) => {
    const matched = stages.find((s) => s.name === stage.name);
    if (!matched) {
      return stage;
    }
    return {
      ...stage,
      status: matched.status || "wait",
      started_at: matched.started_at || "-",
      ended_at: matched.ended_at || "-",
      output_summary: matched.output_summary || "-",
      errors: matched.errors || []
    };
  });
}

export default function App() {
  const [mode, setMode] = useState("file");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [file, setFile] = useState(null);
  const [jsonText, setJsonText] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [result, setResult] = useState(null);
  const [timelineStages, setTimelineStages] = useState(createInitialStageState());
  const [historyRecords, setHistoryRecords] = useState([]);
  const [historyError, setHistoryError] = useState("");
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const draftedEmail = useMemo(() => result?.artifacts?.email_draft || null, [result]);
  const personalizationNotes = useMemo(() => result?.artifacts?.personalization_notes || [], [result]);
  const plannerTrace = useMemo(() => result?.planner_trace || [], [result]);

  useEffect(() => {
    void fetchHistory();
  }, []);

  async function fetchHistory(limit = 25) {
    setIsHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch(`${baseUrl}/history?limit=${limit}`);
      if (!response.ok) {
        let message = `History request failed with status ${response.status}`;
        try {
          const err = await response.json();
          message = err?.message || message;
        } catch {
          const body = await response.text();
          message = body || message;
        }
        throw new Error(message);
      }
      const data = await response.json();
      setHistoryRecords(data.records || []);
    } catch (error) {
      setHistoryError(error.message || "Could not load history records.");
    } finally {
      setIsHistoryLoading(false);
    }
  }

  async function runWithFile() {
    if (!file) {
      throw new Error("Select a .json file before running.");
    }

    const form = new FormData();
    form.append("file", file);

    const response = await fetch(`${baseUrl}/upload`, {
      method: "POST",
      body: form
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `Request failed with status ${response.status}`);
    }

    return response.json();
  }

  async function runWithJson() {
    let payload;
    try {
      payload = JSON.parse(jsonText);
    } catch {
      throw new Error("JSON input is invalid. Please fix syntax and retry.");
    }

    const response = await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `Request failed with status ${response.status}`);
    }

    return response.json();
  }

  async function handleRun(event) {
    event.preventDefault();
    setIsRunning(true);
    setRunError("");
    setResult(null);
    setTimelineStages(
      createInitialStageState().map((stage) => ({
        ...stage,
        status: "wait",
        output_summary: "Pending execution"
      }))
    );

    try {
      const data = mode === "file" ? await runWithFile() : await runWithJson();
      setResult(data);
      setTimelineStages(mapResultToStageBoard(data.stages || []));
      await fetchHistory();
    } catch (error) {
      setRunError(error.message || "Execution failed.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="page-shell">
      <header className="hero">
        <div>
          <h1>Lead Follow-up Flight Deck</h1>
          <p>Upload a lead file or paste lead JSON, then watch each backend stage progress in sequence.</p>
        </div>
        <div className="status-chip">{isRunning ? "Running" : "Ready"}</div>
      </header>

      <section className="panel form-panel">
        <form onSubmit={handleRun}>
          <div className="grid-2">
            <label className="field">
              <span>Backend API Base URL</span>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(normalizeBaseUrl(e.target.value))}
                placeholder={DEFAULT_BASE_URL}
              />
            </label>
            <div className="field mode-switch">
              <span>Input Mode</span>
              <div className="toggle-row">
                <button
                  type="button"
                  className={mode === "file" ? "active" : ""}
                  onClick={() => setMode("file")}
                >
                  File Upload
                </button>
                <button
                  type="button"
                  className={mode === "json" ? "active" : ""}
                  onClick={() => setMode("json")}
                >
                  JSON Input
                </button>
              </div>
            </div>
          </div>

          {mode === "file" ? (
            <label className="field">
              <span>Select Lead JSON File</span>
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          ) : (
            <label className="field">
              <span>Lead JSON Payload</span>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                rows={12}
                spellCheck={false}
              />
            </label>
          )}

          <div className="action-row">
            <button type="submit" disabled={isRunning} className="run-btn">
              {isRunning ? "Running Agent..." : "Run Lead Follow-up"}
            </button>
            {runError && <p className="error-text">{runError}</p>}
          </div>
        </form>
      </section>

      <section className="panel timeline-panel">
        <div className="panel-head">
          <h2>Stage Movement</h2>
          <span className="meta-pill">
            {timelineStages.filter((stage) => stage.status === "success").length}/{timelineStages.length} passed
          </span>
        </div>

        {!result && <p className="muted">Stages are listed below. Run the agent to see which stages passed/failed/skipped.</p>}

        <ol className="timeline">
          {timelineStages.map((stage, idx) => (
            <li key={`${stage.name}-${idx}`} className={`timeline-item ${statusTone(stage.status)}`}>
              <div className="dot" />
              <div className="card">
                <div className="title-row">
                  <h3>{stage.name}</h3>
                  <span className={`badge ${statusTone(stage.status)}`}>{stage.status}</span>
                </div>
                <p><strong>Started:</strong> {stage.started_at}</p>
                {stage.ended_at && <p><strong>Ended:</strong> {stage.ended_at}</p>}
                {stage.output_summary && <p><strong>Output:</strong> {stage.output_summary}</p>}
                {stage.errors?.length > 0 && (
                  <details>
                    <summary>Errors ({stage.errors.length})</summary>
                    <pre>{prettyJson(stage.errors)}</pre>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel result-panel">
        <div className="panel-head">
          <h2>Final Decision</h2>
        </div>
        {!result ? (
          <p className="muted">No result yet.</p>
        ) : (
          <>
            <div className="summary-grid">
              <div className="summary-card">
                <span>Trace ID</span>
                <strong>{result.trace_id}</strong>
              </div>
              <div className="summary-card">
                <span>Status</span>
                <strong>{result.status}</strong>
              </div>
              <div className="summary-card">
                <span>Action</span>
                <strong>{result.decision?.action || "-"}</strong>
              </div>
              <div className="summary-card">
                <span>Workflow State</span>
                <strong>{result.decision?.workflow_state || "-"}</strong>
              </div>
              <div className="summary-card">
                <span>Confidence</span>
                <strong>{result.confidence ?? "-"}</strong>
              </div>
              <div className="summary-card">
                <span>Confidence Rationale</span>
                <strong>{result.confidence_rationale || "-"}</strong>
              </div>
            </div>

            <div className="details-grid">
              <div className="detail-card">
                <h3>Drafted Email</h3>
                <p><strong>Subject:</strong> {draftedEmail?.subject || "-"}</p>
                <p><strong>Body:</strong></p>
                <pre className="inline-pre">{draftedEmail?.body || "No draft body available."}</pre>
              </div>

              <div className="detail-card">
                <h3>Important Lead Details</h3>
                <p><strong>Trace ID:</strong> {result.trace_id}</p>
                <p><strong>Scenario:</strong> {result.scenario}</p>
                <p><strong>LLM Action:</strong> {result.decision?.llm_action || "-"}</p>
                <p><strong>Reasoning:</strong> {result.decision?.reasoning || "-"}</p>
                <p><strong>Confidence Band:</strong> {result.decision?.confidence_band || "-"}</p>
                <p><strong>Missing Fields:</strong> {result.artifacts?.missing_fields?.length ? result.artifacts.missing_fields.join(", ") : "None"}</p>
                <p><strong>Personalization Notes:</strong></p>
                {personalizationNotes.length > 0 ? (
                  <ul className="plain-list">
                    {personalizationNotes.map((note, index) => (
                      <li key={`${note}-${index}`}>{note}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No personalization notes available.</p>
                )}
              </div>
            </div>

            {result.decision?.next_steps?.length > 0 && (
              <div className="next-steps">
                <h3>What Can Be Performed Next</h3>
                <ul>
                  {result.decision.next_steps.map((step) => (
                    <li key={step.code}>
                      <strong>{step.label}</strong>
                      <p>{step.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="planner-trace">
              <div className="panel-head">
                <h3>Planner Trace</h3>
                <span className="meta-pill">{plannerTrace.length} turns</span>
              </div>
              {plannerTrace.length === 0 ? (
                <p className="muted">No planner trace available for this run.</p>
              ) : (
                <ol className="trace-list">
                  {plannerTrace.map((entry, index) => (
                    <li
                      key={`${entry.at || "na"}-${entry.tool_call_id || index}`}
                      className={`trace-item ${traceTone(entry?.result?.status)}`}
                    >
                      <div className="trace-head">
                        <strong>#{index + 1} {entry.selected_stage || "-"}</strong>
                        <span className={`badge ${traceTone(entry?.result?.status)}`}>
                          {entry?.result?.status || "unknown"}
                        </span>
                        <span className="trace-time">{entry.at || "-"}</span>
                      </div>
                      <p>
                        <strong>Executed:</strong> {entry.executed_stage || "-"}
                        {entry.tool_call_id ? ` | tool_call_id: ${entry.tool_call_id}` : ""}
                      </p>
                      <p><strong>Rationale:</strong> {entry.rationale || "-"}</p>
                      {entry.skip_reason && <p><strong>Skip Reason:</strong> {entry.skip_reason}</p>}
                      <details>
                        <summary>Result Payload</summary>
                        <pre className="raw-json-pre">{prettyJson(entry.result || {})}</pre>
                      </details>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <details>
              <summary>View Full JSON Result</summary>
              <pre className="raw-json-pre">{prettyJson(result)}</pre>
            </details>
          </>
        )}
      </section>

      <section className="panel history-panel">
        <div className="panel-head">
          <h2>Previous Runs Dashboard</h2>
          <div className="history-actions">
            <button type="button" className="secondary-btn" onClick={() => fetchHistory()} disabled={isHistoryLoading}>
              {isHistoryLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {historyError && <p className="error-text">{historyError}</p>}
        {!historyError && historyRecords.length === 0 && <p className="muted">No historical records yet.</p>}

        {historyRecords.length > 0 && (
          <div className="table-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Lead</th>
                  <th>Status</th>
                  <th>Action</th>
                  <th>Workflow</th>
                  <th>Confidence</th>
                  <th>Trace ID</th>
                </tr>
              </thead>
              <tbody>
                {historyRecords.map((record) => (
                  <tr key={record.trace_id}>
                    <td>{record.created_at || "-"}</td>
                    <td>{record.lead_id || "-"}</td>
                    <td>{record.status || "-"}</td>
                    <td>{record.action || "-"}</td>
                    <td>{record.workflow_state || "-"}</td>
                    <td>{record.confidence ?? "-"}</td>
                    <td className="trace-col">{record.trace_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
