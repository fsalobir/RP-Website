import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { validateAdminPlanActions } from "./adminActionRegistry";

const countryId = "11111111-1111-4111-8111-111111111111";
const unitId = "22222222-2222-4222-8222-222222222222";

describe("registre fermé des actions admin", () => {
  it("refuse une action, une table ou un champ libres", () => {
    expect(() => validateAdminPlanActions([{
      id: "sql.execute", parameters: { sql: "delete from countries" }, reason: "test", risk: "isolated",
    }])).toThrow(/non autorisée/i);
    expect(() => validateAdminPlanActions([{
      id: "country.update",
      parameters: { countryId, values: { name: "France", table: "admins" } },
      reason: "test", risk: "reversible",
    }])).toThrow(/champ non autorisé/i);
    expect(() => validateAdminPlanActions([{
      id: "country.delete", parameters: { countryId, command: "Remove-Item" }, reason: "test", risk: "isolated",
    }])).toThrow(/paramètre non autorisé/i);
  });

  it("refuse les champs militaires absents de l'interface", () => {
    expect(() => validateAdminPlanActions([{
      id: "country.military.update",
      parameters: { countryId, rosterUnitId: unitId, values: { current_level: 100, extra_count: 2, stock_points: 999 } },
      reason: "test", risk: "reversible",
    }])).toThrow(/champ non autorisé/i);
  });

  it("isole toujours une opération destructrice ou externe", () => {
    expect(() => validateAdminPlanActions([
      { id: "country.delete", parameters: { countryId }, reason: "test", risk: "isolated" },
      { id: "country.update", parameters: { countryId, values: { name: "France" } }, reason: "test", risk: "reversible" },
    ])).toThrow(/isolée/i);
    expect(() => validateAdminPlanActions([{
      id: "roster.unit.delete", parameters: { rosterUnitId: unitId }, reason: "test", risk: "reversible",
    }])).toThrow(/risque incorrect/i);
  });

  it("valide aussi le contenu des paramètres JSON typés", () => {
    expect(() => validateAdminPlanActions([{
      id: "rp.article.review",
      parameters: { article_id: countryId, title: "Titre", description: "trop court", sections: [] },
      reason: "test", risk: "isolated",
    }])).toThrow(/100 caractères/i);
    expect(() => validateAdminPlanActions([{
      id: "rp.automation.update",
      parameters: { action_type_id: countryId, config: { weight: 1, commande: "libre" } },
      reason: "test", risk: "isolated",
    }])).toThrow(/non autorisé/i);
  });
});
