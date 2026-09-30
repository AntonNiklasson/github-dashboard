import { expect, test } from "vitest";
import { render } from "ink-testing-library";
import { Markdown } from "./markdown.js";

const frame = (source: string) => {
  const ui = render(<Markdown source={source} />);
  const output = ui.lastFrame()!;
  ui.unmount();
  return output;
};

test("drops HTML comments and markup, keeps text", () => {
  const output = frame(
    "<!--\nTemplate hint\n-->\n\n## What &amp; why\n\nAdds **size** labels `a<b>`.\n",
  );
  expect(output).not.toContain("Template hint");
  expect(output).not.toContain("<!--");
  expect(output).not.toContain("##");
  expect(output).not.toContain("**");
  expect(output).toContain("What & why");
  expect(output).toContain("Adds size labels a<b>.");
});

test("lists, tasks, quotes and tables", () => {
  const output = frame(
    "- [x] done\n- [ ] todo\n\n1. one\n2. two\n\n> quoted\n\n| A | Long |\n| - | - |\n| x | y |\n",
  );
  expect(output).toContain("\u{f0132} done");
  expect(output).toContain("\u{f0131} todo");
  expect(output).toContain("2. two");
  expect(output).toContain("┃ quoted");
  expect(output).toContain("A │ Long");
  expect(output).toContain("x │ y");
});

test("strips terminal control sequences", () => {
  expect(frame("hi \x1b[2J there")).not.toContain("\x1b[2J");
});

test("empty body", () => {
  expect(frame("<!-- only a template -->")).toContain("No description");
});
