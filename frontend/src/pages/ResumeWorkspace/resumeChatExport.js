import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";
import {
  buildResumeDocxBlob,
  buildResumePdfBlob,
  fileBaseName,
} from "./resumeExport";

const FORMAT_CONFIG = {
  pdf: {
    extension: "pdf",
    mime: "application/pdf",
  },
  docx: {
    extension: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
};

function wantsPdf(message = "") {
  return /\bpdf\b/i.test(message);
}

function wantsDocx(message = "") {
  return /\b(docx?|word)\b/i.test(message) || /Word|文档/i.test(message);
}

export function getRequestedResumeExportFormats(message = "") {
  const text = String(message || "");
  const hasStrongExportIntent =
    /(导出|下载|保存|输出|export|download|save)/i.test(text);
  const hasGenerateFileIntent =
    /(生成|制作|create|make)/i.test(text) &&
    (wantsPdf(text) || wantsDocx(text));

  if (!hasStrongExportIntent && !hasGenerateFileIntent) return [];

  const formats = [];
  if (wantsPdf(text)) formats.push("pdf");
  if (wantsDocx(text)) formats.push("docx");

  if (formats.length > 0) return formats;
  if (/(简历|resume|cv)/i.test(text)) return ["pdf", "docx"];
  return [];
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function buildResumeExportFiles({
  resume,
  resumeElement,
  formats = [],
}) {
  const baseName = fileBaseName(resume);
  const files = [];

  for (const format of formats) {
    const config = FORMAT_CONFIG[format];
    if (!config) continue;

    const blob =
      format === "pdf"
        ? await buildResumePdfBlob(resumeElement, resume)
        : await buildResumeDocxBlob(resume);

    files.push({
      format,
      filename: `${baseName}.${config.extension}`,
      mime: blob.type || config.mime,
      base64: await blobToBase64(blob),
    });
  }

  return files;
}

export async function registerResumeExportFiles({
  slug,
  threadSlug = null,
  prompt,
  files = [],
}) {
  const response = await fetch(
    `${API_BASE}/workspace/${slug}/resume/export-files`,
    {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({
        threadSlug,
        prompt,
        files,
      }),
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) {
    throw new Error(data?.message || "Failed to register resume export files.");
  }
  return data;
}
