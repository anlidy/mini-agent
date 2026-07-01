import { useNavigate, useOutletContext } from "react-router-dom";

import SettingsView from "../components/SettingsView";
import type { RootContext } from "./types";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { lastChatKey } = useOutletContext<RootContext>();

  return (
    <SettingsView
      onClose={() => navigate(`/chat/${encodeURIComponent(lastChatKey)}`)}
    />
  );
}
