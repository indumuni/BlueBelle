import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import App from "./App";

test("counter increments on click", async () => {
  render(<App />);
  const button = screen.getByRole("button", { name: /count is 0/i });
  await userEvent.click(button);
  expect(button).toHaveTextContent("Count is 1");
});
