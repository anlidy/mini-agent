import { useCallback, useState } from "react";

/* ------------------------------------------------------------------ */
/*  localStorage helpers                                               */
/* ------------------------------------------------------------------ */

function readStoredWidth(key: string, fallback: number): number {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = Number(stored);
      if (Number.isInteger(parsed) && parsed >= 180 && parsed <= 480) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return fallback;
}

function writeStoredWidth(key: string, width: number): void {
  try {
    localStorage.setItem(key, width.toString());
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

const LEFT_KEY = "mini-agent.leftPanelWidth";
const RIGHT_KEY = "mini-agent.rightPanelWidth";

export function usePanelLayout(defaultLeft = 260, defaultRight = 300) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [leftWidth, setLeftWidthState] = useState(() => readStoredWidth(LEFT_KEY, defaultLeft));
  const [rightWidth, setRightWidthState] = useState(() => readStoredWidth(RIGHT_KEY, defaultRight));

  const setLeftWidth = useCallback((width: number) => {
    setLeftWidthState(width);
    writeStoredWidth(LEFT_KEY, width);
  }, []);

  const setRightWidth = useCallback((width: number) => {
    setRightWidthState(width);
    writeStoredWidth(RIGHT_KEY, width);
  }, []);

  const toggleLeft = useCallback(() => setLeftCollapsed((c) => !c), []);
  const toggleRight = useCallback(() => setRightCollapsed((c) => !c), []);

  return {
    leftCollapsed,
    rightCollapsed,
    leftWidth,
    rightWidth,
    setLeftWidth,
    setRightWidth,
    toggleLeft,
    toggleRight
  };
}
