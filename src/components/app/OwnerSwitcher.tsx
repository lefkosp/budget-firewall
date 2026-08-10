"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface OwnerOption {
  collaboratorRowId: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerName?: string;
  canApprove: boolean;
}

const SELF_VALUE = "self";

/**
 * Lets a collaborator switch which owner's data the rest of the app shows.
 * Invisible for the common solo-user case (no owners to switch between).
 * Switching does a hard navigation rather than updating shared state --
 * there's no query cache in this app, and every data-fetching page does
 * its own mount-time fetch, so a full remount is the only way to guarantee
 * no page is left showing the previous owner's data.
 */
export function OwnerSwitcher() {
  const { user, actingAs } = useAuth();
  const [owners, setOwners] = useState<OwnerOption[] | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    api
      .get<OwnerOption[]>("/api/collaborators/owners")
      .then(setOwners)
      .catch(() => setOwners([]));
  }, []);

  if (!owners || owners.length === 0) {
    return null;
  }

  const currentValue = actingAs ? actingAs.id : SELF_VALUE;

  async function handleChange(value: string) {
    setSwitching(true);
    try {
      await api.post("/api/me/switch-owner", { ownerUserId: value === SELF_VALUE ? null : value });
      window.location.href = "/dashboard";
    } catch {
      setSwitching(false);
    }
  }

  return (
    <div className="px-2 pb-2">
      <Select value={currentValue} onValueChange={handleChange} disabled={switching}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Viewing" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SELF_VALUE}>{user?.name || "Myself"}</SelectItem>
          {owners.map((owner) => (
            <SelectItem key={owner.ownerUserId} value={owner.ownerUserId}>
              {owner.ownerName || owner.ownerEmail}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
