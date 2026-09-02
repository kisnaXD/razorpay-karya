"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createCalendarFollowUp,
  fetchCalendarMeetings,
  fetchMeetingBrief,
  type ApiNodeFull,
  type MeetingBriefDto,
} from "@/lib/api";
import { useConsole } from "@/lib/console-context";
import { Button, PageHeader } from "@/components/ui";

function startOfWeekMondayIst(d = new Date()): Date {
  const utc = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  utc.setUTCHours(0, 0, 0, 0);
  return new Date(utc.getTime() - 5.5 * 60 * 60 * 1000);
}

function dayLabel(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function isSameIstDay(a: Date, b: Date): boolean {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Kolkata",
  };
  return (
    a.toLocaleDateString("en-CA", opts) === b.toLocaleDateString("en-CA", opts)
  );
}

function weekRangeLabel(start: Date): string {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  };
  const from = start.toLocaleDateString("en-IN", opts);
  const to = end.toLocaleDateString("en-IN", { ...opts, year: "numeric" });
  return `${from} – ${to} · IST`;
}

function meetingTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function meetingStartsAt(m: ApiNodeFull): string | null {
  return typeof m.props.startsAt === "string" ? m.props.startsAt : null;
}

export function CalendarWeek() {
  const { focusNode, reload } = useConsole();
  const [weekOffset, setWeekOffset] = useState(0);
  const [meetings, setMeetings] = useState<ApiNodeFull[]>([]);
  const [brief, setBrief] = useState<MeetingBriefDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const weekStart = useMemo(() => {
    const start = startOfWeekMondayIst();
    start.setDate(start.getDate() + weekOffset * 7);
    return start;
  }, [weekOffset]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const load = useCallback(async () => {
    try {
      setError(null);
      // Include ±7 days so a nearest-Thursday seed still appears if the demo
      // day sits near a week boundary.
      const from = new Date(weekStart);
      from.setDate(from.getDate() - 7);
      const to = new Date(weekStart);
      to.setDate(to.getDate() + 14);
      const res = await fetchCalendarMeetings({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      setMeetings(res.meetings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calendar");
    }
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const meetingsOnDay = (day: Date) => {
    const dayKey = day.toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    return meetings.filter((m) => {
      const startsAt = meetingStartsAt(m);
      if (!startsAt) return false;
      const mKey = new Date(startsAt).toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
      });
      return mKey === dayKey;
    });
  };

  async function openBrief(meetingKey: string) {
    try {
      setError(null);
      const res = await fetchMeetingBrief(meetingKey);
      setBrief(res.brief);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load brief");
    }
  }

  async function followUp() {
    if (!brief) return;
    setBusy(true);
    try {
      await createCalendarFollowUp({
        meetingKey: brief.meetingKey,
        note: brief.proposedAsk,
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Follow-up failed");
    } finally {
      setBusy(false);
    }
  }

  const today = new Date();

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Calendar">
      <PageHeader
        title="Calendar"
        subtitle={weekRangeLabel(weekStart)}
        trailing={
          <>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Previous week"
              onClick={() => {
                setBrief(null);
                setWeekOffset((n) => n - 1);
              }}
            >
              ←
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Next week"
              onClick={() => {
                setBrief(null);
                setWeekOffset((n) => n + 1);
              }}
            >
              →
            </Button>
          </>
        }
      />

      {error ? <p className="px-5 py-3 text-sm text-muted">{error}</p> : null}

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">
          <div className="grid grid-cols-7 border-b border-line">
            {days.map((day) => {
              const dayMeetings = meetingsOnDay(day);
              const todayCol = isSameIstDay(day, today);
              return (
                <div
                  key={day.toISOString()}
                  className={[
                    "min-h-[160px] border-r border-line/60 px-2 py-2 last:border-r-0",
                    todayCol ? "bg-signal/[0.04]" : "",
                  ].join(" ")}
                >
                  <p
                    className={[
                      "inline-block rounded-[var(--radius-sm)] px-1.5 py-0.5 font-mono text-xs",
                      todayCol
                        ? "bg-signal/10 text-signal"
                        : "text-muted",
                    ].join(" ")}
                  >
                    {dayLabel(day)}
                  </p>
                  <div className="mt-2 space-y-2">
                    {dayMeetings.length === 0 ? (
                      <p className="text-xs text-muted">No meetings</p>
                    ) : (
                      dayMeetings.map((meeting) => {
                        const startsAt = meetingStartsAt(meeting);
                        return (
                          <button
                            key={meeting.key}
                            type="button"
                            onClick={() => void openBrief(meeting.key)}
                            className="w-full rounded-[var(--radius-sm)] border border-line bg-surface p-2 text-left transition-colors duration-100 hover:border-signal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                          >
                            <span className="block text-sm font-medium text-text">
                              {meeting.label}
                            </span>
                            {startsAt ? (
                              <span className="mt-1 block font-mono text-xs text-muted">
                                {meetingTime(startsAt)}
                              </span>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {!brief ? (
            <p className="px-5 py-4 text-sm text-muted">
              Click a meeting for the prep brief.
            </p>
          ) : null}
        </div>

        {brief ? (
          <aside
            className="flex w-[320px] shrink-0 flex-col overflow-auto border-l border-line bg-surface"
            aria-label="Meeting brief"
          >
            <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
              <div>
                <h2 className="text-md font-medium text-text">{brief.label}</h2>
                <p className="mt-0.5 font-mono text-xs text-muted">
                  {meetingTime(brief.startsAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Close brief"
                onClick={() => setBrief(null)}
              >
                ✕
              </Button>
            </div>
            <div className="space-y-3 px-4 py-4">
              {brief.sections.map((section) => (
                <div key={section.heading}>
                  <p className="text-xs uppercase tracking-[0.06em] text-muted">
                    {section.heading}
                  </p>
                  <p className="mt-1 text-base leading-[1.45] text-text">
                    {section.body}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-auto border-t border-line p-4">
              <p className="text-xs uppercase tracking-[0.06em] text-muted">
                Proposed ask
              </p>
              <p className="mt-2 text-base leading-[1.45] text-text">
                {brief.proposedAsk}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  loading={busy}
                  disabled={busy}
                  onClick={() => void followUp()}
                >
                  Create follow-up task
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => focusNode(brief.meetingKey)}
                >
                  Focus on graph →
                </Button>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
