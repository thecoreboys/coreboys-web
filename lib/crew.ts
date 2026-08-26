import type { CrewMember } from "@coreboys/shared";

const ROLE_LABELS: Readonly<Record<CrewMember["role"], string>> = {
  cameraman: "Cameraman",
  management: "Management",
  editor: "Editor",
  producer: "Technical Productions",
};

/** Keep functional role grouping separate from a crew member's public title. */
export function getCrewRoleLabel(
  crew: Pick<CrewMember, "role" | "roleLabel">,
): string {
  return crew.roleLabel ?? ROLE_LABELS[crew.role];
}
