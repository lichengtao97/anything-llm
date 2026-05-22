const { reqBody, userFromSession } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { validWorkspaceSlug } = require("../utils/middleware/validWorkspace");
const { WorkspaceChats } = require("../models/workspaceChats");
const { WorkspaceThread } = require("../models/workspaceThread");
const createFilesLib = require("../utils/agents/aibitat/plugins/create-files/lib");

const MAX_RESUME_EXPORT_FILE_BYTES = 15 * 1024 * 1024;
const EXPORT_FORMATS = {
  pdf: {
    extension: "pdf",
    fileType: "pdf",
    outputType: "PdfFileDownload",
    isValidBuffer: (buffer) => buffer.slice(0, 4).toString("utf8") === "%PDF",
  },
  docx: {
    extension: "docx",
    fileType: "docx",
    outputType: "DocxFileDownload",
    isValidBuffer: (buffer) =>
      buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b,
  },
};

function safeDisplayFilename(filename = "", extension = "") {
  const fallback = `resume.${extension}`;
  const safe = String(filename || fallback)
    .split(/[\\/]/)
    .pop()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (!safe) return fallback;
  return safe.toLowerCase().endsWith(`.${extension}`)
    ? safe
    : `${safe}.${extension}`;
}

function decodeExportBuffer(file = {}) {
  if (typeof file.base64 !== "string" || !file.base64.trim()) return null;
  const normalized = file.base64.includes(",")
    ? file.base64.split(",").pop()
    : file.base64;
  return Buffer.from(normalized, "base64");
}

async function findThread({ workspace, user, threadSlug }) {
  if (!threadSlug) return null;
  return await WorkspaceThread.get({
    slug: threadSlug,
    workspace_id: workspace.id,
    user_id: user?.id || null,
  });
}

function exportedText(outputs = []) {
  const hasPdf = outputs.some((output) => output.type === "PdfFileDownload");
  const hasDocx = outputs.some((output) => output.type === "DocxFileDownload");
  if (hasPdf && hasDocx) return "PDF 和 Word 导出完成";
  if (hasPdf) return "PDF 导出完成";
  if (hasDocx) return "Word 导出完成";
  return "导出完成";
}

function resumeWorkspaceEndpoints(app) {
  if (!app) return;

  app.post(
    "/workspace/:slug/resume/export-files",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const workspace = response.locals.workspace;
        const { threadSlug = null, prompt = "", files = [] } = reqBody(request);

        if (!Array.isArray(files) || files.length === 0) {
          response.status(400).json({ message: "No export files provided." });
          return;
        }

        const thread = await findThread({ workspace, user, threadSlug });
        if (threadSlug && !thread) {
          response.status(404).json({ message: "Workspace thread not found." });
          return;
        }

        const outputs = [];
        for (const file of files) {
          const format = String(file?.format || "").toLowerCase();
          const config = EXPORT_FORMATS[format];
          if (!config) {
            response.status(400).json({ message: "Unsupported export format." });
            return;
          }

          const buffer = decodeExportBuffer(file);
          if (!buffer || buffer.length === 0) {
            response.status(400).json({ message: "Invalid export file data." });
            return;
          }

          if (buffer.length > MAX_RESUME_EXPORT_FILE_BYTES) {
            response.status(413).json({ message: "Export file is too large." });
            return;
          }

          if (!config.isValidBuffer(buffer)) {
            response.status(400).json({ message: "Export file is malformed." });
            return;
          }

          const savedFile = await createFilesLib.saveGeneratedFile({
            fileType: config.fileType,
            extension: config.extension,
            buffer,
            displayFilename: safeDisplayFilename(
              file.filename,
              config.extension
            ),
          });

          outputs.push({
            type: config.outputType,
            payload: {
              filename: savedFile.displayFilename,
              storageFilename: savedFile.filename,
              fileSize: savedFile.fileSize,
            },
          });
        }

        const text = exportedText(outputs);
        const { chat, message } = await WorkspaceChats.new({
          workspaceId: workspace.id,
          prompt: String(prompt || "导出简历"),
          response: {
            text,
            sources: [],
            type: "textResponse",
            outputs,
          },
          threadId: thread?.id || null,
          user,
        });

        if (!chat) {
          response
            .status(500)
            .json({ message: message || "Failed to save export chat." });
          return;
        }

        response.status(200).json({
          success: true,
          text,
          chatId: chat.id,
          outputs,
        });
      } catch (e) {
        console.error("[resumeWorkspace/export-files]", e.message, e);
        response.status(500).json({ message: "Failed to export resume files." });
      }
    }
  );
}

module.exports = { resumeWorkspaceEndpoints };
