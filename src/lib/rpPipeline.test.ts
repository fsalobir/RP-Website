import { describe, expect, it } from "vitest";
import {
  collectFactualNumbers,
  containsNsfwContent,
  estimateRoleplayDate,
  getD100Outcome,
  parseAndValidateMagnumOutput,
  selectLoreContext,
} from "@/lib/rpPipeline";
import type { LoreArticle } from "@/types/rpPipeline";

describe("pipeline RP", () => {
  it("respecte chaque frontière du D100", () => {
    expect([1, 2, 24, 25, 49, 50, 74, 75, 99, 100].map(getD100Outcome)).toEqual([
      "critical_failure",
      "major_failure",
      "major_failure",
      "minor_failure",
      "minor_failure",
      "minor_success",
      "minor_success",
      "major_success",
      "major_success",
      "critical_success",
    ]);
    expect(() => getD100Outcome(0)).toThrow(RangeError);
  });

  it("interpole entre deux ancres et gèle après la dernière pendant une pause", () => {
    const anchors = [
      { real_timestamp: "2026-07-01T00:00:00Z", roleplay_month: 5, roleplay_year: 2040 },
      { real_timestamp: "2026-08-01T00:00:00Z", roleplay_month: 6, roleplay_year: 2040 },
    ];
    expect(
      estimateRoleplayDate({ anchors, at: "2026-07-16T12:00:00Z", cadenceDaysPerMonth: 31 })?.iso,
    ).toBe("2040-05-16");
    expect(
      estimateRoleplayDate({ anchors, at: "2026-08-20T00:00:00Z", cadenceDaysPerMonth: 31, paused: true })?.iso,
    ).toBe("2040-06-01");
  });

  it("gère une cadence extrapolée et une date réelle antérieure aux ancres", () => {
    const anchors = [{ real_timestamp: "2026-07-01T00:00:00Z", roleplay_month: 7, roleplay_year: 2040 }];
    expect(
      estimateRoleplayDate({ anchors, at: "2026-07-06T00:00:00Z", cadenceDaysPerMonth: 10 })?.iso,
    ).toBe("2040-07-16");
    expect(
      estimateRoleplayDate({ anchors, at: "2026-06-01T00:00:00Z", cadenceDaysPerMonth: 10 })?.iso,
    ).toBe("2040-07-01");
  });

  it("privilégie l'autorité tout en excluant suppression et quarantaine", () => {
    const base: LoreArticle = {
      id: "player",
      source_kind: "player",
      source_platform: "discord",
      action_id: null,
      countries: [{ country_id: "fr", relation_role: "author" }],
      tags: ["diplomatie"],
      rp_year: 2040,
      rp_month: 5,
      rp_day: 1,
      rp_week: 1,
      real_published_at: "2026-07-01T00:00:00Z",
      title: "Titre",
      description: "x",
      raw_content: "x",
      clean_content: "x".repeat(100),
      current_output: {},
      embeds: [],
      links: [],
      discord_channel_id: "1",
      discord_message_id: "1",
      editorial_status: "approved",
      deleted_at: null,
      nsfw_quarantined: false,
    };
    const official = { ...base, id: "official", source_kind: "official" as const };
    const quarantined = { ...base, id: "bad", source_kind: "engine" as const, nsfw_quarantined: true };
    expect(selectLoreContext([base, official, quarantined], { countryIds: ["fr"], maxArticles: 2 }).articles.map(({ id }) => id))
      .toEqual(["official", "player"]);
  });

  it("privilégie la pertinence directe avant l'autorité régionale", () => {
    const direct = {
      id: "direct",
      source_kind: "official" as const,
      source_platform: "discord" as const,
      action_id: null,
      countries: [{ country_id: "fr", relation_role: "author" as const }],
      tags: [],
      rp_year: 2040,
      rp_month: 5,
      rp_day: 1,
      rp_week: 1,
      real_published_at: "2026-07-01T00:00:00Z",
      title: "Direct",
      description: "x",
      raw_content: "x",
      clean_content: "x",
      current_output: {},
      embeds: [],
      links: [],
      discord_channel_id: "1",
      discord_message_id: "1",
      editorial_status: "approved" as const,
      deleted_at: null,
      nsfw_quarantined: false,
    };
    const regionalMj = {
      ...direct,
      id: "regional",
      source_kind: "mj" as const,
      countries: [{ country_id: "jp", relation_role: "author" as const, continent_id: "europe" }],
    };
    expect(
      selectLoreContext([regionalMj, direct], {
        countryIds: ["fr"],
        regionIds: ["europe"],
        maxArticles: 1,
      }).articles[0]?.id,
    ).toBe("direct");
  });

  it("rejette les champs, mentions, nombres et contenus NSFW non autorisés", () => {
    const valid = JSON.stringify({
      title: "Accord régional",
      description: "La France confirme une coopération prudente. ".repeat(11),
    });
    expect(parseAndValidateMagnumOutput(valid, { profile: "brief", allowedCountries: ["France"] }).errors).toEqual([]);
    expect(parseAndValidateMagnumOutput(valid, { profile: "brief", allowedCountries: ["Japon"] }).errors)
      .toContain("Aucun pays autorisé n'est mentionné.");
    const invalid = JSON.stringify({
      title: "@everyone",
      description: `${"Une annonce. ".repeat(35)} 42 nsfw`,
      channel_id: "123",
    });
    expect(parseAndValidateMagnumOutput(invalid, { profile: "brief" }).errors.length).toBeGreaterThan(2);
    expect(
      parseAndValidateMagnumOutput(
        JSON.stringify({
          title: "Revers confirmé",
          description: `${"La France publie un bilan prudent. ".repeat(12)} Échec majeur.`,
        }),
        { profile: "brief", allowedCountries: ["France"] },
      ).errors,
    ).toContain("Fait mécanique interdit.");
    expect(containsNsfwContent("Une violation du traité")).toBe(false);
    expect(containsNsfwContent("Un accord violé")).toBe(false);
    expect(containsNsfwContent("Un viol")).toBe(true);
    expect(
      parseAndValidateMagnumOutput(valid, {
        profile: "brief",
        allowedCountries: ["France"],
        knownCountries: ["France", "Allemagne"],
      }).errors,
    ).toEqual([]);
    expect(
      parseAndValidateMagnumOutput(
        JSON.stringify({
          title: "Accord régional",
          description: "La France et l’Allemagne confirment une coopération prudente. ".repeat(9),
        }),
        {
          profile: "brief",
          allowedCountries: ["France"],
          knownCountries: ["France", "Allemagne"],
        },
      ).errors,
    ).toContain("Pays absents des faits : Allemagne.");
    expect(
      [...collectFactualNumbers({
        action_id: "42000000-1234-5678-9abc-999999999999",
        date_rp: "2040-05-01",
        fait: "3 signataires",
      })],
    ).toEqual(expect.arrayContaining(["2040", "5", "1", "3"]));
  });
});
