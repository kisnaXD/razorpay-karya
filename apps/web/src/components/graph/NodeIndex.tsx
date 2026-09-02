import type { ApiNode } from "@/lib/api";

type NodeIndexProps = {
  nodes: ApiNode[];
  neighborhoodKeys: Set<string>;
  selectedKey: string | null;
  onSelect?: (key: string) => void;
};

export function NodeIndex({
  nodes,
  neighborhoodKeys,
  selectedKey,
  onSelect,
}: NodeIndexProps) {
  const grouped = new Map<string, ApiNode[]>();
  for (const node of nodes) {
    const list = grouped.get(node.type) ?? [];
    list.push(node);
    grouped.set(node.type, list);
  }

  const types = [...grouped.keys()].sort();

  return (
    <section
      className="flex min-h-0 flex-col border-l border-line"
      aria-label="Node index"
    >
      <header className="border-b border-line px-4 py-2">
        <h2 className="text-[15px] font-medium text-text">Index</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        {types.map((type) => {
          const typeNodes = grouped.get(type) ?? [];
          typeNodes.sort((a, b) => a.key.localeCompare(b.key));
          return (
            <div key={type} className="mb-4">
              <h3 className="mb-1 text-[11px] uppercase tracking-[0.08em] text-muted">
                {type}
              </h3>
              <ul>
                {typeNodes.map((node) => {
                  const inHood = neighborhoodKeys.has(node.key);
                  const selected = selectedKey === node.key;
                  return (
                    <li key={node.key}>
                      <button
                        type="button"
                        onClick={() => onSelect?.(node.key)}
                        className={[
                          "w-full text-left font-mono text-[12px] leading-[1.6]",
                          inHood ? "text-signal" : "text-muted",
                          selected ? "bg-surface-2 px-1 -mx-1" : "hover:text-text",
                          onSelect ? "cursor-pointer border-0 bg-transparent" : "",
                        ].join(" ")}
                      >
                        {node.key}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
