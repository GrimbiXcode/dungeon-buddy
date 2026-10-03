import { describe, expect, it } from "vitest";
import { calcCategories, convertText, feetToInput, formatDistance, formatRange, ftToM, inputToFeet, lbToKg, mToFt, parseRangeText } from "./units";
import { attackRange, normalizeAttack } from "./character";

describe("Einheiten", () => {
  it("Spieltisch- und exakte Umrechnung", () => {
    expect(ftToM(30)).toBe(9);
    expect(ftToM(30, "exact")).toBe(9.14);
    expect(mToFt(9)).toBe(30);
    expect(lbToKg(10)).toBe(5);
  });

  it("Anzeige und Eingabe der Bewegungsrate", () => {
    expect(formatDistance(30, "metric")).toBe("9 m");
    expect(formatDistance(25, "metric")).toBe("7.5 m");
    expect(formatDistance(30, "imperial")).toBe("30 ft");
    expect(feetToInput(25, "metric")).toBe(7.5);
    expect(inputToFeet(7.5, "metric")).toBe(25);
    expect(inputToFeet(30, "imperial")).toBe(30);
  });

  it("Freitext nach metrisch", () => {
    expect(convertText("150 feet", "metric")).toBe("45 m");
    expect(convertText("Self (15-foot cone)", "metric")).toBe("Self (4.5-m cone)");
    expect(convertText("a 20-foot-radius sphere", "metric")).toBe("a 6-m-radius sphere");
    expect(convertText("80/320 ft", "metric")).toBe("24/96 m");
    expect(convertText("Reichweite 5ft", "metric")).toBe("Reichweite 1.5 m");
    expect(convertText("1 mile", "metric")).toBe("1.5 km");
    expect(convertText("weighs 10 pounds", "metric")).toBe("weighs 5 kg");
    expect(convertText("Touch", "metric")).toBe("Touch");
  });

  it("Freitext nach imperial", () => {
    expect(convertText("24/96 m", "imperial")).toBe("80/320 ft");
    expect(convertText("eine Kreatur in 9 m", "imperial")).toBe("eine Kreatur in 30 ft");
    expect(convertText("4.5-m-Kegel", "imperial")).toBe("15-ft-Kegel");
    expect(convertText("3 km", "imperial")).toBe("2 mi");
    expect(convertText("4,5 m", "imperial")).toBe("15 ft");
    expect(convertText("1’000 feet", "metric")).toBe("300 m");
    expect(convertText("Montag, 3 Mann", "imperial")).toBe("Montag, 3 Mann");
  });

  it("Rechner zeigt Felder passend zum System", () => {
    expect(calcCategories("metric").some(c => c.key === "squaresMetric")).toBe(true);
    expect(calcCategories("imperial").some(c => c.key === "squaresMetric")).toBe(false);
  });
});

describe("Reichweiten von Waffen", () => {
  it("liest alte Freitext-Angaben", () => {
    expect(parseRangeText("80/320 ft")).toEqual({ normal: 80, long: 320 });
    expect(parseRangeText("5 ft")).toEqual({ normal: 5, long: null });
    expect(parseRangeText("24/96 m")).toEqual({ normal: 80, long: 320 });
    expect(parseRangeText("1,5 m")).toEqual({ normal: 5, long: null });
    expect(parseRangeText("30")).toEqual({ normal: 30, long: null });
    expect(parseRangeText("Berührung")).toBeNull();
  });

  it("zeigt Grund- und Fernreichweite in der gewählten Einheit", () => {
    expect(formatRange(80, 320, "imperial")).toBe("80/320 ft");
    expect(formatRange(80, 320, "metric")).toBe("24/96 m");
    expect(formatRange(5, null, "metric")).toBe("1.5 m");
  });

  it("überträgt alte Angriffe in die neuen Felder", () => {
    const bow = normalizeAttack({ name: "Kurzbogen", kind: "ranged", range: "80/320 ft" });
    expect([bow.rangeNormal, bow.rangeLong, bow.range]).toEqual([80, 320, ""]);
    expect(attackRange(bow, "metric")).toBe("24/96 m");
    const odd = normalizeAttack({ name: "Peitsche", range: "nur mit Weitreichend" });
    expect([odd.rangeNormal, odd.range]).toEqual([null, "nur mit Weitreichend"]);
    expect(attackRange(odd, "imperial")).toBe("nur mit Weitreichend");
    const fresh = normalizeAttack({ name: "Speer", rangeNormal: 20, rangeLong: 60, range: "egal" });
    expect([fresh.rangeNormal, fresh.rangeLong, fresh.range]).toEqual([20, 60, ""]);
  });
});
