import { render, screen } from "@testing-library/react";
import App from "./App";

jest.mock("./pages/LandingPage", () => () => <main>Bazario storefront</main>);

test("renders the Bazario storefront", () => {
  render(<App />);
  expect(screen.getByText("Bazario storefront")).toBeInTheDocument();
});
