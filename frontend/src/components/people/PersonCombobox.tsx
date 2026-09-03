import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { PersonAvatar } from "./PersonAvatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { getFamilyByIdSync } from "@/services/api/families";
import { cn, fullName } from "@/lib/utils";
import type { Person } from "@/types";

/** Searchable person picker — village-wide, not scoped to a single family, so a father and mother from two different lineages can each be found and picked independently. */
export function PersonCombobox({
  value,
  onChange,
  people,
  placeholder = "Rechercher un nom…",
  emptyOptionLabel = "Non renseigné·e",
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  people: Person[];
  placeholder?: string;
  emptyOptionLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = people.find((p) => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-10 w-full justify-between font-normal"
        >
          <span className={cn("flex min-w-0 items-center gap-2 truncate", !selected && "text-muted-foreground")}>
            {selected && <PersonAvatar person={selected} size="xs" />}
            <span className="truncate">{selected ? fullName(selected) : emptyOptionLabel}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-0"
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>Personne introuvable.</CommandEmpty>
            <CommandItem
              value={emptyOptionLabel}
              onSelect={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <Check className={cn("size-4", !value ? "opacity-100" : "opacity-0")} />
              <span className="text-muted-foreground">{emptyOptionLabel}</span>
            </CommandItem>
            {people.map((p) => {
              const family = getFamilyByIdSync(p.familyId);
              return (
                <CommandItem
                  key={p.id}
                  value={`${fullName(p)} ${family?.name ?? ""} ${p.matricule}`}
                  onSelect={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4 shrink-0", value === p.id ? "opacity-100" : "opacity-0")} />
                  <PersonAvatar person={p} size="xs" />
                  <span className="min-w-0 flex-1 truncate">{fullName(p)}</span>
                  {family && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {family.name.replace("Famille ", "")}
                    </span>
                  )}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
