import type { GuideNetworkGroup, GuideNetworkRow } from "./channels";
import type { GuidePayload, GuideProgram } from "./guide-response";
import { packWatchItemLists, unpackWatchItemLists, type WatchItemPayload } from "./item-payload";
import type { WatchItem } from "./types";

type PackedNetwork = Omit<GuideNetworkGroup, "rows"> & { rows: Omit<GuideNetworkRow, "items">[] };
export type CompactGuidePayload = Omit<GuidePayload, "programs" | "networks"> & {
  format: "compact-v1";
  programs: Array<Omit<GuideProgram, "watchItem"> & { watchItem?: number }>;
  networks?: PackedNetwork[];
  itemPayload: WatchItemPayload;
};

/** Programs and network rows share one archive, including exact provider URLs. */
export function packGuidePayload({ programs, networks, ...metadata }: GuidePayload): CompactGuidePayload {
  const programItems: WatchItem[] = [];
  const packedPrograms = programs.map(({ watchItem, ...program }) => {
    if (!watchItem) return program;
    const index = programItems.push(watchItem) - 1;
    return { ...program, watchItem: index };
  });
  const lists: Record<string, WatchItem[]> = { programs: programItems };
  const packedNetworks = networks?.map((group) => ({
    ...group,
    rows: group.rows.map(({ items, ...row }) => {
      lists[`row:${row.id}`] = items;
      return row;
    }),
  }));
  return {
    ...metadata,
    format: "compact-v1",
    programs: packedPrograms,
    ...(packedNetworks ? { networks: packedNetworks } : {}),
    itemPayload: packWatchItemLists(lists),
  };
}

export function unpackGuidePayload({ format: _format, itemPayload, programs, networks, ...metadata }: CompactGuidePayload): GuidePayload {
  const lists = unpackWatchItemLists(itemPayload);
  return {
    ...metadata,
    programs: programs.map(({ watchItem, ...program }) => {
      if (watchItem === undefined) return program;
      const item = lists.programs?.[watchItem];
      if (!Number.isInteger(watchItem) || !item) throw new Error("Invalid guide program reference");
      return { ...program, watchItem: item };
    }),
    ...(networks ? { networks: networks.map((group) => ({
      ...group,
      rows: group.rows.map((row) => {
        const items = lists[`row:${row.id}`];
        if (!items) throw new Error("Invalid guide row reference");
        return { ...row, items };
      }),
    })) } : {}),
  };
}
