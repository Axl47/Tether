import { Schema } from "effect";

export const SIDEBAR_THREAD_SORT_OPTIONS = [
  {
    value: "activity",
    label: "Activity",
    description: "Newest activity first.",
  },
  {
    value: "created",
    label: "Creation",
    description: "Newest threads first.",
  },
  {
    value: "status",
    label: "Status",
    description: "Groups threads by current status.",
  },
  {
    value: "name",
    label: "Name",
    description: "Alphabetical order.",
  },
] as const;

export type SidebarThreadSort = (typeof SIDEBAR_THREAD_SORT_OPTIONS)[number]["value"];

export const DEFAULT_SIDEBAR_THREAD_SORT: SidebarThreadSort = "activity";

export const SidebarThreadSortSchema = Schema.Literals(
  SIDEBAR_THREAD_SORT_OPTIONS.map((option) => option.value),
);
