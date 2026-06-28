'use client';
import React, { useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

export interface GraphNode {
  id: string;
  name: string;
  val: number;
  group: number;
  color?: string;
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface ObsidianGraphViewProps {
  data: GraphData;
}

export default function ObsidianGraphView({ data }: ObsidianGraphViewProps) {
  const fgRef = useRef<any>(null);
  const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoverNode(node);
  }, []);

  const handleZoomIn = () => {
    if (fgRef.current) {
      fgRef.current.zoom(fgRef.current.zoom() * 1.2, 300);
    }
  };

  const handleZoomOut = () => {
    if (fgRef.current) {
      fgRef.current.zoom(fgRef.current.zoom() / 1.2, 300);
    }
  };

  const handleReset = () => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(400, 40);
    }
  };

  return (
    <div className="w-full h-full relative bg-[#090d16] overflow-hidden flex flex-col justify-center items-center">
      {/* Overlay Controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <div className="flex items-center bg-[#0e131f]/90 border border-white/10 rounded-xl p-1.5 shadow-lg backdrop-blur-sm">
          <button
            onClick={handleZoomIn}
            title="Phóng to"
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={handleZoomOut}
            title="Thu nhỏ"
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
            </svg>
          </button>
          <div className="h-4 w-px bg-white/10 mx-1" />
          <button
            onClick={handleReset}
            title="Căn chỉnh vừa màn hình"
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer text-[10px] font-bold px-2.5"
          >
            Căn giữa
          </button>
        </div>
      </div>

      {/* Hover Info Card */}
      {hoverNode && (
        <div className="absolute top-4 right-4 z-10 bg-[#0e131f]/95 border border-[var(--accent,#38bdf8)]/40 px-4 py-2.5 rounded-xl shadow-xl backdrop-blur-md max-w-xs animate-fadeIn">
          <p className="text-[10px] font-bold text-[var(--accent,#38bdf8)] uppercase tracking-wider mb-0.5">
            Khái niệm chọn
          </p>
          <p className="text-xs font-semibold text-white leading-snug">
            {hoverNode.name}
          </p>
        </div>
      )}

      {/* Canvas */}
      <div className="w-full h-full flex items-center justify-center">
        <ForceGraph2D
          ref={fgRef}
          graphData={data}
          backgroundColor="#090d16"
          nodeAutoColorBy="group"
          nodeRelSize={5}
          linkWidth={1.5}
          linkColor={() => 'rgba(56, 189, 248, 0.25)'}
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={0.006}
          linkDirectionalParticleWidth={2.5}
          linkDirectionalParticleColor={() => '#38bdf8'}
          onNodeHover={handleNodeHover as any}
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const label = node.name;
            const fontSize = Math.max(12 / globalScale, 3.5);
            ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;

            const isHovered = hoverNode && hoverNode.id === node.id;
            const nodeRadius = (node.val || 5) * (isHovered ? 1.3 : 1);

            // Glow effect on hover
            if (isHovered) {
              ctx.shadowColor = '#38bdf8';
              ctx.shadowBlur = 15;
            } else {
              ctx.shadowBlur = 0;
            }

            // Draw Node Circle
            ctx.beginPath();
            ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI, false);
            ctx.fillStyle = node.color || (node.group === 0 ? '#38bdf8' : node.group === 1 ? '#818cf8' : '#c084fc');
            ctx.fill();

            // Reset shadow
            ctx.shadowBlur = 0;

            // Draw Node Text Label
            ctx.fillStyle = isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.85)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(label, node.x, node.y + nodeRadius + 3);
          }}
        />
      </div>

      {/* Bottom Tip */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#0e131f]/95 border border-white/5 rounded-full px-4 py-1.5 text-[10px] text-gray-400 shadow-md backdrop-blur-sm flex items-center gap-1.5 select-none pointer-events-none z-10">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
        Rê chuột vào nút để xem thông tin • Kéo rê các nút để trải nghiệm mô phỏng vật lý Obsidian
      </div>
    </div>
  );
}
