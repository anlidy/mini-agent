import { useOutletContext } from "react-router-dom";

import ChatThread from "../components/ChatThread";
import type { RootContext } from "./types";

export default function ChatPage() {
  const { sessions, socket, activeKey } = useOutletContext<RootContext>();

  return (
    <ChatThread
      sessionKey={activeKey}
      messages={sessions.activeSession?.messages ?? []}
      segments={socket.segments}
      approval={socket.approval}
      connected={socket.connected}
      active={socket.active}
      aborting={socket.aborting}
      error={socket.error ?? sessions.error}
      onSend={socket.send}
      onApprove={socket.resolveApproval}
      onAbort={socket.abort}
    />
  );
}
