/** Current owner decisions never mutate the identity or historical state of a sealed delivery. */
export function applyOwnerAcceptance(farm, decision) {
  if (decision.revisionId !== farm.floorRevision.asset.revisionId || decision.assetId !== 'farmhouse') throw new Error('Owner decision does not identify the retained floor child');
  const revisions = farm.assets.map((asset) => ({ id: asset.id, revisionId: asset.id === decision.assetId ? decision.revisionId : asset.revisionId, ownerAccepted: asset.id === decision.assetId ? decision.ownerAccepted : asset.review.ownerAccepted }));
  return {
    ...farm,
    deliveryReview: { revision: farm.revision, fullPackAccepted: farm.fullPackAccepted, acceptedAssets: farm.assets.filter((asset) => asset.review.ownerAccepted).length, total: farm.assets.length, source: `packs/farm/${farm.revision}/downloads.json and exact-revision review records` },
    ownerReview: { acceptedAssets: revisions.filter((asset) => asset.ownerAccepted).length, total: revisions.length, status: revisions.every((asset) => asset.ownerAccepted) ? 'all-current-revisions-accepted' : 'review-in-progress', date: decision.date, statement: decision.statement, source: decision.source, revisions },
    floorRevision: { ...farm.floorRevision, ownerAccepted: decision.ownerAccepted, status: decision.ownerAccepted ? 'owner-accepted' : farm.floorRevision.status, ownerAcceptance: decision, reviewAtCapture: farm.floorRevision.review, review: farm.floorRevision.review?.replace('owner acceptance pending.', 'owner accepted the edit on 29 September 2026.') },
  };
}

export function requestedAuthorship(receipt, invocation) {
  const keys = ['stage', 'requestedModel', 'requestedEffort', 'harness', 'harnessVersion'];
  for (const key of keys) if (!receipt[key] || receipt[key] !== invocation[key]) throw new Error(`Receipt and invocation disagree on ${key}`);
  return { ...Object.fromEntries(keys.map((key) => [key, receipt[key]])), confirmedEffort: null, confirmation: 'Requested in receipt and invocation; effective reasoning effort not independently confirmed.' };
}

export function selectToolPair(rows, callLine) {
  const blocks = rows[callLine - 1]?.message?.content;
  const call = Array.isArray(blocks) ? blocks.find((block) => block.type === 'tool_use' && block.name.startsWith('mcp__kiln_workspace__kiln_')) : null;
  if (!call) throw new Error(`No recorded Kiln call on line ${callLine}`);
  for (let index = callLine; index < rows.length; index++) {
    const content = rows[index]?.message?.content;
    if (!Array.isArray(content)) continue;
    const output = content.find((block) => block.type === 'tool_result' && block.tool_use_id === call.id);
    if (!output) continue;
    const parts = Array.isArray(output.content) ? output.content : [{ type: 'text', text: output.content }];
    const text = parts.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
    let result;
    try { result = JSON.parse(text); } catch { result = text; }
    return { tool: call.name.split('__').at(-1), arguments: call.input, result, callLine, resultLine: index + 1, omittedImages: parts.filter((part) => part.type === 'image').length };
  }
  throw new Error(`Recorded call on line ${callLine} has no matching result`);
}

/** Review deliberately selected fields only. Never publish native run envelopes. */
export function publicExcerpt(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (/[a-z]:[\\/]|\/(?:Users|home)\/|file:\/\/|data:image|base64|\\\\[^\\]/i.test(text)) throw new Error('Excerpt contains private local paths or an embedded payload');
  return text;
}
