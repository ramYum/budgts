import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CrystalPerch, crystalLines } from "./crystal-perch";

const bubbles = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>(".crystal-say")].map((b) => [b.dataset.say, b.textContent]);

describe("crystalLines", () => {
  it("greets by name when it fits the bubble, and generically when it doesn't", () => {
    expect(crystalLines("Alex", 0.3).hello).toBe("Hi, Alex!");
    expect(crystalLines("Christopher", 0.3).hello).toBe("Hi there!");
    expect(crystalLines("", 0.3).hello).toBe("Hi there!");
  });

  it("leads with the month's note: the savings rate, overspending, or no income yet", () => {
    expect(crystalLines("Alex", 0.32).lines[0]).toBe("32% saved!");
    expect(crystalLines("Alex", -0.11).lines[0]).toBe("Spent > earned");
    expect(crystalLines("Alex", null).lines[0]).toBe("No income yet");
  });
});

describe("CrystalPerch", () => {
  it("arrives saying hi, then her note on the month", () => {
    const { container } = render(<CrystalPerch name="Alex" savingsRate={0.32} />);
    expect(bubbles(container)).toEqual([
      ["hello", "Hi, Alex!"],
      ["note", "32% saved!"],
    ]);
  });

  it("is a button: each tap makes her say the next line, announced politely", async () => {
    const user = userEvent.setup();
    const { container } = render(<CrystalPerch name="Alex" savingsRate={0.32} />);
    const crystal = screen.getByRole("button", { name: "Say hi to Crystal" });

    await user.click(crystal);
    expect(bubbles(container)).toEqual([["tap", "32% saved!"]]);
    expect(container.querySelector("[aria-live]")).toHaveTextContent("32% saved!");
    expect(container.querySelector(".crystal-react")).not.toBeNull();
    expect(container.querySelectorAll(".crystal-burst > *")).toHaveLength(7);

    await user.click(crystal);
    await user.click(crystal);
    await user.click(crystal);
    await user.click(crystal);
    // four lines, then round again
    expect(bubbles(container)).toEqual([["tap", "32% saved!"]]);
  });

  it("flaps: her robin carries the raised-wing frame", () => {
    const { container } = render(<CrystalPerch name="Alex" savingsRate={0.32} />);
    expect(container.querySelector(".robin-wing-up")).not.toBeNull();
  });

  it("lets a '+$' rise from her chirp only while the month is saving", () => {
    const saving = render(<CrystalPerch name="Alex" savingsRate={0.32} />);
    expect(saving.container.querySelectorAll(".crystal-token")).toHaveLength(2);
    saving.unmount();
    const over = render(<CrystalPerch name="Alex" savingsRate={-0.2} />);
    expect(over.container.querySelectorAll(".crystal-token")).toHaveLength(0);
  });
});
