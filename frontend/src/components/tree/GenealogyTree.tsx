import { useEffect, useMemo, useState } from "react";
import { usePanZoom } from "@/hooks/usePanZoom";
import { PersonProfileDialog } from "@/components/people/PersonProfileDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { computeTreeLayout } from "./treeLayout";
import { TreeEdges } from "./TreeEdges";
import { TreeNode } from "./TreeNode";
import { TreeControls } from "./TreeControls";
import { buildKinshipGraph, describeRelationship, type KinshipResult } from "./kinship";
import type { FamilyTreeNode } from "@/services/api/tree";
import type { Person } from "@/types";
import { cn, fullName } from "@/lib/utils";

interface GenealogyTreeProps {
  root: FamilyTreeNode;
  people: Person[];
  highlightedIds?: Set<string>;
  className?: string;
  /** Used by the small per-person preview cards on "Tout le village" — the
   * bounded (non-fullscreen) canvas becomes a static preview: no drag-to-pan
   * (no grab cursor), no zoom buttons/wheel/pinch, only "plein écran"
   * remains to open the fully interactive tree. Never applies to the
   * fullscreen modal itself, which always stays fully interactive. */
  compact?: boolean;
  /** Fullscreen dialog title — explicit rather than always derived from
   * `root.person`, which isn't necessarily the person/context the caller
   * actually wants named (e.g. "Tout le village" cards, whose displayed
   * sommet can be a different person than the card's own subject). Falls
   * back to "Arbre de {root.person}" when omitted, unchanged for callers
   * that were already correct with that default ("Moi", "Rechercher une
   * personne"). */
  title?: string;
}

interface TreeCanvasProps {
  root: FamilyTreeNode;
  collapsed: Set<string>;
  onToggleCollapse: (personId: string) => void;
  people: Person[];
  highlightedIds?: Set<string>;
  className?: string;
  onSelect: (person: Person) => void;
  onMaximize?: () => void;
  compact?: boolean;
  kinshipPersonA: Person | null;
  kinshipPersonB: Person | null;
  onSelectKinshipA: (person: Person) => void;
  onSelectKinshipB: (person: Person) => void;
  onResetKinship: () => void;
  kinshipResult: KinshipResult | undefined;
}

/** The pan/zoom canvas itself — mounted twice by `GenealogyTree` below (once
 * in its normal bounded size, once inside the fullscreen modal), each with
 * its own independent `usePanZoom` instance since the two live in
 * differently-sized containers. `collapsed`/`onSelect` stay lifted to the
 * parent so both mounts share the same collapse state and the same
 * quick-view/add-relation dialogs. */
function TreeCanvas({
  root,
  collapsed,
  onToggleCollapse,
  people,
  highlightedIds,
  className,
  onSelect,
  onMaximize,
  compact,
  kinshipPersonA,
  kinshipPersonB,
  onSelectKinshipA,
  onSelectKinshipB,
  onResetKinship,
  kinshipResult,
}: TreeCanvasProps) {
  const { containerRef, transform, handlers, zoomIn, zoomOut, centerOn } = usePanZoom();

  const layout = useMemo(() => computeTreeLayout(root, collapsed), [root, collapsed]);

  const fit = () => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const scale = Math.min(
      (rect.width - 60) / layout.width,
      (rect.height - 60) / layout.height,
      1,
    );
    centerOn(layout.width / 2, layout.height / 2, Math.max(0.28, scale));
  };

  useEffect(() => {
    const id = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root.person.id]);

  // Une fois un lien de parenté trouvé, recentre la vue sur l'ensemble du
  // chemin surligné (plutôt que de laisser l'une des deux personnes hors
  // champ) — sans quoi le chemin coloré n'apporterait rien si l'une des deux
  // extrémités reste invisible à l'écran.
  useEffect(() => {
    if (!kinshipResult) return;
    const relevant = layout.nodes.filter(
      (n) => kinshipResult.pathIds.includes(n.id) || n.data.spouses.some((s) => kinshipResult.pathIds.includes(s.id)),
    );
    if (relevant.length === 0) return;
    const xs = relevant.map((n) => n.x);
    const ys = relevant.map((n) => n.y);
    const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const el = containerRef.current;
    const rect = el?.getBoundingClientRect();
    const spanX = Math.max(...xs) - Math.min(...xs) + 240;
    const spanY = Math.max(...ys) - Math.min(...ys) + 240;
    const scale = rect ? Math.min((rect.width - 60) / spanX, (rect.height - 60) / spanY, 1) : transform.scale;
    centerOn(midX, midY, Math.max(0.28, Math.min(scale, 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kinshipResult]);

  const jumpToPerson = (person: Person) => {
    const node = layout.nodes.find((n) => n.id === person.id || n.data.spouses.some((s) => s.id === person.id));
    if (node) {
      centerOn(node.x, node.y + 60, Math.max(transform.scale, 0.85));
    }
    onSelect(person);
  };

  return (
    <div
      className={cn(
        "relative touch-none select-none overflow-hidden rounded-xl border border-border bg-muted/20 bg-grain",
        className,
      )}
    >
      <TreeControls
        people={people}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onJumpToPerson={jumpToPerson}
        onMaximize={onMaximize}
        compact={compact}
        kinshipPersonA={kinshipPersonA}
        kinshipPersonB={kinshipPersonB}
        onSelectKinshipA={onSelectKinshipA}
        onSelectKinshipB={onSelectKinshipB}
        onResetKinship={onResetKinship}
        kinshipResult={kinshipResult}
      />

      <div
        ref={containerRef}
        className={cn("size-full", !compact && "cursor-grab active:cursor-grabbing")}
        {...(compact ? {} : handlers)}
      >
        <div
          className="relative"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: "0 0",
          }}
        >
          <TreeEdges layout={layout} highlightedIds={highlightedIds} />
          {layout.nodes.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              highlightedIds={highlightedIds}
              onSelect={onSelect}
              onToggleCollapse={onToggleCollapse}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function GenealogyTree({ root, people, highlightedIds, className, compact, title }: GenealogyTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Person | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // « Lien de parenté » — deux personnes choisies dans cet arbre + le lien
  // calculé entre elles (voir kinship.ts). Levé ici (plutôt que dans
  // TreeCanvas) pour que les deux montages du canvas (normal + plein écran)
  // partagent la même sélection, comme `collapsed` ci-dessus.
  const [kinshipPersonA, setKinshipPersonA] = useState<Person | null>(null);
  const [kinshipPersonB, setKinshipPersonB] = useState<Person | null>(null);

  const kinshipGraph = useMemo(() => buildKinshipGraph(root), [root]);
  const kinshipResult = useMemo(
    () =>
      kinshipPersonA && kinshipPersonB
        ? describeRelationship(kinshipGraph, kinshipPersonA.id, kinshipPersonB.id)
        : undefined,
    [kinshipGraph, kinshipPersonA, kinshipPersonB],
  );
  const kinshipHighlightedIds = useMemo(
    () => (kinshipResult ? new Set(kinshipResult.pathIds) : undefined),
    [kinshipResult],
  );
  const effectiveHighlightedIds = kinshipHighlightedIds ?? highlightedIds;

  const resetKinship = () => {
    setKinshipPersonA(null);
    setKinshipPersonB(null);
  };

  // Change de personne/arbre affiché : une sélection de l'arbre précédent
  // n'a plus de sens ici (elle pourrait même ne plus exister dans ce
  // nouveau `people`).
  useEffect(() => {
    resetKinship();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root.person.id]);

  const toggleCollapse = (personId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  };

  return (
    <>
      <TreeCanvas
        root={root}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        people={people}
        highlightedIds={effectiveHighlightedIds}
        className={className}
        onSelect={setSelected}
        onMaximize={() => setFullscreen(true)}
        compact={compact}
        kinshipPersonA={kinshipPersonA}
        kinshipPersonB={kinshipPersonB}
        onSelectKinshipA={setKinshipPersonA}
        onSelectKinshipB={setKinshipPersonB}
        onResetKinship={resetKinship}
        kinshipResult={kinshipResult}
      />

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        {/* Below `sm`, 80vw/80vh of an already-small phone viewport leaves
         * barely any room for the canvas — go truly edge-to-edge instead,
         * and only shrink to the "floating window" look once there's actual
         * screen to spare. */}
        <DialogContent className="flex h-[100dvh] w-screen max-w-none max-h-none flex-col gap-0 overflow-hidden rounded-none p-3 sm:h-[80vh] sm:w-[80vw] sm:max-w-[80vw] sm:max-h-[80vh] sm:rounded-xl sm:p-4">
          <DialogHeader className="pb-2">
            <DialogTitle>{title ?? `Arbre de ${fullName(root.person)}`}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            <TreeCanvas
              root={root}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
              people={people}
              highlightedIds={effectiveHighlightedIds}
              className="size-full"
              onSelect={setSelected}
              kinshipPersonA={kinshipPersonA}
              kinshipPersonB={kinshipPersonB}
              onSelectKinshipA={setKinshipPersonA}
              onSelectKinshipB={setKinshipPersonB}
              onResetKinship={resetKinship}
              kinshipResult={kinshipResult}
            />
          </div>
        </DialogContent>
      </Dialog>

      <PersonProfileDialog
        personId={selected?.id ?? ""}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </>
  );
}
