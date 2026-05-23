import React, { useRef, useState } from "react";
import { FilePdf, MicrosoftWordLogo, SpinnerGap } from "@phosphor-icons/react";
import showToast from "@/utils/toast";
import ClassicResumeTemplate from "./ClassicResumeTemplate";
import { exportResumeAsDocx, exportResumeAsPdf } from "./resumeExport";
import { analyzeResume } from "./resumeProgress";
import { RESUME_PREVIEW_TABS } from "./resumeModes";

export default function ResumePreviewPanel({
  resume,
  mode,
  resumePaperRef: providedResumePaperRef = null,
}) {
  const progress = analyzeResume(resume);
  const localResumePaperRef = useRef(null);
  const resumePaperRef = providedResumePaperRef || localResumePaperRef;
  const [activeTab, setActiveTab] = useState(mode?.tab || "resume");
  const [exporting, setExporting] = useState(null);
  const activeTabMeta =
    RESUME_PREVIEW_TABS.find((tab) => tab.id === activeTab) ||
    RESUME_PREVIEW_TABS[0];

  React.useEffect(() => {
    setActiveTab(mode?.tab || "resume");
  }, [mode?.tab]);

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
      <header className="resume-preview-toolbar">
        <div className="resume-progress-compact">
          <div
            className="resume-progress-track"
            aria-label={`Resume completeness ${progress.percentage}%`}
          >
            <span style={{ width: `${progress.percentage}%` }} />
          </div>
          <strong>{progress.percentage}%</strong>
        </div>
        <div
          className="resume-preview-tabs"
          role="tablist"
          aria-label="Resume assets"
        >
          {RESUME_PREVIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? "is-active" : ""}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="resume-preview-actions" aria-label="Preview actions">
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
      {activeTab === "resume" ? (
        <div className="resume-preview-scroll">
          <ClassicResumeTemplate ref={resumePaperRef} resume={resume} />
        </div>
      ) : (
        <>
          <div className="resume-preview-empty">
            <p>{activeTabMeta.label}</p>
            <h3>{activeTabMeta.title}</h3>
            <span>{activeTabMeta.description}</span>
          </div>
          <div className="resume-export-source" aria-hidden="true">
            <ClassicResumeTemplate ref={resumePaperRef} resume={resume} />
          </div>
        </>
      )}
    </section>
  );
}
