import { readFile, writeFile } from "fs/promises";

const graph = JSON.parse(await readFile("data/graph.json", "utf-8"));

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Composio Tool Dependency Graph — Google Super &amp; GitHub</title>
<style>
  :root {
    --bg: #0b0e14;
    --panel-bg: #12161f;
    --border: #232a38;
    --text: #d7dce3;
    --muted: #8b93a3;
    --accent: #5aa9ff;
    --googlesuper: #4fc3f7;
    --github: #ffb454;
    --lookup: #5aa9ff;
    --creates: #66d19e;
    --resolve: #c792ea;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; overflow: hidden; }
  #app { display: flex; width: 100%; height: 100%; }
  #graphWrap { position: relative; flex: 1; overflow: hidden; cursor: grab; }
  #graphWrap.dragging { cursor: grabbing; }
  svg { width: 100%; height: 100%; display: block; }
  #sidebar { width: 340px; flex-shrink: 0; background: var(--panel-bg); border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
  #controls { padding: 14px 16px; border-bottom: 1px solid var(--border); }
  #controls h1 { font-size: 14px; margin: 0 0 4px; font-weight: 600; }
  #controls .sub { font-size: 11px; color: var(--muted); margin-bottom: 12px; }
  #search { width: 100%; padding: 7px 9px; background: #1a2029; border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 12px; margin-bottom: 10px; }
  #search:focus { outline: none; border-color: var(--accent); }
  .filterGroup { margin-bottom: 10px; }
  .filterGroup .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 6px; }
  .chk { display: flex; align-items: center; gap: 6px; font-size: 12px; padding: 3px 0; cursor: pointer; user-select: none; }
  .chk input { cursor: pointer; }
  .swatch { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .stats { font-size: 11px; color: var(--muted); padding: 8px 16px; border-bottom: 1px solid var(--border); }
  #detail { flex: 1; overflow-y: auto; padding: 16px; font-size: 12.5px; line-height: 1.5; }
  #detail .empty { color: var(--muted); font-size: 12px; margin-top: 20px; text-align: center; }
  #detail h2 { font-size: 14px; margin: 0 0 2px; word-break: break-word; }
  #detail .slugline { font-size: 10.5px; color: var(--muted); margin-bottom: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  #detail .desc { color: #b7bfcc; margin-bottom: 14px; }
  #detail .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin: 14px 0 6px; }
  #detail .req { display: inline-block; background: #1a2029; border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; margin: 2px 3px 0 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
  .edgeItem { border-left: 2px solid var(--border); padding: 6px 0 6px 10px; margin-bottom: 6px; cursor: pointer; }
  .edgeItem:hover { border-left-color: var(--accent); background: #161c27; }
  .edgeItem .who { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--text); }
  .edgeItem .note { color: var(--muted); font-size: 11px; margin-top: 2px; }
  .tag { display: inline-block; font-size: 9.5px; padding: 1px 5px; border-radius: 3px; margin-left: 6px; vertical-align: middle; }
  .tag.lookup { background: rgba(90,169,255,0.18); color: var(--lookup); }
  .tag.creates { background: rgba(102,209,158,0.18); color: var(--creates); }
  .tag.resolve-identity { background: rgba(199,146,234,0.18); color: var(--resolve); }
  #tooltip { position: absolute; pointer-events: none; background: #1a2029; border: 1px solid var(--border); border-radius: 6px; padding: 6px 9px; font-size: 11.5px; max-width: 280px; display: none; z-index: 10; box-shadow: 0 4px 16px rgba(0,0,0,0.4); }
  #tooltip .t-slug { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--accent); font-size: 11px; }
  #zoomHint { position: absolute; bottom: 10px; left: 12px; font-size: 10.5px; color: var(--muted); background: rgba(18,22,31,0.75); padding: 4px 8px; border-radius: 5px; }
  a, a:visited { color: var(--accent); }
</style>
</head>
<body>
<div id="app">
  <div id="graphWrap">
    <svg id="svg"></svg>
    <div id="tooltip"></div>
    <div id="zoomHint">scroll to zoom · drag to pan · click a node for details</div>
  </div>
  <div id="sidebar">
    <div id="controls">
      <h1>Composio Tool Dependency Graph</h1>
      <div class="sub">Google Super &amp; GitHub — precursor actions required before a tool can run</div>
      <input id="search" type="text" placeholder="Search tool name or slug…" />
      <div class="filterGroup">
        <div class="label">Toolkit</div>
        <label class="chk"><input type="checkbox" data-toolkit="googlesuper" checked><span class="swatch" style="background:var(--googlesuper)"></span> Google Super</label>
        <label class="chk"><input type="checkbox" data-toolkit="github" checked><span class="swatch" style="background:var(--github)"></span> GitHub</label>
      </div>
      <div class="filterGroup">
        <div class="label">Edge type</div>
        <label class="chk"><input type="checkbox" data-etype="lookup" checked><span class="swatch" style="background:var(--lookup)"></span> lookup (list/search/get first)</label>
        <label class="chk"><input type="checkbox" data-etype="creates" checked><span class="swatch" style="background:var(--creates)"></span> creates (id comes from creating it)</label>
        <label class="chk"><input type="checkbox" data-etype="resolve-identity" checked><span class="swatch" style="background:var(--resolve)"></span> resolve-identity (name → email/login)</label>
      </div>
    </div>
    <div class="stats" id="stats"></div>
    <div id="detail"><div class="empty">Click any node to see its required inputs and the tools that can supply them.</div></div>
  </div>
</div>
<script>
const GRAPH = ${JSON.stringify(graph)};
</script>
<script>
(function() {
  const nodesById = new Map(GRAPH.nodes.map(n => [n.slug, n]));

  // --- layout: cluster nodes by toolkit + family, sunflower-pack within each cluster ---
  const clusterKey = n => n.toolkit + '::' + n.family;
  const clusters = new Map();
  for (const n of GRAPH.nodes) {
    const k = clusterKey(n);
    if (!clusters.has(k)) clusters.set(k, { toolkit: n.toolkit, family: n.family, nodes: [] });
    clusters.get(k).nodes.push(n);
  }

  function layoutToolkit(clusterList, startX, startY, targetWidth) {
    clusterList.sort((a, b) => b.nodes.length - a.nodes.length);
    let x = startX, y = startY, rowH = 0, maxX = startX;
    for (const c of clusterList) {
      const radius = 26 + 15 * Math.sqrt(c.nodes.length);
      const diameter = radius * 2 + 36;
      if (x + diameter > startX + targetWidth && x > startX) {
        x = startX;
        y += rowH + 50;
        rowH = 0;
      }
      const cx = x + radius, cy = y + radius;
      c.cx = cx; c.cy = cy; c.radius = radius;
      const golden = Math.PI * (3 - Math.sqrt(5));
      c.nodes.forEach((n, i) => {
        if (c.nodes.length === 1) { n.x = cx; n.y = cy; return; }
        const r = radius * 0.82 * Math.sqrt((i + 0.5) / c.nodes.length);
        const theta = i * golden;
        n.x = cx + r * Math.cos(theta);
        n.y = cy + r * Math.sin(theta);
      });
      x += diameter;
      rowH = Math.max(rowH, diameter);
      maxX = Math.max(maxX, x);
    }
    return { bottom: y + rowH, right: maxX };
  }

  const gsClusters = [...clusters.values()].filter(c => c.toolkit === 'googlesuper');
  const ghClusters = [...clusters.values()].filter(c => c.toolkit === 'github');
  const band1 = layoutToolkit(gsClusters, 0, 0, 2600);
  layoutToolkit(ghClusters, 0, band1.bottom + 160, 2600);

  // --- degree (for node sizing) ---
  const degree = new Map();
  for (const e of GRAPH.edges) {
    degree.set(e.from, (degree.get(e.from) || 0) + 1);
    degree.set(e.to, (degree.get(e.to) || 0) + 1);
  }

  // --- SVG scaffolding ---
  const svg = document.getElementById('svg');
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  const defs = el('defs', {});
  for (const [id, color] of [['arrow-lookup', 'var(--lookup)'], ['arrow-creates', 'var(--creates)'], ['arrow-resolve-identity', 'var(--resolve)']]) {
    const marker = el('marker', { id, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse' });
    marker.appendChild(el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: color }));
    defs.appendChild(marker);
  }
  svg.appendChild(defs);

  const viewport = el('g', { id: 'viewport' });
  svg.appendChild(viewport);

  const familyLabelsLayer = el('g', { class: 'familyLabels' });
  const edgeLayer = el('g', { class: 'edges' });
  const nodeLayer = el('g', { class: 'nodes' });
  viewport.appendChild(familyLabelsLayer);
  viewport.appendChild(edgeLayer);
  viewport.appendChild(nodeLayer);

  for (const c of clusters.values()) {
    const t = el('text', { x: c.cx, y: c.cy - c.radius - 8, 'text-anchor': 'middle', fill: '#5b6472', 'font-size': '13', 'font-weight': '600' });
    t.textContent = c.family + ' (' + c.nodes.length + ')';
    familyLabelsLayer.appendChild(t);
  }

  const toolkitColor = t => t === 'googlesuper' ? 'var(--googlesuper)' : 'var(--github)';

  const edgeEls = [];
  for (const e of GRAPH.edges) {
    const a = nodesById.get(e.from), b = nodesById.get(e.to);
    if (!a || !b) continue;
    const line = el('line', {
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      stroke: 'var(--' + (e.type === 'lookup' ? 'lookup' : e.type === 'creates' ? 'creates' : 'resolve') + ')',
      'stroke-width': e.type === 'resolve-identity' ? 1 : 1.3,
      'stroke-dasharray': e.type === 'creates' ? '5,3' : e.type === 'resolve-identity' ? '1.5,3' : 'none',
      opacity: e.type === 'resolve-identity' ? 0.22 : 0.35,
      'marker-end': 'url(#arrow-' + e.type + ')',
    });
    line.dataset.type = e.type;
    line.dataset.from = e.from;
    line.dataset.to = e.to;
    edgeLayer.appendChild(line);
    edgeEls.push({ el: line, edge: e });
  }

  const nodeEls = new Map();
  for (const n of GRAPH.nodes) {
    const g = el('g', { class: 'nodeG', transform: 'translate(' + n.x + ',' + n.y + ')' });
    const r = 4 + Math.min(10, Math.sqrt(degree.get(n.slug) || 1) * 1.8);
    const circle = el('circle', { r, fill: toolkitColor(n.toolkit), stroke: '#0b0e14', 'stroke-width': 1, 'fill-opacity': 0.9 });
    g.appendChild(circle);
    g.dataset.slug = n.slug;
    g.dataset.toolkit = n.toolkit;
    g.style.cursor = 'pointer';
    nodeLayer.appendChild(g);
    nodeEls.set(n.slug, { g, circle, r, n });

    g.addEventListener('mouseenter', (ev) => showTooltip(n, ev));
    g.addEventListener('mousemove', (ev) => positionTooltip(ev));
    g.addEventListener('mouseleave', hideTooltip);
    g.addEventListener('click', () => selectNode(n.slug));
  }

  // --- pan & zoom ---
  let tx = 0, ty = 0, scale = 0.42;
  const wrap = document.getElementById('graphWrap');
  function applyTransform() {
    viewport.setAttribute('transform', 'translate(' + tx + ',' + ty + ') scale(' + scale + ')');
  }
  // center initial view
  function centerView() {
    const rect = wrap.getBoundingClientRect();
    tx = rect.width / 2 - (band1.right / 2) * scale;
    ty = 40;
    applyTransform();
  }
  window.addEventListener('resize', centerView);

  let dragging = false, lastX = 0, lastY = 0;
  wrap.addEventListener('mousedown', (e) => {
    if (e.target.closest('.nodeG')) return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    wrap.classList.add('dragging');
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    tx += e.clientX - lastX; ty += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    applyTransform();
  });
  window.addEventListener('mouseup', () => { dragging = false; wrap.classList.remove('dragging'); });
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const worldX = (mx - tx) / scale, worldY = (my - ty) / scale;
    const factor = Math.exp(-e.deltaY * 0.0012);
    scale = Math.min(6, Math.max(0.05, scale * factor));
    tx = mx - worldX * scale;
    ty = my - worldY * scale;
    applyTransform();
  }, { passive: false });

  // --- tooltip ---
  const tooltip = document.getElementById('tooltip');
  function showTooltip(n) {
    tooltip.innerHTML = '<div class="t-slug">' + n.slug + '</div><div style="margin-top:3px;color:#b7bfcc">' + (n.name || '') + '</div>';
    tooltip.style.display = 'block';
  }
  function positionTooltip(ev) {
    const rect = wrap.getBoundingClientRect();
    tooltip.style.left = (ev.clientX - rect.left + 14) + 'px';
    tooltip.style.top = (ev.clientY - rect.top + 10) + 'px';
  }
  function hideTooltip() { tooltip.style.display = 'none'; }

  // --- selection / detail panel ---
  const detail = document.getElementById('detail');
  let selected = null;

  function edgeTag(type) {
    return '<span class="tag ' + type + '">' + type + '</span>';
  }

  function selectNode(slug) {
    selected = slug;
    const n = nodesById.get(slug);
    for (const { g, circle, r } of nodeEls.values()) {
      const isSel = g.dataset.slug === slug;
      circle.setAttribute('stroke', isSel ? '#fff' : '#0b0e14');
      circle.setAttribute('stroke-width', isSel ? 2.5 : 1);
      circle.setAttribute('r', isSel ? r * 1.6 : r);
    }
    const incoming = GRAPH.edges.filter(e => e.to === slug);
    const outgoing = GRAPH.edges.filter(e => e.from === slug);

    for (const { el: line, edge } of edgeEls) {
      const related = edge.from === slug || edge.to === slug;
      line.style.opacity = related ? 0.9 : 0.05;
    }

    let html = '<h2>' + (n.name || n.slug) + '</h2>';
    html += '<div class="slugline">' + n.slug + ' &middot; ' + n.toolkit + '</div>';
    html += '<div class="desc">' + (n.description || '') + '</div>';

    if (n.requiredInputs.length) {
      html += '<div class="section-title">Required inputs</div>';
      html += n.requiredInputs.map(r => '<span class="req">' + r + '</span>').join('');
    }

    html += '<div class="section-title">Depends on (' + incoming.length + ')</div>';
    html += incoming.length ? incoming.map(e => edgeRow(e, e.from)).join('') : '<div class="edgeItem" style="border-color:transparent;color:var(--muted)">none detected</div>';

    html += '<div class="section-title">Enables (' + outgoing.length + ')</div>';
    html += outgoing.length ? outgoing.map(e => edgeRow(e, e.to)).join('') : '<div class="edgeItem" style="border-color:transparent;color:var(--muted)">none detected</div>';

    detail.innerHTML = html;
    detail.querySelectorAll('[data-jump]').forEach(elm => {
      elm.addEventListener('click', () => selectNode(elm.dataset.jump));
    });
  }

  function edgeRow(e, otherSlug) {
    const other = nodesById.get(otherSlug);
    return '<div class="edgeItem" data-jump="' + otherSlug + '">' +
      '<div class="who">' + otherSlug + edgeTag(e.type) + '</div>' +
      '<div class="note">' + e.note + '</div>' +
      '</div>';
  }

  // --- filters ---
  const toolkitState = { googlesuper: true, github: true };
  const etypeState = { lookup: true, creates: true, 'resolve-identity': true };

  function applyFilters() {
    for (const { g, n } of nodeEls.values()) {
      const visible = toolkitState[n.toolkit];
      g.style.display = visible ? '' : 'none';
    }
    for (const l of familyLabelsLayer.children) {
      // recompute visibility based on any node in that family's toolkit being visible
    }
    for (const { el: line, edge } of edgeEls) {
      const a = nodesById.get(edge.from), b = nodesById.get(edge.to);
      const visible = toolkitState[a.toolkit] && toolkitState[b.toolkit] && etypeState[edge.type];
      line.style.display = visible ? '' : 'none';
    }
    document.querySelectorAll('.familyLabels text').forEach((t, i) => {
      const c = [...clusters.values()][i];
      t.style.display = toolkitState[c.toolkit] ? '' : 'none';
    });
  }

  document.querySelectorAll('[data-toolkit]').forEach(cb => {
    cb.addEventListener('change', () => { toolkitState[cb.dataset.toolkit] = cb.checked; applyFilters(); });
  });
  document.querySelectorAll('[data-etype]').forEach(cb => {
    cb.addEventListener('change', () => { etypeState[cb.dataset.etype] = cb.checked; applyFilters(); });
  });

  // --- search ---
  const search = document.getElementById('search');
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    for (const { g, circle, r, n } of nodeEls.values()) {
      if (!q) { g.style.opacity = 1; circle.setAttribute('r', r); continue; }
      const match = n.slug.toLowerCase().includes(q) || (n.name || '').toLowerCase().includes(q);
      g.style.opacity = match ? 1 : 0.08;
      circle.setAttribute('r', match ? r * 1.4 : r);
    }
  });

  // --- stats ---
  document.getElementById('stats').textContent =
    GRAPH.nodeCount + ' tools with dependencies · ' + GRAPH.edgeCount + ' edges · scanned ' + GRAPH.totalToolsScanned + ' tools total';

  centerView();
})();
</script>
</body>
</html>
`;

await writeFile("graph.html", html, "utf-8");
console.log("Wrote graph.html (" + (html.length / 1024).toFixed(0) + " KB)");
