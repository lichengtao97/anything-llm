import { useState, useEffect, useContext, useRef } from "react";
import ChatHistory from "./ChatHistory";
import { CLEAR_ATTACHMENTS_EVENT, DndUploaderContext } from "./DnDWrapper";
import PromptInput, {
  PROMPT_INPUT_EVENT,
  PROMPT_INPUT_ID,
} from "./PromptInput";
import Workspace from "@/models/workspace";
import handleChat, { ABORT_STREAM_EVENT } from "@/utils/chat";
import { isMobile } from "react-device-detect";
import { SidebarMobileHeader } from "../../Sidebar";
import { useNavigate } from "react-router-dom";
import { v4 } from "uuid";
import handleSocketResponse, {
  websocketURI,
  AGENT_SESSION_END,
  AGENT_SESSION_START,
  setAgentSessionActive,
} from "@/utils/chat/agent";
import DnDFileUploaderWrapper from "./DnDWrapper";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import { ChatTooltips } from "./ChatTooltips";
import { MetricsProvider } from "./ChatHistory/HistoricalMessage/Actions/RenderMetrics";
import useChatContainerQuickScroll from "@/hooks/useChatContainerQuickScroll";
import { PENDING_HOME_MESSAGE } from "@/utils/constants";
import { clearPromptInputDraft } from "@/hooks/usePromptInputStorage";
import { safeJsonParse } from "@/utils/request";
import { useTranslation } from "react-i18next";
import paths from "@/utils/paths";
import QuickActions from "@/components/lib/QuickActions";
import SuggestedMessages from "@/components/lib/SuggestedMessages";
import ChatSettingsMenu from "./ChatSettingsMenu";
import WorkspaceModelPicker from "./WorkspaceModelPicker";
import { ChatSidebarProvider } from "./ChatSidebar";
import SourcesSidebar from "./SourcesSidebar";
import MemoriesSidebar from "./MemoriesSidebar";

export default function ChatContainer({
  workspace,
  threadSlug = null,
  knownHistory = [],
  layoutVariant = "default",
  rightPanel = null,
  onChatResult = null,
  onCustomSubmit = null,
  prepareOutgoingPrompt = null,
  transformUserMessageContent = null,
  transformAssistantMessageContent = null,
  emptyStateTitle = null,
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loadingResponse, setLoadingResponse] = useState(false);
  const [chatHistory, setChatHistory] = useState(() =>
    transformHistoryForDisplay(knownHistory)
  );
  const [socketId, setSocketId] = useState(null);
  const [websocket, setWebsocket] = useState(null);
  const { files, parseAttachments } = useContext(DndUploaderContext);
  const { chatHistoryRef } = useChatContainerQuickScroll();
  const pendingMessageChecked = useRef(false);
  const pendingResetRef = useRef(false);

  const { listening, resetTranscript } = useSpeechRecognition({
    clearTranscriptOnListen: true,
  });
  const isResumeLayout = layoutVariant === "resume" && !!rightPanel;
  const containerHeightStyle = {
    height: isMobile ? "100%" : "calc(100% - 32px)",
  };

  function normalizeChatResultIdentity(chatResult = {}) {
    if (chatResult.uuid || !chatResult.id) return chatResult;
    return {
      ...chatResult,
      uuid: chatResult.id,
    };
  }

  function handleIncomingChatResult(chatResult, remHistory, _chatHistory) {
    const normalizedChatResult = normalizeChatResultIdentity(chatResult);

    if (typeof onChatResult === "function") {
      try {
        onChatResult(normalizedChatResult);
      } catch (e) {
        console.error("Failed to handle chat result callback:", e);
      }
    }

    const displayChatResult = transformChatResultForDisplay(
      normalizedChatResult,
      _chatHistory
    );

    return handleChat(
      displayChatResult,
      setLoadingResponse,
      setChatHistory,
      remHistory,
      _chatHistory,
      setSocketId
    );
  }

  function transformTextContent(content, transformer) {
    if (typeof transformer !== "function") return content;

    try {
      const transformed = transformer(content);
      return typeof transformed === "string" ? transformed : content;
    } catch (e) {
      console.error("Failed to transform message content:", e);
      return content;
    }
  }

  function transformHistoryForDisplay(history = []) {
    if (
      typeof transformAssistantMessageContent !== "function" &&
      typeof transformUserMessageContent !== "function"
    ) {
      return history;
    }

    return history.map((message) => {
      if (typeof message.content !== "string") {
        return message;
      }

      if (message.role === "user") {
        return {
          ...message,
          content: transformTextContent(
            message.content,
            transformUserMessageContent
          ),
        };
      }

      if (message.role !== "assistant") {
        return message;
      }

      return {
        ...message,
        content: transformTextContent(
          message.content,
          transformAssistantMessageContent
        ),
      };
    });
  }

  function transformChatResultForDisplay(chatResult, _chatHistory) {
    if (typeof transformAssistantMessageContent !== "function") {
      return chatResult;
    }

    if (
      (chatResult.type === "textResponse" ||
        chatResult.type === "statusResponse") &&
      chatResult.textResponse
    ) {
      return {
        ...chatResult,
        textResponse: transformTextContent(
          chatResult.textResponse,
          transformAssistantMessageContent
        ),
      };
    }

    if (chatResult.type === "finalizeResponseStream") {
      const chatIdx = _chatHistory.findIndex(
        (chat) => chat.uuid === chatResult.uuid
      );
      if (chatIdx !== -1 && _chatHistory[chatIdx]?.content) {
        _chatHistory[chatIdx] = {
          ..._chatHistory[chatIdx],
          content: transformTextContent(
            _chatHistory[chatIdx].content,
            transformAssistantMessageContent
          ),
        };
      }
    }

    return chatResult;
  }

  function buildOutgoingPrompt(message, attachments = []) {
    if (typeof prepareOutgoingPrompt !== "function") return message;

    try {
      return (
        prepareOutgoingPrompt(message, {
          workspace,
          threadSlug,
          chatHistory,
          attachments,
        }) || message
      );
    } catch (e) {
      console.error("Failed to prepare outgoing prompt:", e);
      return message;
    }
  }

  async function handleCustomSubmitIfNeeded({
    message,
    attachments = [],
    baseHistory = chatHistory,
  }) {
    if (typeof onCustomSubmit !== "function") return false;

    try {
      const result = await onCustomSubmit({
        message,
        attachments,
        workspace,
        threadSlug,
        chatHistory: baseHistory,
      });
      if (!result?.handled) return false;

      const nextHistory = Array.isArray(result.history)
        ? result.history
        : [
            ...baseHistory,
            ...(Array.isArray(result.messages) ? result.messages : []),
          ];

      if (listening) endSTTSession();
      setChatHistory(nextHistory);
      setMessageEmit("");
      setLoadingResponse(false);
      window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));
      return true;
    } catch (e) {
      console.error("Failed to handle custom chat submit:", e);
      if (listening) endSTTSession();
      setChatHistory([
        ...baseHistory,
        {
          content: message,
          role: "user",
          attachments,
        },
        {
          uuid: v4(),
          type: "abort",
          content: "导出失败，请稍后重试",
          role: "assistant",
          sources: [],
          closed: true,
          error: e.message,
          animate: false,
          pending: false,
        },
      ]);
      setMessageEmit("");
      setLoadingResponse(false);
      window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));
      return true;
    }
  }

  /**
   * Emit an update to the state of the prompt input without directly
   * passing a prop in so that it does not re-render constantly.
   * @param {string} messageContent - The message content to set
   * @param {'replace' | 'append'} writeMode - Replace current text or append to existing text (default: replace)
   */
  function setMessageEmit(messageContent = "", writeMode = "replace") {
    window.dispatchEvent(
      new CustomEvent(PROMPT_INPUT_EVENT, {
        detail: { messageContent, writeMode },
      })
    );
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    const currentMessage =
      document.getElementById(PROMPT_INPUT_ID)?.value || "";
    if (!currentMessage) return false;

    // Clear the localStorage draft for this thread/workspace so that if the
    // PromptInput remounts (empty→chat transition), it won't restore stale text
    clearPromptInputDraft(threadSlug ?? workspace.slug);

    const attachments = parseAttachments();
    if (
      await handleCustomSubmitIfNeeded({
        message: currentMessage,
        attachments,
      })
    )
      return false;

    const outgoingMessage = buildOutgoingPrompt(currentMessage, attachments);
    const prevChatHistory = [
      ...chatHistory,
      {
        content: currentMessage,
        role: "user",
        attachments,
      },
      {
        content: "",
        role: "assistant",
        pending: true,
        userMessage: outgoingMessage,
        displayUserMessage: currentMessage,
        animate: true,
      },
    ];

    if (listening) {
      // Stop the mic if the send button is clicked
      endSTTSession();
    }
    setChatHistory(prevChatHistory);
    setMessageEmit("");
    setLoadingResponse(true);
  };

  function endSTTSession() {
    SpeechRecognition.stopListening();
    resetTranscript();
  }

  const regenerateAssistantMessage = (chatId) => {
    const filteredHistory = chatHistory.slice(0, -1);
    const lastUserMessage = filteredHistory.findLast(
      (msg) => msg.role === "user"
    );
    Workspace.deleteChats(workspace.slug, [chatId])
      .then(() =>
        sendCommand({
          text: lastUserMessage.content,
          autoSubmit: true,
          history: filteredHistory,
          attachments: lastUserMessage?.attachments,
        })
      )
      .catch((e) => console.error(e));
  };

  /**
   * Send a command to the LLM prompt input.
   * @param {Object} options - Arguments to send to the LLM
   * @param {string} options.text - The text to send to the LLM
   * @param {boolean} options.autoSubmit - Determines if the text should be sent immediately or if it should be added to the message state (default: false)
   * @param {Object[]} options.history - The history of the chat prior to this message for overriding the current chat history
   * @param {Object[import("./DnDWrapper").Attachment]} options.attachments - The attachments to send to the LLM for this message
   * @param {'replace' | 'append' | 'prepend'} options.writeMode - Replace current text or append to existing text (default: replace)
   * @returns {void}
   */
  const sendCommand = async ({
    text = "",
    autoSubmit = false,
    history = [],
    attachments = [],
    writeMode = "replace",
  } = {}) => {
    // If we are not auto-submitting, we can just emit the text to the prompt input.
    if (!autoSubmit) {
      setMessageEmit(text, writeMode);
      return;
    }

    if (writeMode === "prepend") {
      const currentText = document.getElementById(PROMPT_INPUT_ID)?.value ?? "";
      text = currentText + " " + text;
    }

    // If we are auto-submitting in append mode
    // than we need to update text with whatever is in the prompt input + the text we are sending.
    // @note: `message` will not work here since it is not updated yet.
    // If text is still empty, after this, then we should just return.
    if (writeMode === "append") {
      const currentText = document.getElementById(PROMPT_INPUT_ID)?.value ?? "";
      text = currentText + text;
    }

    if (!text || text === "") return false;

    // Clear the localStorage draft so that if the PromptInput remounts
    // (e.g. /reset causing empty→chat or chat→empty transitions),
    // it won't restore stale text.
    clearPromptInputDraft(threadSlug ?? workspace.slug);

    // If we are auto-submitting
    // Then we can replace the current text since this is not accumulating.
    if (
      await handleCustomSubmitIfNeeded({
        message: text,
        attachments,
        baseHistory: history.length > 0 ? history : chatHistory,
      })
    )
      return false;

    const outgoingText = buildOutgoingPrompt(text, attachments);
    let prevChatHistory;
    if (history.length > 0) {
      // use pre-determined history chain.
      prevChatHistory = [
        ...history,
        {
          content: "",
          role: "assistant",
          pending: true,
          userMessage: outgoingText,
          displayUserMessage: text,
          attachments,
          animate: true,
        },
      ];
    } else {
      prevChatHistory = [
        ...chatHistory,
        {
          content: text,
          role: "user",
          attachments,
        },
        {
          content: "",
          role: "assistant",
          pending: true,
          userMessage: outgoingText,
          displayUserMessage: text,
          attachments,
          animate: true,
        },
      ];
    }

    setChatHistory(prevChatHistory);
    setMessageEmit("");
    setLoadingResponse(true);
  };

  useEffect(() => {
    if (pendingMessageChecked.current || !workspace?.slug) return;
    pendingMessageChecked.current = true;

    const pending = safeJsonParse(sessionStorage.getItem(PENDING_HOME_MESSAGE));
    if (pending?.message) {
      setTimeout(() => {
        sessionStorage.removeItem(PENDING_HOME_MESSAGE);
        sendCommand({
          text: pending.message,
          attachments: pending.attachments || [],
          autoSubmit: true,
        });
      }, 100);
    }
  }, [workspace?.slug]);

  useEffect(() => {
    async function fetchReply() {
      const promptMessage =
        chatHistory.length > 0 ? chatHistory[chatHistory.length - 1] : null;
      const remHistory = chatHistory.length > 0 ? chatHistory.slice(0, -1) : [];
      var _chatHistory = [...remHistory];

      // Override hook for new messages to now go to agents until the connection closes
      if (!!websocket) {
        if (!promptMessage || !promptMessage?.userMessage) return false;
        const attachments = promptMessage?.attachments ?? parseAttachments();
        window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));
        websocket.send(
          JSON.stringify({
            type: "awaitingFeedback",
            feedback: promptMessage?.userMessage,
            attachments,
          })
        );

        // /reset during an active agent session should end the session AND
        // clear the chat in a single action. The send above triggers the
        // server to abort the agent and close the socket; fall through to the
        // /reset flow below which resets memory + clears chat history.
        if (promptMessage.userMessage.trim() !== "/reset") return;
        pendingResetRef.current = true;
      }

      if (!promptMessage || !promptMessage?.userMessage) return false;

      // If running and edit or regeneration, this history will already have attachments
      // so no need to parse the current state.
      const attachments = promptMessage?.attachments ?? parseAttachments();
      window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));

      await Workspace.multiplexStream({
        workspaceSlug: workspace.slug,
        threadSlug,
        prompt: promptMessage.userMessage,
        chatHandler: (chatResult) =>
          handleIncomingChatResult(chatResult, remHistory, _chatHistory),
        attachments,
      });
      return;
    }
    loadingResponse === true && fetchReply();
  }, [loadingResponse, chatHistory, workspace]);

  // TODO: Simplify this WSS stuff
  useEffect(() => {
    let socket = null;

    function handleWSS() {
      try {
        if (!socketId || !!websocket) return;
        socket = new WebSocket(
          `${websocketURI()}/api/agent-invocation/${socketId}`
        );
        socket.supportsAgentStreaming = false;

        window.addEventListener(ABORT_STREAM_EVENT, () => {
          setAgentSessionActive(false);
          window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
          socket?.close();
        });

        socket.addEventListener("message", (event) => {
          setLoadingResponse(true);
          try {
            handleSocketResponse(socket, event, setChatHistory);
          } catch {
            console.error("Failed to parse data");
            setAgentSessionActive(false);
            window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
            socket.close();
          }
          setLoadingResponse(false);
        });

        socket.addEventListener("close", (_event) => {
          setAgentSessionActive(false);
          window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
          // When the close was triggered by /reset, skip the "Agent session
          // complete." status - the pending /reset flow will clear history.
          if (pendingResetRef.current) {
            pendingResetRef.current = false;
          } else {
            setChatHistory((prev) => [
              ...prev.filter((msg) => !!msg.content),
              {
                uuid: v4(),
                type: "statusResponse",
                content: "Agent session complete.",
                role: "assistant",
                sources: [],
                closed: true,
                error: null,
                animate: false,
                pending: false,
              },
            ]);
          }
          setLoadingResponse(false);
          setWebsocket(null);
          setSocketId(null);
        });
        setWebsocket(socket);
        setAgentSessionActive(true);
        window.dispatchEvent(new CustomEvent(AGENT_SESSION_START));
        window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));
      } catch (e) {
        setChatHistory((prev) => [
          ...prev.filter((msg) => !!msg.content),
          {
            uuid: v4(),
            type: "abort",
            content: e.message,
            role: "assistant",
            sources: [],
            closed: true,
            error: e.message,
            animate: false,
            pending: false,
          },
        ]);
        setLoadingResponse(false);
        setWebsocket(null);
        setSocketId(null);
      }
    }
    handleWSS();

    return () => {
      if (socket) {
        setAgentSessionActive(false);
        window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
        socket.close();
      }
    };
  }, [socketId]);

  const isEmpty =
    chatHistory.length === 0 && !sessionStorage.getItem(PENDING_HOME_MESSAGE);
  const displayChatHistory = transformHistoryForDisplay(chatHistory);
  const emptyTitle = emptyStateTitle || t("main-page.greeting");

  if (isEmpty && isResumeLayout) {
    return (
      <ChatSidebarProvider>
        <div
          style={containerHeightStyle}
          className="resume-workspace-shell w-full h-full z-[2]"
        >
          <div className="resume-workspace-chat-column">
            <ChatSettingsMenu />
            <div className="resume-workspace-chat-surface flex-1 min-w-0 transition-all duration-500 relative md:rounded-[16px] bg-zinc-900 light:bg-white w-full h-full overflow-hidden border-none light:border-solid light:border light:border-theme-modal-border">
              {isMobile && <SidebarMobileHeader />}
              <WorkspaceModelPicker workspaceSlug={workspace.slug} />
              <DnDFileUploaderWrapper>
                <div className="flex flex-col h-full w-full items-center justify-center">
                  <div className="flex flex-col items-center w-full max-w-[750px]">
                    <h1 className="text-white text-xl md:text-2xl mb-11 text-center">
                      {emptyTitle}
                    </h1>
                    <PromptInput
                      workspace={workspace}
                      submit={handleSubmit}
                      isStreaming={loadingResponse}
                      sendCommand={sendCommand}
                      attachments={files}
                      centered={true}
                    />
                    <QuickActions
                      hasAvailableWorkspace={!!workspace}
                      onCreateAgent={() =>
                        navigate(paths.settings.agentSkills())
                      }
                      onEditWorkspace={() =>
                        navigate(
                          paths.workspace.settings.generalAppearance(
                            workspace.slug
                          )
                        )
                      }
                      onUploadDocument={() =>
                        document
                          .getElementById("dnd-chat-file-uploader")
                          ?.click()
                      }
                    />
                  </div>
                  <SuggestedMessages
                    suggestedMessages={workspace?.suggestedMessages}
                    sendCommand={sendCommand}
                  />
                </div>
              </DnDFileUploaderWrapper>
              <ChatTooltips />
            </div>
          </div>
          <aside className="resume-workspace-preview-column">
            {rightPanel}
          </aside>
        </div>
      </ChatSidebarProvider>
    );
  }

  if (isEmpty) {
    return (
      <ChatSidebarProvider>
        <div
          style={containerHeightStyle}
          className="relative flex md:ml-[2px] md:mr-[16px] md:my-[16px] w-full h-full z-[2]"
        >
          <ChatSettingsMenu />
          <div className="flex-1 min-w-0 transition-all duration-500 relative md:rounded-[16px] bg-zinc-900 light:bg-white w-full h-full overflow-hidden border-none light:border-solid light:border light:border-theme-modal-border">
            {isMobile && <SidebarMobileHeader />}
            <WorkspaceModelPicker workspaceSlug={workspace.slug} />
            <DnDFileUploaderWrapper>
              <div className="flex flex-col h-full w-full items-center justify-center">
                <div className="flex flex-col items-center w-full max-w-[750px]">
                  <h1 className="text-white text-xl md:text-2xl mb-11 text-center">
                    {emptyTitle}
                  </h1>
                  <PromptInput
                    workspace={workspace}
                    submit={handleSubmit}
                    isStreaming={loadingResponse}
                    sendCommand={sendCommand}
                    attachments={files}
                    centered={true}
                  />
                  <QuickActions
                    hasAvailableWorkspace={!!workspace}
                    onCreateAgent={() => navigate(paths.settings.agentSkills())}
                    onEditWorkspace={() =>
                      navigate(
                        paths.workspace.settings.generalAppearance(
                          workspace.slug
                        )
                      )
                    }
                    onUploadDocument={() =>
                      document.getElementById("dnd-chat-file-uploader")?.click()
                    }
                  />
                </div>
                <SuggestedMessages
                  suggestedMessages={workspace?.suggestedMessages}
                  sendCommand={sendCommand}
                />
              </div>
            </DnDFileUploaderWrapper>
            <ChatTooltips />
          </div>
          <MemoriesSidebar workspace={workspace} />
        </div>
      </ChatSidebarProvider>
    );
  }

  if (isResumeLayout) {
    return (
      <ChatSidebarProvider>
        <div
          style={containerHeightStyle}
          className="resume-workspace-shell w-full h-full z-[2]"
        >
          <div className="resume-workspace-chat-column">
            <ChatSettingsMenu />
            <div className="resume-workspace-chat-surface flex-1 min-w-0 transition-all duration-500 relative md:rounded-[16px] bg-zinc-900 light:bg-white text-white light:text-slate-900 h-full overflow-hidden border-none light:border-solid light:border light:border-theme-modal-border">
              {isMobile && <SidebarMobileHeader />}
              <WorkspaceModelPicker workspaceSlug={workspace.slug} />
              <DnDFileUploaderWrapper>
                <div className="flex flex-col h-full w-full pb-20 md:pb-0">
                  <div className="contents">
                    <MetricsProvider>
                      <ChatHistory
                        ref={chatHistoryRef}
                        history={displayChatHistory}
                        workspace={workspace}
                        sendCommand={sendCommand}
                        updateHistory={setChatHistory}
                        regenerateAssistantMessage={regenerateAssistantMessage}
                        websocket={websocket}
                      />
                    </MetricsProvider>
                    <PromptInput
                      workspace={workspace}
                      submit={handleSubmit}
                      isStreaming={loadingResponse}
                      sendCommand={sendCommand}
                      attachments={files}
                      centered={false}
                      mobilePosition="absolute"
                    />
                  </div>
                </div>
              </DnDFileUploaderWrapper>
              <ChatTooltips />
            </div>
          </div>
          <aside className="resume-workspace-preview-column">
            {rightPanel}
          </aside>
        </div>
      </ChatSidebarProvider>
    );
  }

  return (
    <ChatSidebarProvider>
      <div
        style={containerHeightStyle}
        className="relative flex md:ml-[2px] md:mr-[16px] md:my-[16px] w-full h-full z-[2]"
      >
        <ChatSettingsMenu />
        <div className="flex-1 min-w-0 transition-all duration-500 relative md:rounded-[16px] bg-zinc-900 light:bg-white text-white light:text-slate-900 h-full overflow-hidden border-none light:border-solid light:border light:border-theme-modal-border">
          {isMobile && <SidebarMobileHeader />}
          <WorkspaceModelPicker workspaceSlug={workspace.slug} />
          <DnDFileUploaderWrapper>
            <div className="flex flex-col h-full w-full pb-20 md:pb-0">
              <div className="contents">
                <MetricsProvider>
                  <ChatHistory
                    ref={chatHistoryRef}
                    history={displayChatHistory}
                    workspace={workspace}
                    sendCommand={sendCommand}
                    updateHistory={setChatHistory}
                    regenerateAssistantMessage={regenerateAssistantMessage}
                    websocket={websocket}
                  />
                </MetricsProvider>
                <PromptInput
                  workspace={workspace}
                  submit={handleSubmit}
                  isStreaming={loadingResponse}
                  sendCommand={sendCommand}
                  attachments={files}
                  centered={false}
                />
              </div>
            </div>
          </DnDFileUploaderWrapper>
          <ChatTooltips />
        </div>
        <SourcesSidebar />
        <MemoriesSidebar workspace={workspace} />
      </div>
    </ChatSidebarProvider>
  );
}
