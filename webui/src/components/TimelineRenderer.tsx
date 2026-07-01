import type { ReactNode } from "react";

import Markdown from "./Markdown";
import ToolGroup from "./ToolGroup";
import type { ToolStep } from "./ToolCallCard";
import type { TimelineItem } from "../lib/timeline";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type RenderGroup =
  | { kind: "user"; key: string; content: string }
  | { kind: "assistant"; key: string; content: string; nextIsTool: boolean }
  | { kind: "tools"; key: string; steps: ToolStep[] };

/* ------------------------------------------------------------------ */
/*  Group consecutive tool items for rendering                         */
/* ------------------------------------------------------------------ */

function groupTimeline(timeline: TimelineItem[]): RenderGroup[] {
  const groups: RenderGroup[] = [];
  let toolBuffer: ToolStep[] = [];

  function flushTools() {
    if (toolBuffer.length > 0) {
      groups.push({ kind: "tools", key: toolBuffer[0]!.id, steps: [...toolBuffer] });
      toolBuffer = [];
    }
  }

  for (let i = 0; i < timeline.length; i++) {
    const item = timeline[i]!;

    if (item.kind === "tool") {
      toolBuffer.push(item.step);
      continue;
    }

    flushTools();

    if (item.kind === "user") {
      groups.push({ kind: "user", key: item.id, content: item.content });
    } else {
      const nextIsTool = i + 1 < timeline.length && timeline[i + 1]!.kind === "tool";
      groups.push({ kind: "assistant", key: item.id, content: item.content, nextIsTool });
    }
  }
  flushTools();

  return groups;
}

/* ------------------------------------------------------------------ */
/*  Render groups → React nodes                                        */
/* ------------------------------------------------------------------ */

function renderGroup(group: RenderGroup): ReactNode {
  switch (group.kind) {
    case "user":
      return (
        <div key={group.key} className="mb-6 ml-auto w-fit max-w-[85%]">
          <div className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-sm leading-relaxed text-text">
            {group.content}
          </div>
        </div>
      );

    case "assistant":
      return (
        <div key={group.key} className={`max-w-[90%] ${group.nextIsTool ? "mb-0" : "mb-5"}`}>
          <div className="text-sm leading-relaxed text-text">
            <Markdown>{group.content}</Markdown>
          </div>
        </div>
      );

    case "tools":
      return <ToolGroup key={group.key} steps={group.steps} />;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function TimelineRenderer({ timeline }: { timeline: TimelineItem[] }) {
  const groups = groupTimeline(timeline);
  return <>{groups.map(renderGroup)}</>;
}
