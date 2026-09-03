import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, initials } from "@/lib/utils";
import type { Person } from "@/types";

const sizeMap = {
  xs: "size-8 text-[10px]",
  sm: "size-10 text-xs",
  md: "size-14 text-sm",
  lg: "size-20 text-lg",
  xl: "size-28 text-2xl",
};

interface PersonAvatarProps {
  person: Pick<Person, "firstName" | "lastName" | "photoUrl" | "isDeceased" | "gender">;
  size?: keyof typeof sizeMap;
  className?: string;
  ring?: boolean;
}

export function PersonAvatar({ person, size = "md", className, ring }: PersonAvatarProps) {
  return (
    <div className={cn("relative shrink-0", className)}>
      <Avatar
        className={cn(
          sizeMap[size],
          ring && "ring-4 ring-background shadow-md",
          person.isDeceased && "grayscale opacity-90",
        )}
      >
        <AvatarImage src={person.photoUrl} alt={`${person.firstName} ${person.lastName}`} />
        <AvatarFallback
          className={cn(
            person.gender === "male" ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary",
          )}
        >
          {initials(person.firstName, person.lastName)}
        </AvatarFallback>
      </Avatar>
    </div>
  );
}
