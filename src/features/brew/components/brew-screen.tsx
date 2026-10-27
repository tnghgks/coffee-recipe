"use client";

import { Check, NotebookPen, RotateCcw, Square, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "zustand";

import { Button, buttonVariants } from "@/components/ui/button";
import { newLogHref } from "@/features/log/prefill";
import { recordBrewStarted } from "@/features/pwa/client";
import type { RecipeDetail } from "@/features/recipe/types";
import {
  brewEndS,
  brewSegments,
  cueSnapshot,
  DEFAULT_ICE_SHARE,
  detectCues,
  elapsedMs,
  formatGrams,
  formatRatio,
  formatSeconds,
  getBrewProgress,
  scaleRecipe,
  type CueSnapshot,
} from "@/lib/brew";
import { cn } from "@/lib/utils";

import { createBeeper, vibrate } from "../feedback";
import { useAnimationFrame, useLocationSearch, useWakeLock, useWakeLockSupported } from "../hooks";
import { brewSettingsQuery, parseBrewSettings, type BrewSettings } from "../settings";
import { createBrewStore } from "../store";

import { BrewPrep } from "./brew-prep";
import { BrewRing } from "./brew-ring";

type BrewScreenProps = {
  recipe: Pick<
    RecipeDetail,
    "id" | "title" | "doseG" | "ratio" | "totalTimeS" | "steps" | "dripper" | "waterTempC" | "grindText"
  >;
  settings: BrewSettings;
  /** Shown on the prep view: the viewer's last "next time" note (a server component in Suspense). */
  note?: ReactNode;
};

/** Re-render at ~10fps; cues and completion are still checked on every frame. */
const RENDER_INTERVAL_MS = 100;

const statusHint = {
  ready: "준비되면 탭해서 시작",
  running: "탭하면 일시정지",
  paused: "일시정지됨 · 탭해서 계속",
} as const;

const stageLabel = {
  ready: "타이머 시작",
  running: "일시정지",
  paused: "계속",
} as const;

export function BrewScreen({ recipe, settings: serverSettings, note }: BrewScreenProps) {
  // The URL is the source of truth: the prep view rewrites it in place, so a reload, the log prefill
  // and the way back to the recipe all keep the settings. Offline, the service worker serves this page
  // from a copy cached without the query string, so only the browser's URL can be trusted.
  const [search, replaceSearch] = useLocationSearch();
  const settings = useMemo(
    () => (search === null ? serverSettings : parseBrewSettings(Object.fromEntries(new URLSearchParams(search)), recipe)),
    [search, serverSettings, recipe],
  );
  const changeSettings = (next: BrewSettings) => replaceSearch(brewSettingsQuery(next, recipe));
  const [store] = useState(() => createBrewStore());
  const [beeper] = useState(createBeeper);
  const session = useStore(store, (s) => s.session);
  // Bumped every frame while running; elapsed time itself always comes from the session + performance.now().
  const [frameNow, setFrameNow] = useState(0);
  const lastCue = useRef<CueSnapshot | null>(null);
  const lastRender = useRef(0);

  const scaled = useMemo(
    () =>
      scaleRecipe({ ratio: recipe.ratio, steps: recipe.steps }, settings.doseG, {
        ratio: settings.ratio,
        iceShare: settings.iced ? DEFAULT_ICE_SHARE : 0,
      }),
    [recipe.ratio, recipe.steps, settings],
  );
  const endMs = brewEndS(scaled.steps, recipe.totalTimeS) * 1000;
  const segments = useMemo(() => brewSegments(scaled.steps, recipe.totalTimeS), [scaled.steps, recipe.totalTimeS]);

  const running = session.status === "running";
  useWakeLock(session.status === "ready" || running || session.status === "paused");
  const wakeLockSupported = useWakeLockSupported();

  useAnimationFrame((now) => {
    store.getState().completeIfDue(endMs);
    const progressNow = getBrewProgress(
      scaled.steps,
      recipe.totalTimeS,
      elapsedMs(store.getState().session, now) / 1000,
    );
    const snapshot = cueSnapshot(progressNow);
    for (const cue of detectCues(lastCue.current, snapshot)) {
      beeper.play(cue);
      vibrate(cue);
    }
    lastCue.current = snapshot;
    if (now - lastRender.current >= RENDER_INTERVAL_MS) {
      lastRender.current = now;
      setFrameNow(now);
    }
  }, running);

  const elapsedS = elapsedMs(session, frameNow) / 1000;
  const progress = getBrewProgress(scaled.steps, recipe.totalTimeS, elapsedS);
  const step = progress.current ?? progress.next;
  const countdown = progress.secondsToNext !== null ? Math.ceil(progress.secondsToNext) : null;
  const recipeHref = `/recipes/${recipe.id}${brewSettingsQuery(settings, recipe)}`;

  // Opens the brew screen at 0:00; the clock waits for a tap on the stage so it starts with the pour.
  const enterBrew = () => {
    beeper.unlock(); // must happen inside the gesture for iOS
    recordBrewStarted(); // install banner shows after a couple of brews
    store.getState().ready();
  };

  const onStageTap = () => {
    if (session.status === "idle" || session.status === "finished") return;
    beeper.unlock();
    lastCue.current = null; // no cues for whatever was already true before the clock (re)starts
    store.getState().toggle();
  };

  const restart = () => {
    lastCue.current = null;
    setFrameNow(0);
    store.getState().reset();
  };

  const nextSoon = running && countdown !== null && countdown <= 3;

  return (
    <div className="flex flex-1 flex-col">
      {/* top bar */}
      <header className="flex items-center gap-2 px-2 pt-2">
        <Link
          href={recipeHref}
          // Next keeps this page alive (hidden) after leaving; without a reset, coming back resumes the old brew.
          onClick={restart}
          aria-label="추출 그만두고 레시피로"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-12 shrink-0")}
        >
          <X className="size-6" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-medium">{recipe.title}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            원두 {formatGrams(scaled.doseG)} · {formatRatio(scaled.ratio)} · {settings.iced ? "아이스" : "핫"}
          </p>
        </div>
        {session.status === "paused" ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-12 shrink-0"
            aria-label="추출 끝내기"
            onClick={() => store.getState().finish()}
          >
            <Square className="size-5" aria-hidden />
          </Button>
        ) : (
          <span className="size-12 shrink-0" aria-hidden />
        )}
      </header>

      {session.status === "idle" ? (
        <BrewPrep
          recipe={recipe}
          settings={settings}
          scaled={scaled}
          onChange={changeSettings}
          onStart={enterBrew}
          note={note}
        />
      ) : session.status === "finished" ? (
        <FinishedView
          elapsedS={elapsedS}
          brewWaterG={scaled.brewWaterG}
          iceG={scaled.iceG}
          recipeHref={recipeHref}
          onLeave={restart}
          logHref={newLogHref({
            recipeId: recipe.id,
            doseG: settings.doseG,
            ratio: settings.ratio,
            iced: settings.iced,
            elapsedS,
          })}
          onRestart={restart}
        />
      ) : (
        <>
          {/* stage: the whole area is the pause/resume control */}
          <button
            type="button"
            onClick={onStageTap}
            aria-label={stageLabel[session.status]}
            className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-6 text-center outline-none select-none focus-visible:bg-accent/40"
          >
            <span className={cn("text-sm font-medium", running ? "text-muted-foreground" : "text-primary")}>
              {statusHint[session.status]}
            </span>

            <BrewRing
              segments={segments}
              currentIndex={progress.currentIndex}
              progress={progress.overallProgress}
              paused={session.status === "paused"}
              pulse={nextSoon}
            >
              {step && (
                <>
                  <span className="text-lg font-semibold sm:text-xl" data-testid="brew-step">
                    {step.label}
                  </span>
                  {/* re-keyed per step so the new target animates in */}
                  <span
                    key={step.position}
                    className="flex items-baseline gap-1 tabular-nums duration-300 animate-in fade-in zoom-in-90"
                  >
                    <span
                      className="text-6xl font-bold tracking-tight text-primary sm:text-7xl"
                      data-testid="brew-target"
                    >
                      {step.cumulativeWaterG}
                    </span>
                    <span className="text-lg text-muted-foreground">g까지</span>
                  </span>
                </>
              )}
              <span className="text-lg text-muted-foreground tabular-nums">
                <span className="font-semibold text-foreground" data-testid="brew-elapsed">
                  {formatSeconds(elapsedS)}
                </span>{" "}
                / {formatSeconds(progress.endS)}
              </span>
            </BrewRing>

            <span className="flex min-h-9 items-center">
              {step && step.pourWaterG > 0 && (
                <span className="rounded-full bg-secondary px-4 py-1.5 text-base text-secondary-foreground tabular-nums">
                  이번에 +{step.pourWaterG}g 붓기
                </span>
              )}
            </span>
          </button>

          {/* next step preview */}
          <div className="mx-4 mb-4 flex min-h-16 items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
            {progress.next ? (
              <>
                <span className="flex flex-col">
                  <span className="text-xs text-muted-foreground">다음 · {formatSeconds(progress.next.startAtS)}</span>
                  <span className="font-medium" data-testid="brew-next">
                    {progress.next.label} → {progress.next.cumulativeWaterG}g
                  </span>
                </span>
                {countdown !== null && (
                  <span
                    // re-keyed each second of the final countdown so every tick pops
                    key={nextSoon ? countdown : "countdown"}
                    className={cn(
                      "font-bold tabular-nums transition-colors",
                      nextSoon ? "text-4xl text-primary duration-300 animate-in zoom-in-150" : "text-2xl text-muted-foreground",
                    )}
                    aria-label={`${countdown}초 남음`}
                  >
                    {countdown}s
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-muted-foreground">
                마지막 단계예요. 다 빠질 때까지 기다리세요 · 종료 {formatSeconds(progress.endS)}
              </span>
            )}
          </div>
        </>
      )}

      {wakeLockSupported === false && session.status !== "finished" && (
        <p className="mx-4 mb-4 text-center text-xs text-muted-foreground">
          이 브라우저는 화면 꺼짐 방지를 지원하지 않아요. 추출하는 동안 화면 자동 잠금을 꺼 두세요.
        </p>
      )}
    </div>
  );
}

function FinishedView({
  elapsedS,
  brewWaterG,
  iceG,
  recipeHref,
  logHref,
  onRestart,
  onLeave,
}: {
  elapsedS: number;
  brewWaterG: number;
  iceG: number;
  recipeHref: string;
  /** Prefilled log form; signed-out users go through login and come back to it. */
  logHref: string;
  onRestart: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-8 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-8" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">추출 완료</h1>
        <p className="text-muted-foreground tabular-nums" data-testid="brew-summary">
          {formatSeconds(elapsedS)} · 물 {brewWaterG}g{iceG > 0 && ` + 얼음 ${iceG}g`}
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <Link href={logHref} className={cn(buttonVariants({ size: "lg" }), "h-12")}>
          <NotebookPen aria-hidden />
          기록 남기기
        </Link>
        <Button size="lg" variant="outline" className="h-12" onClick={onRestart}>
          <RotateCcw aria-hidden />
          다시 내리기
        </Button>
        <Link
          href={recipeHref}
          onClick={onLeave}
          className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "h-12")}
        >
          레시피로 돌아가기
        </Link>
      </div>
    </div>
  );
}
