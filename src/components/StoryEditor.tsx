import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { MentionInput } from "@/components/MentionInput";
import {
  X, Type, Smile, Sticker, Palette, Pencil, Undo, Download,
  AlignLeft, AlignCenter, AlignRight, Bold, Italic, ChevronLeft, ChevronRight
} from "lucide-react";

// Filter presets
const FILTERS = [
  { name: "Normal", class: "", style: {} },
  { name: "Clarendon", class: "brightness-125 contrast-110 saturate-130", style: { filter: "brightness(1.25) contrast(1.1) saturate(1.3)" } },
  { name: "Gingham", class: "", style: { filter: "brightness(1.05) sepia(0.1) hue-rotate(-10deg)" } },
  { name: "Moon", class: "", style: { filter: "grayscale(1) brightness(1.1) contrast(1.1)" } },
  { name: "Lark", class: "", style: { filter: "brightness(1.1) contrast(0.9) saturate(1.2)" } },
  { name: "Reyes", class: "", style: { filter: "brightness(1.1) contrast(0.85) saturate(0.75) sepia(0.22)" } },
  { name: "Juno", class: "", style: { filter: "brightness(1.1) contrast(1.15) saturate(1.4)" } },
  { name: "Slumber", class: "", style: { filter: "brightness(1.05) saturate(0.66) sepia(0.2)" } },
  { name: "Crema", class: "", style: { filter: "brightness(1.05) contrast(0.95) saturate(0.9) sepia(0.1)" } },
  { name: "Ludwig", class: "", style: { filter: "brightness(1.05) contrast(1.05) saturate(1.2)" } },
  { name: "Aden", class: "", style: { filter: "brightness(1.2) contrast(0.9) saturate(0.85) hue-rotate(20deg)" } },
  { name: "Perpetua", class: "", style: { filter: "brightness(1.05) contrast(1.1) saturate(1.1)" } },
];

// Popular stickers/emojis
const STICKERS = ["❤️", "🔥", "😍", "🎉", "✨", "💯", "🙌", "👏", "😂", "🥰", "💕", "⭐", "🌟", "💫", "🎊", "🎁", "🏆", "👑", "💎", "🦋"];

// Text fonts
const FONTS = [
  { name: "Classic", value: "sans-serif" },
  { name: "Modern", value: "'Helvetica Neue', sans-serif" },
  { name: "Typewriter", value: "'Courier New', monospace" },
  { name: "Neon", value: "'Arial Black', sans-serif" },
  { name: "Strong", value: "'Impact', sans-serif" },
];

// Text colors
const TEXT_COLORS = [
  "#FFFFFF", "#000000", "#FF0000", "#00FF00", "#0000FF", 
  "#FFFF00", "#FF00FF", "#00FFFF", "#FF6B6B", "#4ECDC4",
  "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8"
];

// Background colors for text
const BG_COLORS = [
  "transparent", "#000000", "#FFFFFF", "#FF0000", "#00FF00", 
  "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF"
];

interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  bgColor: string;
  font: string;
  align: "left" | "center" | "right";
  bold: boolean;
  italic: boolean;
  rotation: number;
}

interface StickerOverlay {
  id: string;
  emoji: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
}

interface DrawPath {
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

interface StoryEditorProps {
  file: File;
  previewUrl: string;
  onSave: (editedImageBlob: Blob) => void;
  onCancel: () => void;
}

export function StoryEditor({ file, previewUrl, onSave, onCancel }: StoryEditorProps) {
  const [activeFilter, setActiveFilter] = useState(0);
  const [activeTab, setActiveTab] = useState<"filters" | "text" | "stickers" | "draw" | null>(null);
  
  // Text overlays
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [textBgColor, setTextBgColor] = useState("transparent");
  const [textFont, setTextFont] = useState(FONTS[0].value);
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right">("center");
  const [textBold, setTextBold] = useState(false);
  const [textItalic, setTextItalic] = useState(false);
  const [textSize, setTextSize] = useState(24);
  
  // Sticker overlays
  const [stickerOverlays, setStickerOverlays] = useState<StickerOverlay[]>([]);
  
  // Drawing
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPaths, setDrawPaths] = useState<DrawPath[]>([]);
  const [currentPath, setCurrentPath] = useState<DrawPath | null>(null);
  const [drawColor, setDrawColor] = useState("#FF0000");
  const [drawWidth, setDrawWidth] = useState(5);
  
  // Dragging
  const [draggingItem, setDraggingItem] = useState<{ type: "text" | "sticker"; id: string } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  
  // Mouse position for cursor indicator
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  const isVideo = file.type.startsWith("video/");

  // Redraw the drawing canvas whenever paths change
  useEffect(() => {
    const canvas = drawCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Set canvas size to match container
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all paths
    [...drawPaths, currentPath].filter(Boolean).forEach(path => {
      if (!path || path.points.length < 2) return;
      
      ctx.beginPath();
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const startX = (path.points[0].x / 100) * canvas.width;
      const startY = (path.points[0].y / 100) * canvas.height;
      ctx.moveTo(startX, startY);

      for (let i = 1; i < path.points.length; i++) {
        const x = (path.points[i].x / 100) * canvas.width;
        const y = (path.points[i].y / 100) * canvas.height;
        ctx.lineTo(x, y);
      }

      ctx.stroke();
    });
  }, [drawPaths, currentPath]);

  // Resize canvas when container resizes
  useEffect(() => {
    const handleResize = () => {
      const canvas = drawCanvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    window.addEventListener("resize", handleResize);
    // Initial size
    setTimeout(handleResize, 100);
    
    return () => window.removeEventListener("resize", handleResize);
  }, []);


  // Add new text overlay
  const addTextOverlay = () => {
    if (!newText.trim()) return;
    
    const newOverlay: TextOverlay = {
      id: Date.now().toString(),
      text: newText,
      x: 50,
      y: 50,
      fontSize: textSize,
      color: textColor,
      bgColor: textBgColor,
      font: textFont,
      align: textAlign,
      bold: textBold,
      italic: textItalic,
      rotation: 0
    };
    
    setTextOverlays(prev => [...prev, newOverlay]);
    setNewText("");
  };

  // Add sticker overlay
  const addStickerOverlay = (emoji: string) => {
    const newSticker: StickerOverlay = {
      id: Date.now().toString(),
      emoji,
      x: 50,
      y: 50,
      size: 48,
      rotation: 0
    };
    
    setStickerOverlays(prev => [...prev, newSticker]);
  };

  // Handle mouse/touch events for dragging
  const handleMouseDown = (e: React.MouseEvent, type: "text" | "sticker", id: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const item = type === "text" 
      ? textOverlays.find(t => t.id === id)
      : stickerOverlays.find(s => s.id === id);
    
    if (!item) return;
    
    const mouseX = ((e.clientX - rect.left) / rect.width) * 100;
    const mouseY = ((e.clientY - rect.top) / rect.height) * 100;
    
    setDraggingItem({ type, id });
    setDragOffset({ x: mouseX - item.x, y: mouseY - item.y });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingItem || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100 - dragOffset.x));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100 - dragOffset.y));
    
    if (draggingItem.type === "text") {
      setTextOverlays(prev => prev.map(t => 
        t.id === draggingItem.id ? { ...t, x, y } : t
      ));
    } else {
      setStickerOverlays(prev => prev.map(s => 
        s.id === draggingItem.id ? { ...s, x, y } : s
      ));
    }
  }, [draggingItem, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setDraggingItem(null);
  }, []);

  useEffect(() => {
    if (draggingItem) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [draggingItem, handleMouseMove, handleMouseUp]);

  // Drawing handlers
  const getMousePosition = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    return { x, y };
  };

  const handleDrawStart = (e: React.MouseEvent) => {
    if (activeTab !== "draw") return;
    e.preventDefault();
    
    const pos = getMousePosition(e);
    setMousePos(pos);
    setIsDrawing(true);
    setCurrentPath({
      points: [pos],
      color: drawColor,
      width: drawWidth
    });
  };

  const handleDrawMove = (e: React.MouseEvent) => {
    const pos = getMousePosition(e);
    setMousePos(pos);
    
    if (!isDrawing || !currentPath || activeTab !== "draw") return;
    
    setCurrentPath(prev => prev ? {
      ...prev,
      points: [...prev.points, pos]
    } : null);
  };

  const handleDrawEnd = () => {
    if (currentPath && currentPath.points.length > 1) {
      setDrawPaths(prev => [...prev, currentPath]);
    }
    setIsDrawing(false);
    setCurrentPath(null);
  };

  // Undo last action
  const handleUndo = () => {
    if (drawPaths.length > 0) {
      setDrawPaths(prev => prev.slice(0, -1));
    } else if (stickerOverlays.length > 0) {
      setStickerOverlays(prev => prev.slice(0, -1));
    } else if (textOverlays.length > 0) {
      setTextOverlays(prev => prev.slice(0, -1));
    }
  };

  // Delete text overlay
  const deleteTextOverlay = (id: string) => {
    setTextOverlays(prev => prev.filter(t => t.id !== id));
    setEditingTextId(null);
  };

  // Delete sticker overlay
  const deleteStickerOverlay = (id: string) => {
    setStickerOverlays(prev => prev.filter(s => s.id !== id));
  };

  // Export edited image
  const handleSave = async () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    canvas.width = 1080;
    canvas.height = 1920;

    // Draw image with filter
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = previewUrl;
    
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    // Apply filter
    ctx.filter = FILTERS[activeFilter].style.filter || "none";
    
    // Calculate aspect ratio fit
    const imgRatio = img.width / img.height;
    const canvasRatio = canvas.width / canvas.height;
    let drawWidth, drawHeight, drawX, drawY;
    
    if (imgRatio > canvasRatio) {
      drawHeight = canvas.height;
      drawWidth = drawHeight * imgRatio;
      drawX = (canvas.width - drawWidth) / 2;
      drawY = 0;
    } else {
      drawWidth = canvas.width;
      drawHeight = drawWidth / imgRatio;
      drawX = 0;
      drawY = (canvas.height - drawHeight) / 2;
    }
    
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    ctx.filter = "none";

    // Draw paths
    drawPaths.forEach(path => {
      if (path.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.width * 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      
      const startX = (path.points[0].x / 100) * canvas.width;
      const startY = (path.points[0].y / 100) * canvas.height;
      ctx.moveTo(startX, startY);
      
      path.points.forEach(point => {
        const x = (point.x / 100) * canvas.width;
        const y = (point.y / 100) * canvas.height;
        ctx.lineTo(x, y);
      });
      
      ctx.stroke();
    });

    // Draw text overlays
    textOverlays.forEach(overlay => {
      const x = (overlay.x / 100) * canvas.width;
      const y = (overlay.y / 100) * canvas.height;
      const fontSize = overlay.fontSize * 3;
      
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((overlay.rotation * Math.PI) / 180);
      
      let fontStyle = "";
      if (overlay.bold) fontStyle += "bold ";
      if (overlay.italic) fontStyle += "italic ";
      ctx.font = `${fontStyle}${fontSize}px ${overlay.font}`;
      ctx.textAlign = overlay.align;
      ctx.textBaseline = "middle";
      
      // Draw background
      if (overlay.bgColor !== "transparent") {
        const metrics = ctx.measureText(overlay.text);
        const padding = 10;
        ctx.fillStyle = overlay.bgColor;
        ctx.fillRect(
          -metrics.width / 2 - padding,
          -fontSize / 2 - padding,
          metrics.width + padding * 2,
          fontSize + padding * 2
        );
      }
      
      // Draw text
      ctx.fillStyle = overlay.color;
      ctx.fillText(overlay.text, 0, 0);
      
      ctx.restore();
    });

    // Draw stickers
    stickerOverlays.forEach(sticker => {
      const x = (sticker.x / 100) * canvas.width;
      const y = (sticker.y / 100) * canvas.height;
      const size = sticker.size * 3;
      
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((sticker.rotation * Math.PI) / 180);
      ctx.font = `${size}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(sticker.emoji, 0, 0);
      ctx.restore();
    });

    // Convert to blob
    canvas.toBlob((blob) => {
      if (blob) {
        onSave(blob);
      }
    }, "image/jpeg", 0.95);
  };


  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Hidden canvas for export */}
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/50">
        <Button variant="ghost" size="icon" onClick={onCancel} className="text-white">
          <X className="h-6 w-6" />
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={handleUndo} className="text-white">
            <Undo className="h-5 w-5" />
          </Button>
          <Button onClick={handleSave} className="bg-blue-500 hover:bg-blue-600 text-white">
            Share Story
          </Button>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div 
          ref={containerRef}
          className={`relative w-full max-w-[400px] aspect-[9/16] bg-black rounded-lg overflow-hidden ${activeTab === "draw" ? "cursor-none" : ""}`}
          onMouseDown={activeTab === "draw" ? handleDrawStart : undefined}
          onMouseMove={handleDrawMove}
          onMouseUp={activeTab === "draw" ? handleDrawEnd : undefined}
          onMouseLeave={activeTab === "draw" ? handleDrawEnd : undefined}
        >
          {/* Media with filter */}
          {isVideo ? (
            <video 
              src={previewUrl} 
              className="w-full h-full object-cover"
              style={FILTERS[activeFilter].style}
              autoPlay
              loop
              muted
            />
          ) : (
            <img 
              ref={imageRef}
              src={previewUrl} 
              alt="Story" 
              className="w-full h-full object-cover"
              style={FILTERS[activeFilter].style}
            />
          )}

          {/* Drawing canvas */}
          <canvas
            ref={drawCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ mixBlendMode: 'normal' }}
          />

          {/* Text overlays */}
          {textOverlays.map(overlay => (
            <div
              key={overlay.id}
              className="absolute cursor-move select-none"
              style={{
                left: `${overlay.x}%`,
                top: `${overlay.y}%`,
                transform: `translate(-50%, -50%) rotate(${overlay.rotation}deg)`,
                fontSize: `${overlay.fontSize}px`,
                color: overlay.color,
                backgroundColor: overlay.bgColor,
                fontFamily: overlay.font,
                fontWeight: overlay.bold ? "bold" : "normal",
                fontStyle: overlay.italic ? "italic" : "normal",
                textAlign: overlay.align,
                padding: overlay.bgColor !== "transparent" ? "4px 8px" : 0,
                borderRadius: "4px",
                whiteSpace: "nowrap"
              }}
              onMouseDown={(e) => handleMouseDown(e, "text", overlay.id)}
              onDoubleClick={() => deleteTextOverlay(overlay.id)}
            >
              {overlay.text}
            </div>
          ))}

          {/* Sticker overlays */}
          {stickerOverlays.map(sticker => (
            <div
              key={sticker.id}
              className="absolute cursor-move select-none"
              style={{
                left: `${sticker.x}%`,
                top: `${sticker.y}%`,
                transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)`,
                fontSize: `${sticker.size}px`
              }}
              onMouseDown={(e) => handleMouseDown(e, "sticker", sticker.id)}
              onDoubleClick={() => deleteStickerOverlay(sticker.id)}
            >
              {sticker.emoji}
            </div>
          ))}

          {/* Draw cursor indicator */}
          {activeTab === "draw" && (
            <div 
              className="absolute pointer-events-none z-50 transition-all duration-75"
              style={{
                left: `${mousePos.x}%`,
                top: `${mousePos.y}%`,
                width: `${drawWidth}px`,
                height: `${drawWidth}px`,
                borderRadius: "50%",
                border: `2px solid white`,
                backgroundColor: drawColor,
                transform: "translate(-50%, -50%)",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.3)"
              }}
            />
          )}
        </div>
      </div>

      {/* Tool Tabs */}
      <div className="flex justify-center gap-6 p-4 bg-black/50">
        <button
          onClick={() => setActiveTab(activeTab === "filters" ? null : "filters")}
          className={`flex flex-col items-center gap-1 ${activeTab === "filters" ? "text-blue-500" : "text-white"}`}
        >
          <Palette className="h-6 w-6" />
          <span className="text-xs">Filters</span>
        </button>
        <button
          onClick={() => setActiveTab(activeTab === "text" ? null : "text")}
          className={`flex flex-col items-center gap-1 ${activeTab === "text" ? "text-blue-500" : "text-white"}`}
        >
          <Type className="h-6 w-6" />
          <span className="text-xs">Text</span>
        </button>
        <button
          onClick={() => setActiveTab(activeTab === "stickers" ? null : "stickers")}
          className={`flex flex-col items-center gap-1 ${activeTab === "stickers" ? "text-blue-500" : "text-white"}`}
        >
          <Smile className="h-6 w-6" />
          <span className="text-xs">Stickers</span>
        </button>
        <button
          onClick={() => setActiveTab(activeTab === "draw" ? null : "draw")}
          className={`flex flex-col items-center gap-1 ${activeTab === "draw" ? "text-blue-500" : "text-white"}`}
        >
          <Pencil className="h-6 w-6" />
          <span className="text-xs">Draw</span>
        </button>
      </div>

      {/* Tool Panels */}
      {activeTab && (
        <div className="bg-zinc-900 p-4 max-h-[300px] overflow-y-auto">
          {/* Filters Panel */}
          {activeTab === "filters" && (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {FILTERS.map((filter, index) => (
                <button
                  key={filter.name}
                  onClick={() => setActiveFilter(index)}
                  className={`flex-shrink-0 flex flex-col items-center gap-1 ${activeFilter === index ? "opacity-100" : "opacity-60"}`}
                >
                  <div 
                    className="w-16 h-16 rounded-lg overflow-hidden border-2"
                    style={{ borderColor: activeFilter === index ? "#3b82f6" : "transparent" }}
                  >
                    <img 
                      src={previewUrl} 
                      alt={filter.name}
                      className="w-full h-full object-cover"
                      style={filter.style}
                    />
                  </div>
                  <span className="text-xs text-white">{filter.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Text Panel */}
          {activeTab === "text" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <MentionInput
                  value={newText}
                  onChange={(val) => setNewText(val)}
                  placeholder="Type your text or @mention..."
                  className="flex-1 bg-zinc-800 border-zinc-700 text-white"
                  onKeyPress={(e) => e.key === "Enter" && addTextOverlay()}
                />
                <Button onClick={addTextOverlay} disabled={!newText.trim()}>
                  Add
                </Button>
              </div>
              
              {/* Font selection */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                {FONTS.map(font => (
                  <button
                    key={font.name}
                    onClick={() => setTextFont(font.value)}
                    className={`px-3 py-1 rounded text-sm whitespace-nowrap ${textFont === font.value ? "bg-blue-500 text-white" : "bg-zinc-800 text-white"}`}
                    style={{ fontFamily: font.value }}
                  >
                    {font.name}
                  </button>
                ))}
              </div>

              {/* Text styling */}
              <div className="flex items-center gap-4">
                <div className="flex gap-1">
                  <button
                    onClick={() => setTextAlign("left")}
                    className={`p-2 rounded ${textAlign === "left" ? "bg-blue-500" : "bg-zinc-800"}`}
                  >
                    <AlignLeft className="h-4 w-4 text-white" />
                  </button>
                  <button
                    onClick={() => setTextAlign("center")}
                    className={`p-2 rounded ${textAlign === "center" ? "bg-blue-500" : "bg-zinc-800"}`}
                  >
                    <AlignCenter className="h-4 w-4 text-white" />
                  </button>
                  <button
                    onClick={() => setTextAlign("right")}
                    className={`p-2 rounded ${textAlign === "right" ? "bg-blue-500" : "bg-zinc-800"}`}
                  >
                    <AlignRight className="h-4 w-4 text-white" />
                  </button>
                </div>
                <button
                  onClick={() => setTextBold(!textBold)}
                  className={`p-2 rounded ${textBold ? "bg-blue-500" : "bg-zinc-800"}`}
                >
                  <Bold className="h-4 w-4 text-white" />
                </button>
                <button
                  onClick={() => setTextItalic(!textItalic)}
                  className={`p-2 rounded ${textItalic ? "bg-blue-500" : "bg-zinc-800"}`}
                >
                  <Italic className="h-4 w-4 text-white" />
                </button>
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-xs text-white">Size</span>
                  <Slider
                    value={[textSize]}
                    onValueChange={([val]) => setTextSize(val)}
                    min={12}
                    max={72}
                    step={2}
                    className="flex-1"
                  />
                </div>
              </div>

              {/* Text colors */}
              <div>
                <span className="text-xs text-white mb-2 block">Text Color</span>
                <div className="flex gap-2 flex-wrap">
                  {TEXT_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setTextColor(color)}
                      className={`w-8 h-8 rounded-full border-2 ${textColor === color ? "border-blue-500" : "border-transparent"}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Background colors */}
              <div>
                <span className="text-xs text-white mb-2 block">Background</span>
                <div className="flex gap-2 flex-wrap">
                  {BG_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setTextBgColor(color)}
                      className={`w-8 h-8 rounded-full border-2 ${textBgColor === color ? "border-blue-500" : "border-zinc-600"}`}
                      style={{ backgroundColor: color === "transparent" ? "transparent" : color }}
                    >
                      {color === "transparent" && <X className="h-4 w-4 text-white m-auto" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Stickers Panel */}
          {activeTab === "stickers" && (
            <div className="grid grid-cols-8 gap-2">
              {STICKERS.map((emoji, index) => (
                <button
                  key={index}
                  onClick={() => addStickerOverlay(emoji)}
                  className="text-3xl p-2 hover:bg-zinc-800 rounded transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Draw Panel */}
          {activeTab === "draw" && (
            <div className="space-y-4">
              <div>
                <span className="text-xs text-white mb-2 block">Brush Color</span>
                <div className="flex gap-2 flex-wrap">
                  {TEXT_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setDrawColor(color)}
                      className={`w-8 h-8 rounded-full border-2 ${drawColor === color ? "border-blue-500" : "border-transparent"}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white">Brush Size</span>
                  <span className="text-xs text-zinc-400">{drawWidth}px</span>
                </div>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[drawWidth]}
                    onValueChange={([val]) => setDrawWidth(val)}
                    min={4}
                    max={40}
                    step={2}
                    className="flex-1"
                  />
                  <div 
                    className="rounded-full border border-white/30 flex-shrink-0"
                    style={{ 
                      width: `${Math.max(drawWidth, 20)}px`, 
                      height: `${Math.max(drawWidth, 20)}px`, 
                      backgroundColor: drawColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <div 
                      className="rounded-full bg-white"
                      style={{
                        width: `${drawWidth}px`,
                        height: `${drawWidth}px`,
                        backgroundColor: drawColor,
                        boxShadow: '0 0 0 2px white'
                      }}
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-zinc-400">
                Draw on the image with your finger or mouse. Double-click text or stickers to delete them.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
