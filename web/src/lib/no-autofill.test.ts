// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { preventPasswordManagers } from "./no-autofill";

describe("Kein Passwortmanager", () => {
  it("schützt bestehende und später eingefügte Felder", async () => {
    document.body.innerHTML = `<input id="name"><textarea id="desc"></textarea><input id="check" type="checkbox"><input id="code" autocomplete="one-time-code">`;
    const stop = preventPasswordManagers();

    const name = document.getElementById("name")!;
    expect(name.getAttribute("autocomplete")).toBe("off");
    expect(name.getAttribute("data-1p-ignore")).toBe("true");
    expect(name.getAttribute("data-lpignore")).toBe("true");
    expect(document.getElementById("desc")!.getAttribute("data-bwignore")).toBe("true");
    // Checkboxen und bewusst gesetztes Autofill bleiben unberührt
    expect(document.getElementById("check")!.hasAttribute("autocomplete")).toBe(false);
    expect(document.getElementById("code")!.getAttribute("autocomplete")).toBe("one-time-code");
    expect(document.getElementById("code")!.hasAttribute("data-1p-ignore")).toBe(false);

    const later = document.createElement("div");
    later.innerHTML = `<label>Name <input id="later"></label>`;
    document.body.append(later);
    await Promise.resolve();
    expect(document.getElementById("later")!.getAttribute("data-1p-ignore")).toBe("true");
    stop();
  });
});
