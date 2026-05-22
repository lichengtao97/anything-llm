import React, { useCallback, useEffect, useRef, useState } from "react";
import { default as WorkspaceChatContainer } from "@/components/WorkspaceChat";
import Sidebar from "@/components/Sidebar";
import { useParams } from "react-router-dom";
import Workspace from "@/models/workspace";
import PasswordModal, { usePasswordModal } from "@/components/Modals/Password";
import { isMobile } from "react-device-detect";
import { v4 } from "uuid";
import { FullScreenLoader } from "@/components/Preloader";
import { LAST_VISITED_WORKSPACE } from "@/utils/constants";
import ResumePreviewPanel from "./ResumePreviewPanel";
import {
  extractResumeUpdate,
  loadStoredResume,
  mergeResumeData,
  persistResume,
  stripResumeUpdatePayload,
} from "./resumeState";
import { buildResumeChatPrompt, stripResumeChatPrompt } from "./resumeDialogue";
import { extractResumeDraftFromMessage } from "./resumeIntake";
import {
  buildResumeExportFiles,
  getRequestedResumeExportFormats,
  registerResumeExportFiles,
} from "./resumeChatExport";
import "./styles.css";

export default function ResumeWorkspace() {
  const { loading, requiresAuth, mode } = usePasswordModal();

  if (loading) return <FullScreenLoader />;
  if (requiresAuth !== false) {
    return <>{requiresAuth !== null && <PasswordModal mode={mode} />}</>;
  }

  return (
    <div className="resume-workspace-page w-screen h-screen overflow-hidden bg-zinc-950 light:bg-slate-50 flex">
      {!isMobile && (
        <div className="resume-workspace-sidebar">
          <Sidebar />
        </div>
      )}
      <ShowResumeWorkspace />
    </div>
  );
}

function ShowResumeWorkspace() {
  const { slug, threadSlug = null } = useParams();
  const [workspace, setWorkspace] = useState(null);
  const [loadedSlug, setLoadedSlug] = useState(null);
  const [resume, setResume] = useState(() =>
    loadStoredResume(slug, threadSlug)
  );
  const responseChunksRef = useRef(new Map());
  const processedAssistantPayloadsRef = useRef(new Set());
  const resumePaperRef = useRef(null);

  useEffect(() => {
    if (!slug) return;
    setResume(loadStoredResume(slug, threadSlug));
    responseChunksRef.current.clear();
    processedAssistantPayloadsRef.current.clear();
  }, [slug, threadSlug]);

  useEffect(() => {
    async function getWorkspace() {
      if (!slug) return;
      const _workspace = await Workspace.bySlug(slug);
      if (!_workspace) {
        setWorkspace(null);
        setLoadedSlug(slug);
        return;
      }

      const [suggestedMessages, { showAgentCommand }] = await Promise.all([
        Workspace.getSuggestedMessages(slug),
        Workspace.agentCommandAvailable(slug),
      ]);
      setWorkspace({
        ..._workspace,
        suggestedMessages,
        showAgentCommand,
      });
      setLoadedSlug(slug);
      localStorage.setItem(
        LAST_VISITED_WORKSPACE,
        JSON.stringify({
          slug: _workspace.slug,
          name: _workspace.name,
        })
      );
    }
    getWorkspace();
  }, [slug]);

  const mergeAndPersistResume = useCallback(
    (patch) => {
      setResume((current) => {
        const next = mergeResumeData(current, patch);
        persistResume(slug, threadSlug, next);
        return next;
      });
    },
    [slug, threadSlug]
  );

  const handleChatResult = useCallback(
    (chatResult = {}) => {
      const { uuid, type, textResponse = "" } = chatResult;
      if (!uuid) return;

      if (type === "textResponseChunk") {
        const current = responseChunksRef.current.get(uuid) || "";
        responseChunksRef.current.set(uuid, `${current}${textResponse || ""}`);
        return;
      }

      let responseText = null;
      if (type === "finalizeResponseStream") {
        responseText = responseChunksRef.current.get(uuid) || "";
        responseChunksRef.current.delete(uuid);
      } else if (type === "textResponse" || type === "statusResponse") {
        responseText = textResponse || "";
      }

      if (!responseText) return;
      const update = extractResumeUpdate(responseText);
      if (update) mergeAndPersistResume(update);
    },
    [mergeAndPersistResume]
  );

  const prepareOutgoingPrompt = useCallback(
    (message) => {
      const draft = extractResumeDraftFromMessage(message, resume);
      if (!draft) return buildResumeChatPrompt(message, resume);

      const projectedResume = mergeResumeData(resume, draft);
      persistResume(slug, threadSlug, projectedResume);
      setResume(projectedResume);
      return buildResumeChatPrompt(message, projectedResume);
    },
    [resume, slug, threadSlug]
  );

  const transformAssistantMessageContent = useCallback(
    (message = "") => {
      const update = extractResumeUpdate(message);
      if (update) {
        const signature = `${threadSlug || "default"}:${message}`;
        if (!processedAssistantPayloadsRef.current.has(signature)) {
          processedAssistantPayloadsRef.current.add(signature);
          queueMicrotask(() => mergeAndPersistResume(update));
        }
      }

      return stripResumeUpdatePayload(message);
    },
    [mergeAndPersistResume, threadSlug]
  );

  const handleResumeExportSubmit = useCallback(
    async ({ message, attachments = [] }) => {
      const formats = getRequestedResumeExportFormats(message);
      if (!formats.length) return { handled: false };

      const files = await buildResumeExportFiles({
        resume,
        resumeElement: resumePaperRef.current,
        formats,
      });
      if (!files.length) return { handled: false };

      const result = await registerResumeExportFiles({
        slug,
        threadSlug,
        prompt: message,
        files,
      });

      return {
        handled: true,
        messages: [
          {
            content: message,
            role: "user",
            attachments,
            chatId: result.chatId,
          },
          {
            uuid: v4(),
            type: "textResponse",
            content: result.text || "导出完成",
            role: "assistant",
            sources: [],
            closed: true,
            error: null,
            animate: false,
            pending: false,
            chatId: result.chatId,
            outputs: result.outputs || [],
          },
        ],
      };
    },
    [resume, slug, threadSlug]
  );

  return (
    <WorkspaceChatContainer
      loading={loadedSlug !== slug}
      workspace={workspace}
      layoutVariant="resume"
      rightPanel={
        <ResumePreviewPanel
          resume={resume}
          workspace={workspace}
          resumePaperRef={resumePaperRef}
        />
      }
      onChatResult={handleChatResult}
      onCustomSubmit={handleResumeExportSubmit}
      prepareOutgoingPrompt={prepareOutgoingPrompt}
      transformUserMessageContent={stripResumeChatPrompt}
      transformAssistantMessageContent={transformAssistantMessageContent}
    />
  );
}
