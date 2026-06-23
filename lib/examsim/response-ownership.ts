export type ResponseOwnershipNode = {
  id: string;
  node_key?: string | null;
  node_type?: string | null;
  parent_node_id?: string | null;
  root_question_id?: string | null;
  depth?: number | null;
  ordinal_path?: number[] | null;
  response_mode?: string | null;
};

export function buildResponseOwnerIds(nodes: ResponseOwnershipNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const byKey = new Map(nodes.map((node) => [String(node.node_key ?? "").trim().toLowerCase(), node]));
  const rootsByOrdinal = new Map<number, ResponseOwnershipNode>();
  for (const node of nodes) {
    const path = Array.isArray(node.ordinal_path) ? node.ordinal_path : [];
    if (Number(node.depth ?? path.length - 1) === 0 && typeof path[0] === "number") {
      rootsByOrdinal.set(path[0], node);
    }
  }

  const owners = new Map<string, string | null>();

  function resolve(node: ResponseOwnershipNode, visiting = new Set<string>()): string | null {
    if (owners.has(node.id)) return owners.get(node.id) ?? null;
    if (hasConfirmedResponseMode(node.response_mode)) {
      owners.set(node.id, node.id);
      return node.id;
    }
    if (visiting.has(node.id)) return null;
    visiting.add(node.id);

    const parent = node.parent_node_id ? byId.get(node.parent_node_id) : null;
    if (parent) {
      const owner = resolve(parent, visiting);
      if (owner) {
        owners.set(node.id, owner);
        return owner;
      }
    }

    const rootReference = String(node.root_question_id ?? "").trim();
    const path = Array.isArray(node.ordinal_path) ? node.ordinal_path : [];
    const root = rootReference
      ? byId.get(rootReference) ?? byKey.get(rootReference.toLowerCase())
      : typeof path[0] === "number"
        ? rootsByOrdinal.get(path[0])
        : null;
    if (root && root.id !== node.id) {
      const owner = resolve(root, visiting);
      if (owner) {
        owners.set(node.id, owner);
        return owner;
      }
    }

    owners.set(node.id, null);
    return null;
  }

  for (const node of nodes) resolve(node);
  return owners;
}

export function hasConfirmedResponseMode(mode: string | null | undefined) {
  return Boolean(mode && mode !== "none");
}
