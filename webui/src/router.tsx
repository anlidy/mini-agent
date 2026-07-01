import { createBrowserRouter, Navigate } from "react-router-dom";

import ChatPage from "./routes/ChatPage";
import RootLayout from "./routes/RootLayout";
import SettingsPage from "./routes/SettingsPage";

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/chat/default" replace /> },
      { path: "chat/:sessionId", element: <ChatPage /> },
      { path: "settings", element: <SettingsPage /> }
    ]
  }
]);
