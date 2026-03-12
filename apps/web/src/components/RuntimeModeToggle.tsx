import type { RuntimeMode } from "@t3tools/contracts";
import { LockIcon, LockOpenIcon } from "lucide-react";

import { Button } from "./ui/button";

interface RuntimeModeToggleProps {
  runtimeMode: RuntimeMode;
  onChange: (mode: RuntimeMode) => void;
  size?: "sm" | "xs";
  className?: string;
}

function nextRuntimeMode(runtimeMode: RuntimeMode): RuntimeMode {
  return runtimeMode === "full-access" ? "approval-required" : "full-access";
}

export default function RuntimeModeToggle({
  runtimeMode,
  onChange,
  size = "sm",
  className,
}: RuntimeModeToggleProps) {
  const isFullAccess = runtimeMode === "full-access";

  return (
    <Button
      variant="ghost"
      className={className}
      size={size}
      type="button"
      onClick={() => onChange(nextRuntimeMode(runtimeMode))}
      title={
        isFullAccess
          ? "Full access — click to require approvals"
          : "Approval required — click for full access"
      }
    >
      {isFullAccess ? <LockOpenIcon /> : <LockIcon />}
      <span className="sr-only sm:not-sr-only">{isFullAccess ? "Full access" : "Supervised"}</span>
    </Button>
  );
}
