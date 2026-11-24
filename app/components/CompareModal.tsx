/* Large side-by-side view: the product photo vs the try-on image made from it. */
import type { ReactNode } from "react";
import { Badge, BlockStack, Box, InlineGrid, InlineStack, Modal, Text } from "@shopify/polaris";
import type { AssetView } from "@prisma/client";
import { withWidth } from "../lib/shared";

const CHECKER = "repeating-conic-gradient(#e9e9e9 0 25%, #ffffff 0 50%) 0 0 / 20px 20px";

interface CompareModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  photo: string | null;
  tryon: string | null;
  view: AssetView;
}

export function CompareModal({ open, onClose, title, photo, tryon, view }: CompareModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="large">
      <Modal.Section>
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Pane label="Product photo" note="Original image from Shopify" src={photo ? withWidth(photo, 1200) : null} />
          <Pane
            label="Try-on image"
            note={tryon ? "Checkerboard = transparent" : "Not generated yet"}
            src={tryon}
            checker
            badge={tryon && (
              <Badge tone={view === "top" ? "success" : "info"}>
                {view === "top" ? "Top view · wraps the finger" : "Photo angle · flat"}
              </Badge>
            )}
          />
        </InlineGrid>
      </Modal.Section>
    </Modal>
  );
}

interface PaneProps { label: string; note: string; src: string | null; checker?: boolean; badge?: ReactNode }

function Pane({ label, note, src, checker = false, badge }: PaneProps) {
  return (
    <BlockStack gap="200">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="h3" variant="headingSm">{label}</Text>
        {badge}
      </InlineStack>
      <Box borderRadius="200" borderWidth="025" borderColor="border" overflowX="hidden" overflowY="hidden">
        <div style={{ background: checker ? CHECKER : "#fff", minHeight: 360, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {src ? (
            <a href={src} target="_blank" rel="noreferrer" title="Open full size in a new tab">
              <img src={src} alt={label} style={{ maxWidth: "100%", maxHeight: "60vh", display: "block" }} />
            </a>
          ) : (
            <Text as="p" tone="subdued">—</Text>
          )}
        </div>
      </Box>
      <Text as="p" variant="bodySm" tone="subdued">{note}{src ? " · click to open full size" : ""}</Text>
    </BlockStack>
  );
}


interface ClickableThumbProps { src: string | null; alt: string; onClick: () => void; size?: number }

/** A thumbnail that opens the comparison when clicked. */
export function ClickableThumb({ src, alt, onClick, size = 48 }: ClickableThumbProps) {
  if (!src) return <Text as="span" tone="subdued">—</Text>;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title="Click to compare"
      style={{ padding: 0, border: "1px solid #e3e3e3", borderRadius: 8, background: CHECKER, cursor: "zoom-in", width: size, height: size, overflow: "hidden" }}
    >
      <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
    </button>
  );
}
