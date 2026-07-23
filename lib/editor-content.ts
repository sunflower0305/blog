import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import type { Editor, JSONContent } from "@tiptap/core";

export function unwrapStandaloneImages(root: Element | DocumentFragment): void {
  for (const paragraph of root.querySelectorAll("p")) {
    const image = paragraph.firstElementChild;
    if (
      paragraph.childElementCount !== 1 ||
      image?.tagName !== "IMG" ||
      paragraph.textContent?.trim()
    ) {
      continue;
    }

    paragraph.replaceWith(image);
  }
}

function parseEditorHtml(html: string, editor: Editor): JSONContent {
  // A normal detached <div> still starts loading image src attributes as soon
  // as innerHTML is assigned. Template contents stay inert until rendered, so
  // ProseMirror can read the stored source URLs without downloading them first.
  const template = document.createElement("template");
  template.innerHTML = html;
  unwrapStandaloneImages(template.content);

  return ProseMirrorDOMParser.fromSchema(editor.schema)
    .parse(template.content)
    .toJSON() as JSONContent;
}

export function setEditorHtmlContent(editor: Editor, html: string): void {
  // tiptap-markdown overrides setContent for string input and parses it as
  // Markdown. Passing parsed JSON keeps existing HTML from being converted a
  // second time, which would split code blocks containing blank lines.
  editor.commands.setContent(parseEditorHtml(html, editor));
}
