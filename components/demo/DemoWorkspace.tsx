"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, RotateCcw, Shield, User, X } from "lucide-react";
import WorkspaceApp, {
  type DemoDriver,
} from "@/components/workspace/WorkspaceApp";
import { apply } from "@/lib/demo/engine";
import {
  DEMO_PASSWORD,
  PERSONAS,
  seedWorld,
  viewFor,
  type DemoPersona,
  type DemoWorld,
} from "@/lib/demo/world";

const ICONS = {
  manager: Building2,
  tenant: User,
  security: Shield,
} as const;

const STORAGE_KEY = "sangopass_demo_world_v1";

function restore(): DemoWorld | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DemoWorld) : null;
  } catch {
    return null;
  }
}

function remember(world: DemoWorld) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(world));
  } catch {
    // A private window or blocked storage costs the demo nothing: the world
    // still lives in React state for as long as the tab is open.
  }
}

export default function DemoWorkspace({ persona }: { persona: DemoPersona }) {
  const [world, setWorld] = useState<DemoWorld>(() => restore() ?? seedWorld());
  const [hint, setHint] = useState(true);

  const state = useMemo(() => viewFor(world, persona), [world, persona]);

  const command = useCallback<DemoDriver["command"]>(
    (input) => {
      // apply() throws the same AppError the server would; WorkspaceApp shows
      // the message exactly as it shows a real one.
      const next = apply(world, persona, input);
      setWorld(next.world);
      remember(next.world);
      return { result: next.result, state: viewFor(next.world, persona) };
    },
    [world, persona],
  );

  const reset = useCallback(() => {
    const fresh = seedWorld();
    setWorld(fresh);
    remember(fresh);
  }, []);

  const banner = (
    <div className="sp-demo-bar">
      <div className="sp-demo-bar-inner">
        <span className="sp-demo-tag">DEMO</span>
        <span className="sp-demo-roles">
          {PERSONAS.map((p) => {
            const Icon = ICONS[p.role];
            const current = p.id === persona.id;
            return (
              <Link
                key={p.id}
                href={`/demo/${p.role}`}
                aria-current={current ? "page" : undefined}
                className={current ? "is-current" : ""}
              >
                <Icon size={14} aria-hidden />
                {p.title}
              </Link>
            );
          })}
        </span>
        <span className="sp-demo-actions">
          <button type="button" onClick={reset} className="sp-demo-reset">
            <RotateCcw size={14} aria-hidden />
            Reset data
          </button>
          <Link href="/">Leave demo</Link>
        </span>
      </div>
      {hint && (
        <p className="sp-demo-hint">
          Sample data in your browser only — nothing is saved and nobody else
          sees it. Switch roles above to follow one guest from request to gate.
          When a form asks a resident to confirm with their password, it is{" "}
          <strong>{DEMO_PASSWORD}</strong>.
          <button
            type="button"
            onClick={() => setHint(false)}
            aria-label="Hide demo tips"
          >
            <X size={14} />
          </button>
        </p>
      )}
    </div>
  );

  const driver: DemoDriver = {
    command,
    refresh: () => viewFor(world, persona),
    banner,
  };

  // Remounting on a role change resets the view state (open dialogs, filters)
  // while the world itself carries over, which is what makes the hand-off
  // between resident, guard and manager read as one story.
  return <WorkspaceApp key={persona.id} initial={state} demo={driver} />;
}
