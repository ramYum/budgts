import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LapseRemovalNotice } from "./lapse-removal-notice";

describe("LapseRemovalNotice", () => {
  it("explains the removal, that history is kept, and how to get back", () => {
    render(<LapseRemovalNotice />);
    expect(screen.getByTestId("lapse-removal-notice")).toHaveTextContent(
      "Your bank connections were removed when your subscription ended. Your past transactions are still here. Subscribe again to reconnect.",
    );
  });
});
