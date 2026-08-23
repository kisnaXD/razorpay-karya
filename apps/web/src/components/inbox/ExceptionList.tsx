import type { ApiException } from "@/lib/api";

type ExceptionListProps = {
  exceptions: ApiException[];
  nodeKeyById: Map<string, string>;
  selectedKey: string | null;
  onSelect: (key: string) => void;
};

export function ExceptionList({
  exceptions,
  nodeKeyById,
  selectedKey,
  onSelect,
}: ExceptionListProps) {
  return (
    <section className="flex min-h-0 flex-col" aria-label="Exceptions">
      <header className="border-b border-line px-4 py-2">
        <h2 className="text-[15px] font-medium text-text">Inbox</h2>
        <p className="text-[12px] text-muted">
          Operational exceptions across the graph.
        </p>
      </header>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {exceptions.map((ex) => {
          const nodeKey = nodeKeyById.get(ex.nodeId) ?? ex.nodeId;
          const selected = selectedKey === nodeKey;
          const borderColor =
            ex.severity === "risk" ? "border-l-risk" : "border-l-warn";

          return (
            <li key={ex.id}>
              <button
                type="button"
                onClick={() => onSelect(nodeKey)}
                className={[
                  "w-full border-b border-line border-l-[3px] px-4 py-3 text-left",
                  borderColor,
                  selected ? "bg-surface-2" : "bg-transparent hover:bg-surface",
                ].join(" ")}
              >
                <div className="font-medium text-text">{ex.title}</div>
                <div className="mt-1 leading-[1.45] text-muted">{ex.detail}</div>
                <div className="mt-2 font-mono text-[12px] text-muted">
                  {nodeKey}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
