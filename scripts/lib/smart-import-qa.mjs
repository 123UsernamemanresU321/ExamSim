export function evaluatePaperPackage(packageValue, expectations) {
  const packageObject = record(packageValue?.normalized_package ?? packageValue);
  const roots = Array.isArray(packageObject.questions) ? packageObject.questions.filter(isRecord) : [];
  const flattened = roots.flatMap((node) => flattenNode(node));
  const rootsByNumber = new Map();
  for (const root of roots) {
    const number = rootQuestionNumber(root);
    if (number) rootsByNumber.set(number, root);
  }

  const expectedNumbers = Array.from({ length: expectations.expectedQuestionCount }, (_, index) => index + 1);
  const missingQuestionNumbers = expectedNumbers.filter((number) => !rootsByNumber.has(number));
  const unexpectedQuestionNumbers = [...rootsByNumber.keys()].filter((number) => number < 1 || number > expectations.expectedQuestionCount);
  const actualTotalMarks = sumQuestionMarks(roots);
  const missingRequiredPrompts = [];
  for (const [requiredKey, terms] of Object.entries(expectations.requiredPrompts ?? {})) {
    const normalizedRequiredKey = normalizeNodeKey(requiredKey);
    const node = flattened.find((candidate) => normalizeNodeKey(nodeKey(candidate)) === normalizedRequiredKey);
    const searchable = node ? searchableNodeText(node) : "";
    if (!node || terms.some((term) => !searchable.includes(String(term).toLowerCase()))) {
      missingRequiredPrompts.push(requiredKey);
    }
  }

  const actualQuestionCount = rootsByNumber.size;
  const sectionBoundaryValid = expectedNumbers.slice(0, expectations.sectionAEnd).every((number) => rootsByNumber.has(number))
    && expectedNumbers.slice(expectations.sectionBStart - 1).every((number) => rootsByNumber.has(number));
  const marksMatch = Math.abs(actualTotalMarks - expectations.expectedTotalMarks) < 0.001;

  return {
    passed: actualQuestionCount === expectations.expectedQuestionCount
      && marksMatch
      && missingQuestionNumbers.length === 0
      && unexpectedQuestionNumbers.length === 0
      && missingRequiredPrompts.length === 0
      && sectionBoundaryValid,
    actualQuestionCount,
    actualTotalMarks,
    missingQuestionNumbers,
    unexpectedQuestionNumbers,
    missingRequiredPrompts,
    sectionBoundaryValid,
    marksMatch,
  };
}

function sumQuestionMarks(roots) {
  return roots.reduce((total, root) => {
    const rootMarks = finiteNumber(root.marks);
    if (rootMarks !== null) return total + rootMarks;
    const leaves = flattenNode(root).filter((node) => !Array.isArray(node.children) || node.children.length === 0);
    return total + leaves.reduce((sum, leaf) => sum + (finiteNumber(leaf.marks) ?? 0), 0);
  }, 0);
}

function flattenNode(node) {
  const children = Array.isArray(node.children) ? node.children.filter(isRecord) : [];
  return [node, ...children.flatMap((child) => flattenNode(child))];
}

function rootQuestionNumber(node) {
  const match = nodeKey(node).match(/(?:^|\b)q?\s*(\d{1,3})(?:\b|\()/i);
  return match?.[1] ? Number(match[1]) : null;
}

function nodeKey(node) {
  return String(node.node_key ?? node.normalized_key ?? node.display_label ?? node.title ?? "");
}

function normalizeNodeKey(value) {
  return String(value).toLowerCase().replace(/^q/, "").replace(/\s+/g, "");
}

function searchableNodeText(node) {
  const prompt = record(node.prompt);
  return [
    node.node_key,
    node.normalized_key,
    node.display_label,
    node.title,
    node.prompt_html,
    node.prompt_latex,
    prompt.html,
    prompt.latex,
    node.has_visual_assets ? "diagram visual asset" : "",
    ...(Array.isArray(node.assets) ? node.assets : []),
    ...(Array.isArray(node.visual_asset_refs) ? node.visual_asset_refs.map((value) => JSON.stringify(value)) : []),
  ].map((value) => String(value ?? "")).join(" ").toLowerCase();
}

function finiteNumber(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function record(value) {
  return isRecord(value) ? value : {};
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
