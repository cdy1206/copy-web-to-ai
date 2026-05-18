import { ensureRoot, showToast } from "./ui";

export interface RegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}

export function startOcrRegionSelection(): Promise<RegionRect | null> {
  return new Promise((resolve) => {
    const root = ensureRoot();
    const layer = document.createElement("div");
    const box = document.createElement("div");
    const hint = document.createElement("div");

    layer.className = "copytex-plus-ocr-layer";
    box.className = "copytex-plus-ocr-box";
    hint.className = "copytex-plus-ocr-hint";
    hint.textContent = "拖拽框选要 OCR 的可见区域，按 Esc 取消";
    layer.append(box, hint);
    root.append(layer);

    let startX = 0;
    let startY = 0;
    let dragging = false;

    const cleanup = () => {
      layer.remove();
      window.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener("blur", cancel, true);
    };

    const cancel = () => {
      cleanup();
      resolve(null);
    };

    const onKeydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancel();
    };

    const updateBox = (event: PointerEvent) => {
      const rect = makeRect(startX, startY, event.clientX, event.clientY);
      box.style.left = `${rect.x}px`;
      box.style.top = `${rect.y}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
    };

    layer.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      layer.setPointerCapture(event.pointerId);
      updateBox(event);
    });

    layer.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      event.preventDefault();
      updateBox(event);
    });

    layer.addEventListener("pointerup", (event) => {
      if (!dragging) return;
      event.preventDefault();
      dragging = false;
      const rect = makeRect(startX, startY, event.clientX, event.clientY);
      cleanup();
      if (rect.width < 8 || rect.height < 8) {
        showToast("框选区域太小", "error");
        resolve(null);
        return;
      }
      resolve({
        ...rect,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      });
    });

    window.addEventListener("keydown", onKeydown, true);
    window.addEventListener("blur", cancel, true);
  });
}

function makeRect(x1: number, y1: number, x2: number, y2: number): Omit<RegionRect, "viewportWidth" | "viewportHeight"> {
  const left = Math.max(0, Math.min(x1, x2));
  const top = Math.max(0, Math.min(y1, y2));
  const right = Math.min(window.innerWidth, Math.max(x1, x2));
  const bottom = Math.min(window.innerHeight, Math.max(y1, y2));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}
