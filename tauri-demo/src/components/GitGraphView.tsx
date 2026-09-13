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
  "#3b82f6", // 0: 经典蓝 (main / trunk)
  "#8b5cf6", // 1: 紫色 (dev / feature 1)
  "#10b981", // 2: 翡翠绿 (feature 2)
  "#f59e0b", // 3: 琥珀橙 (hotfix)
  "#ec4899", // 4: 洋红 (payment)
  "#06b6d4", // 5: 青蓝
  "#f97316", // 6: 珊瑚橙
  "#6366f1", // 7: 靛青
];

function makePath(fromX: number, fromY: number, toX: number, toY: number, isMerge: boolean): string {
  if (fromX === toX) {
    return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  }
  if (isMerge) {
    // Merge: 从顶部合并提交平滑弯出到来源分支轨道，再垂直连接到该分支的最新提交
    const curveEndY = Math.min(toY, fromY + 28);
    const midY = (fromY + curveEndY) * 0.5;
    if (toY <= curveEndY) {
      return `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;
    }
    return `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${curveEndY} L ${toX} ${toY}`;
  } else {
    // Fork: 沿分支自身的轨道垂直向下，到达基准提交时平滑弯入父节点
    const curveStartY = Math.max(fromY, toY - 28);
    const midY = (curveStartY + toY) * 0.5;
    if (fromY >= curveStartY) {
      return `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;
    }
    return `M ${fromX} ${fromY} L ${fromX} ${curveStartY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;
  }
}

export function computeGitGraph(commits: GraphCommit[]) {
  const shaToIdx = new Map<string, number>();
  commits.forEach((c, idx) => shaToIdx.set(c.sha, idx));

  const lanes: (string | null)[] = [];
  const cols: number[] = [];
  let maxCol = 0;

  // 1. 严格按时间线分配每个 Commit 的轨道列 (Lane Allocation)
  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    let col = lanes.indexOf(c.sha);

    if (col === -1) {
      col = lanes.indexOf(null);
      if (col === -1) {
        col = lanes.length;
        lanes.push(c.sha);
      } else {
        lanes[col] = c.sha;
      }
    }

    cols[i] = col;
    if (col > maxCol) maxCol = col;

    const parents = c.parent_shas;
    if (parents.length === 0) {
      lanes[col] = null;
    } else {
      lanes[col] = parents[0];
      for (let pIdx = 1; pIdx < parents.length; pIdx++) {
        const p = parents[pIdx];
        let pCol = lanes.indexOf(p);
        if (pCol === -1) {
          pCol = lanes.indexOf(null);
          if (pCol === -1) {
            pCol = lanes.length;
            lanes.push(p);
          } else {
            lanes[pCol] = p;
          }
        }
        if (pCol > maxCol) maxCol = pCol;
      }
    }

    // 释放所有已匹配到达当前 commit 的多余轨道，确保绝对不产生悬空断头线
    for (let l = 0; l < lanes.length; l++) {
      if (l !== col && lanes[l] === c.sha) {
        lanes[l] = null;
      }
    }
  }

  // 2. 生成节点坐标
  const nodes: ComputedNode[] = commits.map((c, i) => {
    const col = cols[i];
    const cx = 14 + col * 14;
    const cy = i * 36 + 18;
    const color = BRANCH_COLORS[col % BRANCH_COLORS.length];
    return {
      sha: c.sha,
      idx: i,
      col,
      cx,
      cy,
      color,
      isHead: i === 0,
    };
  });

  // 3. 严格根据父子依赖生成闭环连线 (每条线都始于子节点，终于父节点，杜绝任何孤悬残线)
  const edges: ComputedEdge[] = [];
  commits.forEach((c, i) => {
    const cCol = cols[i];
    const fromX = 14 + cCol * 14;
    const fromY = i * 36 + 18;

    c.parent_shas.forEach((pSha, pOrder) => {
      const pIdx = shaToIdx.get(pSha);
      if (pIdx !== undefined) {
        const pCol = cols[pIdx];
        const toX = 14 + pCol * 14;
        const toY = pIdx * 36 + 18;
        const isMerge = pOrder > 0;
        const color = isMerge
          ? BRANCH_COLORS[pCol % BRANCH_COLORS.length]
          : BRANCH_COLORS[cCol % BRANCH_COLORS.length];

        edges.push({
          id: `${c.sha}->${pSha}`,
          d: makePath(fromX, fromY, toX, toY, isMerge),
          color,
        });
      } else {
        // 父节点超出当前已加载列表时，平滑向下渐隐延伸一小截
        edges.push({
          id: `${c.sha}->trail-${pSha}`,
          d: `M ${fromX} ${fromY} L ${fromX} ${fromY + 36}`,
          color: BRANCH_COLORS[cCol % BRANCH_COLORS.length],
        });
      }
    });
  });

  const graphWidth = Math.max(28, (maxCol + 1) * 14 + 16);
  const graphHeight = Math.max(36, commits.length * 36);

  return { nodes, edges, graphWidth, graphHeight };
}

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
      }}
    >
      {/* 1. 严格闭环连接的拓扑曲线 */}
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

      {/* 2. 节点圆点 (精准对齐每行 Commit) */}
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

            {n.isHead && <circle cx={n.cx} cy={n.cy} r={1.8} fill="var(--surface)" />}
          </g>
        );
      })}
    </svg>
  );
};
