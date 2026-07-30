import { describe, expect, it } from "vitest";
import { filterWikiPagesByQuery } from "@/lib/wiki/tree";
import type { WikiPageRow } from "@/lib/wiki/types";

describe("filterWikiPagesByQuery", () => {
  it("trouve un sujet même si la recherche omet les accents", () => {
    const page = {
      id: "1",
      slug: "ideologie",
      title: "Idéologie",
      search_text: "Évolution politique",
    } as WikiPageRow;

    expect(filterWikiPagesByQuery([page], "ideologie")).toEqual([page]);
  });
});
