import React, { useMemo } from "react";

export interface GraphCommit {
  sha: string;
  parent_shas: string[];
}

export interface ComputedNode {
  sha: string;
  idx: number;
  col: number;
  cx: number;
  cy: number;
  color: string;
  isHead: boolean;
}

export interface ComputedEdge {
  id: string;
  d: string;
  color: string;
}

export const BRANCH_COLORS = [
  "#3b82f6", // 0: 蓝 (通常 main / dev)
  "#8b5cf6", // 1: 紫
  "#10b981", // 2: 绿
  "#f59e0b", // 3: 橙
  "#ec4899", // 4: 粉
  "#06b6d4", // 5: 青
  "#f97316", // 6: 珊瑚橙
  "#6366f1", // 7: 靛蓝
];

const ROW_H = 36;
const COL_W = 14;
const NODE_CY = (i: number) => i * ROW_H + 18;
const NODE_CX = (col: number) => 14 + col * COL_W;

/**
 * 绘制从 (x1, y1) 到 (x2, y2) 的连接路径：
 * isMerge: true 表示合并来源连线（从合并提交向外平滑连接到被合并分支）
 * isMerge: false 表示分支分叉连线（沿子分支列向下，临近父节点时平滑汇入）
 */
function makeEdgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  isMerge: boolean
): string {
  if (x1 === x2) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  const dy = y2 - y1;

  if (isMerge) {
    // 合并线：从子节点 (x1, y1) 先平滑向目标列过渡，再竖直连入目标节点 (x2, y2)
    const curveH = Math.min(28, Math.max(14, dy * 0.45));
    const midY = y1 + curveH;
    return `M ${x1} ${y1} C ${x1} ${y1 + curveH * 0.55}, ${x2} ${y1 + curveH * 0.45}, ${x2} ${midY} L ${x2} ${y2}`;
  } else {
    // 分叉线：沿子分支自身列向下，临近基准父节点时平滑拐入 (x2, y2)
    const curveH = Math.min(28, Math.max(14, dy * 0.45));
    const startY = y2 - curveH;
    return `M ${x1} ${y1} L ${x1} ${startY} C ${x1} ${startY + curveH * 0.55}, ${x2} ${startY + curveH * 0.45}, ${x2} ${y2}`;
  }
}

export function computeGitGraph(commits: GraphCommit[]) {
  const n = commits.length;
  if (n === 0) return { nodes: [], edges: [], graphWidth: 28, graphHeight: 36 };

  const shaToIdx = new Map<string, number>();
  commits.forEach((c, idx) => shaToIdx.set(c.sha, idx));

  // ── 1. 泳道分配 (Lane Allocation) ──────────────────────────
  const lanes: (string | null)[] = [];
  const laneColors: number[] = [];
  let colorCounter = 0;

  const cols: number[] = new Array(n);
  let maxCol = 0;

  const getOrAllocLane = (sha: string): number => {
    let col = lanes.indexOf(sha);
    if (col !== -1) return col;

    col = lanes.indexOf(null);
    if (col === -1) {
      col = lanes.length;
      lanes.push(sha);
      laneColors.push(colorCounter++ % BRANCH_COLORS.length);
    } else {
      lanes[col] = sha;
      if (laneColors[col] === undefined) {
        laneColors[col] = colorCounter++ % BRANCH_COLORS.length;
      }
    }
    return col;
  };

  for (let i = 0; i < n; i++) {
    const c = commits[i];

    // 当前提交所属的列
    const col = getOrAllocLane(c.sha);
    cols[i] = col;
    if (col > maxCol) maxCol = col;

    // 第一父节点继续沿用本列
    if (c.parent_shas.length > 0) {
      lanes[col] = c.parent_shas[0];
    } else {
      lanes[col] = null; // 初始提交，该列生命周期结束
    }

    // 清除其他列可能存在的同 SHA 等待项（多分支汇聚）
    for (let l = 0; l < lanes.length; l++) {
      if (l !== col && lanes[l] === c.sha) {
        lanes[l] = null;
      }
    }
  }

  // ── 2. 生成节点 ───────────────────────────────────────────
  const nodes: ComputedNode[] = commits.map((c, i) => {
    const col = cols[i];
    const color = BRANCH_COLORS[laneColors[col] ?? col % BRANCH_COLORS.length];
    return {
      sha: c.sha,
      idx: i,
      col,
      cx: NODE_CX(col),
      cy: NODE_CY(i),
      color,
      isHead: i === 0,
    };
  });

  // ── 3. 生成连线（无虚假旁路列，点到点平滑汇聚）─────────────
  const edges: ComputedEdge[] = [];

  for (let i = 0; i < n; i++) {
    const c = commits[i];
    const fromX = NODE_CX(cols[i]);
    const fromY = NODE_CY(i);
    const nodeColor = BRANCH_COLORS[laneColors[cols[i]] ?? cols[i] % BRANCH_COLORS.length];

    c.parent_shas.forEach((pSha, pOrder) => {
      const pIdx = shaToIdx.get(pSha);
      const isMerge = pOrder > 0; // 第 2 个及之后的父节点是 merge 来源

      if (pIdx !== undefined) {
        const pCol = cols[pIdx];
        const toX = NODE_CX(pCol);
        const toY = NODE_CY(pIdx);
        const pColor = BRANCH_COLORS[laneColors[pCol] ?? pCol % BRANCH_COLORS.length];

        // 连线颜色：合并线用被合并方(pColor)的颜色，主干线用本分支颜色
        const color = isMerge ? pColor : nodeColor;

        edges.push({
          id: `${c.sha}->${pSha}`,
          d: makeEdgePath(fromX, fromY, toX, toY, isMerge),
          color,
        });
      } else {
        // 父节点超出当前已加载提交列表：向下平滑渐隐延伸
        edges.push({
          id: `${c.sha}->trail-${pSha}`,
          d: `M ${fromX} ${fromY} L ${fromX} ${fromY + 36}`,
          color: nodeColor,
        });
      }
    });
  }

  const graphWidth = Math.max(28, NODE_CX(maxCol) + COL_W + 12);
  const graphHeight = Math.max(36, n * ROW_H);

  return { nodes, edges, graphWidth, graphHeight };
}

// ── SVG 渲染组件 ───────────────────────────────────────────
interface GitGraphOverlayProps {
  commits: GraphCommit[];
  selectedSha?: string;
}

export const GitGraphOverlay: React.FC<GitGraphOverlayProps> = ({
  commits,
  selectedSha,
}) => {
  const { nodes, edges, graphWidth, graphHeight } = useMemo(
    () => computeGitGraph(commits),
    [commits]
  );

  return (
    <svg
      className="git-dag-svg"
      viewBox={`0 0 ${graphWidth} ${graphHeight}`}
      style={{
        width: `${graphWidth}px`,
        height: `${graphHeight}px`,
        position: "absolute",
        left: 0,
        top: 0,
        pointerEvents: "none",
        zIndex: 2,
        overflow: "visible",
      }}
    >
      {edges.map((e) => (
        <path
          key={e.id}
          d={e.d}
          fill="none"
          stroke={e.color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {nodes.map((n) => {
        const isSelected = n.sha === selectedSha;
        return (
          <g key={n.sha}>
            {isSelected && (
              <circle
                cx={n.cx}
                cy={n.cy}
                r={7}
                fill="none"
                stroke={n.color}
                strokeWidth={1.8}
                opacity={0.65}
              />
            )}
            <circle
              cx={n.cx}
              cy={n.cy}
              r={n.isHead ? 5 : 4}
              fill={n.color}
              stroke="var(--surface)"
              strokeWidth={1.5}
            />
            {n.isHead && (
              <circle cx={n.cx} cy={n.cy} r={1.8} fill="var(--surface)" />
            )}
          </g>
        );
      })}
    </svg>
  );
};
