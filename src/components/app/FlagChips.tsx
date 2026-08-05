import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface FlagChipsProps {
  isGambling?: boolean;
  isCrypto?: boolean;
  isBlacklisted?: boolean;
  className?: string;
}

/** Gambling/crypto/blacklist flag chips -- the single place these render, everywhere a transaction shows them. */
export function FlagChips({ isGambling, isCrypto, isBlacklisted, className }: FlagChipsProps) {
  if (!isGambling && !isCrypto && !isBlacklisted) return null;

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {isGambling && (
        <Badge variant="destructive" className="text-xs">
          Gambling
        </Badge>
      )}
      {isCrypto && (
        <Badge variant="destructive" className="text-xs">
          Crypto
        </Badge>
      )}
      {isBlacklisted && (
        <Badge variant="destructive" className="text-xs">
          Blacklisted
        </Badge>
      )}
    </div>
  );
}
