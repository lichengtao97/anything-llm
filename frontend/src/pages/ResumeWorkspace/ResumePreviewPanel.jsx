import React, { useRef, useState } from "react";
import { FilePdf, MicrosoftWordLogo, SpinnerGap } from "@phosphor-icons/react";
import showToast from "@/utils/toast";
import ClassicResumeTemplate from "./ClassicResumeTemplate";
import { getResumeSuggestions } from "./resumeIntake";
import { exportResumeAsDocx, exportResumeAsPdf } from "./resumeExport";
import { analyzeResume } from "./resumeProgress";

export default function ResumePreviewPanel({
  resume,
  workspace,
  resumePaperRef: providedResumePaperRef = null,
}) {
  const progress = analyzeResume(resume);
  const suggestions = getResumeSuggestions(resume);
  const localResumePaperRef = useRef(null);
  const resumePaperRef = providedResumePaperRef || localResumePaperRef;
  const [exporting, setExporting] = useState(null);

  async function handleExport(format) {
    if (exporting) return;
    setExporting(format);
    try {
      if (format === "pdf") {
        await exportResumeAsPdf(resumePaperRef.current, resume);
        showToast("PDF 已开始下载", "success");
      } else {
        await exportResumeAsDocx(resume);
        showToast("Word 已开始下载", "success");
      }
    } catch (e) {
      console.error("Failed to export resume:", e);
      showToast("导出失败，请稍后重试", "error");
    } finally {
      setExporting(null);
    }
  }

  return (
    <section className="resume-preview-panel" aria-label="Resume preview">
      <header className="resume-preview-header">
        <div>
          <p>Resume Preview</p>
          <h2>简历进度</h2>
        </div>
        <div className="resume-preview-actions" aria-label="Preview actions">
          <span>Classic</span>
          {workspace?.name && <span>{workspace.name}</span>}
          <button
            type="button"
            className="resume-export-button"
            onClick={() => handleExport("pdf")}
            disabled={!!exporting}
            aria-label="导出 PDF"
            data-export-format="pdf"
          >
            {exporting === "pdf" ? (
              <SpinnerGap className="resume-export-spinner" />
            ) : (
              <FilePdf />
            )}
            <span>PDF</span>
          </button>
          <button
            type="button"
            className="resume-export-button"
            onClick={() => handleExport("docx")}
            disabled={!!exporting}
            aria-label="导出 Word"
            data-export-format="docx"
          >
            {exporting === "docx" ? (
              <SpinnerGap className="resume-export-spinner" />
            ) : (
              <MicrosoftWordLogo />
            )}
            <span>Word</span>
          </button>
        </div>
      </header>
      <div className="resume-preview-status">
        <div className="resume-stage-line">
          <span>当前阶段</span>
          <strong>{progress.stageLabel}</strong>
        </div>
        <div className="resume-progress-line">
          <span>完整度</span>
          <strong>{progress.percentage}%</strong>
        </div>
        <div
          className="resume-progress-track"
          aria-label={`Resume completeness ${progress.percentage}%`}
        >
          <span style={{ width: `${progress.percentage}%` }} />
        </div>
        <div className="resume-section-checks">
          {progress.sections.map((section) => (
            <span
              key={section.id}
              className={section.done ? "is-complete" : "is-pending"}
            >
              {section.label}
            </span>
          ))}
        </div>
        <div className="resume-suggestions">
          <p>修改建议</p>
          <ul>
            {suggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="resume-preview-scroll">
        <ClassicResumeTemplate ref={resumePaperRef} resume={resume} />
      </div>
    </section>
  );
}
